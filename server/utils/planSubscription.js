import mongoose from "mongoose";
import User from "../models/User.js";
import RazorpayPlan from "../models/RazorpayPlan.js";
import LedgerEntry from "../models/LedgerEntry.js";
import { PLAN_PURPOSE, planAmountMinor, planLines } from "./planCheckout.js";
import { snapshotForPaidAmount } from "./tax/checkout.js";
import { recordPayment } from "./ledger.js";
import { issueInvoice, totalRow, gatewayRow, formatInvoiceMoney } from "./invoiceIssue.js";

/**
 * Recurring plans: Razorpay Subscriptions behind the FIP and writer Silver/Gold plans.
 *
 * Until this module existed every plan was a ONE-TIME Razorpay order that granted 30 (or 365) days
 * and then lapsed — nothing ever charged the card again, despite the pricing copy saying "/month" and
 * the terms describing automatic renewal. Here the plan is a Razorpay Subscription: Razorpay holds the
 * mandate and charges each cycle, and every successful charge moves `accessExpiresAt` forward.
 *
 * The one rule everything below is built around: ACCESS FOLLOWS MONEY. A charge is applied by exactly
 * one function, `applySubscriptionCharge`, which three callers share:
 *
 *   1. the checkout callback (planSubscription verify) — so the first payment activates instantly;
 *   2. the Razorpay webhook (subscription.charged …) — so renewals land with nobody on the site;
 *   3. `syncRecurringPlan` — a pull from Razorpay for when a webhook never arrives.
 *
 * All three may see the same payment, in any order, more than once. That is safe because every write
 * is idempotent: the ledger and invoice are unique on the payment id, and the access window is set
 * to an ABSOLUTE date (Razorpay's `current_end`) and never moved backwards.
 */

export const RECURRING_BILLING = "recurring";

/** What each sellable plan grants. `plan` and `accessTier` are the User.subscription enum values. */
export const PLAN_CATALOG = {
  film_industry_professional: {
    plan: "pro",
    accessTier: "film_industry_professional",
    tier: "",
    label: "Film Industry Professional",
  },
  writer_silver: { plan: "silver", accessTier: "writer_silver", tier: "silver", label: "Writer Silver" },
  writer_gold: { plan: "gold", accessTier: "writer_gold", tier: "gold", label: "Writer Gold" },
};

/**
 * Razorpay billing period per Ckript cycle.
 *
 * `totalCount` caps the mandate at ten years, which is the most Razorpay's integration guide allows
 * a subscription to be charged for. A subscriber still on the plan after that would be asked to
 * re-subscribe; nobody is billed past what they authorised.
 */
export const RECURRING_CYCLES = {
  monthly: { period: "monthly", interval: 1, totalCount: 120, days: 30, label: "monthly" },
  annual: { period: "yearly", interval: 1, totalCount: 10, days: 365, label: "yearly" },
};

/** Statuses in which Razorpay will (still) charge the card. */
export const RENEWING_STATUSES = ["authenticated", "active", "pending"];

const DAY_MS = 24 * 60 * 60 * 1000;

/** A deferred start shorter than this isn't worth a separate authorisation — just start now. */
const MIN_DEFERRAL_MS = DAY_MS;

export const normalizeCycle = (cycle) => (cycle === "annual" ? "annual" : "monthly");

/**
 * Recurring billing is on unless explicitly switched off. The switch exists for one situation: the
 * Razorpay account does not have Subscriptions activated yet, in which case plans keep selling as
 * one-time purchases instead of failing outright. Read lazily — see razorpayClient.js.
 */
export const recurringBillingEnabled = () =>
  String(process.env.PLAN_RECURRING_BILLING ?? "true").trim().toLowerCase() !== "false";

const unixToDate = (seconds) => {
  const n = Number(seconds);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
};

const asDate = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
};

/** Razorpay returns `notes` as an object, or as an empty ARRAY when none were set. */
const notesOf = (entity) => {
  const notes = entity?.notes;
  return notes && typeof notes === "object" && !Array.isArray(notes) ? notes : {};
};

