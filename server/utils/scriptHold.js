import { verifyRazorpaySignature } from "./razorpaySignature.js";

const text = (value) => String(value ?? "").trim();
const sameMoney = (left, right) => Math.abs(Number(left || 0) - Number(right || 0)) < 0.01;

/**
 * Kept for its existing callers and tests, but no longer a separate implementation: the HMAC check
 * lives in exactly one place (razorpaySignature.js), so a fix there reaches every flow.
 */
export const isValidRazorpaySignature = ({ orderId, paymentId, signature, secret } = {}) => {
  if (![orderId, paymentId, signature, secret].every((value) => text(value))) return false;
  return verifyRazorpaySignature({ orderId: text(orderId), paymentId: text(paymentId), signature: text(signature), secret });
};
/**
 * A valid callback proves more than possession of a signature: the fetched order and payment must
 * belong to this account and project, carry the exact server-authored purpose/price, and be fully
 * captured. This is deliberately pure so every refusal can be pinned without a provider or Mongo.
 */
export const validateScriptHoldPayment = ({
  order,
  payment,
  orderId,
  paymentId,
  userId,
  scriptId,
  expectedTotalInr,
} = {}) => {
  const notes = order?.notes || {};
  const orderAmount = Number(order?.amount || 0);
  const paymentAmount = Number(payment?.amount || 0);
  const orderCurrency = text(order?.currency).toUpperCase();
  const paymentCurrency = text(payment?.currency).toUpperCase();

  if (text(order?.id) !== text(orderId) || text(payment?.id) !== text(paymentId)) {
    return { ok: false, message: "Payment identity does not match this checkout." };
  }
  if (text(notes.type) !== "script_hold"
      || text(notes.userId) !== text(userId)
      || text(notes.scriptId) !== text(scriptId)) {
    return { ok: false, message: "Payment order does not belong to this account and project." };
  }
  if (!sameMoney(notes.totalAmountInr, expectedTotalInr)) {
    return { ok: false, message: "The hold price changed before payment was verified." };
  }
  if (text(order?.status).toLowerCase() !== "paid"
      || Number(order?.amount_paid || 0) !== orderAmount
      || orderAmount <= 0) {
    return { ok: false, pending: true, message: "The payment has not been fully paid yet." };
  }
  if (text(payment?.order_id) !== text(orderId)
      || text(payment?.status).toLowerCase() !== "captured"
      || payment?.captured !== true) {
    return { ok: false, pending: true, message: "The payment has not been captured yet." };
  }
  if (paymentAmount !== orderAmount || !orderCurrency || paymentCurrency !== orderCurrency) {
    return { ok: false, message: "Captured payment amount or currency does not match the order." };
  }

  return {
    ok: true,
    charge: {
      currency: orderCurrency,
      amountMinor: orderAmount,
      chargedTotal: orderAmount / 100,
      // An order that fell back from USD to INR keeps the USD rate in its notes; INR is always 1.
      fxRate: orderCurrency === "INR" ? 1 : Number(notes.fxRate) || 1,
      paidAt: payment?.created_at ? new Date(Number(payment.created_at) * 1000) : new Date(),
    },
  };
};
