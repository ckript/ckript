import { stateByCode } from "../../config/tax.js";
import { SUPPLY } from "./engine.js";

/**
 * GSTR-1 / GSTR-3B data, built from issued tax documents. PURE: give it the documents of a period and
 * it returns the return's tables. This is internal to the finance portal (one of the two places the
 * statutory names are allowed), so the column names follow the GST offline tool.
 *
 * Every amount is INR (returns are filed in INR): the snapshot's `inr` block, which for an INR sale is
 * the same figures and for a USD sale the converted ones. Credit notes reduce the tables they belong to.
 */

/** B2C invoices to another state above this value are reported invoice-wise (table 5, "B2CL"). TODO-CA: confirm. */
export const B2CL_THRESHOLD_INR_MINOR = 100000 * 100;

const rupees = (minor) => Math.round(Number(minor) || 0) / 100;
const istDate = (value) => (value
  ? new Date(new Date(value).getTime() + 330 * 60000).toISOString().slice(0, 10).split("-").reverse().join("-")
  : "");

const posLabel = (tax) => {
  const pos = tax?.placeOfSupply || {};
  if (pos.country && pos.country !== "IN") return "96-Foreign Country";
  const state = stateByCode(pos.stateCode);
  return state ? `${state.code}-${state.name}` : String(pos.stateCode || "");
};

const inrTotals = (tax) => {
  const inr = tax?.inr || {};
  const t = tax?.totals || {};
  const pick = (k) => (Number.isFinite(Number(inr[k])) && inr[k] !== undefined ? Number(inr[k]) : Number(t[k] || 0));
  return {
    taxable: pick("taxableMinor"),
    cgst: pick("cgstMinor"),
    sgst: pick("sgstMinor"),
    igst: pick("igstMinor"),
    gross: pick("grossMinor"),
  };
};

/** Lines in INR, scaled from the snapshot lines so they sum to the INR totals exactly. */
const inrLines = (tax) => {
  const totals = inrTotals(tax);
  const lines = tax?.lines || [];
  const sum = lines.reduce((a, l) => a + Number(l.taxableMinor || 0), 0) || 1;
  let taxableLeft = totals.taxable;
  let igstLeft = totals.igst;
  let cgstLeft = totals.cgst;
  let sgstLeft = totals.sgst;
  return lines.map((line, i) => {
    const last = i === lines.length - 1;
    const share = Number(line.taxableMinor || 0) / sum;
    const taxable = last ? taxableLeft : Math.round(totals.taxable * share);
    const igst = last ? igstLeft : Math.round(totals.igst * share);
    const cgst = last ? cgstLeft : Math.round(totals.cgst * share);
    const sgst = last ? sgstLeft : Math.round(totals.sgst * share);
    taxableLeft -= taxable; igstLeft -= igst; cgstLeft -= cgst; sgstLeft -= sgst;
    return { sac: line.sac, description: line.description, rate: Number(line.rateBps || 0) / 100, taxable, igst, cgst, sgst };
  });
};

const isExport = (tax) => tax?.supplyType === SUPPLY.EXPORT;
const isSez = (tax) => tax?.supplyType === SUPPLY.SEZ;
const isInter = (tax) => tax?.supplyType === SUPPLY.INTER || isSez(tax);
const hasGstin = (tax) => Boolean(tax?.recipient?.gstin);

/** Which GSTR-1 table an INVOICE belongs to. */
export const classifyDocument = (doc) => {
  const tax = doc.tax || {};
  if (isExport(tax)) return "exp";
  if (hasGstin(tax)) return "b2b";
  if (tax.supplyType === SUPPLY.INTER && inrTotals(tax).gross > B2CL_THRESHOLD_INR_MINOR) return "b2cl";
  return "b2cs";
};