export const isPlanSubscription = (subscription) => {
  const notes = notesOf(subscription);
  return notes.purpose === PLAN_PURPOSE && notes.billing === RECURRING_BILLING && Boolean(PLAN_CATALOG[notes.planKey]);
};

export const subscriptionNotes = ({ userId, planKey, cycle }) => ({
  purpose: PLAN_PURPOSE,
  billing: RECURRING_BILLING,
  userId: String(userId),
  planKey,
  tier: PLAN_CATALOG[planKey]?.tier || "",
  cycle: normalizeCycle(cycle),
});

/** The user's current paid window on `accessTier`, if they have one that has not lapsed. */
const activeWindowOn = (userSubscription = {}, accessTier, now) => {
  const expiry = asDate(userSubscription.accessExpiresAt || userSubscription.expiresAt);
  const active =
    userSubscription.accessTier === accessTier &&
    userSubscription.accessStatus === "active" &&
    expiry &&
    expiry.getTime() > now.getTime();
  return active ? expiry : null;
};

/**
 * When should a new subscription's first charge happen?
 *
 * Someone who already holds paid time on the same plan — a one-time purchase from before recurring
 * billing, or a recurring plan they cancelled and are now resuming — must not pay twice for the same
 * days. Their subscription starts when the current window ends; until then Razorpay only takes a
 * small authorisation, which buys nothing (see planChargeEffect).
 *
 * @returns {Date|null} the deferred start, or null to start (and charge) immediately.
 */
export const deferredStartFor = (userSubscription, planKey, now = new Date()) => {
  const meta = PLAN_CATALOG[planKey];
  if (!meta) return null;
  const expiry = activeWindowOn(userSubscription, meta.accessTier, now);
  if (!expiry) return null;
  return expiry.getTime() - now.getTime() > MIN_DEFERRAL_MS ? expiry : null;
};

/**
 * One-time purchase window. A renewal of the SAME plan while it is still active extends from the
 * current expiry; it used to restart from today, so renewing with ten days left threw those ten days
 * away. A different plan (or a lapsed one) starts fresh.
 */
export const oneTimeAccessWindow = (userSubscription, accessTier, durationDays, now = new Date()) => {
  const current = activeWindowOn(userSubscription, accessTier, now);
  const from = current || now;
  return {
    expiresAt: new Date(from.getTime() + durationDays * DAY_MS),
    freshActivation: !current,
  };
};

/**
 * The `subscription.recurring.*` fields mirrored from a Razorpay subscription entity.
 *
 * `cancelAtPeriodEnd` is ours, not Razorpay's: cancelling stops the mandate immediately at Razorpay,
 * while the access already paid for runs to its end. Carry the existing value unless told otherwise.
 */
export const recurringStateSet = (subscription, { eventAt, cancelAtPeriodEnd, extra = {} } = {}) => {
  const notes = notesOf(subscription);
  const status = String(subscription?.status || "");
  const cancelling = Boolean(cancelAtPeriodEnd);
  const set = {
    "subscription.recurring.razorpaySubscriptionId": String(subscription?.id || ""),
    "subscription.recurring.razorpayPlanId": String(subscription?.plan_id || ""),
    "subscription.recurring.planKey": notes.planKey || "",
    "subscription.recurring.tier": PLAN_CATALOG[notes.planKey]?.tier || "",
    "subscription.recurring.cycle": normalizeCycle(notes.cycle),
    "subscription.recurring.status": status,
    "subscription.recurring.autoRenew": RENEWING_STATUSES.includes(status) && !cancelling,
    "subscription.recurring.cancelAtPeriodEnd": cancelling,
    "subscription.recurring.currentPeriodStart": unixToDate(subscription?.current_start),
    "subscription.recurring.currentPeriodEnd": unixToDate(subscription?.current_end),
    "subscription.recurring.nextChargeAt": RENEWING_STATUSES.includes(status) && !cancelling
      ? unixToDate(subscription?.charge_at)
      : null,
    "subscription.recurring.paidCount": Number(subscription?.paid_count) || 0,
  };
  if (eventAt) set["subscription.recurring.statusEventAt"] = eventAt;
  for (const [key, value] of Object.entries(extra)) set[`subscription.recurring.${key}`] = value;
  return set;
};

