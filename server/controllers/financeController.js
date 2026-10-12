import LedgerEntry from "../models/LedgerEntry.js";
import Invoice from "../models/Invoice.js";

/**
 * The finance panel's API. READ-ONLY, by construction — there is no mutating handler in this file.
 *
 * Money comes from the LedgerEntry collection; TAXES come from the issued tax documents (tax invoices
 * less credit notes). Two sources on purpose: the documents are what the returns are filed from, and a
 * payment captured before taxes switched on has its taxes on a back-filled invoice, not on its
 * append-only ledger row. Reading taxes from the documents keeps the panel and the filings identical.
 *
 * Money is summed in MINOR units and grouped BY CURRENCY. INR and USD are never added together.
 *
 * Wording: this portal is one of the two places statutory names are allowed (CGST/SGST/IGST in the
 * breakdowns and exports), because the CA files from it. Headline figures still say "Taxes".
 */

const KINDS = [
  "plan_subscription",
  "competition_registration",
  "script_purchase",
  "script_hold",
  "ai_trailer",
  "consultation",
  "cash_prize",
  "credits",
  "other",
];

// Invoice kinds are named after the document, ledger kinds after the money; the same sale either way.
const INVOICE_KIND_TO_LEDGER = {
  plan_subscription: "plan_subscription",
  script: "script_purchase",
  script_hold: "script_hold",
  ai_trailer: "ai_trailer",
  competition_registration: "competition_registration",
  consultation: "consultation",
};

/** Parse a YYYY-MM-DD (or ISO) bound. Returns null for anything unusable rather than Invalid Date. */
const parseDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const dateRange = (query = {}) => {
  const from = parseDate(query.from);
  const to = parseDate(query.to);
  if (!from && !to) return null;
  const range = {};
  if (from) range.$gte = from;
  // An inclusive end date: a user asking for "to 31 March" means the whole of the 31st.
  if (to) range.$lte = new Date(to.getTime() + 86_399_999);
  return range;
};

/** Shared filter builder, so the summary and the list can never describe different sets of rows. */
const buildMatch = (query = {}) => {
  const match = {};
  const range = dateRange(query);
  if (range) match.occurredAt = range;
  if (query.kind && KINDS.includes(query.kind)) match.kind = query.kind;
  if (["paid", "granted", "reversed"].includes(query.settlement)) match.settlement = query.settlement;
  if (query.currency) match.currency = String(query.currency).toUpperCase();
  if (query.user) match.user = query.user;
  if (["intra", "inter", "export_igst", "sez_igst"].includes(query.supplyType)) match["tax.supplyType"] = query.supplyType;
  return match;
};

/** Taxes from the documents in range, by currency and by (ledger) kind. Credit notes count negative. */
export const documentTaxes = async (query, kind) => {
  const range = dateRange(query);
  const match = { documentType: { $in: ["tax_invoice", "credit_note"] }, tax: { $exists: true } };
  if (range) match.$or = [{ documentType: "tax_invoice", supplyDate: range }, { documentType: "credit_note", invoiceDate: range }];
  if (query.currency) match.currency = String(query.currency).toUpperCase();
  const docs = await Invoice.find(match).select("documentType kind currency tax.totals tax.gap").lean();
  const byCurrency = new Map();
  const byKind = new Map();
  for (const doc of docs) {
    const ledgerKind = INVOICE_KIND_TO_LEDGER[doc.kind] || "other";
    if (kind && ledgerKind !== kind) continue;
    const sign = doc.documentType === "credit_note" ? -1 : 1;
    const t = doc.tax?.totals || {};
    const cur = doc.currency || "INR";
    const c = byCurrency.get(cur) || { taxMinor: 0, cgstMinor: 0, sgstMinor: 0, igstMinor: 0, gapTaxMinor: 0, invoices: 0, creditNotes: 0 };
    c.taxMinor += sign * Number(t.taxMinor || 0);
    c.cgstMinor += sign * Number(t.cgstMinor || 0);
    c.sgstMinor += sign * Number(t.sgstMinor || 0);
    c.igstMinor += sign * Number(t.igstMinor || 0);
    if (doc.tax?.gap) c.gapTaxMinor += sign * Number(t.taxMinor || 0);
    if (sign > 0) c.invoices += 1; else c.creditNotes += 1;
    byCurrency.set(cur, c);
    const kKey = `${ledgerKind}|${cur}`;
    byKind.set(kKey, (byKind.get(kKey) || 0) + sign * Number(t.taxMinor || 0));
  }
  return { byCurrency, byKind };
};

