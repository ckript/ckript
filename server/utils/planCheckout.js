import { PLAN_PRICES } from "../config/pricing.js";

/**
 * Plan checkout: make the ORDER authoritative, never the request body.
 *
 * Both plan verifiers previously checked only the Razorpay signature and then read `tier` and
 * `cycle` straight from `req.body` to decide what to grant. A signature proves that some payment on
 * this merchant account succeeded — nothing about which order, for how much, or by whom. So:
 *
 *   • Pay for Silver (₹399), call verify with tier:"gold"  → Gold granted.
 *   • Pay for a month, call verify with cycle:"annual"     → 365 days granted instead of 30.
 *
 * Both were reachable by any authenticated user with a legitimate cheap payment. The fix is to stamp
 * the plan and billing cycle into the Razorpay order at CREATION time — where the price is computed
 * server-side — and to read them back from the order at verification, ignoring the body entirely.
 * The client can still send anything it likes; nothing downstream reads it.
 *
 * The same shape as the competition-registration guard in competitionController.js, deliberately:
 * one pattern for "prove this payment belongs to this purchase" across the codebase.
 */

export const PLAN_PURPOSE = "plan_subscription";

/** The annual discount, applied to twelve months. One definition — it was inlined at four sites. */
const ANNUAL_MULTIPLIER = 12 * 0.85;

/**
 * Price for a plan, in MINOR units (paise / cents).
 *
 * Falls back to the INR column when a currency has no explicit price, matching getPlanAmount — the
 * USD figures are a fixed matrix, not an FX conversion.
 */
export const planAmountMinor = (planKey, currency, cycle) => {
  const prices = PLAN_PRICES[planKey];
  if (!prices) return null;
  const base = prices[String(currency || "INR").toUpperCase()] ?? prices.INR;
  if (!base) return null;
  return cycle === "annual" ? Math.round((base / 100) * ANNUAL_MULTIPLIER) * 100 : base;
};

const PLAN_LABELS = {
  film_industry_professional: "Film Industry Professional plan",
  writer_silver: "Writer Silver plan",
  writer_gold: "Writer Gold plan",
};

const PLAN_LINE_KINDS = {
  film_industry_professional: "plan_fip",
  writer_silver: "plan_writer_silver",
  writer_gold: "plan_writer_gold",
};

/** The plan as a priced line (PRE-TAX), for the tax engine. */
export const planLines = (planKey, currency, cycle) => {
  const amountMinor = planAmountMinor(planKey, currency, cycle);
  if (!amountMinor) return [];
  const label = PLAN_LABELS[planKey] || "Plan";
  return [{
    kind: PLAN_LINE_KINDS[planKey] || "plan",
    amountMinor,
    description: `${label} (${cycle === "annual" ? "annual" : "monthly"})`,
  }];
};

/** Stamped onto the order at creation. Razorpay returns notes on orders.fetch, so this needs no storage. */
export const planOrderNotes = ({ userId, planKey, tier = "", cycle }) => ({
  purpose: PLAN_PURPOSE,
  userId: String(userId),
  planKey,
  tier,
  cycle: cycle === "annual" ? "annual" : "monthly",
});

/**
 * Read back what Razorpay actually captured and prove the order belongs to this user and plan.
 *
 * Returns either `{ error, status }` or the verified facts. Callers must treat `notes.tier` and
 * `notes.cycle` as the only source of truth for what to grant.
 */
export const readVerifiedPlanOrder = async (razorpay, orderId, userId) => {
  let order;
  try {
    order = await razorpay.orders.fetch(orderId);
  } catch (error) {
    console.error("[plan checkout] order fetch failed:", error?.message || error);
    return { error: "Could not confirm the payment with Razorpay. Please contact support.", status: 502 };
  }
  if (!order) return { error: "Payment order could not be found.", status: 400 };

  const notes = order.notes || {};
  if (notes.purpose !== PLAN_PURPOSE || String(notes.userId) !== String(userId)) {
    return { error: "This payment does not belong to this subscription.", status: 400 };
  }

  const currency = String(order.currency || "INR").toUpperCase();
  // `amount_paid`, not `amount`: Razorpay reports the latter on orders that were created but never
  // captured, so trusting it would accept an unpaid order.
  const paidMinor = Number(order.amount_paid ?? order.amount) || 0;
  const expectedMinor = planAmountMinor(notes.planKey, currency, notes.cycle);

  if (!expectedMinor || paidMinor < expectedMinor) {
    return { error: "The amount paid does not match the plan price.", status: 400 };
  }

  return {
    order,
    notes,
    planKey: notes.planKey,
    tier: notes.tier,
    cycle: notes.cycle,
    currency,
    paidMinor,
    paidMajor: paidMinor / 100,
  };
};

export default readVerifiedPlanOrder;
