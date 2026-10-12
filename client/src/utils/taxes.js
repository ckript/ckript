import { useEffect, useState } from "react";
import api from "../services/api";
import { formatSubunits } from "./currency";

/* ─────────────────────────────────────────────────────────────
   Taxes at checkout — the client side.

   The founder's rules, which every surface here follows:
     • listed prices are PRE-TAX (₹399); the checkout step shows
       Subtotal · Taxes (18%) · Total and the pay button says the total;
     • the word users read is "Taxes" — never GST, GSTIN, CGST, SGST
       or IGST (those appear only on the tax invoice PDF and in the
       finance portal);
     • the client NEVER computes tax. It renders the server's quote
       (`breakdown`), so the number on the button is the number charged.
   ───────────────────────────────────────────────────────────── */

export const TAX_WORD = "Taxes";

let configPromise = null;

/** GET /api/tax/config, fetched once per page load. Never rejects: falls back to "not charging". */
export const fetchTaxConfig = () => {
  if (!configPromise) {
    // Started inside a promise so even a throwing or stubbed client lands in the catch below.
    configPromise = Promise.resolve()
      .then(() => api.get("/tax/config"))
      .then((response) => response?.data || {})
      .catch(() => {
        configPromise = null;
        return { label: TAX_WORD, ratePercent: 18, chargingEnabled: false, showPlusTaxesHint: false, states: [] };
      });
  }
  return configPromise;
};

export const useTaxConfig = () => {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchTaxConfig().then((c) => alive && setConfig(c));
    return () => {
      alive = false;
    };
  }, []);
  return config;
};

/**
 * The rows a checkout shows for a server breakdown: each line, then Subtotal, Taxes (18%) and Total.
 * With taxes switched off (taxMinor 0, no rate) the Taxes row is dropped rather than shown as zero.
 */
export const breakdownRows = (breakdown) => {
  if (!breakdown) return [];
  const currency = breakdown.currency || "INR";
  const money = (minor) => formatSubunits(minor, currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rows = (breakdown.lines || []).map((line, i) => ({
    key: `line-${line.kind || i}-${i}`,
    label: line.label,
    value: money(line.amountMinor),
    kind: "line",
  }));
  const taxed = Number(breakdown.taxMinor) > 0;
  if (taxed || (breakdown.lines || []).length > 1) {
    rows.push({ key: "subtotal", label: "Subtotal", value: money(breakdown.subtotalMinor), kind: "subtotal" });
  }
  if (taxed) rows.push({ key: "taxes", label: breakdown.taxLabel || TAX_WORD, value: money(breakdown.taxMinor), kind: "taxes" });
  rows.push({ key: "total", label: "Total", value: money(breakdown.totalMinor), kind: "total" });
  return rows;
};

/** "Pay ₹470.82" — always the server's total. */
export const payLabel = (breakdown, fallback = "Pay") =>
  breakdown
    ? `Pay ${formatSubunits(breakdown.totalMinor, breakdown.currency || "INR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : fallback;

// ── Business tax ID (shown as "Business tax ID"; validated as a GSTIN) ──────

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Format + checksum only — a hint while typing. The server is the authority. */
export const isValidBusinessTaxId = (value) => {
  const id = String(value || "").toUpperCase().replace(/\s+/g, "");
  if (!PATTERN.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const product = CHARS.indexOf(id[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36] === id[14];
};

export const isIndia = (country) => ["INDIA", "IN", "IND", "BHARAT"].includes(String(country || "").trim().toUpperCase());

export const EMPTY_BILLING = Object.freeze({
  type: "individual",
  name: "",
  legalName: "",
  businessTaxId: "",
  isSez: false,
  line1: "",
  line2: "",
  city: "",
  stateCode: "",
  pincode: "",
  country: "India",
});

/** Client-side checks that mirror the server's, worded for users. Returns { field: message }. */
export const billingErrors = (billing) => {
  const errors = {};
  if (!String(billing.country || "").trim()) errors.country = "Select your country.";
  if (isIndia(billing.country)) {
    if (!billing.stateCode) errors.stateCode = "Select your state.";
    if (billing.pincode && !/^[1-9][0-9]{5}$/.test(String(billing.pincode).trim())) errors.pincode = "Enter a 6-digit PIN code.";
  }
  if (billing.businessTaxId) {
    if (!isValidBusinessTaxId(billing.businessTaxId)) errors.businessTaxId = "That business tax ID doesn't look right. Check it and try again.";
    else if (!isIndia(billing.country)) errors.businessTaxId = "A business tax ID can only be added for a billing address in India.";
    else if (billing.stateCode && String(billing.businessTaxId).trim().slice(0, 2) !== String(billing.stateCode).padStart(2, "0")) {
      errors.businessTaxId = "The business tax ID is registered in a different state from the one selected.";
    }
  }
  if (billing.type === "business") {
    if (!String(billing.legalName || "").trim()) errors.legalName = "Enter the registered business name.";
    if (!String(billing.line1 || "").trim()) errors.line1 = "Enter the business address.";
  }
  return errors;
};

/** The billing object a checkout endpoint accepts. */
export const billingPayload = (billing) => ({
  type: billing.type === "business" ? "business" : "individual",
  name: String(billing.name || "").trim(),
  legalName: String(billing.legalName || "").trim(),
  businessTaxId: String(billing.businessTaxId || "").toUpperCase().replace(/\s+/g, ""),
  isSez: Boolean(billing.isSez),
  line1: String(billing.line1 || "").trim(),
  line2: String(billing.line2 || "").trim(),
  city: String(billing.city || "").trim(),
  stateCode: String(billing.stateCode || "").trim(),
  pincode: String(billing.pincode || "").trim(),
  country: String(billing.country || "").trim(),
});

/** The saved billing details (or a prefill from the profile), for a checkout form. */
export const fetchBillingProfile = async () => {
  try {
    const { data } = await api.get("/users/billing-profile");
    const b = data?.billing || {};
    const source = b.saved ? b : { ...b, ...(b.suggested || {}) };
    return {
      saved: Boolean(b.saved),
      billing: {
        ...EMPTY_BILLING,
        type: source.type || "individual",
        name: source.name || "",
        legalName: source.legalName || "",
        businessTaxId: source.businessTaxId || "",
        isSez: Boolean(source.isSez),
        line1: source.line1 || "",
        line2: source.line2 || "",
        city: source.city || "",
        stateCode: source.stateCode || "",
        pincode: source.pincode || "",
        country: source.country || "India",
      },
    };
  } catch {
    return { saved: false, billing: { ...EMPTY_BILLING } };
  }
};

export const saveBillingProfile = async (billing) => {
  const { data } = await api.put("/users/billing-profile", billingPayload(billing));
  return data;
};

/** A one-line summary of saved billing details, for the collapsed checkout view. */
export const billingSummary = (billing, states = []) => {
  const state = states.find((s) => s.code === billing?.stateCode);
  return [
    billing?.type === "business" ? billing.legalName : billing?.name,
    billing?.city,
    state?.name,
    billing?.country,
    billing?.businessTaxId ? `Business tax ID ${billing.businessTaxId}` : "",
  ].filter(Boolean).join(" · ");
};
