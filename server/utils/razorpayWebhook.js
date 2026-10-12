import PaymentQuote from "../models/PaymentQuote.js";
import { handleRazorpayWebhookEvent } from "./planSubscription.js";
import { bookRefund } from "./tax/refunds.js";

/**
 * Every Razorpay webhook event, routed. One endpoint (/api/webhooks/razorpay), verified once.
 *
 *   subscription.*     plan renewals, cancellations, failed retries — fulfilled server-side
 *                      (utils/planSubscription.js), because renewals happen with nobody on the site.
 *   payment.captured   recorded against the order's quote, so the finance reconciliation can list any
 *   order.paid         capture that the checkout callback never fulfilled (a closed tab, a dead
 *                      connection). Fulfilment of one-off purchases stays with each flow's verify
 *                      handler and recovery path, which own the domain rules for what was bought.
 *   refund.processed   a refund made straight from the Razorpay dashboard still gets its credit note
 *                      and ledger reversal. Refunds made through the app are already booked; this is
 *                      idempotent on the refund id.
 */

const entityOf = (event, name) => event?.payload?.[name]?.entity || null;

const markCaptured = async (payment) => {
  if (!payment?.order_id || !payment?.id) return { handled: false, reason: "no order on the payment" };
  const result = await PaymentQuote.updateOne(
    { orderId: String(payment.order_id), capturedPaymentId: "" },
    { $set: { capturedPaymentId: String(payment.id) } },
  );
  return { handled: true, quoteUpdated: Boolean(result.modifiedCount) };
};

export const dispatchRazorpayWebhook = async (event, { razorpay } = {}) => {
  const type = String(event?.event || "");

  if (type.startsWith("subscription.")) return handleRazorpayWebhookEvent(event, { razorpay });

  if (type === "payment.captured" || type === "order.paid") {
    return { type, ...(await markCaptured(entityOf(event, "payment"))) };
  }

  if (type === "refund.processed") {
    const refund = entityOf(event, "refund");
    if (!refund?.id || !refund?.payment_id) return { handled: false, reason: "incomplete refund" };
    const booked = await bookRefund({
      paymentId: refund.payment_id,
      refundId: refund.id,
      amountMinor: Number(refund.amount) || 0,
      reason: refund.notes?.reason || "Refund processed by Razorpay",
      source: "webhook:refund.processed",
    });
    return { handled: true, type, alreadyBooked: Boolean(booked.alreadyBooked), creditNote: booked.creditNote?.invoiceNumber || null };
  }

  return { handled: false, reason: `ignored ${type || "unknown"} event` };
};

export default dispatchRazorpayWebhook;
