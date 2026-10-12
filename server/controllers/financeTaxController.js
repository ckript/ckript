import LedgerEntry from "../models/LedgerEntry.js";
import Invoice from "../models/Invoice.js";
import PaymentQuote from "../models/PaymentQuote.js";
import Consultation from "../models/Consultation.js";
import User from "../models/User.js";
import TaxPeriodLock from "../models/TaxPeriodLock.js";
import { taxChargingEnabled, taxLiabilityFrom } from "../config/tax.js";
import { periodBounds, taxPeriodOf } from "../utils/tax/documentNumber.js";
import { buildGstr1, buildGstr3b, gstr1Csv, GSTR1_COLUMNS } from "../utils/tax/returns.js";
import { findGapPayments, gapDeadlines, gapRow, issueGapInvoices } from "../utils/tax/gap.js";
import { refundPayment } from "../utils/tax/refunds.js";
import { getRazorpayClient } from "../utils/razorpayClient.js";

/**
 * The finance portal's tax views (/api/finance/taxes/*) and the admin-only actions behind them.
 *
 * Reads are mounted on financeRoutes (finance + admin). Every handler that CHANGES something —
 * issuing gap invoices, locking a period, refunding — is mounted on adminRoutes behind adminOnly, so
 * a finance user who forges the request is refused by the server, not just hidden by the UI.
 */

const currentPeriod = () => taxPeriodOf(new Date());
const periodOf = (req) => {
  const period = String(req.query?.period || req.body?.period || currentPeriod());
  return periodBounds(period) ? period : null;
};

const periodDocuments = (period) => Invoice.find({
  taxPeriod: period,
  documentType: { $in: ["tax_invoice", "credit_note"] },
  tax: { $exists: true },
}).sort({ seq: 1 }).lean();

const periodCancelled = (period) => Invoice.find({ taxPeriod: period, documentType: "cancelled" })
  .select("invoiceNumber series fy seq documentType").lean();

const sendCsv = (res, filename, csv) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(`﻿${csv}`);
};

// GET /api/finance/taxes/summary?period=YYYY-MM — the month at a glance, in INR.
export const getTaxSummary = async (req, res) => {
  try {
    const period = periodOf(req);
    if (!period) return res.status(400).json({ message: "Use a period like 2026-10." });
    const [documents, lock] = await Promise.all([periodDocuments(period), TaxPeriodLock.findOne({ period }).lean()]);
    const totals = { taxableMinor: 0, cgstMinor: 0, sgstMinor: 0, igstMinor: 0, taxMinor: 0, grossMinor: 0 };
    let invoices = 0;
    let creditNotes = 0;
    let exports = 0;
    let gapInvoices = 0;
    for (const doc of documents) {
      const sign = doc.documentType === "credit_note" ? -1 : 1;
      const inr = doc.tax.inr || doc.tax.totals || {};
      totals.taxableMinor += sign * Number(inr.taxableMinor || 0);
      totals.cgstMinor += sign * Number(inr.cgstMinor || 0);
      totals.sgstMinor += sign * Number(inr.sgstMinor || 0);
      totals.igstMinor += sign * Number(inr.igstMinor || 0);
      totals.grossMinor += sign * Number(inr.grossMinor || 0);
      if (sign > 0) invoices += 1; else creditNotes += 1;
      if (doc.tax.supplyType === "export_igst" && sign > 0) exports += 1;
      if (doc.tax.gap && sign > 0) gapInvoices += 1;
    }
    totals.taxMinor = totals.cgstMinor + totals.sgstMinor + totals.igstMinor;
    return res.json({
      period,
      currency: "INR",
      totals,
      counts: { invoices, creditNotes, exports, gapInvoices },
      locked: Boolean(lock),
      lockedAt: lock?.createdAt || null,
      chargingEnabled: taxChargingEnabled(),
      liabilityFrom: taxLiabilityFrom(),
    });
  } catch (error) {
    console.error("[finance/taxes] summary failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to load the tax summary." });
  }
};