/**
 * Headline figures, by currency and by kind: what was collected, the taxes inside it, the revenue that
 * leaves, and what is owed out to writers and professionals.
 */
export const getFinanceSummary = async (req, res) => {
  try {
    const match = buildMatch(req.query);
    const moneyMatch = { ...match, settlement: { $in: ["paid", "reversed"] } };

    const [byCurrency, byKind, grants, taxes] = await Promise.all([
      LedgerEntry.aggregate([
        { $match: moneyMatch },
        { $group: {
          _id: "$currency",
          netMinor: { $sum: "$amountMinor" },
          grossMinor: { $sum: { $cond: [{ $eq: ["$settlement", "paid"] }, "$amountMinor", 0] } },
          refundedMinor: { $sum: { $cond: [{ $eq: ["$settlement", "reversed"] }, "$amountMinor", 0] } },
          payments: { $sum: { $cond: [{ $eq: ["$settlement", "paid"] }, 1, 0] } },
          refunds: { $sum: { $cond: [{ $eq: ["$settlement", "reversed"] }, 1, 0] } },
          payoutMinor: { $sum: { $ifNull: ["$creatorPayoutMinor", 0] } },
          gatewayFeeMinor: { $sum: { $ifNull: ["$gatewayFeeMinor", 0] } },
          gatewayTaxMinor: { $sum: { $ifNull: ["$gatewayTaxMinor", 0] } },
        } },
        { $sort: { netMinor: -1 } },
      ]),

      LedgerEntry.aggregate([
        { $match: moneyMatch },
        { $group: {
          _id: { kind: "$kind", currency: "$currency" },
          netMinor: { $sum: "$amountMinor" },
          payoutMinor: { $sum: { $ifNull: ["$creatorPayoutMinor", 0] } },
          count: { $sum: 1 },
        } },
        { $sort: { netMinor: -1 } },
      ]),

      // Revenue foregone: what the comps, admin grants and prizes would have been worth. No taxes —
      // nothing was charged.
      LedgerEntry.aggregate([
        { $match: { ...match, settlement: "granted" } },
        { $group: {
          _id: { kind: "$kind", currency: "$currency" },
          forgoneMinor: { $sum: "$listPriceMinor" },
          count: { $sum: 1 },
        } },
        { $sort: { forgoneMinor: -1 } },
      ]),

      documentTaxes(req.query, match.kind),
    ]);

    return res.json({
      currencies: byCurrency.map((r) => {
        const t = taxes.byCurrency.get(r._id) || {};
        const taxMinor = Number(t.taxMinor || 0);
        return {
          currency: r._id,
          netMinor: r.netMinor,
          grossMinor: r.grossMinor,
          refundedMinor: r.refundedMinor,
          taxMinor,
          revenueExTaxMinor: r.netMinor - taxMinor,
          taxBreakdown: { cgstMinor: t.cgstMinor || 0, sgstMinor: t.sgstMinor || 0, igstMinor: t.igstMinor || 0, gapTaxMinor: t.gapTaxMinor || 0 },
          taxDocuments: { invoices: t.invoices || 0, creditNotes: t.creditNotes || 0 },
          // Creator payouts arising from this currency's sales. Payouts are always recorded in INR,
          // whatever the buyer paid in, so a USD row carries a rupee figure: payoutCurrency says so.
          payoutMinor: r.payoutMinor,
          payoutCurrency: "INR",
          gatewayFeeMinor: r.gatewayFeeMinor,
          gatewayTaxMinor: r.gatewayTaxMinor,
          payments: r.payments,
          refunds: r.refunds,
        };
      }),
      byKind: byKind.map((r) => {
        const taxMinor = taxes.byKind.get(`${r._id.kind}|${r._id.currency}`) || 0;
        return {
          kind: r._id.kind,
          currency: r._id.currency,
          netMinor: r.netMinor,
          taxMinor,
          revenueExTaxMinor: r.netMinor - taxMinor,
          payoutMinor: r.payoutMinor,
          payoutCurrency: "INR",
          count: r.count,
        };
      }),
      grants: grants.map((r) => ({
        kind: r._id.kind, currency: r._id.currency, forgoneMinor: r.forgoneMinor, count: r.count,
      })),
    });
  } catch (error) {
    console.error("[finance] summary failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to load the finance summary." });
  }
};

