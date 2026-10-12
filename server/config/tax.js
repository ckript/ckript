import { COMPANY } from "../utils/companyContacts.js";

/**
 * Taxes on every payment — the founder's decisions, as configuration.
 *
 * Confirmed 2026-10-11 (see GST_BILLING_PROMPT.md §1.3):
 *   • Listed prices are PRE-TAX (₹399). Taxes of 18% are ADDED at checkout (₹470.82 charged).
 *   • 18% applies to the FULL amount (script price + platform fee, the whole consultation), and to
 *     foreign / USD buyers too — no LUT, no zero-rating.
 *   • Users only ever see the word "Taxes". GST terminology appears only on the tax invoice PDF and
 *     in the finance portal's statutory views, because the law requires it there.
 *   • Tax liability starts 2026-10-04 00:00 IST (the registration date). Payments before that are
 *     untouched; payments from then until charging switched on get tax carved out of what was paid.
 *
 * Every value is read LAZILY: dotenv.config() runs in server.js's body, after every import has been
 * evaluated, so a module-level `process.env.X` read would capture undefined forever.
 */

const env = (key, fallback = "") => {
  const value = String(process.env[key] ?? "").trim();
  return value || fallback;
};

const asDate = (value, fallback) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : fallback;
};

/** Charging taxes at checkout. Off by default: with it off, checkout behaves exactly as before. */
export const taxChargingEnabled = () => env("GST_ENABLED", "false").toLowerCase() === "true";

/** The moment taxes started being added at checkout (informational; the flag is what gates it). */
export const taxChargeFrom = () => asDate(env("GST_CHARGE_FROM"), null);

/** The registration date. Payments before this were never taxable. */
export const TAX_LIABILITY_DEFAULT = "2026-10-04T00:00:00+05:30";
export const taxLiabilityFrom = () => asDate(env("TAX_LIABILITY_FROM", TAX_LIABILITY_DEFAULT), new Date(TAX_LIABILITY_DEFAULT));

/** A muted "+ taxes" next to listed prices. Off by the founder's call; available without a release. */
export const showPlusTaxesHint = () => env("SHOW_PLUS_TAXES_HINT", "false").toLowerCase() === "true";

/** The only word the client may show for tax. */
export const TAX_LABEL = "Taxes";

/**
 * Rates in BASIS POINTS with effective dates, so a future rate change is a data change and every
 * historical document still resolves to the rate it was issued under.
 */
export const RATE_TABLE = [
  { key: "standard", rateBps: 1800, from: "2017-07-01T00:00:00+05:30", to: null },
];

export const rateFor = (key = "standard", at = new Date()) => {
  const when = asDate(at, new Date()).getTime();
  const row = RATE_TABLE.find((r) =>
    r.key === key
    && new Date(r.from).getTime() <= when
    && (!r.to || new Date(r.to).getTime() > when));
  return row ? row.rateBps : 1800;
};

/**
 * What each sellable line is, for the tax invoice and the HSN/SAC summary.
 *
 * TODO-CA: SAC codes are candidates, to be confirmed by the CA before filing:
 *   plans 998431 / 998439 / 997331 · script licence 997336 / 997339 · platform fee 998599
 *   competition entry 998596 · AI trailer 999612 / 998439 · consultation 998399
 */
export const PRODUCT_TAX = {
  plan_fip: { sac: "998439", description: "Film Industry Professional plan", rateKey: "standard" },
  plan_writer_silver: { sac: "998439", description: "Writer Silver plan", rateKey: "standard" },
  plan_writer_gold: { sac: "998439", description: "Writer Gold plan", rateKey: "standard" },
  script_price: { sac: "997336", description: "Screenplay rights", rateKey: "standard" },
  script_platform_fee: { sac: "998599", description: "Platform fee", rateKey: "standard" },
  hold_price: { sac: "997336", description: "Screenplay hold (option) fee", rateKey: "standard" },
  hold_platform_fee: { sac: "998599", description: "Platform fee", rateKey: "standard" },
  ai_trailer: { sac: "999612", description: "AI trailer generation", rateKey: "standard" },
  competition_registration: { sac: "998596", description: "Competition entry fee", rateKey: "standard" },
  consultation: { sac: "998399", description: "Script consultation", rateKey: "standard" },
};

export const PLAN_LINE_KIND = {
  film_industry_professional: "plan_fip",
  writer_silver: "plan_writer_silver",
  writer_gold: "plan_writer_gold",
};

/** The supplier, from the company getters (read at call time). */
export const supplier = () => ({
  legalName: COMPANY.legalName,
  gstin: COMPANY.gstin,
  stateCode: COMPANY.gstStateCode,
  address: COMPANY.registeredAddress,
  pan: COMPANY.pan,
  cin: COMPANY.cin,
});

/**
 * GST state / UT codes. `legacy` codes are still accepted inside an old GSTIN but never offered in a
 * dropdown (25 Daman & Diu merged into 26 in 2020; 28 is pre-2014 Andhra Pradesh). 96 and 97 exist for
 * reporting only.
 */
export const STATE_CODES = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "25", name: "Daman and Diu", legacy: true },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "28", name: "Andhra Pradesh (before 2014)", legacy: true },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory", reportingOnly: true },
  { code: "96", name: "Foreign Country", reportingOnly: true },
];

const STATE_BY_CODE = new Map(STATE_CODES.map((s) => [s.code, s]));

const normaliseName = (value) => String(value || "")
  .toLowerCase()
  .replace(/&/g, " and ")
  .replace(/[^a-z ]/g, " ")
  .replace(/\b(state of|nct of|the|ut of|union territory of)\b/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const STATE_ALIASES = {
  "new delhi": "07",
  "delhi ncr": "07",
  "orissa": "21",
  "pondicherry": "34",
  "j and k": "01",
  "jammu kashmir": "01",
  "andaman nicobar": "35",
  "andaman and nicobar": "35",
  "dadra and nagar haveli": "26",
  "daman and diu": "26",
  "uttaranchal": "05",
  "bombay": "27",
  "mumbai": "27",
  "bangalore": "29",
  "bengaluru": "29",
};

const STATE_BY_NAME = new Map(
  STATE_CODES.filter((s) => !s.reportingOnly && !s.legacy).map((s) => [normaliseName(s.name), s.code]),
);

export const stateByCode = (code) => STATE_BY_CODE.get(String(code || "").padStart(2, "0")) || null;

/** A state code from a free-text state name ("New Delhi", "maharashtra", "Orissa"), or "". */
export const stateCodeFromName = (name) => {
  const key = normaliseName(name);
  if (!key) return "";
  return STATE_BY_NAME.get(key) || STATE_ALIASES[key] || "";
};

/** The list a billing form offers: current states and UTs only. */
export const selectableStates = () =>
  STATE_CODES.filter((s) => !s.legacy && !s.reportingOnly).map(({ code, name }) => ({ code, name }));

/** What GET /api/tax/config returns. No GSTIN and no "GST" wording — see the wording rule. */
export const publicTaxConfig = () => ({
  label: TAX_LABEL,
  ratePercent: rateFor("standard") / 100,
  chargingEnabled: taxChargingEnabled(),
  showPlusTaxesHint: showPlusTaxesHint(),
  states: selectableStates(),
});
