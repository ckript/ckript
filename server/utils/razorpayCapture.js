import { verifyRazorpaySignature } from "./razorpaySignature.js";

/**
 * Prove a checkout callback is the payment for THIS purchase — not merely some payment on the account.
 *
 * A valid signature only proves Razorpay issued that order/payment pair. Before this existed, the
 * script purchase and AI trailer verifiers stopped there, so a genuine ₹98 competition payment could
 * be replayed against a ₹1,00,000 script. Every verifier now also proves, from Razorpay's own records:
 *
 *   • the order and payment are the ones named, and belong together;
 *   • the order's notes were stamped by OUR order-creation code for this user and this subject;
 *   • the order is fully paid and the payment captured, for the order's exact amount and currency;
 *   • (optionally) the amount equals what the server priced — the tax-added total.
 *
 * `validateCapturedOrder` is pure, so each refusal is pinned by a test without a provider.
 */

const text = (value) => String(value ?? "").trim();

export const validateCapturedOrder = ({
  order,
  payment,
  orderId,
  paymentId,
  expectNotes = {},
  expectedAmountMinor = null,
} = {}) => {
  const notes = order?.notes && !Array.isArray(order.notes) ? order.notes : {};
  const orderAmount = Number(order?.amount || 0);
  const orderCurrency = text(order?.currency).toUpperCase();

  if (text(order?.id) !== text(orderId) || text(payment?.id) !== text(paymentId)) {
    return { ok: false, message: "Payment identity does not match this checkout." };
  }
  for (const [key, expected] of Object.entries(expectNotes)) {
    if (expected === undefined || expected === null) continue;
    if (text(notes[key]) !== text(expected)) {
      return { ok: false, message: "This payment does not belong to this purchase." };
    }
  }
  if (expectedAmountMinor !== null && orderAmount !== Number(expectedAmountMinor)) {
    return { ok: false, message: "The amount paid does not match the price of this purchase." };
  }
  if (text(order?.status).toLowerCase() !== "paid" || Number(order?.amount_paid || 0) !== orderAmount || orderAmount <= 0) {
    return { ok: false, pending: true, message: "The payment has not been fully paid yet." };
  }
  if (text(payment?.order_id) !== text(orderId) || text(payment?.status).toLowerCase() !== "captured") {
    return { ok: false, pending: true, message: "The payment has not been captured yet." };
  }
  if (Number(payment?.amount || 0) !== orderAmount || text(payment?.currency).toUpperCase() !== orderCurrency) {
    return { ok: false, message: "Captured payment amount or currency does not match the order." };
  }

  return {
    ok: true,
    charge: {
      currency: orderCurrency,
      amountMinor: orderAmount,
      chargedTotal: orderAmount / 100,
      // An order that fell back from USD to INR still carries the USD rate in its notes; an INR charge
      // has an FX rate of 1, always.
      fxRate: orderCurrency === "INR" ? 1 : Number(notes.fxRate) || 1,
      paidAt: payment?.created_at ? new Date(Number(payment.created_at) * 1000) : new Date(),
      fee: Number(payment?.fee || 0),
      feeTax: Number(payment?.tax || 0),
      international: Boolean(payment?.international),
    },
  };
};

/**
 * Signature + both fetches + validation, for a verify handler. Returns the validation result, or
 * `{ ok:false, status, message }` for a bad signature or an unreachable provider.
 */
export const readVerifiedOrder = async (razorpay, { orderId, paymentId, signature, expectNotes, expectedAmountMinor = null }) => {
  if (!orderId || !paymentId || !signature) {
    return { ok: false, status: 400, message: "Payment verification payload is incomplete." };
  }
  if (!verifyRazorpaySignature({ orderId: String(orderId), paymentId: String(paymentId), signature: String(signature) })) {
    return { ok: false, status: 400, message: "Payment verification failed - Invalid signature" };
  }
  let order;
  let payment;
  try {
    [order, payment] = await Promise.all([
      razorpay.orders.fetch(String(orderId)),
      razorpay.payments.fetch(String(paymentId)),
    ]);
  } catch (error) {
    console.error("[razorpay] could not fetch the order/payment:", error?.error?.description || error?.message || error);
    return { ok: false, status: 502, message: "Could not confirm the payment with Razorpay. Please contact support." };
  }
  const result = validateCapturedOrder({ order, payment, orderId, paymentId, expectNotes, expectedAmountMinor });
  if (!result.ok) return { ...result, status: result.pending ? 409 : 400 };
  return { ...result, order, payment };
};