// GET /api/finance/taxes/gstr1?period=YYYY-MM[&table=b2b&format=csv]
export const getGstr1 = async (req, res) => {
  try {
    const period = periodOf(req);
    if (!period) return res.status(400).json({ message: "Use a period like 2026-10." });
    const [documents, cancelled] = await Promise.all([periodDocuments(period), periodCancelled(period)]);
    const data = buildGstr1({ documents, cancelled });
    const table = String(req.query.table || "");
    if (req.query.format === "csv") {
      if (!GSTR1_COLUMNS[table]) return res.status(400).json({ message: `Choose a table: ${Object.keys(GSTR1_COLUMNS).join(", ")}.` });
      return sendCsv(res, `gstr1-${period}-${table}.csv`, gstr1Csv(table, data[table]));
    }
    return res.json({ period, tables: data });
  } catch (error) {
    console.error("[finance/taxes] gstr1 failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to build GSTR-1." });
  }
};

// GET /api/finance/taxes/gstr3b?period=YYYY-MM
export const getGstr3b = async (req, res) => {
  try {
    const period = periodOf(req);
    if (!period) return res.status(400).json({ message: "Use a period like 2026-10." });
    return res.json({ period, tables: buildGstr3b({ documents: await periodDocuments(period) }) });
  } catch (error) {
    console.error("[finance/taxes] gstr3b failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to build GSTR-3B." });
  }
};

// GET /api/finance/taxes/register?period=YYYY-MM&type=tax_invoice|credit_note[&format=csv]
export const getTaxRegister = async (req, res) => {
  try {
    const period = periodOf(req);
    if (!period) return res.status(400).json({ message: "Use a period like 2026-10." });
    const type = ["tax_invoice", "credit_note", "cancelled"].includes(req.query.type) ? req.query.type : null;
    const docs = await Invoice.find({
      taxPeriod: period,
      documentType: type ? type : { $in: ["tax_invoice", "credit_note", "cancelled"] },
    }).sort({ series: 1, seq: 1 }).populate("creator", "name email sid").lean();
    const rows = docs.map((d) => {
      const inr = d.tax?.inr || d.tax?.totals || {};
      return {
        _id: d._id,
        number: d.invoiceNumber,
        type: d.documentType,
        date: d.invoiceDate,
        supplyDate: d.supplyDate,
        buyer: d.tax?.recipient?.legalName || d.tax?.recipient?.name || d.creator?.name || "",
        email: d.creator?.email || "",
        businessTaxId: d.tax?.recipient?.gstin || "",
        placeOfSupply: d.tax?.placeOfSupply?.country && d.tax.placeOfSupply.country !== "IN" ? d.tax.placeOfSupply.country : d.tax?.placeOfSupply?.stateCode || "",
        supplyType: d.tax?.supplyType || "",
        gap: Boolean(d.tax?.gap),
        currency: d.currency,
        taxableMinor: Number(d.tax?.totals?.taxableMinor || 0),
        taxMinor: Number(d.tax?.totals?.taxMinor || 0),
        cgstMinor: Number(d.tax?.totals?.cgstMinor || 0),
        sgstMinor: Number(d.tax?.totals?.sgstMinor || 0),
        igstMinor: Number(d.tax?.totals?.igstMinor || 0),
        grossMinor: Number(d.tax?.totals?.grossMinor || 0),
        inrTaxableMinor: Number(inr.taxableMinor || 0),
        inrTaxMinor: Number(inr.cgstMinor || 0) + Number(inr.sgstMinor || 0) + Number(inr.igstMinor || 0),
        against: d.originalInvoiceNumber || "",
        paymentId: d.providerPaymentId || "",
      };
    });
    if (req.query.format === "csv") {
      const header = ["Number", "Type", "Date", "Date of supply", "Buyer", "Email", "Buyer GSTIN", "Place of supply", "Supply type", "Back-fill", "Currency", "Taxable", "CGST", "SGST", "IGST", "Taxes", "Total", "Taxable (INR)", "Taxes (INR)", "Against", "Payment ID"];
      const cell = (v) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const m = (v) => ((Number(v) || 0) / 100).toFixed(2);
      const csv = [header, ...rows.map((r) => [r.number, r.type, r.date ? new Date(r.date).toISOString().slice(0, 10) : "", r.supplyDate ? new Date(r.supplyDate).toISOString().slice(0, 10) : "", r.buyer, r.email, r.businessTaxId, r.placeOfSupply, r.supplyType, r.gap ? "yes" : "", r.currency, m(r.taxableMinor), m(r.cgstMinor), m(r.sgstMinor), m(r.igstMinor), m(r.taxMinor), m(r.grossMinor), m(r.inrTaxableMinor), m(r.inrTaxMinor), r.against, r.paymentId])]
        .map((r) => r.map(cell).join(",")).join("\r\n");
      return sendCsv(res, `tax-register-${period}${type ? `-${type}` : ""}.csv`, csv);
    }
    return res.json({ period, rows });
  } catch (error) {
    console.error("[finance/taxes] register failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to load the document register." });
  }
};