/** The tax document behind each ledger entry: its invoice (a payment) or credit note (a refund). */
export const documentsFor = async (entries) => {
  const paymentIds = entries.filter((e) => e.settlement === "paid" && e.providerPaymentId).map((e) => e.providerPaymentId);
  const refundIds = entries.filter((e) => e.settlement === "reversed" && e.providerPaymentId).map((e) => e.providerPaymentId);
  if (!paymentIds.length && !refundIds.length) return new Map();
  const docs = await Invoice.find({
    $or: [
      { documentType: "tax_invoice", providerPaymentId: { $in: paymentIds } },
      { documentType: "credit_note", refundId: { $in: refundIds } },
      { documentType: "legacy_invoice", providerPaymentId: { $in: paymentIds } },
    ],
  }).select("_id invoiceNumber invoiceDate documentType providerPaymentId refundId tax").lean();
  const map = new Map();
  for (const doc of docs) {
    const key = doc.documentType === "credit_note" ? `refund:${doc.refundId}` : `payment:${doc.providerPaymentId}`;
    // A tax invoice wins over the legacy document for the same payment (a back-filled one).
    if (map.has(key) && doc.documentType === "legacy_invoice") continue;
    map.set(key, doc);
  }
  return map;
};

/** Ledger entry + its tax document, flattened for the table and the CSV. */
export const withTaxes = (entry, docs) => {
  const doc = docs.get(entry.settlement === "reversed" ? `refund:${entry.providerPaymentId}` : `payment:${entry.providerPaymentId}`);
  const tax = doc?.tax || entry.tax || null;
  const sign = entry.settlement === "reversed" ? -1 : 1;
  const totals = tax?.totals || {};
  return {
    ...entry,
    tax: undefined,
    taxMinor: tax ? sign * Number(totals.taxMinor || 0) : 0,
    taxableMinor: tax ? sign * Number(totals.taxableMinor || 0) : entry.amountMinor,
    cgstMinor: tax ? sign * Number(totals.cgstMinor || 0) : 0,
    sgstMinor: tax ? sign * Number(totals.sgstMinor || 0) : 0,
    igstMinor: tax ? sign * Number(totals.igstMinor || 0) : 0,
    supplyType: tax?.supplyType || (entry.settlement === "granted" ? "no_consideration" : "pre_gst"),
    gap: Boolean(tax?.gap),
    placeOfSupply: tax?.placeOfSupply?.country && tax.placeOfSupply.country !== "IN"
      ? tax.placeOfSupply.country
      : tax?.placeOfSupply?.stateCode || "",
    businessTaxId: tax?.recipient?.gstin || "",
    sac: (tax?.lines || []).map((l) => l.sac).filter(Boolean).join(" "),
    document: doc ? { _id: doc._id, number: doc.invoiceNumber, type: doc.documentType, date: doc.invoiceDate } : null,
  };
};