/**
 * Decide what a payment on a plan subscription means. PURE — no I/O — so every branch is testable.
 *
 * Returns one of:
 *   { kind: "reject", reason }            not ours / not a plan / unknown user
 *   { kind: "pending_capture" }           a full payment Razorpay has not captured yet
 *   { kind: "authorization", set, ... }   a deferred start's token payment: mandate set up, no access
 *   { kind: "charge", set, ledger, ... }  a real cycle payment: extend access, book it, invoice it
 *   { kind: "stale_charge", ledger, ... } money taken on a subscription the user has since replaced:
 *                                         book it (it is real revenue) but do not touch access
 */
export const planChargeEffect = ({ user, subscription, payment, now = new Date(), eventAt = null }) => {
  if (!isPlanSubscription(subscription)) return { kind: "reject", reason: "not a plan subscription" };
  const notes = notesOf(subscription);
  if (!user || String(user._id) !== String(notes.userId)) return { kind: "reject", reason: "user mismatch" };
  if (!payment?.id) return { kind: "reject", reason: "no payment" };

  const planKey = notes.planKey;
  const meta = PLAN_CATALOG[planKey];
  const cycle = normalizeCycle(notes.cycle);
  const cycleMeta = RECURRING_CYCLES[cycle];
  const currency = String(payment.currency || "INR").toUpperCase();
  const paidMinor = Number(payment.amount) || 0;
  const expectedMinor = planAmountMinor(planKey, currency, cycle) || 0;
  const userSub = user.subscription || {};
  const tracked = userSub.recurring || {};

  // Another subscription is the one we track, and this one is older: a leftover mandate.
  const trackedId = String(tracked.razorpaySubscriptionId || "");
  const isTracked = trackedId === String(subscription.id);
  const trackedStillRenewing = Boolean(trackedId) && !isTracked && RENEWING_STATUSES.includes(tracked.status);
  const createdAt = unixToDate(subscription.created_at);
  const trackedCreatedAt = asDate(tracked.subscriptionCreatedAt);
  const isOlderThanTracked =
    trackedStillRenewing && createdAt && trackedCreatedAt && createdAt.getTime() < trackedCreatedAt.getTime();

  // A payment smaller than the plan price is the authorisation of a deferred start — it buys nothing.
  // (A real charge in a fallen-back currency is checked against THAT currency's price above.)
  if (!expectedMinor || paidMinor < expectedMinor) {
    if (isOlderThanTracked) return { kind: "reject", reason: "authorisation on a superseded subscription" };
    return {
      kind: "authorization",
      planKey,
      cycle,
      set: {
        "subscription.billingMode": RECURRING_BILLING,
        ...recurringStateSet(subscription, {
          eventAt: eventAt || now,
          extra: {
            currency,
            amountMinor: expectedMinor,
            subscriptionCreatedAt: createdAt,
            lastSyncedAt: now,
          },
        }),
      },
      // A new mandate replaces whatever was renewing before it.
      cancelPrevious: trackedStillRenewing ? trackedId : "",
    };
  }

  if (payment.status !== "captured") return { kind: "pending_capture", planKey, cycle };

  const chargedAt = unixToDate(payment.created_at) || now;
  const periodStart = unixToDate(subscription.current_start);
  const periodEnd = unixToDate(subscription.current_end);

  const ledger = {
    kind: "plan_subscription",
    user: user._id,
    amountMinor: paidMinor,
    currency,
    listPriceMinor: expectedMinor,
    providerOrderId: String(payment.order_id || ""),
    providerPaymentId: String(payment.id),
    subjectType: "Plan",
    label: `${meta.label} (${cycle}, auto-renew)`,
    occurredAt: chargedAt,
    metadata: {
      planKey,
      tier: meta.tier,
      cycle,
      billing: RECURRING_BILLING,
      razorpaySubscriptionId: String(subscription.id),
      cycleNumber: Number(subscription.paid_count) || 0,
      periodStart,
      periodEnd,
    },
  };

  const invoice = {
    paymentReference: String(payment.id),
    currency,
    paidMajor: paidMinor / 100,
    label: meta.label,
    cycle,
    periodStart,
    periodEnd,
    subscriptionId: String(subscription.id),
    cycleNumber: Number(subscription.paid_count) || 0,
    chargedAt,
  };

  if (isOlderThanTracked) {
    return { kind: "stale_charge", planKey, cycle, ledger, invoice, cancelSubscriptionId: String(subscription.id) };
  }

  // The new window: Razorpay's period end for this charge, never earlier than what the user already
  // holds on this plan. The fallback covers an entity without current_end (it should always have one).
  const currentExpiry = activeWindowOn(userSub, meta.accessTier, now);
  const fallbackEnd = new Date((currentExpiry || now).getTime() + cycleMeta.days * DAY_MS);
  let expiresAt = periodEnd && periodEnd.getTime() > now.getTime() ? periodEnd : fallbackEnd;
  if (currentExpiry && currentExpiry.getTime() > expiresAt.getTime()) expiresAt = currentExpiry;

  const set = {
    "subscription.plan": meta.plan,
    "subscription.accessTier": meta.accessTier,
    "subscription.accessStatus": "active",
    "subscription.expiresAt": expiresAt,
    "subscription.accessExpiresAt": expiresAt,
    "subscription.checkoutMode": "live",
    "subscription.checkoutProvider": "razorpay",
    "subscription.checkoutReference": String(subscription.id),
    "subscription.paymentId": String(payment.id),
    "subscription.billingMode": RECURRING_BILLING,
    ...recurringStateSet(subscription, {
      eventAt: eventAt || now,
      cancelAtPeriodEnd: isTracked ? Boolean(tracked.cancelAtPeriodEnd) : false,
      extra: {
        currency,
        amountMinor: expectedMinor,
        lastPaymentId: String(payment.id),
        lastChargedAt: chargedAt,
        subscriptionCreatedAt: createdAt,
        lastSyncedAt: now,
      },
    }),
  };

  // First activation of this plan (not a renewal): anchor the monthly usage cycle here and clear the
  // per-cycle counters, exactly as the one-time checkout always has. A renewal keeps the anchor, so
  // upload quotas and contact limits keep resetting on the same day each month.
  if (!currentExpiry) {
    set["subscription.accessActivatedAt"] = now;
    set["subscription.aiImagesGeneratedTotal"] = 0;
    if (planKey === "film_industry_professional") {
      Object.assign(set, {
        "subscription.revealedContacts": [],
        "subscription.messagedWriters": [],
        "subscription.scheduledMeetings": [],
        "subscription.contactsLimit": 10,
        "subscription.messageWritersLimit": 10,
        "subscription.meetingsLimit": 10,
      });
    }
  }

  return {
    kind: "charge",
    planKey,
    cycle,
    expiresAt,
    freshActivation: !currentExpiry,
    set,
    ledger,
    invoice,
    cancelPrevious: trackedStillRenewing ? trackedId : "",
  };
};

