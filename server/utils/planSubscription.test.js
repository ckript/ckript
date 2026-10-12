// Recurring plans: what a Razorpay subscription payment is allowed to do to a member's access.
//
// planChargeEffect is pure, so every branch — first activation, renewal, a deferred start's token
// authorisation, a plan switch, a charge on a mandate the user already replaced — is exercised here
// without Razorpay or a database. The signature checks are exercised against real HMACs.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  RECURRING_CYCLES,
  deferredStartFor,
  oneTimeAccessWindow,
  planChargeEffect,
  recurringStateSet,
  subscriptionNotes,
  isPlanSubscription,
  handleRazorpayWebhookEvent,
  publicRecurringState,
  recurringBillingEnabled,
} from "./planSubscription.js";
import {
  verifyRazorpaySubscriptionSignature,
  verifyRazorpayWebhookSignature,
} from "./razorpaySignature.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-11T06:30:00.000Z");
const unix = (date) => Math.floor(date.getTime() / 1000);
const USER_ID = "507f1f77bcf86cd799439011";

const subscriptionFor = ({
  id = "sub_NEW",
  planKey = "writer_gold",
  cycle = "monthly",
  status = "active",
  start = NOW,
  end = new Date(NOW.getTime() + 30 * DAY),
  createdAt = NOW,
  paidCount = 1,
} = {}) => ({
  id,
  plan_id: "plan_X",
  status,
  current_start: unix(start),
  current_end: unix(end),
  charge_at: unix(end),
  start_at: unix(start),
  paid_count: paidCount,
  created_at: unix(createdAt),
  notes: subscriptionNotes({ userId: USER_ID, planKey, cycle }),
});

const paymentOf = ({ id = "pay_1", amount = 69900, currency = "INR", status = "captured", at = NOW } = {}) => ({
  id,
  amount,
  currency,
  status,
  order_id: "order_1",
  created_at: unix(at),
});

const userWith = (subscription = {}) => ({ _id: USER_ID, subscription });

describe("Razorpay signatures for subscriptions and webhooks", () => {
  const saved = {};
  beforeEach(() => {
    saved.key = process.env.RAZORPAY_KEY_SECRET;
    saved.hook = process.env.RAZORPAY_WEBHOOK_SECRET;
    process.env.RAZORPAY_KEY_SECRET = "key_secret_for_tests";
    process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret_for_tests";
  });
  afterEach(() => {
    process.env.RAZORPAY_KEY_SECRET = saved.key;
    process.env.RAZORPAY_WEBHOOK_SECRET = saved.hook;
  });

  const hmac = (secret, message) => crypto.createHmac("sha256", secret).update(message).digest("hex");

  test("a subscription checkout is signed payment_id|subscription_id — the reverse of an order", () => {
    const signature = hmac("key_secret_for_tests", "pay_1|sub_1");
    assert.equal(verifyRazorpaySubscriptionSignature({ subscriptionId: "sub_1", paymentId: "pay_1", signature }), true);
    const orderStyle = hmac("key_secret_for_tests", "sub_1|pay_1");
    assert.equal(verifyRazorpaySubscriptionSignature({ subscriptionId: "sub_1", paymentId: "pay_1", signature: orderStyle }), false);
  });

  test("a signature for another subscription is refused", () => {
    const signature = hmac("key_secret_for_tests", "pay_1|sub_OTHER");
    assert.equal(verifyRazorpaySubscriptionSignature({ subscriptionId: "sub_1", paymentId: "pay_1", signature }), false);
  });

  test("a webhook is verified against the raw body with the WEBHOOK secret, not the key secret", () => {
    const rawBody = '{"event":"subscription.charged","payload":{}}';
    assert.equal(verifyRazorpayWebhookSignature({ rawBody, signature: hmac("webhook_secret_for_tests", rawBody) }), true);
    assert.equal(verifyRazorpayWebhookSignature({ rawBody, signature: hmac("key_secret_for_tests", rawBody) }), false);
    // Re-serialised JSON is a different byte string, so it must not verify.
    const reserialised = JSON.stringify(JSON.parse(rawBody), null, 2);
    assert.equal(verifyRazorpayWebhookSignature({ rawBody: reserialised, signature: hmac("webhook_secret_for_tests", rawBody) }), false);
  });

  test("with no webhook secret configured, nothing verifies", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "";
    const rawBody = "{}";
    assert.equal(verifyRazorpayWebhookSignature({ rawBody, signature: hmac("", rawBody) }), false);
  });
});