export const buildGstr1 = ({ documents = [], cancelled = [] } = {}) => {
  const invoices = documents.filter((d) => d.documentType === "tax_invoice" && d.tax);
  const credits = documents.filter((d) => d.documentType === "credit_note" && d.tax);

  const b2b = [];
  const b2cl = [];
  const exp = [];
  const b2csMap = new Map();
  const cdnr = [];
  const cdnur = [];
  const hsnMap = new Map();

  const addHsn = (doc, sign) => {
    const audience = hasGstin(doc.tax) ? "B2B" : "B2C";
    for (const line of inrLines(doc.tax)) {
      const key = `${audience}|${line.sac}|${line.rate}`;
      const row = hsnMap.get(key) || {
        audience, hsn: line.sac, description: line.description, uqc: "OTH-OTHERS", quantity: 0,
        rate: line.rate, taxable: 0, igst: 0, cgst: 0, sgst: 0, value: 0,
      };
      row.quantity += sign;
      row.taxable += sign * line.taxable;
      row.igst += sign * line.igst;
      row.cgst += sign * line.cgst;
      row.sgst += sign * line.sgst;
      row.value += sign * (line.taxable + line.igst + line.cgst + line.sgst);
      hsnMap.set(key, row);
    }
  };

  const addB2cs = (doc, sign) => {
    const t = inrTotals(doc.tax);
    const rate = Number(doc.tax.rateBps || 0) / 100;
    const key = `${posLabel(doc.tax)}|${rate}`;
    const row = b2csMap.get(key) || { type: "OE", placeOfSupply: posLabel(doc.tax), rate, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
    row.taxable += sign * t.taxable;
    row.igst += sign * t.igst;
    row.cgst += sign * t.cgst;
    row.sgst += sign * t.sgst;
    b2csMap.set(key, row);
  };

  for (const doc of invoices) {
    const t = inrTotals(doc.tax);
    const rate = Number(doc.tax.rateBps || 0) / 100;
    const base = { number: doc.invoiceNumber, date: istDate(doc.invoiceDate), value: t.gross, placeOfSupply: posLabel(doc.tax), rate, taxable: t.taxable };
    const table = classifyDocument(doc);
    if (table === "b2b") {
      b2b.push({
        gstin: doc.tax.recipient.gstin,
        receiverName: doc.tax.recipient.legalName || doc.tax.recipient.name || "",
        ...base,
        reverseCharge: "N",
        invoiceType: isSez(doc.tax) ? "SEZ supplies with payment" : "Regular B2B",
        igst: t.igst, cgst: t.cgst, sgst: t.sgst,
      });
    } else if (table === "b2cl") {
      b2cl.push({ ...base, igst: t.igst });
    } else if (table === "exp") {
      exp.push({ exportType: "WPAY", ...base, igst: t.igst });
    } else {
      addB2cs(doc, 1);
    }
    addHsn(doc, 1);
  }

  for (const doc of credits) {
    const t = inrTotals(doc.tax);
    const rate = Number(doc.tax.rateBps || 0) / 100;
    const base = {
      noteNumber: doc.invoiceNumber,
      noteDate: istDate(doc.invoiceDate),
      noteType: "C",
      placeOfSupply: posLabel(doc.tax),
      value: t.gross,
      rate,
      taxable: t.taxable,
      igst: t.igst, cgst: t.cgst, sgst: t.sgst,
      originalNumber: doc.originalInvoiceNumber || "",
      originalDate: istDate(doc.originalInvoiceDate),
    };
    if (hasGstin(doc.tax)) {
      cdnr.push({ gstin: doc.tax.recipient.gstin, receiverName: doc.tax.recipient.legalName || doc.tax.recipient.name || "", reverseCharge: "N", supplyType: isSez(doc.tax) ? "SEZ supplies with payment" : "Regular B2B", ...base });
    } else if (isExport(doc.tax)) {
      cdnur.push({ urType: "EXPWP", ...base });
    } else if (doc.tax.supplyType === SUPPLY.INTER && t.gross > B2CL_THRESHOLD_INR_MINOR) {
      cdnur.push({ urType: "B2CL", ...base });
    } else {
      // Small B2C credit notes are netted into B2CS rather than reported note-wise.
      addB2cs(doc, -1);
    }
    addHsn(doc, -1);
  }

  // Table 13: document ranges per series, with cancelled numbers counted.
  const docsBySeries = new Map();
  for (const doc of [...invoices, ...credits, ...cancelled]) {
    if (!doc.series) continue;
    const key = `${doc.series}|${doc.fy}`;
    const row = docsBySeries.get(key) || {
      nature: doc.series === "CN" ? "Credit Note" : "Invoices for outward supply",
      series: doc.series, fy: doc.fy, from: null, to: null, fromNumber: "", toNumber: "", total: 0, cancelled: 0,
    };
    row.total += 1;
    if (doc.documentType === "cancelled") row.cancelled += 1;
    if (row.from === null || doc.seq < row.from) { row.from = doc.seq; row.fromNumber = doc.invoiceNumber; }
    if (row.to === null || doc.seq > row.to) { row.to = doc.seq; row.toNumber = doc.invoiceNumber; }
    docsBySeries.set(key, row);
  }

  return {
    b2b,
    b2cl,
    b2cs: [...b2csMap.values()],
    exp,
    cdnr,
    cdnur,
    hsn: [...hsnMap.values()],
    docs: [...docsBySeries.values()].map(({ from, to, ...row }) => ({ ...row, netIssued: row.total - row.cancelled })),
  };
};

/** GSTR-3B 3.1 and 3.2 from the same documents. */
export const buildGstr3b = ({ documents = [] } = {}) => {
  const zero = () => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });
  const t31a = zero();
  const t31b = zero();
  const t32 = new Map();
  for (const doc of documents) {
    if (!doc.tax || !["tax_invoice", "credit_note"].includes(doc.documentType)) continue;
    const sign = doc.documentType === "credit_note" ? -1 : 1;
    const t = inrTotals(doc.tax);
    const bucket = isExport(doc.tax) || isSez(doc.tax) ? t31b : t31a;
    bucket.taxable += sign * t.taxable;
    bucket.igst += sign * t.igst;
    bucket.cgst += sign * t.cgst;
    bucket.sgst += sign * t.sgst;
    if (isInter(doc.tax) && !hasGstin(doc.tax) && !isSez(doc.tax)) {
      const key = posLabel(doc.tax);
      const row = t32.get(key) || { placeOfSupply: key, taxable: 0, igst: 0 };
      row.taxable += sign * t.taxable;
      row.igst += sign * t.igst;
      t32.set(key, row);
    }
  }
  return {
    "3.1(a) Outward taxable supplies (other than zero rated, nil rated and exempted)": t31a,
    "3.1(b) Outward taxable supplies (zero rated)": t31b,
    "3.1(c) Other outward supplies (nil rated, exempted)": zero(),
    "3.2 Inter-state supplies to unregistered persons": [...t32.values()],
  };
};