const formatDay = (date) =>
  date
    ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(date)
    : "";

const issuePlanInvoice = (user, invoice, source, tax = null) => {
  const cycleLabel = RECURRING_CYCLES[invoice.cycle]?.label || invoice.cycle;
  const period = invoice.periodStart && invoice.periodEnd
    ? `${formatDay(invoice.periodStart)} – ${formatDay(invoice.periodEnd)}`
    : "";
  return issueInvoice({
    kind: "plan_subscription",
    user,
    paymentReference: invoice.paymentReference,
    providerPaymentId: invoice.paymentReference,
    tax,
    supplyDate: invoice.chargedAt || null,
    currency: invoice.currency,
    amountCharged: invoice.paidMajor,
    detailLines: [
      invoice.label,
      `Billing: ${cycleLabel}, renews automatically`,
      period ? `Period: ${period}` : "",
      invoice.cycleNumber ? `Billing cycle: ${invoice.cycleNumber}` : "",
      `Subscription: ${invoice.subscriptionId}`,
      `Payment Ref: ${invoice.paymentReference}`,
    ],
    rows: [
      {
        item: invoice.label,
        type: "Subscription",
        detail: period
          ? `${cycleLabel} plan, auto-renewing. Covers ${period}.`
          : `${cycleLabel} plan, auto-renewing.`,
        amountLabel: formatInvoiceMoney(invoice.paidMajor, invoice.currency),
        amountValue: invoice.paidMajor,
      },
      totalRow(invoice.paidMajor, invoice.currency),
      gatewayRow(invoice.paymentReference),
    ],
    source,
  });
};