describe("billing cycles", () => {
  test("no mandate is authorised for longer than ten years", () => {
    assert.equal(RECURRING_CYCLES.monthly.period, "monthly");
    assert.equal(RECURRING_CYCLES.annual.period, "yearly");
    assert.ok(RECURRING_CYCLES.monthly.totalCount <= 120);
    assert.ok(RECURRING_CYCLES.annual.totalCount <= 10);
  });

  test("recurring billing is on unless explicitly switched off", () => {
    const saved = process.env.PLAN_RECURRING_BILLING;
    delete process.env.PLAN_RECURRING_BILLING;
    assert.equal(recurringBillingEnabled(), true);
    process.env.PLAN_RECURRING_BILLING = "false";
    assert.equal(recurringBillingEnabled(), false);
    process.env.PLAN_RECURRING_BILLING = saved ?? "";
    if (saved === undefined) delete process.env.PLAN_RECURRING_BILLING;
  });
});

describe("nobody pays twice for days they already hold", () => {
  test("paid time left on the same plan defers the first charge to its end", () => {
    const expiry = new Date(NOW.getTime() + 20 * DAY);
    const start = deferredStartFor({ accessTier: "writer_gold", accessStatus: "active", accessExpiresAt: expiry }, "writer_gold", NOW);
    assert.equal(start?.getTime(), expiry.getTime());
  });

  test("less than a day left is not worth a separate authorisation", () => {
    const expiry = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
    assert.equal(deferredStartFor({ accessTier: "writer_gold", accessStatus: "active", accessExpiresAt: expiry }, "writer_gold", NOW), null);
  });

  test("time on a DIFFERENT plan does not defer — an upgrade starts today", () => {
    const expiry = new Date(NOW.getTime() + 20 * DAY);
    assert.equal(deferredStartFor({ accessTier: "writer_silver", accessStatus: "active", accessExpiresAt: expiry }, "writer_gold", NOW), null);
  });

  test("the free FIP tier (active, no expiry) is not paid time", () => {
    assert.equal(
      deferredStartFor({ accessTier: "film_industry_professional", accessStatus: "active", plan: "free" }, "film_industry_professional", NOW),
      null,
    );
  });

  test("a one-time renewal of an active plan extends from its expiry instead of discarding it", () => {
    const expiry = new Date(NOW.getTime() + 10 * DAY);
    const result = oneTimeAccessWindow({ accessTier: "writer_silver", accessStatus: "active", accessExpiresAt: expiry }, "writer_silver", 30, NOW);
    assert.equal(result.freshActivation, false);
    assert.equal(result.expiresAt.getTime(), expiry.getTime() + 30 * DAY);
  });

  test("a lapsed plan restarts from today", () => {
    const lapsed = new Date(NOW.getTime() - DAY);
    const result = oneTimeAccessWindow({ accessTier: "writer_silver", accessStatus: "active", accessExpiresAt: lapsed }, "writer_silver", 30, NOW);
    assert.equal(result.freshActivation, true);
    assert.equal(result.expiresAt.getTime(), NOW.getTime() + 30 * DAY);
  });
});

