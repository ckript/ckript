import DocumentSeries from "../../models/DocumentSeries.js";

/**
 * Tax document numbering (CGST Rules r.46(b)): consecutive, ≤ 16 characters, unique per financial
 * year, using only letters, digits, "-" and "/".
 *
 *   tax invoice   CK/2627/000123   (14 characters)
 *   credit note   CN/2627/000045
 *
 * Everything here works in INDIA time. The old invoice numbers stamped the UTC date, so a payment at
 * 00:30 IST carried yesterday's date — and on the night of 31 March / 1 April it would land in the
 * wrong financial year altogether.
 */

export const DOCUMENT_SERIES = Object.freeze({
  tax_invoice: "CK",
  credit_note: "CN",
});

export const DOCUMENT_NUMBER_PATTERN = /^[A-Z0-9/-]{1,16}$/;

const IST_OFFSET_MS = 330 * 60 * 1000;

/** Calendar parts of `date` as seen in India. */
export const istParts = (date = new Date()) => {
  const shifted = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
};

/** "2627" for any instant between 1 Apr 2026 00:00 IST and 31 Mar 2027 23:59:59 IST. */
export const financialYearOf = (date = new Date()) => {
  const { year, month } = istParts(date);
  const start = month >= 4 ? year : year - 1;
  return `${String(start % 100).padStart(2, "0")}${String((start + 1) % 100).padStart(2, "0")}`;
};

/** The IST calendar month "YYYY-MM" of an instant — the return period it is filed in. */
export const taxPeriodOf = (date = new Date()) => {
  const { year, month } = istParts(date);
  return `${year}-${String(month).padStart(2, "0")}`;
};

/** [start, end) instants of an IST calendar month "YYYY-MM". */
export const periodBounds = (period) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(period || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(year, month - 1, 1) - IST_OFFSET_MS);
  const end = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1) - IST_OFFSET_MS);
  return { start, end };
};

export const formatDocumentNumber = (prefix, fy, seq) => `${prefix}/${fy}/${String(seq).padStart(6, "0")}`;

/**
 * Allocate the next number in a series. Atomic: two concurrent calls can never get the same value.
 * Called only once a payment has been captured, so a number is never burnt on an abandoned checkout.
 */
export const allocateDocumentNumber = async (documentType, at = new Date()) => {
  const prefix = DOCUMENT_SERIES[documentType];
  if (!prefix) throw new Error(`No number series for document type "${documentType}"`);
  const fy = financialYearOf(at);
  const counter = await DocumentSeries.findOneAndUpdate(
    { series: prefix, fy },
    { $inc: { next: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const seq = Number(counter.next);
  return { number: formatDocumentNumber(prefix, fy, seq), series: prefix, fy, seq };
};