// ── CSV ─────────────────────────────────────────────────────────────────────

const cell = (value) => {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV for one GSTR-1 table, amounts in rupees with two decimals, columns as the offline tool names them. */
export const GSTR1_COLUMNS = {
  b2b: [["GSTIN/UIN of Recipient", "gstin"], ["Receiver Name", "receiverName"], ["Invoice Number", "number"], ["Invoice date", "date"], ["Invoice Value", "value", true], ["Place Of Supply", "placeOfSupply"], ["Reverse Charge", "reverseCharge"], ["Invoice Type", "invoiceType"], ["Rate", "rate"], ["Taxable Value", "taxable", true], ["Integrated Tax", "igst", true], ["Central Tax", "cgst", true], ["State/UT Tax", "sgst", true]],
  b2cl: [["Invoice Number", "number"], ["Invoice date", "date"], ["Invoice Value", "value", true], ["Place Of Supply", "placeOfSupply"], ["Rate", "rate"], ["Taxable Value", "taxable", true], ["Integrated Tax", "igst", true]],
  b2cs: [["Type", "type"], ["Place Of Supply", "placeOfSupply"], ["Rate", "rate"], ["Taxable Value", "taxable", true], ["Integrated Tax", "igst", true], ["Central Tax", "cgst", true], ["State/UT Tax", "sgst", true]],
  exp: [["Export Type", "exportType"], ["Invoice Number", "number"], ["Invoice date", "date"], ["Invoice Value", "value", true], ["Rate", "rate"], ["Taxable Value", "taxable", true], ["Integrated Tax", "igst", true]],
  cdnr: [["GSTIN/UIN of Recipient", "gstin"], ["Receiver Name", "receiverName"], ["Note Number", "noteNumber"], ["Note Date", "noteDate"], ["Note Type", "noteType"], ["Place Of Supply", "placeOfSupply"], ["Reverse Charge", "reverseCharge"], ["Note Supply Type", "supplyType"], ["Note Value", "value", true], ["Rate", "rate"], ["Taxable Value", "taxable", true], ["Integrated Tax", "igst", true], ["Central Tax", "cgst", true], ["State/UT Tax", "sgst", true], ["Original Invoice", "originalNumber"], ["Original Date", "originalDate"]],
  cdnur: [["UR Type", "urType"], ["Note Number", "noteNumber"], ["Note Date", "noteDate"], ["Note Type", "noteType"], ["Place Of Supply", "placeOfSupply"], ["Note Value", "value", true], ["Rate", "rate"], ["Taxable Value", "taxable", true], ["Integrated Tax", "igst", true], ["Original Invoice", "originalNumber"]],
  hsn: [["Supply", "audience"], ["HSN/SAC", "hsn"], ["Description", "description"], ["UQC", "uqc"], ["Total Quantity", "quantity"], ["Total Value", "value", true], ["Rate", "rate"], ["Taxable Value", "taxable", true], ["Integrated Tax Amount", "igst", true], ["Central Tax Amount", "cgst", true], ["State/UT Tax Amount", "sgst", true]],
  docs: [["Nature of Document", "nature"], ["Sr. No. From", "fromNumber"], ["Sr. No. To", "toNumber"], ["Total Number", "total"], ["Cancelled", "cancelled"], ["Net Issued", "netIssued"]],
};

export const gstr1Csv = (table, rows) => {
  const columns = GSTR1_COLUMNS[table];
  if (!columns) return "";
  const header = columns.map(([label]) => cell(label)).join(",");
  const body = (rows || []).map((row) => columns.map(([, key, money]) => cell(money ? rupees(row[key]).toFixed(2) : row[key])).join(","));
  return [header, ...body].join("\r\n");
};