describe("what a subscription payment buys", () => {
  test("a payment on someone else's subscription is rejected", () => {
    const effect = planChargeEffect({
      user: { _id: "507f1f77bcf86cd799439099", subscription: {} },
      subscription: subscriptionFor(),
      payment: paymentOf(),
      now: NOW,
    });
    assert.equal(effect.kind, "reject");
  });

  test("a subscription that is not a plan subscription is rejected", () => {
    const foreign = { ...subscriptionFor(), notes: { purpose: "something_else", userId: USER_ID } };
    assert.equal(planChargeEffect({ user: userWith(), subscription: foreign, payment: paymentOf(), now: NOW }).kind, "reject");
  });

  test("the first charge activates the plan until Razorpay's period end and books the money", () => {
    const end = new Date(NOW.getTime() + 31 * DAY);
    const effect = planChargeEffect({
      user: userWith({ accessTier: "none", accessStatus: "inactive" }),
      subscription: subscriptionFor({ end }),
      payment: paymentOf(),
      now: NOW,
    });
    assert.equal(effect.kind, "charge");
    assert.equal(effect.freshActivation, true);
    assert.equal(effect.set["subscription.accessExpiresAt"].getTime(), end.getTime());
    assert.equal(effect.set["subscription.accessTier"], "writer_gold");
    assert.equal(effect.set["subscription.plan"], "gold");
    assert.equal(effect.set["subscription.billingMode"], "recurring");
    assert.equal(effect.set["subscription.recurring.autoRenew"], true);
    assert.equal(effect.set["subscription.accessActivatedAt"].getTime(), NOW.getTime());
    assert.equal(effect.ledger.amountMinor, 69900);
    assert.equal(effect.ledger.listPriceMinor, 69900);
    assert.equal(effect.ledger.providerPaymentId, "pay_1");
    assert.equal(effect.ledger.metadata.billing, "recurring");
    assert.equal(effect.invoice.paymentReference, "pay_1");
  });

  test("a FIP first charge clears the per-cycle contact and message counters", () => {
    const effect = planChargeEffect({
      user: userWith({ accessTier: "none" }),
      subscription: subscriptionFor({ planKey: "film_industry_professional" }),
      payment: paymentOf({ amount: 199900 }),
      now: NOW,
    });
    assert.equal(effect.kind, "charge");
    assert.deepEqual(effect.set["subscription.revealedContacts"], []);
    assert.equal(effect.set["subscription.contactsLimit"], 10);
    assert.equal(effect.set["subscription.plan"], "pro");
  });

  test("a renewal extends access but keeps the usage-cycle anchor and counters", () => {
    const currentExpiry = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
    const nextEnd = new Date(currentExpiry.getTime() + 30 * DAY);
    const effect = planChargeEffect({
      user: userWith({
        accessTier: "writer_gold",
        accessStatus: "active",
        accessExpiresAt: currentExpiry,
        recurring: { razorpaySubscriptionId: "sub_NEW", status: "active", autoRenew: true },
      }),
      subscription: subscriptionFor({ start: currentExpiry, end: nextEnd, paidCount: 2 }),
      payment: paymentOf({ id: "pay_2" }),
      now: NOW,
    });
    assert.equal(effect.kind, "charge");
    assert.equal(effect.freshActivation, false);
    assert.equal(effect.set["subscription.accessExpiresAt"].getTime(), nextEnd.getTime());
    assert.equal("subscription.accessActivatedAt" in effect.set, false);
    assert.equal("subscription.revealedContacts" in effect.set, false);
    assert.equal(effect.ledger.metadata.cycleNumber, 2);
    assert.equal(effect.cancelPrevious, "");
  });

  test("applying the same payment twice lands on the same date (idempotent)", () => {
    const end = new Date(NOW.getTime() + 30 * DAY);
    const subscription = subscriptionFor({ end });
    const first = planChargeEffect({ user: userWith({ accessTier: "none" }), subscription, payment: paymentOf(), now: NOW });
    const afterFirst = userWith({
      accessTier: "writer_gold",
      accessStatus: "active",
      accessExpiresAt: first.set["subscription.accessExpiresAt"],
      recurring: { razorpaySubscriptionId: "sub_NEW", status: "active" },
    });
    const second = planChargeEffect({ user: afterFirst, subscription, payment: paymentOf(), now: NOW });
    assert.equal(second.set["subscription.accessExpiresAt"].getTime(), end.getTime());
    assert.equal(second.freshActivation, false, "a replay must not reset the usage cycle");
  });

  test("a stale entity can never shorten access a later charge already granted", () => {
    const later = new Date(NOW.getTime() + 60 * DAY);
    const staleEnd = new Date(NOW.getTime() + 30 * DAY);
    const effect = planChargeEffect({
      user: userWith({ accessTier: "writer_gold", accessStatus: "active", accessExpiresAt: later, recurring: { razorpaySubscriptionId: "sub_NEW", status: "active" } }),
      subscription: subscriptionFor({ end: staleEnd }),
      payment: paymentOf(),
      now: NOW,
    });
    assert.equal(effect.set["subscription.accessExpiresAt"].getTime(), later.getTime());
  });

  test("a deferred start's token authorisation sets up the mandate but buys no access", () => {
    const startsAt = new Date(NOW.getTime() + 20 * DAY);
    const effect = planChargeEffect({
      user: userWith({ accessTier: "writer_gold", accessStatus: "active", accessExpiresAt: startsAt }),
      subscription: subscriptionFor({ status: "authenticated", start: startsAt, end: startsAt, paidCount: 0 }),
      payment: paymentOf({ amount: 500 }),
      now: NOW,
    });
    assert.equal(effect.kind, "authorization");
    assert.equal("subscription.accessExpiresAt" in effect.set, false);
    assert.equal(effect.set["subscription.recurring.status"], "authenticated");
    assert.equal(effect.set["subscription.recurring.autoRenew"], true);
    assert.equal(effect.set["subscription.recurring.nextChargeAt"].getTime(), unix(startsAt) * 1000);
    assert.equal(effect.ledger, undefined, "an authorisation is not revenue");
  });

  test("a full payment Razorpay has not captured yet grants nothing yet", () => {
    const effect = planChargeEffect({ user: userWith(), subscription: subscriptionFor(), payment: paymentOf({ status: "authorized" }), now: NOW });
    assert.equal(effect.kind, "pending_capture");
  });

  test("switching plans cancels the mandate that was renewing before", () => {
    const effect = planChargeEffect({
      user: userWith({
        accessTier: "writer_silver",
        accessStatus: "active",
        accessExpiresAt: new Date(NOW.getTime() + 10 * DAY),
        recurring: {
          razorpaySubscriptionId: "sub_OLD",
          status: "active",
          autoRenew: true,
          subscriptionCreatedAt: new Date(NOW.getTime() - 40 * DAY),
        },
      }),
      subscription: subscriptionFor({ id: "sub_NEW", planKey: "writer_gold" }),
      payment: paymentOf(),
      now: NOW,
    });
    assert.equal(effect.kind, "charge");
    assert.equal(effect.cancelPrevious, "sub_OLD");
    assert.equal(effect.set["subscription.recurring.razorpaySubscriptionId"], "sub_NEW");
    assert.equal(effect.freshActivation, true, "gold starts today; silver days are not carried over");
  });

  test("a charge on a mandate the user has since replaced is booked but does not touch access", () => {
    const effect = planChargeEffect({
      user: userWith({
        accessTier: "writer_gold",
        accessStatus: "active",
        accessExpiresAt: new Date(NOW.getTime() + 25 * DAY),
        recurring: {
          razorpaySubscriptionId: "sub_GOLD",
          status: "active",
          autoRenew: true,
          subscriptionCreatedAt: new Date(NOW.getTime() - 5 * DAY),
        },
      }),
      subscription: subscriptionFor({ id: "sub_SILVER", planKey: "writer_silver", createdAt: new Date(NOW.getTime() - 60 * DAY) }),
      payment: paymentOf({ amount: 39900 }),
      now: NOW,
    });
    assert.equal(effect.kind, "stale_charge");
    assert.equal(effect.set, undefined);
    assert.equal(effect.ledger.amountMinor, 39900);
    assert.equal(effect.cancelSubscriptionId, "sub_SILVER");
  });

  test("a USD plan that fell back to INR is checked against the INR price", () => {
    const effect = planChargeEffect({ user: userWith(), subscription: subscriptionFor(), payment: paymentOf({ currency: "INR", amount: 69900 }), now: NOW });
    assert.equal(effect.kind, "charge");
    const usd = planChargeEffect({ user: userWith(), subscription: subscriptionFor(), payment: paymentOf({ currency: "USD", amount: 900 }), now: NOW });
    assert.equal(usd.kind, "charge");
    assert.equal(usd.ledger.currency, "USD");
  });

  test("an annual plan must be paid at the annual price", () => {
    const sub = subscriptionFor({ cycle: "annual", end: new Date(NOW.getTime() + 365 * DAY) });
    const monthlyMoney = planChargeEffect({ user: userWith(), subscription: sub, payment: paymentOf({ amount: 69900 }), now: NOW });
    assert.notEqual(monthlyMoney.kind, "charge", "a monthly amount must not buy a year");
    const annual = planChargeEffect({ user: userWith(), subscription: sub, payment: paymentOf({ amount: 713000 }), now: NOW });
    assert.equal(annual.kind, "charge");
  });
});

