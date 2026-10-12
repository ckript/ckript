import LedgerEntry from "../../models/LedgerEntry.js";
import Invoice from "../../models/Invoice.js";
import { recordReversal } from "../ledger.js";
import { issueCreditNote } from "../invoiceIssue.js";

/**
 * Refund a captured payment — the ONE path every refund takes.
 *
 *   1. Razorpay refunds the money (full or partial).
 *   2. A credit note (CGST Act s.34) is issued against the original tax invoice, reversing the taxes
 *      pro rata — never more than were charged.
 *   3. The ledger gets a reversal entry against the original, carrying the taxes reversed.
 *
 * Before this, a consultation refund called Razorpay and wrote nothing else: the money left, the
 * revenue stayed on the books, and the taxes were never reversed. A payment from before taxes applied
 * has no tax invoice, so it gets the reversal without a credit note.
 *
 * Refuses to refund more than what remains of the payment after earlier refunds.
 */
export const refundPayment = async ({
  razorpay,
  paymentId,
  amountMinor = null,
  // Only for a payment that predates the ledger (no original on the books): what to refund when no
  // amount is given. A booked payment always refunds what remains of it.
  fallbackAmountMinor = null,
  reason = "",
  notes = {},
  source = "",
}) => {
  const id = String(paymentId || "").trim();
  if (!razorpay || !id) return { ok: false, status: 400, message: "Nothing to refund." };

  const original = await LedgerEntry.findOne({ providerPaymentId: id, settlement: "paid" });
  const priorRefunds = original
    ? await LedgerEntry.find({ reversalOf: original._id, settlement: "reversed" }).select("amountMinor taxMinor").lean()
    : [];
  const alreadyRefunded = priorRefunds.reduce((total, r) => total + Math.abs(Number(r.amountMinor) || 0), 0);
  const paidMinor = original ? Math.abs(Number(original.amountMinor) || 0) : null;
  const remaining = paidMinor === null ? null : paidMinor - alreadyRefunded;
  const fallback = Number(fallbackAmountMinor) > 0 ? Math.round(Number(fallbackAmountMinor)) : null;
  const requested = amountMinor === null || amountMinor === undefined ? (remaining ?? fallback) : Math.round(Number(amountMinor));

  if (requested === null || !Number.isFinite(requested) || requested <= 0) {
    return { ok: false, status: 400, message: original ? "This payment has already been refunded in full." : "The original payment is not on the books, so it cannot be refunded here." };
  }
  if (remaining !== null && requested > remaining) {
    return { ok: false, status: 400, message: `At most ${(remaining / 100).toFixed(2)} ${original.currency} can still be refunded.` };
  }

  let refund;
  try {
    refund = await razorpay.payments.refund(id, {
      amount: requested,
      notes: { ...notes, reason: String(reason || "").slice(0, 200) },
    });
  } catch (error) {
    console.error(`[refund] Razorpay refused the refund of ${id}:`, error?.error?.description || error?.message || error);
    return { ok: false, status: 502, message: error?.error?.description || "Razorpay could not process the refund." };
  }

  const booked = await bookRefund({ paymentId: id, refundId: refund.id, amountMinor: requested, reason, source, original });
  return { ok: true, refund, amountMinor: requested, currency: original?.currency || refund.currency, ...booked };
};

/**
 * The bookkeeping half of a refund — credit note + ledger reversal — for a refund that has already
 * happened at Razorpay. refundPayment calls it after refunding; the webhook calls it for a refund made
 * straight from the Razorpay dashboard. Idempotent on the refund id.
 */
export const bookRefund = async ({ paymentId, refundId, amountMinor, reason = "", source = "", original = null }) => {
  const id = String(paymentId || "").trim();
  const ref = String(refundId || "").trim();
  if (!id || !ref) return { creditNote: null, reversal: null };
  const already = await LedgerEntry.findOne({ providerPaymentId: ref, settlement: "reversed" }).select("_id").lean();
  if (already) return { creditNote: null, reversal: { _id: already._id }, alreadyBooked: true };
  const ledgerOriginal = original || await LedgerEntry.findOne({ providerPaymentId: id, settlement: "paid" });
  const requested = Math.round(Number(amountMinor) || 0);

  // The tax invoice this payment was documented on — a credit note is issued only against one.
  const invoice = await Invoice.findOne({ providerPaymentId: id, documentType: "tax_invoice" });
  const creditNote = invoice
    ? await issueCreditNote({ original: invoice, refundGrossMinor: requested, refundId: ref, reason, source })
    : null;
  const creditTax = creditNote?._id
    ? await Invoice.findById(creditNote._id).select("tax.totals").lean()
    : null;

  const reversal = ledgerOriginal
    ? await recordReversal({
      original: ledgerOriginal,
      amountMinor: requested,
      reason,
      providerPaymentId: ref,
      source,
      taxMinor: creditTax?.tax?.totals?.taxMinor ?? null,
      creatorPayoutMinor: ledgerOriginal.amountMinor
        ? Math.round(Math.abs(Number(ledgerOriginal.creatorPayoutMinor) || 0) * requested / Math.abs(ledgerOriginal.amountMinor))
        : 0,
    })
    : null;

  return {
    creditNote: creditNote ? { _id: creditNote._id, invoiceNumber: creditNote.invoiceNumber } : null,
    reversal: reversal ? { _id: reversal._id } : null,
    // The taxes handed back inside this refund (0 for a payment that predates taxes).
    taxMinor: Math.abs(Number(creditTax?.tax?.totals?.taxMinor) || 0),
  };
};

export default refundPayment;