const cancelQuietly = async (razorpay, subscriptionId, why) => {
  if (!razorpay || !subscriptionId) return;
  try {
    await razorpay.subscriptions.cancel(String(subscriptionId), false);
  } catch (error) {
    // Already cancelled/completed is the common case and harmless. Anything else is logged for finance
    // because it means a mandate we meant to stop may still charge.
    console.error(`[plan subscription] could not cancel ${subscriptionId} (${why}):`, error?.error?.description || error?.message || error);
  }
};

const loadPlanUser = async (subscription) => {
  const userId = notesOf(subscription).userId;
  if (!userId || !mongoose.isValidObjectId(String(userId))) return null;
  return User.findById(String(userId)).select("sid name email role subscription address billingProfile");
};

/**
 * Apply one payment on a plan subscription: extend access, book it, issue the invoice.
 *
 * Never throws for a payment that has already been taken — like every other post-capture write in
 * this codebase, a ledger or invoice failure is logged and skipped rather than surfaced as a failed
 * payment. Only the access update is load-bearing, and it is idempotent.
 */
export const applySubscriptionCharge = async ({ razorpay, subscription, payment, source = "", eventAt = null }) => {
  const user = await loadPlanUser(subscription);
  if (!user) return { kind: "reject", reason: "user not found" };

  const effect = planChargeEffect({ user, subscription, payment, now: new Date(), eventAt });

  if (effect.kind === "reject" || effect.kind === "pending_capture") return effect;

  // Each charge is its own supply: price its taxes from what Razorpay actually took. A renewal at the
  // tax-added price is an ordinary taxed sale; one at the pre-tax price (a mandate created before taxes
  // switched on) has the taxes carved out of it. Null when taxes are off.
  const chargeTax = effect.kind === "charge" || effect.kind === "stale_charge"
    ? await snapshotForPaidAmount({
      user,
      lines: planLines(effect.planKey, effect.ledger.currency, effect.cycle),
      paidMinor: effect.ledger.amountMinor,
      currency: effect.ledger.currency,
      paidAt: effect.ledger.occurredAt,
    })
    : null;

  if (effect.kind === "stale_charge") {
    // Real money on a mandate the user has replaced. Book and document it so finance can see (and, if
    // the business decides, refund) it — but leave the user's current plan alone, and stop the mandate.
    await recordPayment({ ...effect.ledger, tax: chargeTax, source });
    await issuePlanInvoice(user, effect.invoice, source, chargeTax);
    await cancelQuietly(razorpay, effect.cancelSubscriptionId, "charge on a superseded subscription");
    console.error(`[plan subscription] payment ${payment.id} landed on superseded subscription ${subscription.id} (user ${user._id})`);
    return effect;
  }

  await User.updateOne({ _id: user._id }, { $set: effect.set });
  if (effect.cancelPrevious) await cancelQuietly(razorpay, effect.cancelPrevious, "replaced by a new subscription");

  if (effect.kind === "charge") {
    await recordPayment({ ...effect.ledger, tax: chargeTax, source });
    await issuePlanInvoice(user, effect.invoice, source, chargeTax);
  }
  return effect;
};