describe("mirrored subscription state", () => {
  test("a cancelled or halted subscription is not renewing and has no next charge", () => {
    for (const status of ["cancelled", "halted", "completed", "expired"]) {
      const set = recurringStateSet(subscriptionFor({ status }));
      assert.equal(set["subscription.recurring.autoRenew"], false, status);
      assert.equal(set["subscription.recurring.nextChargeAt"], null, status);
    }
  });

  test("cancel-at-period-end stops renewal even while Razorpay still says active", () => {
    const set = recurringStateSet(subscriptionFor({ status: "active" }), { cancelAtPeriodEnd: true });
    assert.equal(set["subscription.recurring.autoRenew"], false);
  });

  test("only notes stamped by our checkout count as a plan subscription", () => {
    assert.equal(isPlanSubscription(subscriptionFor()), true);
    assert.equal(isPlanSubscription({ notes: [] }), false, "Razorpay sends [] when there are no notes");
    assert.equal(isPlanSubscription({ notes: { purpose: "plan_subscription", billing: "recurring", planKey: "nope" } }), false);
  });

  test("the client view exposes state, never Razorpay ids", () => {
    const view = publicRecurringState({
      billingMode: "recurring",
      accessTier: "writer_gold",
      recurring: { razorpaySubscriptionId: "sub_SECRETISH", status: "active", autoRenew: true, planKey: "writer_gold", cycle: "monthly" },
    });
    assert.equal(view.autoRenew, true);
    assert.equal(JSON.stringify(view).includes("sub_SECRETISH"), false);
  });
});

describe("webhook routing", () => {
  test("non-subscription events are acknowledged and ignored", async () => {
    const result = await handleRazorpayWebhookEvent({ event: "payment.captured", payload: {} });
    assert.equal(result.handled, false);
  });

  test("subscription events that are not plan subscriptions are ignored", async () => {
    const result = await handleRazorpayWebhookEvent({
      event: "subscription.charged",
      payload: { subscription: { entity: { id: "sub_x", notes: [] } } },
    });
    assert.equal(result.handled, false);
  });
});