// GET /api/finance/taxes/review — documents whose place of supply needs a human look.
export const getTaxReviewQueue = async (_req, res) => {
  try {
    const docs = await Invoice.find({ documentType: "tax_invoice", "tax.placeOfSupply.needsReview": true })
      .sort({ invoiceDate: -1 }).limit(200).populate("creator", "name email").lean();
    return res.json({
      rows: docs.map((d) => ({
        _id: d._id,
        number: d.invoiceNumber,
        date: d.invoiceDate,
        buyer: d.creator?.name || "",
        email: d.creator?.email || "",
        placeOfSupply: d.tax.placeOfSupply,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load the review queue." });
  }
};

// GET /api/finance/taxes/reconciliation?period=YYYY-MM — every capture must have its document.
export const getReconciliation = async (req, res) => {
  try {
    const period = periodOf(req);
    if (!period) return res.status(400).json({ message: "Use a period like 2026-10." });
    const { start, end } = periodBounds(period);
    const since = taxLiabilityFrom();
    const from = start < since ? since : start;
    const paid = from < end
      ? await LedgerEntry.find({ settlement: "paid", provider: "razorpay", occurredAt: { $gte: from, $lt: end } })
        .populate("user", "name email").lean()
      : [];
    const ids = paid.map((e) => e.providerPaymentId).filter(Boolean);
    const documented = new Set((await Invoice.find({ providerPaymentId: { $in: ids }, documentType: "tax_invoice" }).select("providerPaymentId").lean()).map((d) => d.providerPaymentId));
    const missing = paid.filter((e) => !documented.has(e.providerPaymentId)).map((e) => ({
      ledgerEntryId: e._id,
      paidAt: e.occurredAt,
      kind: e.kind,
      label: e.label,
      buyer: e.user?.name || "",
      currency: e.currency,
      amountMinor: e.amountMinor,
      paymentId: e.providerPaymentId,
      // No snapshot at all = paid before taxes switched on: the gap back-fill documents it.
      reason: e.tax ? "Tax invoice not issued" : "Paid before taxes switched on — issue the back-fill",
    }));

    // Captured at Razorpay (seen by the webhook) but never fulfilled or booked.
    const capturedQuotes = await PaymentQuote.find({ capturedPaymentId: { $ne: "" }, updatedAt: { $gte: start, $lt: end } }).lean();
    const quotedIds = capturedQuotes.map((q) => q.capturedPaymentId);
    const booked = new Set((await LedgerEntry.find({ providerPaymentId: { $in: quotedIds } }).select("providerPaymentId").lean()).map((e) => e.providerPaymentId));
    const unbooked = capturedQuotes.filter((q) => !booked.has(q.capturedPaymentId)).map((q) => ({
      orderId: q.orderId,
      paymentId: q.capturedPaymentId,
      purpose: q.purpose,
      currency: q.currency,
      grossMinor: q.grossMinor,
      capturedAt: q.updatedAt,
    }));

    const fees = paid.reduce((acc, e) => {
      const c = acc[e.currency] || { feeMinor: 0, feeTaxMinor: 0 };
      c.feeMinor += Number(e.gatewayFeeMinor || 0);
      c.feeTaxMinor += Number(e.gatewayTaxMinor || 0);
      acc[e.currency] = c;
      return acc;
    }, {});

    return res.json({
      period,
      payments: paid.length,
      documented: paid.length - missing.length,
      missing,
      unbooked,
      gatewayFees: fees,
    });
  } catch (error) {
    console.error("[finance/taxes] reconciliation failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to reconcile." });
  }
};

// GET /api/finance/taxes/gap[?format=csv] — D8: payments since 4 Oct 2026 still to be back-filled.
export const getGapReport = async (req, res) => {
  try {
    const rows = (await findGapPayments()).map(gapRow);
    const deadlines = gapDeadlines(rows[0]?.paidAt);
    if (req.query.format === "csv") {
      const header = ["Paid at", "Kind", "Description", "Buyer", "Email", "Currency", "Paid", "Taxable value", "Taxes", "CGST", "SGST", "IGST", "Supply type", "Place of supply", "Payment ID", "Ledger entry"];
      const m = (v) => ((Number(v) || 0) / 100).toFixed(2);
      const cell = (v) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const csv = [header, ...rows.map((r) => [new Date(r.paidAt).toISOString(), r.kind, r.label, r.buyer, r.email, r.currency, m(r.paidMinor), m(r.taxableMinor), m(r.taxMinor), m(r.cgstMinor), m(r.sgstMinor), m(r.igstMinor), r.supplyType, r.placeOfSupply, r.paymentId, r.ledgerEntryId])]
        .map((r) => r.map(cell).join(",")).join("\r\n");
      return sendCsv(res, `tax-gap-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    }
    return res.json({ liabilityFrom: taxLiabilityFrom(), deadlines, count: rows.length, rows: rows.slice(0, 500) });
  } catch (error) {
    console.error("[finance/taxes] gap report failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to build the gap report." });
  }
};

// GET /api/finance/consultations — the read side of consultations, for the CA.
export const listFinanceConsultations = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const filter = { status: { $nin: ["payment_pending", "payment_failed"] } };
    const [rows, total] = await Promise.all([
      Consultation.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
        .populate("writer", "name email").populate("professional", "name email role")
        .populate("invoice", "invoiceNumber").populate("creditNote", "invoiceNumber").lean(),
      Consultation.countDocuments(filter),
    ]);
    return res.json({
      page,
      total,
      pages: Math.ceil(total / limit) || 1,
      rows: rows.map((c) => ({
        _id: c._id,
        bookingId: c.bookingId,
        writer: c.writer?.name || "",
        professional: c.professional?.name || "",
        status: c.status,
        currency: c.currency,
        priceMinor: c.preTaxAmount || c.amount,
        taxMinor: c.taxMinor || 0,
        chargedMinor: c.amount,
        platformFeeMinor: c.platformFee,
        payoutMinor: c.professionalAmount,
        refundMinor: c.refundAmount || 0,
        invoiceNumber: c.invoice?.invoiceNumber || "",
        creditNoteNumber: c.creditNote?.invoiceNumber || "",
        paidAt: c.paidAt,
        payoutCompletedAt: c.payoutCompletedAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load consultations." });
  }
};

const PAID_TIERS = ["film_industry_professional", "writer_silver", "writer_gold"];

// GET /api/finance/plans — every paid plan: how it bills, whether it renews, the next charge.
export const listFinancePlans = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const filter = {
      "subscription.accessTier": { $in: PAID_TIERS },
      "subscription.plan": { $in: ["pro", "diamond", "silver", "gold"] },
    };
    const [users, total] = await Promise.all([
      User.find(filter).sort({ "subscription.accessExpiresAt": -1 }).skip((page - 1) * limit).limit(limit)
        .select("name email sid role subscription.plan subscription.accessTier subscription.accessStatus subscription.accessExpiresAt subscription.billingMode subscription.recurring")
        .lean(),
      User.countDocuments(filter),
    ]);
    return res.json({
      page,
      total,
      pages: Math.ceil(total / limit) || 1,
      rows: users.map((u) => {
        const sub = u.subscription || {};
        const rec = sub.recurring || {};
        return {
          _id: u._id,
          name: u.name,
          email: u.email,
          sid: u.sid,
          plan: sub.accessTier,
          cycle: rec.cycle || "",
          billingMode: sub.billingMode || "one_time",
          renewalStatus: rec.status || "",
          autoRenew: Boolean(rec.autoRenew),
          nextChargeAt: rec.nextChargeAt || null,
          nextChargeMinor: rec.autoRenew ? Number(rec.amountMinor || 0) : 0,
          currency: rec.currency || "INR",
          lastChargedAt: rec.lastChargedAt || null,
          accessExpiresAt: sub.accessExpiresAt || null,
          active: sub.accessStatus === "active" && sub.accessExpiresAt && new Date(sub.accessExpiresAt) > new Date(),
        };
      }),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load plans." });
  }
};

// ── Admin-only actions (mounted on adminRoutes) ─────────────────────────────

// AuditLog is script-scoped (scriptId is required), so finance actions are traced here instead: the
// lock stores who locked it, the refund's reversal and Razorpay notes carry the admin's id, and this
// line puts every action in the server log with its actor.
const audit = async (req, action, metadata) => {
  console.info(`[finance-audit] ${action} by ${req.user?._id} ${JSON.stringify(metadata)}`);
};

// POST /api/admin/taxes/gap/issue { confirm: "ISSUE" } — issue the back-filled tax invoices.
export const issueGapInvoicesAdmin = async (req, res) => {
  try {
    if (req.body?.confirm !== "ISSUE") {
      return res.status(400).json({ message: 'Type ISSUE to confirm. This issues numbered tax invoices that cannot be withdrawn, only credited.' });
    }
    const result = await issueGapInvoices({ notify: req.body?.notify === true, source: `admin:${req.user._id}` });
    await audit(req, "tax.gap.issue", { issued: result.issued.length, failed: result.failed.length });
    return res.json(result);
  } catch (error) {
    console.error("[admin/taxes] gap issue failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to issue the back-fill invoices." });
  }
};

// POST /api/admin/taxes/period-lock { period: "2026-10", note }
export const lockTaxPeriod = async (req, res) => {
  try {
    const period = String(req.body?.period || "");
    if (!periodBounds(period)) return res.status(400).json({ message: "Use a period like 2026-10." });
    if (period >= currentPeriod()) return res.status(400).json({ message: "Only a past month can be locked." });
    const lock = await TaxPeriodLock.findOneAndUpdate(
      { period },
      { $setOnInsert: { period, lockedBy: req.user._id, note: String(req.body?.note || "").slice(0, 300) } },
      { upsert: true, new: true },
    );
    await audit(req, "tax.period.lock", { period });
    return res.json({ period: lock.period, lockedAt: lock.createdAt });
  } catch (error) {
    return res.status(500).json({ message: "Failed to lock the period." });
  }
};

// POST /api/admin/payments/:ledgerEntryId/refund { amountMinor?, reason }
export const refundLedgerPayment = async (req, res) => {
  try {
    const entry = await LedgerEntry.findById(String(req.params.ledgerEntryId)).lean();
    if (!entry || entry.settlement !== "paid" || !entry.providerPaymentId) {
      return res.status(404).json({ message: "That payment cannot be refunded here." });
    }
    const razorpay = await getRazorpayClient();
    if (!razorpay) return res.status(503).json({ message: "Razorpay is not configured." });
    const reason = String(req.body?.reason || "").trim().slice(0, 200);
    if (!reason) return res.status(400).json({ message: "Give a reason for the refund." });
    const amount = req.body?.amountMinor === undefined || req.body?.amountMinor === null || req.body?.amountMinor === ""
      ? null
      : Math.round(Number(req.body.amountMinor));
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) return res.status(400).json({ message: "Enter a positive amount." });
    const result = await refundPayment({
      razorpay,
      paymentId: entry.providerPaymentId,
      amountMinor: amount,
      reason,
      notes: { ledgerEntryId: String(entry._id), by: String(req.user._id) },
      source: "financeTaxController.refundLedgerPayment",
    });
    if (!result.ok) return res.status(result.status || 400).json({ message: result.message });
    await audit(req, "payment.refund", { ledgerEntryId: String(entry._id), amountMinor: result.amountMinor, creditNote: result.creditNote?.invoiceNumber || "" });
    return res.json({
      message: "Refund issued.",
      amountMinor: result.amountMinor,
      currency: result.currency,
      refundId: result.refund?.id,
      creditNote: result.creditNote,
    });
  } catch (error) {
    console.error("[admin] refund failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to refund the payment." });
  }
};