/**
 * Mirror a status change (activated, pending, halted, cancelled, completed …) onto the user.
 *
 * Two guards, both because webhooks are neither exclusive nor ordered:
 *   • only the subscription we currently track may change the state — the `cancelled` event of a plan
 *     the user just switched AWAY from must not mark the new one cancelled;
 *   • an event older than the last one applied is ignored, so `pending` cannot overwrite a later
 *     `active`.
 *
 * Access is never revoked here. The paid window simply runs out at accessExpiresAt; a halted or
 * cancelled subscription just stops extending it.
 */
export const applySubscriptionStatus = async ({ subscription, eventAt = new Date() }) => {
  if (!isPlanSubscription(subscription)) return { applied: false, reason: "not a plan subscription" };
  const user = await loadPlanUser(subscription);
  if (!user) return { applied: false, reason: "user not found" };

  const tracked = user.subscription?.recurring || {};
  const trackedId = String(tracked.razorpaySubscriptionId || "");
  if (trackedId && trackedId !== String(subscription.id)) {
    return { applied: false, reason: "not the tracked subscription" };
  }
  const lastEventAt = asDate(tracked.statusEventAt);
  if (lastEventAt && eventAt && eventAt.getTime() < lastEventAt.getTime()) {
    return { applied: false, reason: "older than the state already applied" };
  }

  const set = {
    "subscription.billingMode": RECURRING_BILLING,
    ...recurringStateSet(subscription, {
      eventAt,
      cancelAtPeriodEnd: trackedId ? Boolean(tracked.cancelAtPeriodEnd) : false,
      extra: { subscriptionCreatedAt: unixToDate(subscription.created_at) },
    }),
  };
  await User.updateOne({ _id: user._id }, { $set: set });
  return { applied: true, status: subscription.status };
};

/**
 * Find (or lazily create) the Razorpay Plan that bills `planKey` / `cycle` / `currency`.
 */
export const ensureRazorpayPlan = async (razorpay, { planKey, cycle, currency, amountMinor }) => {
  const accountKeyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  const key = { accountKeyId, planKey, cycle, currency, amountMinor };
  const cached = await RazorpayPlan.findOne(key).lean();
  if (cached?.razorpayPlanId) return cached.razorpayPlanId;

  const meta = PLAN_CATALOG[planKey];
  const cycleMeta = RECURRING_CYCLES[cycle];
  const created = await razorpay.plans.create({
    period: cycleMeta.period,
    interval: cycleMeta.interval,
    item: {
      name: `Ckript ${meta.label} (${cycleMeta.label})`,
      amount: amountMinor,
      currency,
      description: `${meta.label}, billed ${cycleMeta.label}. Renews automatically until cancelled.`,
    },
    notes: { planKey, cycle },
  });

  try {
    await RazorpayPlan.create({ ...key, razorpayPlanId: created.id });
    return created.id;
  } catch (error) {
    // Two first-ever subscribers raced; keep the winner's plan. The loser's is an unused, harmless
    // plan on the Razorpay account.
    if (error?.code === 11000) {
      const winner = await RazorpayPlan.findOne(key).lean();
      if (winner?.razorpayPlanId) return winner.razorpayPlanId;
    }
    throw error;
  }
};

/**
 * Create the Razorpay Subscription for a checkout, with the same USD → INR fallback the one-time
 * order flow uses (USD needs International Payments enabled on the merchant account).
 */
