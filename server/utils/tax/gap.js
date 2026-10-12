import LedgerEntry from "../../models/LedgerEntry.js";
import Invoice from "../../models/Invoice.js";
import User from "../../models/User.js";
import { taxLiabilityFrom } from "../../config/tax.js";
import { issueCreditNote, issueInvoice } from "../invoiceIssue.js";
import { planLines } from "../planCheckout.js";
import { lineFor, taxSnapshotFor } from "./checkout.js";
import { allocate } from "./engine.js";

/**
 * D8 — the gap period: payments captured from the registration date (4 Oct 2026, 00:00 IST) until
 * taxes were switched on at checkout. Those buyers paid the pre-tax price, so nothing can be charged
 * on top; instead the 18% is CARVED OUT of what was paid and a tax invoice is issued for it.
 *
 * Defined by the data, not by a cut-over timestamp: a gap payment is a paid ledger entry on or after the
 * registration date that carries no tax snapshot and has no tax invoice yet. Payments before the
 * registration date are never touched.
 *
 * Tax invoices for services are due within 30 days of the supply (CGST Rules r.47) and the October
 * sales must be in the October GSTR-1 (due 11 Nov) — so the earliest gap payments must be invoiced by
 * 3 Nov 2026. `gapDeadlines` reports both.
 */

const KIND_TO_INVOICE = {
  plan_subscription: "plan_subscription",
  script_purchase: "script",
  script_hold: "script_hold",
  ai_trailer: "ai_trailer",
  competition_registration: "competition_registration",
  consultation: "consultation",
};

/** The lines a gap payment is made of, rebuilt from what the ledger recorded at the time. */
const gapLines = (entry) => {
  const amount = Math.abs(Number(entry.amountMinor) || 0);
  const meta = entry.metadata || {};
  switch (entry.kind) {
    case "plan_subscription": {
      const lines = planLines(meta.planKey || "writer_silver", entry.currency, meta.cycle || "monthly");
      return lines.length ? lines : [lineFor("plan_writer_silver", amount, entry.label || "Plan")];
    }
    case "script_purchase":
    case "script_hold": {
      const fee = Number(meta.platformFeeInr ?? meta.platformCommissionInr ?? 0);
      const base = Number(meta.writerPayoutInr ?? meta.creatorPayoutInr ?? 0);
      const isHold = entry.kind === "script_hold";
      if (fee > 0 && base > 0) {
        const [priceMinor, feeMinor] = allocate(amount, [Math.round(base * 100), Math.round(fee * 100)]);
        return [
          lineFor(isHold ? "hold_price" : "script_price", priceMinor, `${isHold ? "30-day hold" : "Script price"} · ${entry.label || ""}`.trim()),
          lineFor(isHold ? "hold_platform_fee" : "script_platform_fee", feeMinor, "Platform fee (5%)"),
        ];
      }
      return [lineFor(isHold ? "hold_price" : "script_price", amount, entry.label || "Script")];
    }
    case "ai_trailer":
      return [lineFor("ai_trailer", amount, `AI trailer · ${entry.label || ""}`.trim())];
    case "competition_registration":
      return [lineFor("competition_registration", amount, `Entry fee · ${entry.label || ""}`.trim())];
    case "consultation":
      return [lineFor("consultation", amount, entry.label || "Consultation")];
    default:
      return [];
  }
};

export const gapDeadlines = (firstPaymentAt) => {
  const first = firstPaymentAt ? new Date(firstPaymentAt) : null;
  return {
    // r.47: within 30 days of the supply.
    invoiceBy: first ? new Date(first.getTime() + 30 * 24 * 60 * 60 * 1000) : null,
    // The GSTR-1 for the month of the supply is due on the 11th of the next month.
    returnDue: first ? new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 11) - 330 * 60000) : null,
  };
};