/** The transaction list, newest first, paginated, each row with its taxes and document. */
export const listFinanceEntries = async (req, res) => {
  try {
    const match = buildMatch(req.query);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

    const [entries, total] = await Promise.all([
      LedgerEntry.find(match)
        .sort({ occurredAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("user", "name email sid role")
        .lean(),
      LedgerEntry.countDocuments(match),
    ]);
    const docs = await documentsFor(entries);

    return res.json({
      entries: entries.map((e) => withTaxes(e, docs)),
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error("[finance] list failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to load transactions." });
  }
};

/** Quote a CSV field: escape embedded quotes and wrap anything containing a delimiter or newline. */
const csvCell = (value) => {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const major = (minor) => ((Number(minor) || 0) / 100).toFixed(2);

/**
 * CSV export — the actual handover format.
 *
 * Streams the whole filtered set with no page limit, because a partial export silently understates
 * the books. Amounts are written in MAJOR units with two decimals, which is what accounting software
 * expects, alongside the currency in its own column so the two are never inferred.
 */
export const exportFinanceCsv = async (req, res) => {
  try {
    const match = buildMatch(req.query);

    const entries = await LedgerEntry.find(match)
      .sort({ occurredAt: -1 })
      .populate("user", "name email sid")
      .lean();
    const docs = await documentsFor(entries);

    const header = [
      "Date", "Kind", "Settlement", "Currency", "Amount", "List price",
      "Taxable value", "Taxes", "CGST", "SGST", "IGST", "Supply type", "Gap back-fill",
      "Place of supply", "Buyer business tax ID (GSTIN)", "SAC",
      "Document type", "Document number", "Document date",
      "Creator payout (INR)", "Gateway fee", "Tax on gateway fee",
      "INR FX rate", "Taxable (INR)", "Taxes (INR)",
      "User", "Email", "User SID", "Description",
      "Provider", "Order ID", "Payment ID", "Entry ID",
    ];

    const rows = entries.map((raw) => {
      const e = withTaxes(raw, docs);
      const doc = docs.get(raw.settlement === "reversed" ? `refund:${raw.providerPaymentId}` : `payment:${raw.providerPaymentId}`);
      const inr = doc?.tax?.inr || raw.tax?.inr || {};
      const sign = raw.settlement === "reversed" ? -1 : 1;
      return [
        new Date(e.occurredAt).toISOString(),
        e.kind,
        e.settlement,
        e.currency,
        major(e.amountMinor),
        major(e.listPriceMinor),
        major(e.taxableMinor),
        major(e.taxMinor),
        major(e.cgstMinor),
        major(e.sgstMinor),
        major(e.igstMinor),
        e.supplyType,
        e.gap ? "yes" : "",
        e.placeOfSupply,
        e.businessTaxId,
        e.sac,
        e.document?.type || "",
        e.document?.number || "",
        e.document?.date ? new Date(e.document.date).toISOString().slice(0, 10) : "",
        major(e.creatorPayoutMinor),
        major(e.gatewayFeeMinor),
        major(e.gatewayTaxMinor),
        inr.fxRate || "",
        inr.taxableMinor !== undefined ? major(sign * inr.taxableMinor) : "",
        inr.taxableMinor !== undefined ? major(sign * ((inr.cgstMinor || 0) + (inr.sgstMinor || 0) + (inr.igstMinor || 0))) : "",
        e.user?.name || "",
        e.user?.email || "",
        e.user?.sid || "",
        e.label || "",
        e.provider,
        e.providerOrderId || "",
        e.providerPaymentId || "",
        String(e._id),
      ];
    });

    const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="ckript-transactions-${stamp}.csv"`);
    // A BOM, so Excel opens UTF-8 correctly — without it ₹ and accented names arrive mangled.
    return res.send(`﻿${csv}`);
  } catch (error) {
    console.error("[finance] export failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to export transactions." });
  }
};
