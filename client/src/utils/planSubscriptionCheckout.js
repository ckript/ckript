import api from "../services/api";
import { razorpayKeyFromOrder } from "./razorpayKey";
import { formatSubunits } from "./currency";

/* ─────────────────────────────────────────────────────────────
   Recurring plan checkout — Razorpay Subscriptions.

   Plans used to be sold as one-time Razorpay orders: one charge,
   thirty (or 365) days, then the plan quietly lapsed. This opens a
   Razorpay Subscription instead, so the card or UPI mandate is
   charged every month (or year) until the member cancels.

   The two plan hooks (writer Silver/Gold and FIP) both call this
   first. It resolves — never rejects for a business outcome — with:

     { outcome: "success",   data }   verified; data.user is the refreshed account
     { outcome: "fallback",  message } the server can't do recurring right now
                                       → the hook sells a one-time period instead
     { outcome: "dismissed" }          the member closed the Razorpay sheet

   and rejects only for real errors (network, verification failure).
   ───────────────────────────────────────────────────────────── */

export const RECURRING_UNAVAILABLE = "RECURRING_UNAVAILABLE";
export const RENEWING_STATUSES = ["authenticated", "active", "pending"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* The account's recurring-billing state, normalised for the UI. */
export const recurringStateOf = (user) => {
  const sub = user?.subscription || {};
  const rec = sub.recurring || {};
  const autoRenew = Boolean(rec.autoRenew) && RENEWING_STATUSES.includes(String(rec.status || ""));
  return {
    billingMode: sub.billingMode || "one_time",
    planKey: rec.planKey || "",
    tier: rec.tier || "",
    cycle: rec.cycle || "",
    status: rec.status || "",
    autoRenew,
    cancelAtPeriodEnd: Boolean(rec.cancelAtPeriodEnd),
    amountMinor: Number(rec.amountMinor) || 0,
    currency: rec.currency || "",
    nextChargeAt: rec.nextChargeAt || null,
    accessExpiresAt: sub.accessExpiresAt || sub.expiresAt || null,
    accessTier: sub.accessTier || "none",
  };
};

/* Does the plan behind `accessTier` renew by itself? */
export const renewsAutomatically = (user, accessTier) => {
  const state = recurringStateOf(user);
  return state.autoRenew && state.accessTier === accessTier;
};

export const formatBillingDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

const PLAN_LABELS = {
  writer_silver: "Writer Silver",
  writer_gold: "Writer Gold",
  film_industry_professional: "Film Industry Professional",
};

/* Everything a settings surface (desktop card or mobile section) says about
   the member's paid plan, worked out once so the two never disagree. */
export const planBillingView = (user) => {
  const sub = user?.subscription || {};
  const billing = recurringStateOf(user);
  const expiry = new Date(sub.accessExpiresAt || sub.expiresAt || 0).getTime();
  // The free FIP tier is "active" with no expiry and plan "free" — nothing to bill or cancel.
  const fipFreeTier = sub.accessTier === "film_industry_professional" && !["pro", "diamond"].includes(sub.plan);
  const paid = Boolean(PLAN_LABELS[sub.accessTier]) && !fipFreeTier && sub.accessStatus === "active" && expiry > Date.now();
  const label = PLAN_LABELS[sub.accessTier] || "Plan";
  const cycle = billing.cycle === "annual" ? "yearly" : billing.cycle === "monthly" ? "monthly" : "";
  const accessEnds = formatBillingDate(billing.accessExpiresAt);
  const nextCharge = formatBillingDate(billing.nextChargeAt || billing.accessExpiresAt);
  const amount = billing.amountMinor ? formatSubunits(billing.amountMinor, billing.currency || "INR") : "";
  const renewing = paid && billing.autoRenew && billing.accessTier === sub.accessTier;
  const failing = renewing && billing.status === "pending";

  let description;
  if (!paid) description = "You're on the free plan.";
  else if (failing) description = "The last renewal didn't go through. Razorpay is retrying — update your payment method from the link Razorpay sent you.";
  else if (renewing && billing.status === "authenticated") description = `Renews automatically from ${nextCharge}${amount ? ` · ${amount}` : ""}`;
  else if (renewing) description = `Renews automatically on ${nextCharge}${amount ? ` · ${amount}` : ""}`;
  else if (billing.billingMode === "recurring") description = `Auto-renew is off · access until ${accessEnds}`;
  else description = `One-time purchase · access until ${accessEnds}`;

  return {
    paid,
    renewing,
    failing,
    label,
    title: paid ? `${label}${cycle ? ` · ${cycle}` : ""}` : "Plan & billing",
    description,
    accessEnds,
    actionLabel: paid ? "Turn on auto-renew" : "See plans",
    pricingTab: sub.accessTier === "film_industry_professional" ? "industry" : "writer",
    cancelPrompt: `Stop automatic renewal? You won't be charged again, and you keep ${label} until ${accessEnds}. Nothing is refunded.`,
  };
};

/* Merge a refreshed account into the persisted session without clobbering the
   auth token and its expiry. */
export const mergeSessionUser = (freshUser, setUser) => {
  if (!freshUser) return null;
  let stored;
  try {
    stored = JSON.parse(localStorage.getItem("user") || "null") || {};
  } catch {
    stored = {};
  }
  const merged = {
    ...stored,
    ...freshUser,
    token: stored.token,
    expiresAt: stored.expiresAt || freshUser.expiresAt,
  };
  if (typeof setUser === "function") setUser(merged);
  try {
    localStorage.setItem("user", JSON.stringify(merged));
  } catch {
    /* storage can be unavailable (private mode); the in-memory session still updated */
  }
  return merged;
};

/* Some first payments are confirmed by Razorpay a moment after checkout
   (verify answers 202). Re-sync from Razorpay until access lands, then give up
   gracefully — the webhook and the next page load will still apply it. */
const waitForActivation = async (accessTier, { attempts = 6, intervalMs = 5000 } = {}) => {
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    await sleep(intervalMs);
    try {
      const { data } = await api.get("/payment/subscriptions/current", { params: { refresh: "1" } });
      last = data;
      const sub = data?.user?.subscription || {};
      const expiry = new Date(sub.accessExpiresAt || sub.expiresAt || 0).getTime();
      if (sub.accessTier === accessTier && sub.accessStatus === "active" && expiry > Date.now()) {
        return { ...data, status: "active", activated: true };
      }
    } catch {
      /* keep polling */
    }
  }
  return { ...(last || {}), status: "activating", activated: false };
};

