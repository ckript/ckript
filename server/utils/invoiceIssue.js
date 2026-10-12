import Invoice from "../models/Invoice.js";
import { TAX_LABEL } from "../config/tax.js";
import { isTaxedSupply, scaleSnapshot } from "./tax/engine.js";
import { allocateDocumentNumber, istParts, taxPeriodOf } from "./tax/documentNumber.js";
import { sendDocumentEmail } from "./tax/documentMail.js";
import { reportingPeriodFor } from "./tax/periods.js";

/** Email the buyer about a NEWLY issued document. Never awaited by the payment path, never throws. */
const announce = (doc, notify) => {
  if (notify && doc?._id) sendDocumentEmail(doc).catch(() => {});
  return doc;
};

/**
 * Issue the document for a payment — one implementation, every payment surface.
 *
 * Four surfaces took real money and produced no document at all: plan subscriptions (₹1,999 / ₹399 /
 * ₹699), script holds, AI trailers, and free-access script grants. The buyer's only trace was a
 * mutated sub-document and a ledger row visible to nobody but the company. For a paid product in
 * India that is a compliance problem, not a polish one.
 *
 * Two rules this module exists to hold:
 *
 *   1. NEVER FAIL A PAYMENT. The money has already moved by the time we are called. A document that
 *      cannot be written is logged and skipped — `null` comes back, and the caller carries on. The
 *      buyer can always be issued one later; a 500 after a successful charge cannot be undone.
 *   2. IDEMPOTENT ON THE PAYMENT REFERENCE. Payment callbacks retry. The unique index on
 *      `paymentReference` is the real guarantee; the pre-check is just the cheap path, and a
 *      duplicate-key error is treated as the success it actually is.
 *
 * With a `tax` snapshot for a taxable supply the document is a TAX INVOICE: numbered in the
 * consecutive financial-year series (CK/2627/000123), carrying the snapshot, and with rows built from
 * it — so every figure on the PDF is the figure the buyer was charged. Without one (taxes switched off,
 * free access, payments before the registration date) it is issued exactly as before.
 */

/**
 * The kinds an invoice can have, and how each one describes itself.
 *
 * `detail` builds the right-hand panel of the document. Keeping it here rather than in the PDF route
 * means adding a new payment surface needs no change to invoiceController at all.
 */
export const INVOICE_KINDS = {
  script: {
    prefix: "INV-SCP",
    detailTitle: "Project",
  },
  competition_registration: {
    prefix: "CKR-REG",
    detailTitle: "Entry Details",
  },
  plan_subscription: {
    prefix: "CKR-PLN",
    detailTitle: "Subscription",
  },
  script_hold: {
    prefix: "CKR-HLD",
    detailTitle: "Hold",
  },
  ai_trailer: {
    prefix: "CKR-TRL",
    detailTitle: "AI Trailer",
  },
  consultation: {
    prefix: "CKR-CNS",
    detailTitle: "Consultation",
  },
};

/**
 * Legacy (non-tax) document number: PREFIX-YYYYMMDD-XXXXXXXX, dated in India time.
 *
 * Still used for documents that are not tax invoices — free-access confirmations, and everything while
 * taxes are switched off. Tax invoices use the consecutive series in utils/tax/documentNumber.js.
 */
