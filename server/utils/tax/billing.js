import { stateByCode, stateCodeFromName } from "../../config/tax.js";
import { COUNTRIES } from "../countries.js";
import { validateGstin } from "./engine.js";

/**
 * Billing details: who the tax invoice is addressed to, and the evidence for its place of supply.
 *
 * Shown to users as "Billing details", with the GSTIN as "Business tax ID (optional)". The word GST
 * never appears in an error message here either — these strings reach the browser.
 */

const text = (value, max = 200) => String(value ?? "").trim().slice(0, max);

const INDIA_TOKENS = new Set(["IN", "IND", "INDIA", "BHARAT"]);

/** "IN" for India in any spelling; otherwise the country upper-cased; "" when absent. */
export const countryKey = (value) => {
  const raw = text(value, 80).toUpperCase();
  if (!raw) return "";
  return INDIA_TOKENS.has(raw) ? "IN" : raw;
};

const knownStateCode = (code) => {
  const state = stateByCode(code);
  return Boolean(state && !state.reportingOnly);
};

export const checkBusinessTaxId = (value) => validateGstin(value, { knownStateCode });

/**
 * Validate billing details from a request. Returns { ok, billing } or { ok:false, errors }.
 * Never throws; every field is length-capped and sanitised.
 */
export const normalizeBillingInput = (input = {}) => {
  const errors = {};
  const type = input.type === "business" ? "business" : "individual";
  const country = text(input.country, 80);
  const isIndia = countryKey(country) === "IN";
  const rawState = text(input.stateCode, 4);
  const stateCode = rawState ? rawState.padStart(2, "0") : "";
  const pincode = text(input.pincode, 12).replace(/\s+/g, "");
  // "businessTaxId" is the public name the client uses; "gstin" is accepted for internal callers.
  const gstinRaw = text(input.businessTaxId || input.gstin, 20).toUpperCase().replace(/\s+/g, "");

  if (!country) errors.country = "Select your country.";
  else if (!COUNTRIES.includes(country) && !isIndia) errors.country = "Select a country from the list.";

  if (isIndia) {
    if (!stateCode) errors.stateCode = "Select your state.";
    else if (!knownStateCode(stateCode) || stateByCode(stateCode)?.legacy) errors.stateCode = "Select a state from the list.";
    if (pincode && !/^[1-9][0-9]{5}$/.test(pincode)) errors.pincode = "Enter a 6-digit PIN code.";
  }

  let gstin = "";
  if (gstinRaw) {
    const check = checkBusinessTaxId(gstinRaw);
    if (!check.valid) {
      errors.gstin = "That business tax ID doesn't look right. Check it and try again.";
    } else {
      gstin = check.value;
      if (!isIndia) errors.gstin = "A business tax ID can only be added for a billing address in India.";
      else if (stateCode && check.stateCode !== stateCode) {
        errors.gstin = "The business tax ID is registered in a different state from the one selected.";
      }
    }
  }

  if (type === "business") {
    if (!text(input.legalName)) errors.legalName = "Enter the registered business name.";
    if (!text(input.line1)) errors.line1 = "Enter the business address.";
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    billing: {
      type,
      name: text(input.name, 120),
      legalName: text(input.legalName, 160),
      gstin,
      isSez: Boolean(gstin && (input.isSez === true || input.isSez === "true")),
      line1: text(input.line1),
      line2: text(input.line2),
      city: text(input.city, 80),
      stateCode: isIndia ? stateCode : "",
      pincode,
      country: isIndia ? "India" : country,
    },
  };
};

/**
 * The billing details to use for a purchase: an explicit override first, then the saved billing
 * profile, then whatever the public profile address says. Returns the shape the engine expects.
 */
export const resolveBilling = (user = {}, override = null) => {
  const saved = user?.billingProfile || {};
  const source = override || (saved.country ? saved : null);
  const profileAddress = user?.address || {};
  const profileCountry = countryKey(profileAddress.country);

  if (source) {
    const country = countryKey(source.country);
    const gstinCheck = source.gstin ? checkBusinessTaxId(source.gstin) : null;
    return {
      billing: {
        type: source.type === "business" ? "business" : "individual",
        name: text(source.name) || text(user?.name),
        legalName: text(source.legalName),
        gstin: gstinCheck?.valid ? gstinCheck.value : "",
        gstinStateCode: gstinCheck?.valid ? gstinCheck.stateCode : "",
        isSez: Boolean(gstinCheck?.valid && source.isSez),
        line1: text(source.line1),
        line2: text(source.line2),
        city: text(source.city),
        stateCode: country === "IN" ? text(source.stateCode, 4) : "",
        pincode: text(source.pincode, 12),
        country,
        countryName: text(source.country, 80),
      },
      profile: { country: profileCountry, stateCode: stateCodeFromName(profileAddress.state) },
    };
  }

  return {
    billing: { type: "individual", name: text(user?.name), country: "", countryName: "" },
    profile: { country: profileCountry, stateCode: profileCountry === "IN" || !profileCountry ? stateCodeFromName(profileAddress.state) : "" },
  };
};

/** The recipient block printed on the tax invoice. */
export const recipientFromBilling = (billing = {}, user = {}) => {
  const state = billing.stateCode ? stateByCode(billing.stateCode) : null;
  return {
    type: billing.type || "individual",
    name: text(billing.name) || text(user?.name),
    legalName: text(billing.legalName),
    gstin: text(billing.gstin, 20),
    isSez: Boolean(billing.isSez),
    email: text(user?.email, 160),
    address: {
      line1: text(billing.line1),
      line2: text(billing.line2),
      city: text(billing.city),
      stateCode: text(billing.stateCode, 4),
      stateName: state?.name || "",
      pincode: text(billing.pincode, 12),
      country: billing.country === "IN" ? "India" : text(billing.countryName || billing.country, 80),
    },
  };
};

/** The saved profile as the client sees it (labels resolved, nothing internal). */
export const publicBillingProfile = (user = {}) => {
  const saved = user?.billingProfile || {};
  return {
    type: saved.type || "individual",
    name: saved.name || "",
    legalName: saved.legalName || "",
    businessTaxId: saved.gstin || "",
    isSez: Boolean(saved.isSez),
    line1: saved.line1 || "",
    line2: saved.line2 || "",
    city: saved.city || "",
    stateCode: saved.stateCode || "",
    pincode: saved.pincode || "",
    country: saved.country || "",
    saved: Boolean(saved.country),
    // Prefill for a first-time form, from the public profile address.
    suggested: saved.country
      ? null
      : {
        name: user?.name || "",
        city: user?.address?.city || "",
        country: countryKey(user?.address?.country) === "IN" ? "India" : (user?.address?.country || ""),
        stateCode: stateCodeFromName(user?.address?.state),
        pincode: user?.address?.zipCode || "",
        line1: user?.address?.street || "",
      },
  };
};
