import geoip from "geoip-lite";
import PaymentQuote from "../../models/PaymentQuote.js";
import {
  PRODUCT_TAX,
  TAX_LABEL,
  rateFor,
  stateByCode,
  supplier,
  taxChargingEnabled,
  taxLiabilityFrom,
} from "../../config/tax.js";
import { getUsdInrRate } from "../currencyFx.js";
import {
  allocate,
  buildTaxSnapshot,
  classifySupply,
  publicBreakdown,
  resolvePlaceOfSupply,
} from "./engine.js";
import { recipientFromBilling, resolveBilling } from "./billing.js";

/**
 * Taxes at checkout — the one service every payment flow calls.
 *
 *   priceCheckout()       before the order: what the buyer pays, and the snapshot behind it
 *   saveQuote()           stores that snapshot against the Razorpay order id
 *   resolveCapturedTax()  after capture: the snapshot that applies to the payment actually taken
 *
 * With charging switched off (GST_ENABLED=false) priceCheckout returns the pre-tax amount and no
 * snapshot, and resolveCapturedTax returns null — every flow behaves exactly as it did before taxes.
 */

/** A priced line. `amountMinor` is PRE-TAX, in the currency being charged. */
export const lineFor = (kind, amountMinor, description = "") => ({
  kind,
  amountMinor: Math.max(0, Math.round(Number(amountMinor) || 0)),
  sac: PRODUCT_TAX[kind]?.sac || "",
  description: description || PRODUCT_TAX[kind]?.description || kind,
});

const sumLines = (lines = []) => lines.reduce((total, line) => total + (Number(line.amountMinor) || 0), 0);

/** Country from the caller's IP via the bundled offline database — no network call at checkout. */
export const geoCountryOf = (ip = "") => {
  const address = String(ip || "").replace(/^::ffff:/, "").trim();
  if (!address) return "";
  try {
    return String(geoip.lookup(address)?.country || "").toUpperCase();
  } catch {
    return "";
  }
};

const fxFor = async (currency, at) => {
  if (String(currency).toUpperCase() === "INR") return null;
  // TODO-CA: CGST Rules r.34 wants a defensible reference rate (RBI or as the CA directs). This is the
  // same live source the checkout already converts with, recorded so the CA can see which was used.
  return { rate: await getUsdInrRate(), source: "open.er-api.com", date: at };
};

/** Build the snapshot for a purchase. `mode` "exclusive" adds tax; "inclusive" carves it out. */
export const taxSnapshotFor = async ({
  user,
  lines,
  currency = "INR",
  billingOverride = null,
  ip = "",
  at = new Date(),
  mode = "exclusive",
  gap = false,
}) => {
  const sup = supplier();
  const { billing, profile } = resolveBilling(user, billingOverride);
  const placeOfSupply = resolvePlaceOfSupply({
    billing,
    profile,
    geoCountry: geoCountryOf(ip),
    supplierStateCode: sup.stateCode,
  });
  placeOfSupply.stateName = stateByCode(placeOfSupply.stateCode)?.name || "";
  const supplyType = classifySupply({ placeOfSupply, supplierStateCode: sup.stateCode, isSez: billing.isSez });
  return buildTaxSnapshot({
    lines,
    currency: String(currency || "INR").toUpperCase(),
    rateBps: rateFor("standard", at),
    mode,
    supplyType,
    placeOfSupply,
    supplier: sup,
    recipient: recipientFromBilling(billing, user),
    fx: await fxFor(currency, at),
    computedAt: at,
    gap,
  });
};

/**
 * Price a checkout. Returns `{ tax, preTaxMinor, grossMinor, breakdown }` where `grossMinor` is what
 * the Razorpay order must be created for and `breakdown` is what the client shows ("Taxes (18%)").
 */
export const priceCheckout = async ({ user, lines, currency = "INR", billingOverride = null, ip = "" }) => {
  const preTaxMinor = sumLines(lines);
  if (!taxChargingEnabled()) {
    return { tax: null, preTaxMinor, grossMinor: preTaxMinor, breakdown: null };
  }
  const tax = await taxSnapshotFor({ user, lines, currency, billingOverride, ip });
  return {
    tax,
    preTaxMinor,
    grossMinor: tax.totals.grossMinor,
    breakdown: publicBreakdown(tax, { label: TAX_LABEL }),
  };
};

/**
 * Price the same lines in the requested currency AND in INR, for flows that may fall back from USD to
 * INR at order creation. Pick the one matching the created order with `pickPriced`.
 */
export const priceWithInrFallback = async ({ user, currency, lines, inrLines, billingOverride, ip }) => {
  const requested = await priceCheckout({ user, lines, currency, billingOverride, ip });
  const inr = String(currency).toUpperCase() === "INR"
    ? requested
    : await priceCheckout({ user, lines: inrLines, currency: "INR", billingOverride, ip });
  return { requested, inr };
};

export const pickPriced = (pair, orderCurrency) =>
  (String(orderCurrency || "").toUpperCase() === "INR" ? pair.inr : pair.requested);

