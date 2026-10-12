import { formatSubunits } from "../../utils/currency";

/**
 * Formatting and labels shared by every /finance tab.
 *
 * Pure: no requests, no React. Every amount the finance API returns is an integer in MINOR units
 * (paise / cents), so `money` is the one door they all go through. Two decimals always, even for INR
 * where the rest of the product rounds to whole rupees: a tax return is filed to the paisa, and a
 * figure rounded on screen would disagree with the CSV the CA files from.
 *
 * This file sits inside pages/finance on purpose. The statutory names (CGST/SGST/IGST, GSTIN) are
 * allowed here and nowhere else in the client — the finance portal is internal, and the CA files
 * returns from it.
 */

export const money = (minor, currency) =>
  formatSubunits(Number(minor) || 0, currency || "INR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const day = (value) => (value ? new Date(value).toLocaleDateString() : "—");

/** A date someone has to act on ("Issue by …") — spelled out so 03/11 is never read as 11 March. */
export const longDay = (value) => (value
  ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
  : "—");

/** Ledger kinds (LedgerEntry.kind). */
export const KIND_LABEL = {
  plan_subscription: "Plans",
  competition_registration: "Challenge entries",
  script_purchase: "Script purchases",
  script_hold: "Script holds",
  ai_trailer: "AI trailers",
  consultation: "Consultations",
  cash_prize: "Cash prizes owed",
  credits: "Credits",
  other: "Other",
};

/** Invoice kinds (Invoice.kind) — named after the document rather than the money. */
export const INVOICE_KIND_LABEL = {
  plan_subscription: "Plan",
  script: "Script purchase",
  script_hold: "Script hold",
  ai_trailer: "AI trailer",
  competition_registration: "Challenge entry",
  consultation: "Consultation",
};

/** How a supply was taxed. Statutory names are fine here: this is the internal portal. */
export const SUPPLY_LABEL = {
  intra: "Delhi (CGST+SGST)",
  inter: "Other state (IGST)",
  export_igst: "Export (IGST)",
  sez_igst: "SEZ (IGST)",
  pre_gst: "Before taxes",
  no_consideration: "Free",
};

export const supplyLabel = (type) => SUPPLY_LABEL[type] || type || "—";

export const DOCUMENT_TYPE_LABEL = {
  tax_invoice: "Tax invoice",
  credit_note: "Credit note",
  legacy_invoice: "Before taxes",
  access_confirmation: "Access confirmation",
  cancelled: "Cancelled",
};

/**
 * Place of supply, whichever shape it arrives in: a code string from the ledger, register and gap
 * endpoints, or the snapshot object ({ country, stateCode, stateName }) from the invoices endpoint.
 */
export const placeLabel = (pos) => {
  if (!pos) return "—";
  if (typeof pos === "string") return pos;
  if (pos.country && pos.country !== "IN") return pos.country;
  return [pos.stateCode, pos.stateName].filter(Boolean).join("-") || "—";
};

/** CGST/SGST/IGST, naming only the parts that are non-zero — "IGST ₹18.00" rather than three zeros. */
export const taxParts = ({ cgstMinor, sgstMinor, igstMinor } = {}, currency) => [
  ["CGST", cgstMinor],
  ["SGST", sgstMinor],
  ["IGST", igstMinor],
].filter(([, v]) => Number(v)).map(([label, v]) => `${label} ${money(v, currency)}`).join(" · ");

/** The month a period string names, local time: "2026-10". */
export const periodOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

/** First and last day of a "YYYY-MM" period as YYYY-MM-DD strings, or null for a malformed one. */
export const periodRange = (period) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(period || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const last = new Date(year, month, 0).getDate();
  return { from: `${match[1]}-${match[2]}-01`, to: `${match[1]}-${match[2]}-${String(last).padStart(2, "0")}` };
};

/** Minor units as the plain major-unit text an input would hold (47080 → "470.80"), without floats. */
export const toMajorInput = (minor) => {
  const n = Math.abs(Math.trunc(Number(minor) || 0));
  return `${Math.floor(n / 100)}.${String(n % 100).padStart(2, "0")}`;
};

/**
 * A major-unit amount someone typed ("470.8") as integer minor units (47080), parsed as a STRING so
 * no float ever touches the figure. Returns null for anything that is not a plain positive amount
 * with at most two decimals.
 */
export const toMinorUnits = (input) => {
  const text = String(input ?? "").trim().replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
};
