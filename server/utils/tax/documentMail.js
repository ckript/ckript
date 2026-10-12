import User from "../../models/User.js";
import { sendPaymentDocumentEmail } from "../emailService.js";

/**
 * Email the buyer when a payment document is issued: a receipt with its tax invoice, or a refund with
 * its credit note. Called by the shared issuer (utils/invoiceIssue.js) for NEWLY created documents only,
 * so a retried callback never sends a second receipt.
 *
 * Fire-and-forget: the payment is already captured, so a mail outage is logged, never surfaced.
 */

const money = (minor, currency) => {
  const code = String(currency || "INR").toUpperCase();
  return `${code === "INR" ? "₹" : "$"}${((Number(minor) || 0) / 100).toLocaleString(code === "INR" ? "en-IN" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const longDate = (value) => new Date(value || Date.now()).toLocaleDateString("en-GB", {
  day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata",
});

const DOCUMENT_LABELS = {
  tax_invoice: "Tax invoice",
  credit_note: "Credit note",
  legacy_invoice: "Invoice",
};

/** The figures the email lists, from the snapshot when there is one. Says "Taxes" — never GST. */
export const documentMailRows = (invoice) => {
  const tax = invoice?.tax;
  if (tax?.totals) {
    const rows = (tax.lines || []).map((line) => [line.description, money(line.taxableMinor, tax.currency)]);
    if (tax.totals.taxMinor > 0) rows.push([`Taxes (${tax.rateBps / 100}%)`, money(tax.totals.taxMinor, tax.currency)]);
    return { rows, total: money(tax.totals.grossMinor, tax.currency) };
  }
  return { rows: [], total: money(Math.round(Math.abs(Number(invoice?.amountCharged || 0)) * 100), invoice?.currency) };
};

export const sendDocumentEmail = async (invoice) => {
  try {
    // Tax documents only: with taxes switched off nothing new is sent, so that mode stays exactly as it
    // was before taxes existed.
    if (!invoice?.creator || !["tax_invoice", "credit_note"].includes(invoice.documentType)) return;
    const user = await User.findById(invoice.creator).select("name email");
    if (!user?.email) return;
    const { rows, total } = documentMailRows(invoice);
    await sendPaymentDocumentEmail(user.email, {
      name: user.name,
      isCredit: invoice.documentType === "credit_note",
      documentLabel: DOCUMENT_LABELS[invoice.documentType] || "Invoice",
      number: invoice.invoiceNumber,
      date: longDate(invoice.invoiceDate),
      title: (invoice.detailLines || [])[0] || "",
      rows,
      total,
      againstNumber: invoice.originalInvoiceNumber || "",
    });
  } catch (error) {
    console.error(`[mail] could not send the document email for ${invoice?.invoiceNumber}:`, error?.message || error);
  }
};

export default sendDocumentEmail;