export const buildInvoiceNumber = (kind, paymentId = "") => {
  const prefix = INVOICE_KINDS[kind]?.prefix || "CKR-INV";
  const { year, month, day } = istParts(new Date());
  const stamp = `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
  const suffix = String(paymentId || "").replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase()
    || Date.now().toString().slice(-8);
  return `${prefix}-${stamp}-${suffix}`;
};

const money = (amount, currency = "INR") =>
  `${String(currency || "INR").toUpperCase()} ${Number(amount || 0).toFixed(2)}`;

const minorLabel = (minor, currency) => money((Number(minor) || 0) / 100, currency);

/**
 * The rows of a tax invoice, from its snapshot. Lines at their TAXABLE value, then one "Taxes (18%)"
 * row — the statutory CGST/SGST/IGST breakup is printed by the PDF from the snapshot itself.
 */
export const taxInvoiceRows = (tax, { paymentId = "", detailByKind = {} } = {}) => {
  const currency = tax.currency;
  const rows = tax.lines.map((line) => ({
    item: line.description,
    type: line.sac ? `SAC ${line.sac}` : "Service",
    detail: detailByKind[line.kind] || "",
    amountLabel: minorLabel(line.taxableMinor, currency),
    amountValue: line.taxableMinor / 100,
  }));
  rows.push({
    item: `${TAX_LABEL} (${tax.rateBps / 100}%)`,
    type: "Taxes",
    detail: tax.gap ? "Included in the amount already paid." : "",
    amountLabel: minorLabel(tax.totals.taxMinor, currency),
    amountValue: tax.totals.taxMinor / 100,
  });
  rows.push(totalRow(tax.totals.grossMinor / 100, currency));
  if (paymentId) rows.push(gatewayRow(paymentId));
  return rows;
};

/** Write a placeholder for a number that was allocated but whose document could not be stored. */
const recordCancelledNumber = async ({ allocated, creatorId, kind, reason }) => {
  try {
    await Invoice.create({
      invoiceNumber: allocated.number,
      documentType: "cancelled",
      series: allocated.series,
      fy: allocated.fy,
      seq: allocated.seq,
      taxPeriod: taxPeriodOf(new Date()),
      invoiceDate: new Date(),
      kind,
      creator: creatorId,
      detailLines: [`Number not issued: ${reason}`],
    });
  } catch (error) {
    console.error(`[invoice] could not record cancelled number ${allocated.number}:`, error?.message || error);
  }
};

/**
 * Create the document, or return the one a concurrent callback already created.
 *
 * The PDF is deliberately NOT rendered here. Rendering means a PDFKit pass plus a Cloudinary upload,
 * and putting that in the payment path buys a slower checkout and a new way for it to fail; the
 * download route renders on first request and caches the result, which is how competition entry
 * invoices have always worked.
 */
export const issueInvoice = async ({
  kind,
  user,
  paymentReference = "",
  currency = "INR",
  amountCharged = 0,
  accessType = "premium",
  rows = [],
  detailLines = [],
  detailTitle = "",
  script = null,
  scriptSid = "",
  competition = null,
  consultation = null,
  scriptPrice = 0,
  writerEarnsPerSale = 0,
  tax = null,
  providerPaymentId = "",
  supplyDate = null,
  detailByKind = {},
  notify = true,
  source = "",
}) => {
  if (!INVOICE_KINDS[kind]) {
    console.error(`[invoice] refusing to issue an unknown kind "${kind}" from ${source}`);
    return null;
  }
  if (!user?._id && !user) {
    console.error(`[invoice] refusing to issue ${kind} with no user (${source})`);
    return null;
  }

  const creatorId = user?._id || user;
  const reference = String(paymentReference || "").trim();
  const paymentId = String(providerPaymentId || "").trim();
  const isTaxInvoice = Boolean(tax && isTaxedSupply(tax.supplyType));

  try {
    // Cheap path. The unique index below is what actually prevents a double issue.
    if (reference) {
      const existing = await Invoice.findOne({ paymentReference: reference })
        .select("_id invoiceNumber pdfPath documentType");
      if (existing) return existing;
    }
    if (isTaxInvoice && paymentId) {
      const existingTax = await Invoice.findOne({ providerPaymentId: paymentId, documentType: "tax_invoice" })
        .select("_id invoiceNumber pdfPath documentType");
      if (existingTax) return existingTax;
    }

    const now = new Date();
    const base = {
      paymentReference: reference || undefined,
      invoiceDate: now,
      kind,
      creator: creatorId,
      creatorSid: user?.sid || "",
      accessType,
      script: script || undefined,
      scriptSid: scriptSid || "",
      competition: competition || undefined,
      consultation: consultation || undefined,
      scriptPrice: Number(scriptPrice) || 0,
      writerEarnsPerSale: Number(writerEarnsPerSale) || 0,
      detailTitle: detailTitle || INVOICE_KINDS[kind].detailTitle,
      detailLines: detailLines.filter(Boolean).map(String),
      providerPaymentId: paymentId,
      supplyDate: supplyDate || now,
    };

    if (!isTaxInvoice) {
      return announce(await Invoice.create({
        ...base,
        invoiceNumber: buildInvoiceNumber(kind, reference),
        // Nothing charged = a record of access granted, not an invoice (no consideration, no tax).
        documentType: Number(amountCharged) > 0 ? "legacy_invoice" : "access_confirmation",
        currency: String(currency || "INR").toUpperCase(),
        amountCharged: Number(amountCharged) || 0,
        rows,
        taxPeriod: taxPeriodOf(now),
      }), notify);
    }

    const allocated = await allocateDocumentNumber("tax_invoice", now);
    try {
      return announce(await Invoice.create({
        ...base,
        invoiceNumber: allocated.number,
        documentType: "tax_invoice",
        series: allocated.series,
        fy: allocated.fy,
        seq: allocated.seq,
        // The return period follows the supply: a back-filled invoice for an October payment is an
        // October supply even when the document is issued in November.
        taxPeriod: await reportingPeriodFor(supplyDate || now, now),
        currency: tax.currency,
        amountCharged: tax.totals.grossMinor / 100,
        tax,
        rows: taxInvoiceRows(tax, { paymentId, detailByKind }),
      }), notify);
    } catch (error) {
      await recordCancelledNumber({ allocated, creatorId, kind, reason: error?.code === 11000 ? "duplicate callback" : "write failed" });
      throw error;
    }
  } catch (error) {
    // A duplicate key means a concurrent callback won the race — the desired outcome, not a failure.
    if (error?.code === 11000 && (reference || paymentId)) {
      return Invoice.findOne(reference ? { paymentReference: reference } : { providerPaymentId: paymentId, documentType: "tax_invoice" })
        .select("_id invoiceNumber pdfPath documentType");
    }
    // Non-fatal by design: see rule 1 above.
    console.error(`[invoice] could not issue ${kind} invoice (${source}):`, error?.message || error);
    return null;
  }
};

/**
 * Issue a credit note (CGST Act s.34) against a tax invoice — a full or partial refund.
 *
 * Idempotent on the refund id. `refundGrossMinor` is the amount refunded INCLUDING taxes; the taxes
 * reversed are the original's, scaled pro rata, so a credit note can never reverse more than was
 * charged.
 */
export const issueCreditNote = async ({ original, refundGrossMinor, refundId = "", reason = "", source = "", notify = true }) => {
  if (!original?._id || original.documentType !== "tax_invoice" || !original.tax) return null;
  const ref = String(refundId || "").trim();
  try {
    if (ref) {
      const existing = await Invoice.findOne({ documentType: "credit_note", refundId: ref })
        .select("_id invoiceNumber pdfPath documentType");
      if (existing) return existing;
    }
    const tax = scaleSnapshot(original.tax.toObject ? original.tax.toObject() : original.tax, refundGrossMinor);
    const now = new Date();
    const allocated = await allocateDocumentNumber("credit_note", now);
    try {
      return announce(await Invoice.create({
        invoiceNumber: allocated.number,
        documentType: "credit_note",
        series: allocated.series,
        fy: allocated.fy,
        seq: allocated.seq,
        taxPeriod: await reportingPeriodFor(now, now),
        invoiceDate: now,
        supplyDate: original.supplyDate || original.invoiceDate,
        kind: original.kind,
        creator: original.creator,
        creatorSid: original.creatorSid || "",
        script: original.script || undefined,
        scriptSid: original.scriptSid || "",
        competition: original.competition || undefined,
        consultation: original.consultation || undefined,
        paymentReference: ref ? `CN-${ref}` : undefined,
        providerPaymentId: original.providerPaymentId || "",
        refundId: ref,
        currency: tax.currency,
        amountCharged: -(tax.totals.grossMinor / 100),
        tax,
        originalInvoice: original._id,
        originalInvoiceNumber: original.invoiceNumber,
        originalInvoiceDate: original.invoiceDate,
        creditReason: String(reason || "Refund").slice(0, 300),
        detailTitle: "Credit note",
        detailLines: [
          `Against invoice ${original.invoiceNumber}`,
          `Invoice date: ${new Date(original.invoiceDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}`,
          reason ? `Reason: ${reason}` : "",
          ref ? `Refund: ${ref}` : "",
        ].filter(Boolean),
        rows: taxInvoiceRows(tax, { paymentId: original.providerPaymentId || "" }),
      }), notify);
    } catch (error) {
      await recordCancelledNumber({ allocated, creatorId: original.creator, kind: original.kind, reason: "credit note write failed" });
      throw error;
    }
  } catch (error) {
    if (error?.code === 11000 && ref) {
      return Invoice.findOne({ documentType: "credit_note", refundId: ref }).select("_id invoiceNumber pdfPath documentType");
    }
    console.error(`[invoice] could not issue a credit note for ${original?.invoiceNumber} (${source}):`, error?.message || error);
    return null;
  }
};

/** A single "Total Paid" row, which every non-script invoice ends with. */
export const totalRow = (amount, currency) => ({
  item: "Total Paid",
  type: "Total",
  detail: "Total charged via payment gateway.",
  amountLabel: money(amount, currency),
  amountValue: Number(amount) || 0,
});

/** The gateway reference row — printed under "Reference", never counted as money. */
export const gatewayRow = (paymentId) => ({
  item: "Payment Gateway",
  type: "Reference",
  detail: `Razorpay Payment ID: ${paymentId || "-"}`,
  amountLabel: "Verified",
  amountValue: 0,
});

export { money as formatInvoiceMoney };
export default { INVOICE_KINDS, buildInvoiceNumber, issueInvoice, issueCreditNote, totalRow, gatewayRow };
