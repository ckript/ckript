import User from "../models/User.js";
import Invoice from "../models/Invoice.js";
import { publicTaxConfig } from "../config/tax.js";
import { normalizeBillingInput, publicBillingProfile } from "../utils/tax/billing.js";

/**
 * Billing details and the buyer's own invoices.
 *
 * Wording: everything returned here reaches the browser, so it says "Business tax ID" and "Taxes" —
 * never GST (the founder's rule). The statutory names live only on the invoice PDF and in /finance.
 */

// GET /api/tax/config — public: the tax label, rate and state list a checkout needs.
export const getTaxConfig = (_req, res) => res.json(publicTaxConfig());

// GET /api/users/billing-profile
export const getBillingProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("name address billingProfile");
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ billing: publicBillingProfile(user) });
  } catch (error) {
    return res.status(500).json({ message: "Could not load your billing details." });
  }
};

// PUT /api/users/billing-profile
export const updateBillingProfile = async (req, res) => {
  try {
    const result = normalizeBillingInput(req.body || {});
    if (!result.ok) return res.status(400).json({ message: "Check your billing details.", errors: result.errors });
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { billingProfile: { ...result.billing, updatedAt: new Date() } } },
      { new: true },
    ).select("name address billingProfile");
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ message: "Billing details saved.", billing: publicBillingProfile(user) });
  } catch (error) {
    return res.status(500).json({ message: "Could not save your billing details." });
  }
};

/** The buyer-facing name of a document. "Tax invoice" is fine to show; "GST invoice" is not. */
const DOCUMENT_LABELS = {
  tax_invoice: "Tax invoice",
  credit_note: "Credit note",
  access_confirmation: "Access confirmation",
  legacy_invoice: "Invoice",
};

const KIND_LABELS = {
  plan_subscription: "Plan",
  script: "Script purchase",
  script_hold: "Script hold",
  ai_trailer: "AI trailer",
  competition_registration: "Competition entry",
  consultation: "Consultation",
};

// GET /api/invoices — the signed-in user's own documents, newest first.
export const listMyInvoices = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const filter = { creator: req.user._id, documentType: { $ne: "cancelled" } };
    const [items, total] = await Promise.all([
      Invoice.find(filter)
        .sort({ invoiceDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select("invoiceNumber invoiceDate kind documentType currency amountCharged tax.totals tax.rateBps detailLines originalInvoiceNumber")
        .lean(),
      Invoice.countDocuments(filter),
    ]);
    return res.json({
      page,
      limit,
      total,
      items: items.map((doc) => ({
        _id: doc._id,
        number: doc.invoiceNumber,
        date: doc.invoiceDate,
        documentType: doc.documentType || "legacy_invoice",
        documentLabel: DOCUMENT_LABELS[doc.documentType] || "Invoice",
        kind: doc.kind,
        kindLabel: KIND_LABELS[doc.kind] || "Purchase",
        title: (doc.detailLines || [])[0] || KIND_LABELS[doc.kind] || "",
        currency: doc.currency || "INR",
        totalMinor: Math.round(Number(doc.amountCharged || 0) * 100),
        taxMinor: Number(doc.tax?.totals?.taxMinor || 0) * (doc.documentType === "credit_note" ? -1 : 1),
        taxLabel: doc.tax?.rateBps ? `Taxes (${doc.tax.rateBps / 100}%)` : "Taxes",
        againstNumber: doc.originalInvoiceNumber || "",
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: "Could not load your invoices." });
  }
};