export const createPlanSubscription = async (razorpay, { userId, planKey, cycle, currency, startAt = null, grossFor = null }) => {
  const normalizedCycle = normalizeCycle(cycle);
  const attempt = async (cur) => {
    // The Razorpay Plan bills the TAX-ADDED total when taxes are on (₹399 → ₹470.82). Everyone pays
    // the same 18%, so one Plan per (plan, cycle, currency) still serves every buyer.
    const amountMinor = grossFor ? await grossFor(cur) : planAmountMinor(planKey, cur, normalizedCycle);
    if (!amountMinor) throw new Error(`No ${cur} price for ${planKey} (${normalizedCycle})`);
    const planId = await ensureRazorpayPlan(razorpay, { planKey, cycle: normalizedCycle, currency: cur, amountMinor });
    const params = {
      plan_id: planId,
      total_count: RECURRING_CYCLES[normalizedCycle].totalCount,
      quantity: 1,
      customer_notify: 1,
      notes: subscriptionNotes({ userId, planKey, cycle: normalizedCycle }),
    };
    if (startAt) {
      params.start_at = Math.floor(startAt.getTime() / 1000);
    } else {
      // An abandoned checkout should not leave a payable subscription link alive for 30 years.
      params.expire_by = Math.floor(Date.now() / 1000) + 2 * 60 * 60;
    }
    const subscription = await razorpay.subscriptions.create(params);
    return { subscription, amountMinor, currency: cur, planId };
  };

  const requested = String(currency || "INR").toUpperCase();
  try {
    return { ...(await attempt(requested)), fellBackToINR: false };
  } catch (error) {
    if (requested !== "USD") throw error;
    console.error("[plan subscription] USD subscription failed, falling back to INR:", error?.error?.description || error?.message || error);
    return { ...(await attempt("INR")), fellBackToINR: true };
  }
};

/**
 * Fetch a subscription and prove it is a plan subscription belonging to `userId`.
 */
export const readVerifiedSubscription = async (razorpay, subscriptionId, userId) => {
  let subscription;
  try {
    subscription = await razorpay.subscriptions.fetch(String(subscriptionId));
  } catch (error) {
    console.error("[plan subscription] fetch failed:", error?.error?.description || error?.message || error);
    return { error: "Could not confirm the subscription with Razorpay. Please contact support.", status: 502 };
  }
  if (!isPlanSubscription(subscription) || String(notesOf(subscription).userId) !== String(userId)) {
    return { error: "This payment does not belong to your subscription.", status: 400 };
  }
  return { subscription };
};

/**
 * Pull the subscription's state from Razorpay and apply anything we missed.
 *
 * The webhook is the primary path for renewals; this is the safety net for when it is not configured,
 * was down, or a delivery was dropped. It is throttled per user so a page that polls cannot turn into
 * a stream of Razorpay API calls.
 */
const SYNC_THROTTLE_MS = 10 * 60 * 1000;
const FORCED_SYNC_THROTTLE_MS = 15 * 1000;

export const syncRecurringPlan = async ({ razorpay, userId, force = false }) => {
  if (!razorpay || !userId) return { synced: false, reason: "not configured" };
  const user = await User.findById(String(userId)).select("subscription.recurring");
  const tracked = user?.subscription?.recurring || {};
  if (!tracked.razorpaySubscriptionId) return { synced: false, reason: "no recurring plan" };

  const lastSynced = asDate(tracked.lastSyncedAt);
  const throttle = force ? FORCED_SYNC_THROTTLE_MS : SYNC_THROTTLE_MS;
  if (lastSynced && Date.now() - lastSynced.getTime() < throttle) return { synced: false, reason: "throttled" };

  // Stamp first, so concurrent requests for the same user don't all go to Razorpay.
  await User.updateOne({ _id: user._id }, { $set: { "subscription.recurring.lastSyncedAt": new Date() } });

  const subscription = await razorpay.subscriptions.fetch(String(tracked.razorpaySubscriptionId));
  let applied = 0;

  try {
    const list = await razorpay.invoices.all({ subscription_id: String(subscription.id), count: 12 });
    const paid = (list?.items || [])
      .filter((inv) => inv?.status === "paid" && inv?.payment_id)
      .sort((a, b) => (Number(a.billing_start) || 0) - (Number(b.billing_start) || 0));
    for (const inv of paid) {
      const already = await LedgerEntry.exists({ providerPaymentId: String(inv.payment_id) });
      if (already) continue;
      const payment = await razorpay.payments.fetch(String(inv.payment_id));
      const result = await applySubscriptionCharge({
        razorpay,
        subscription,
        payment,
        source: "planSubscription.syncRecurringPlan",
      });
      if (result.kind === "charge" || result.kind === "stale_charge") applied += 1;
    }
  } catch (error) {
    console.error("[plan subscription] invoice sync failed:", error?.error?.description || error?.message || error);
  }

  await applySubscriptionStatus({ subscription, eventAt: new Date() });
  return { synced: true, applied, status: subscription.status };
};