/** Remember what an order was priced at. Non-fatal: a missing quote only means a carve-out later. */
export const saveQuote = async ({ order, user, purpose, subjectId = "", priced }) => {
  if (!order?.id || !priced?.tax) return null;
  const doc = {
    orderId: String(order.id),
    user: user?._id || user,
    purpose,
    subjectId: String(subjectId || ""),
    currency: String(order.currency || priced.tax.currency).toUpperCase(),
    preTaxMinor: priced.preTaxMinor,
    grossMinor: Number(order.amount) || priced.grossMinor,
    tax: priced.tax,
  };
  try {
    return await PaymentQuote.create(doc);
  } catch (error) {
    if (error?.code === 11000) return PaymentQuote.findOne({ orderId: doc.orderId });
    console.error(`[tax] could not save the quote for order ${doc.orderId}:`, error?.message || error);
    return null;
  }
};

/** The quote behind an order, or null. */
export const loadQuote = async (orderId) => {
  if (!orderId) return null;
  return PaymentQuote.findOne({ orderId: String(orderId) }).lean();
};

/**
 * Which snapshot applies to a captured payment?
 *
 *   charging off                         → null (records stay exactly as before; the gap back-fill
 *                                          covers this period later)
 *   order priced with taxes (a quote)    → that quote's snapshot, if the amount paid matches it
 *   paid before the registration date    → null (never taxable)
 *   otherwise                            → taxes CARVED OUT of what was paid (an order created before
 *                                          charging switched on, paid after it)
 */
export const resolveCapturedTax = async ({
  orderId,
  paymentId = "",
  paidMinor,
  currency,
  paidAt = new Date(),
  user,
  lines,
  ip = "",
}) => {
  if (!taxChargingEnabled()) return null;
  const quote = await loadQuote(orderId);
  const cur = String(currency || "").toUpperCase();
  if (quote?.tax && Number(quote.grossMinor) === Number(paidMinor) && quote.currency === cur) {
    if (paymentId && !quote.capturedPaymentId) {
      await PaymentQuote.updateOne({ _id: quote._id }, { $set: { capturedPaymentId: String(paymentId) } }).catch(() => {});
    }
    return quote.tax;
  }
  if (new Date(paidAt).getTime() < taxLiabilityFrom().getTime()) return null;

  const weights = (lines || []).map((l) => Number(l.amountMinor) || 0);
  const parts = allocate(Number(paidMinor) || 0, weights.length ? weights : [1]);
  const scaled = (lines && lines.length ? lines : [lineFor("other", paidMinor, "Payment")])
    .map((line, i) => ({ ...line, amountMinor: parts[i] || 0 }));
  return taxSnapshotFor({ user, lines: scaled, currency: cur, ip, at: new Date(paidAt), mode: "inclusive", gap: true });
};

/**
 * The snapshot for an amount already captured WITHOUT a stored quote — a subscription renewal, or a
 * recovery path. If what was paid equals the lines plus 18%, it is an ordinary taxed sale; otherwise
 * (a mandate created at the pre-tax price, before charging switched on) the taxes are carved out of it.
 */
export const snapshotForPaidAmount = async ({ user, lines, paidMinor, currency, paidAt = new Date(), ip = "" }) => {
  if (!taxChargingEnabled()) return null;
  if (new Date(paidAt).getTime() < taxLiabilityFrom().getTime()) return null;
  const exclusive = await taxSnapshotFor({ user, lines, currency, ip, at: new Date(paidAt) });
  if (exclusive.totals.grossMinor === Number(paidMinor)) return exclusive;
  return resolveCapturedTax({ orderId: "", paidMinor, currency, paidAt, user, lines, ip });
};

/**
 * Billing details sent with a checkout ("billing" in the body). Validated like the profile form;
 * saved to the profile when "saveBilling" is ticked. Returns { override } or { error, errors }.
 */
export const billingFromRequest = async (req, user) => {
  const raw = req.body?.billing;
  if (!raw || typeof raw !== "object") return { override: null };
  const { normalizeBillingInput } = await import("./billing.js");
  const result = normalizeBillingInput(raw);
  if (!result.ok) return { error: "Check your billing details.", errors: result.errors };
  if (req.body?.saveBilling === true || req.body?.saveBilling === "true") {
    const { default: User } = await import("../../models/User.js");
    await User.updateOne(
      { _id: user?._id || req.user?._id },
      { $set: { billingProfile: { ...result.billing, updatedAt: new Date() } } },
    ).catch((error) => console.error("[tax] could not save billing details:", error?.message || error));
  }
  return { override: result.billing };
};

/** The caller's IP, for the place-of-supply evidence. */
export const requestIp = (req) =>
  String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || req.socket?.remoteAddress || "";

/** What a client checkout shows for a priced set of lines, including when taxes are off. */
export const checkoutBreakdown = (priced, { currency, lines } = {}) => {
  if (priced?.breakdown) return priced.breakdown;
  if (priced?.tax) return publicBreakdown(priced.tax, { label: TAX_LABEL });
  return {
    currency: String(currency || "INR").toUpperCase(),
    lines: (lines || []).map((l) => ({ kind: l.kind, label: l.description, amountMinor: l.amountMinor })),
    subtotalMinor: priced?.preTaxMinor || 0,
    taxLabel: TAX_LABEL,
    taxRatePercent: 0,
    taxMinor: 0,
    totalMinor: priced?.grossMinor || 0,
    taxesIncluded: false,
  };
};