/** Every gap payment, oldest first, with what its tax invoice would say. */
export const findGapPayments = async ({ limit = 5000 } = {}) => {
  const since = taxLiabilityFrom();
  const entries = await LedgerEntry.find({
    settlement: "paid",
    provider: "razorpay",
    occurredAt: { $gte: since },
    tax: { $exists: false },
    kind: { $in: Object.keys(KIND_TO_INVOICE) },
  })
    .sort({ occurredAt: 1 })
    .limit(limit)
    .populate("user", "name email sid address billingProfile")
    .lean();

  const ids = entries.map((e) => e.providerPaymentId).filter(Boolean);
  const documented = new Set(
    (await Invoice.find({ providerPaymentId: { $in: ids }, documentType: "tax_invoice" }).select("providerPaymentId").lean())
      .map((d) => d.providerPaymentId),
  );

  const rows = [];
  for (const entry of entries) {
    if (!entry.providerPaymentId || documented.has(entry.providerPaymentId)) continue;
    const lines = gapLines(entry);
    if (!lines.length) continue;
    const weights = lines.map((l) => l.amountMinor);
    const parts = allocate(Math.abs(entry.amountMinor), weights);
    const scaled = lines.map((l, i) => ({ ...l, amountMinor: parts[i] }));
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await taxSnapshotFor({
      user: entry.user || {},
      lines: scaled,
      currency: entry.currency,
      at: new Date(entry.occurredAt),
      mode: "inclusive",
      gap: true,
    });
    rows.push({ entry, snapshot });
  }
  return rows;
};

/** A flat row per gap payment, for the CSV and the finance panel. */
export const gapRow = ({ entry, snapshot }) => ({
  ledgerEntryId: String(entry._id),
  paidAt: entry.occurredAt,
  kind: entry.kind,
  label: entry.label || "",
  buyer: entry.user?.name || "",
  email: entry.user?.email || "",
  currency: entry.currency,
  paidMinor: Math.abs(entry.amountMinor),
  taxableMinor: snapshot.totals.taxableMinor,
  taxMinor: snapshot.totals.taxMinor,
  cgstMinor: snapshot.totals.cgstMinor,
  sgstMinor: snapshot.totals.sgstMinor,
  igstMinor: snapshot.totals.igstMinor,
  supplyType: snapshot.supplyType,
  placeOfSupply: snapshot.placeOfSupply?.stateCode || snapshot.placeOfSupply?.country || "",
  paymentId: entry.providerPaymentId,
});

/**
 * Issue the gap tax invoices (and credit notes for any refunds already made against those payments).
 * Idempotent per payment: a payment that already has a tax invoice is skipped, so it is safe to re-run.
 */
export const issueGapInvoices = async ({ notify = false, limit = 5000, source = "tax.gap" } = {}) => {
  const rows = await findGapPayments({ limit });
  const issued = [];
  const failed = [];
  for (const { entry, snapshot } of rows) {
    // eslint-disable-next-line no-await-in-loop
    const user = entry.user?._id ? entry.user : await User.findById(entry.user).select("name email sid");
    const invoiceKind = KIND_TO_INVOICE[entry.kind];
    // eslint-disable-next-line no-await-in-loop
    const doc = await issueInvoice({
      kind: invoiceKind,
      user,
      paymentReference: `TAX-${entry.providerPaymentId}`,
      providerPaymentId: entry.providerPaymentId,
      tax: snapshot,
      supplyDate: entry.occurredAt,
      script: ["script", "script_hold", "ai_trailer"].includes(invoiceKind) ? entry.subjectId : null,
      competition: invoiceKind === "competition_registration" ? entry.subjectId : null,
      consultation: invoiceKind === "consultation" ? entry.subjectId : null,
      detailLines: [entry.label || "", `Payment Ref: ${entry.providerPaymentId}`, "Amount received inclusive of taxes"],
      notify,
      source,
    });
    if (!doc?._id) {
      failed.push(String(entry._id));
      continue;
    }
    // Refunds already made against this payment get their credit notes now too.
    // eslint-disable-next-line no-await-in-loop
    const reversals = await LedgerEntry.find({ reversalOf: entry._id, settlement: "reversed" }).lean();
    if (reversals.length) {
      // eslint-disable-next-line no-await-in-loop
      const full = await Invoice.findById(doc._id);
      for (const reversal of reversals) {
        // eslint-disable-next-line no-await-in-loop
        await issueCreditNote({
          original: full,
          refundGrossMinor: Math.abs(reversal.amountMinor),
          refundId: reversal.providerPaymentId || `REV-${reversal._id}`,
          reason: reversal.metadata?.reason || "Refund",
          notify,
          source,
        });
      }
    }
    issued.push({ ledgerEntryId: String(entry._id), invoiceNumber: doc.invoiceNumber });
  }
  return { issued, failed, remaining: Math.max(0, rows.length - issued.length) };
};