/**
 * Re-sync on read, but only when it can matter: the user is on auto-renew and their paid window has
 * ended (a renewal should have landed). Bounded by a timeout so a slow Razorpay never stalls a page.
 */
export const syncIfRenewalDue = async ({ razorpay, user, timeoutMs = 3000 }) => {
  const sub = user?.subscription || {};
  const tracked = sub.recurring || {};
  if (!razorpay || !tracked.razorpaySubscriptionId || !tracked.autoRenew) return false;
  const expiry = asDate(sub.accessExpiresAt || sub.expiresAt);
  if (expiry && expiry.getTime() > Date.now()) return false;
  try {
    const result = await Promise.race([
      syncRecurringPlan({ razorpay, userId: user._id }),
      new Promise((resolve) => setTimeout(() => resolve({ synced: false, reason: "timeout" }), timeoutMs)),
    ]);
    return Boolean(result?.synced);
  } catch (error) {
    console.error("[plan subscription] renewal sync failed:", error?.error?.description || error?.message || error);
    return false;
  }
};

/**
 * Route one webhook event. Subscription events only — order/payment events for the other checkouts
 * still complete through their own verify callbacks.
 */
const CHARGE_EVENTS = new Set([
  "subscription.authenticated",
  "subscription.activated",
  "subscription.charged",
  "subscription.completed",
]);

export const handleRazorpayWebhookEvent = async (event, { razorpay } = {}) => {
  const type = String(event?.event || "");
  if (!type.startsWith("subscription.")) return { handled: false, reason: `ignored ${type || "unknown"} event` };

  const subscription = event?.payload?.subscription?.entity;
  const payment = event?.payload?.payment?.entity;
  if (!isPlanSubscription(subscription)) return { handled: false, reason: "not a plan subscription" };

  const eventAt = unixToDate(event?.created_at) || new Date();
  let charge = null;
  if (payment && CHARGE_EVENTS.has(type)) {
    charge = await applySubscriptionCharge({
      razorpay,
      subscription,
      payment,
      source: `webhook:${type}`,
      eventAt,
    });
  }
  const status = await applySubscriptionStatus({ subscription, eventAt });
  return { handled: true, type, charge: charge?.kind || null, status: status.applied ? subscription.status : status.reason };
};

/** What the client is told about a recurring plan. */
export const publicRecurringState = (userSubscription = {}) => {
  const tracked = userSubscription.recurring || {};
  return {
    billingMode: userSubscription.billingMode || "one_time",
    planKey: tracked.planKey || "",
    tier: tracked.tier || "",
    cycle: tracked.cycle || "",
    status: tracked.status || "",
    autoRenew: Boolean(tracked.autoRenew),
    cancelAtPeriodEnd: Boolean(tracked.cancelAtPeriodEnd),
    amountMinor: Number(tracked.amountMinor) || 0,
    currency: tracked.currency || "",
    nextChargeAt: tracked.nextChargeAt || null,
    currentPeriodEnd: tracked.currentPeriodEnd || null,
    accessExpiresAt: userSubscription.accessExpiresAt || userSubscription.expiresAt || null,
    accessTier: userSubscription.accessTier || "none",
    paidCount: Number(tracked.paidCount) || 0,
  };
};