export async function openRecurringPlanCheckout({
  plan, // "silver" | "gold" | "fip"
  accessTier, // the tier this plan grants, to know when activation has landed
  cycle = "monthly",
  currency = "INR",
  user,
  returnTo = "",
  billing = null,
  saveBilling = false,
  onVerifying,
}) {
  let created;
  try {
    ({ data: created } = await api.post("/payment/subscriptions", {
      plan,
      cycle,
      currency,
      ...(billing ? { billing, saveBilling } : {}),
    }));
  } catch (error) {
    const body = error?.response?.data || {};
    if (body.code === RECURRING_UNAVAILABLE) return { outcome: "fallback", message: body.message || "" };
    throw error;
  }

  const key = razorpayKeyFromOrder(created);

  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key,
      subscription_id: created.subscriptionId,
      name: "Ckript",
      description: created.description || "Plan subscription",
      handler: async (response) => {
        try {
          if (typeof onVerifying === "function") onVerifying();
          const { data, status } = await api.post("/payment/subscriptions/verify", {
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_subscription_id: response.razorpay_subscription_id,
            razorpay_signature: response.razorpay_signature,
            returnTo,
          });
          const result = status === 202 ? { ...data, ...(await waitForActivation(accessTier)) } : data;
          resolve({ outcome: "success", data: { ...result, startsAt: created.startsAt || null, created } });
        } catch (error) {
          reject(error);
        }
      },
      prefill: {
        name: user?.name || "",
        email: user?.email || "",
      },
      theme: { color: "#0f1320" },
      modal: {
        ondismiss: () => resolve({ outcome: "dismissed" }),
      },
    });
    checkout.open();
  });
}

/* Turn automatic renewal off. Access already paid for is kept until it ends. */
export async function cancelRecurringPlan() {
  const { data } = await api.post("/payment/subscriptions/cancel");
  return data;
}

/* Fetch (and re-sync from Razorpay) the current recurring state. */
export async function fetchRecurringPlan({ refresh = false } = {}) {
  const { data } = await api.get("/payment/subscriptions/current", {
    params: refresh ? { refresh: "1" } : undefined,
  });
  return data;
}
