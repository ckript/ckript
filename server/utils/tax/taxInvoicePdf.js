import { Writable } from "stream";
import PDFDocument from "pdfkit";
import { CONTACTS } from "../companyContacts.js";
import { LOGO, SIGNATURE, BRAND } from "../brandAssets.js";
import { stateByCode } from "../../config/tax.js";
import { amountInWords } from "./engine.js";

/**
 * The TAX INVOICE and CREDIT NOTE (CGST Rules r.46 / CGST Act s.34).
 *
 * This is the one buyer-facing document where GST terminology appears — the GSTIN and the CGST, SGST
 * and IGST lines are what the law requires a tax invoice to state. Everywhere else the founder's
 * wording rule holds and users read "Taxes"; so even here the totals lead with a friendly
 * "Taxes (18%)" line and print the statutory breakup beneath it.
 *
 * Every figure comes from the document's frozen `tax` snapshot — supplier, recipient, place of supply,
 * lines and totals. Nothing is recomputed, so re-rendering a document (a design change) can change its
 * layout but never its numbers.
 */

const IST = "Asia/Kolkata";

const longDate = (value) => (value
  ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: IST })
  : "-");

const money = (minor, currency) => {
  const code = String(currency || "INR").toUpperCase();
  const value = (Number(minor) || 0) / 100;
  const grouped = value.toLocaleString(code === "INR" ? "en-IN" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${code} ${grouped}`;
};

const text = (value, fallback = "-") => {
  const t = String(value ?? "").trim();
  return t || fallback;
};

const titleCase = (value) => String(value || "").toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

const placeOfSupplyLabel = (pos = {}) => {
  if (pos.country && pos.country !== "IN") return `${titleCase(pos.country)} (outside India)`;
  const state = stateByCode(pos.stateCode);
  return state ? `${state.name} (${state.code})` : text(pos.stateCode);
};

export const renderTaxInvoicePdfBuffer = async ({ invoice }) => {
  const tax = invoice?.tax;
  if (!invoice?._id || !invoice?.invoiceNumber || !tax) throw new Error("A tax document needs its snapshot to render");

  const isCredit = invoice.documentType === "credit_note";
  const currency = tax.currency || invoice.currency || "INR";
  const supplier = tax.supplier || {};
  const recipient = tax.recipient || {};
  const address = recipient.address || {};
  const totals = tax.totals || {};
  const rate = Number(tax.rateBps || 0) / 100;
  const intra = Number(totals.cgstMinor || 0) + Number(totals.sgstMinor || 0) > 0;
  const supplierState = stateByCode(supplier.stateCode);

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "A4", margin: 44, bufferPages: true });
    doc.on("error", reject);
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.pipe(new Writable({ write(_c, _e, cb) { cb(); } }));

    const left = 44;
    const right = doc.page.width - 44;
    const width = right - left;
    const contentBottom = doc.page.height - 84;
    let y = 44;

    const eyebrow = (label, x, at, w, { align = "left", color = BRAND.inkMuted } = {}) => {
      doc.font("Helvetica-Bold").fontSize(6.8).fillColor(color)
        .text(String(label).toUpperCase(), x, at, { width: w, align, characterSpacing: 1 });
    };
    const rule = (x, at, w, { color = BRAND.rule, weight = 0.7 } = {}) => {
      doc.save().moveTo(x, at).lineTo(x + w, at).lineWidth(weight).strokeColor(color).stroke().restore();
    };
    const block = (title, lines, x, at, w) => {
      let cy = at;
      eyebrow(title, x, cy, w);
      cy += 10;
      rule(x, cy, w);
      cy += 6;
      lines.filter(Boolean).forEach((line, i) => {
        const t = String(line);
        doc.font(i === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(i === 0 ? 9.5 : 8.4)
          .fillColor(i === 0 ? BRAND.ink : BRAND.inkSoft)
          .text(t, x, cy, { width: w });
        cy += doc.heightOfString(t, { width: w }) + 2;
      });
      return cy - at;
    };
    const ensure = (needed) => {
      if (y + needed <= contentBottom) return;
      doc.addPage();
      y = 44;
    };

    // ── Masthead ──────────────────────────────────────────────────────────────
    const logoH = 40;
    const [logoW] = LOGO.boxForHeight(logoH);
    let drewLogo = false;
    if (LOGO.path) {
      try { doc.image(LOGO.path, left, y, { width: logoW, height: logoH }); drewLogo = true; } catch { /* wordmark below */ }
    }
    if (!drewLogo) {
      doc.font("Times-Bold").fontSize(26).fillColor(BRAND.ink).text("ckript", left, y + 6);
    }
    doc.font("Times-Bold").fontSize(22).fillColor(BRAND.ink)
      .text(isCredit ? "CREDIT NOTE" : "TAX INVOICE", right - 260, y + 2, { width: 260, align: "right", characterSpacing: 2.5 });
    doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND.accent)
      .text(text(invoice.invoiceNumber), right - 260, y + 30, { width: 260, align: "right" });
    rule(left, y + logoH + 12, width, { color: BRAND.accent, weight: 1.8 });
    y += logoH + 24;

    // ── Supplier | Document ──────────────────────────────────────────────────
    const gap = 24;
    const colW = (width - gap) / 2;
    const supplierH = block("Supplier", [
      supplier.legalName,
      supplier.address,
      `GSTIN: ${text(supplier.gstin)}`,
      supplier.pan ? `PAN: ${supplier.pan}` : "",
      supplier.cin ? `CIN: ${supplier.cin}` : "",
      supplierState ? `State: ${supplierState.name} (${supplierState.code})` : "",
    ], left, y, colW);
    const docLines = [
      `${isCredit ? "Credit note" : "Invoice"} no.: ${text(invoice.invoiceNumber)}`,
      `${isCredit ? "Credit note" : "Invoice"} date: ${longDate(invoice.invoiceDate)}`,
      `Date of supply: ${longDate(invoice.supplyDate || invoice.invoiceDate)}`,
      `Place of supply: ${placeOfSupplyLabel(tax.placeOfSupply)}`,
      "Whether tax is payable on reverse charge: No",
      `Currency: ${currency}`,
    ];
    if (isCredit) {
      docLines.splice(2, 0, `Against invoice: ${text(invoice.originalInvoiceNumber)} dated ${longDate(invoice.originalInvoiceDate)}`);
      if (invoice.creditReason) docLines.push(`Reason: ${invoice.creditReason}`);
    }
    const docH = block(isCredit ? "Credit note" : "Invoice", docLines, left + colW + gap, y, colW);
    y += Math.max(supplierH, docH) + 16;

    // ── Billed to ────────────────────────────────────────────────────────────
    const recipientState = stateByCode(address.stateCode);
    const billedH = block("Billed to", [
      recipient.legalName || recipient.name,
      recipient.legalName && recipient.name && recipient.legalName !== recipient.name ? recipient.name : "",
      [address.line1, address.line2].filter(Boolean).join(", "),
      [address.city, recipientState ? `${recipientState.name} (${recipientState.code})` : "", address.pincode].filter(Boolean).join(", "),
      address.country,
      recipient.gstin ? `GSTIN: ${recipient.gstin}${recipient.isSez ? " (SEZ)" : ""}` : "",
      recipient.email,
    ], left, y, width);
    y += billedH + 16;

    // ── Lines ────────────────────────────────────────────────────────────────
    const cols = [
      { key: "desc", label: "Description", w: width * 0.36, align: "left" },
      { key: "sac", label: "SAC", w: width * 0.09, align: "left" },
      { key: "qty", label: "Qty", w: width * 0.06, align: "right" },
      { key: "taxable", label: "Taxable value", w: width * 0.15, align: "right" },
      { key: "rate", label: "Rate", w: width * 0.07, align: "right" },
      { key: "tax", label: "Tax", w: width * 0.12, align: "right" },
      { key: "total", label: "Amount", w: width * 0.15, align: "right" },
    ];
    const drawHead = () => {
      let x = left;
      cols.forEach((c) => { eyebrow(c.label, x, y, c.w - 4, { align: c.align, color: BRAND.accent }); x += c.w; });
      y += 11;
      rule(left, y, width, { color: BRAND.ink, weight: 0.8 });
      y += 6;
    };
    drawHead();
    (tax.lines || []).forEach((line) => {
      const cells = {
        desc: text(line.description),
        sac: text(line.sac),
        qty: String(line.qty || 1),
        taxable: money(line.taxableMinor, currency),
        rate: `${(Number(line.rateBps || 0) / 100)}%`,
        tax: money(line.taxMinor, currency),
        total: money(line.totalMinor, currency),
      };
      doc.font("Helvetica").fontSize(8.6);
      const h = Math.max(16, doc.heightOfString(cells.desc, { width: cols[0].w - 6 }) + 6);
      ensure(h + 4);
      let x = left;
      cols.forEach((c) => {
        doc.font(c.key === "desc" ? "Helvetica-Bold" : "Helvetica").fontSize(8.6).fillColor(BRAND.ink)
          .text(cells[c.key], x, y, { width: c.w - 6, align: c.align });
        x += c.w;
      });
      y += h;
      rule(left, y - 3, width, { color: BRAND.ruleSoft });
    });

    // ── Totals ───────────────────────────────────────────────────────────────
    ensure(140);
    y += 8;
    const boxW = 250;
    const boxX = right - boxW;
    const row = (label, value, { bold = false, muted = false } = {}) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 10.5 : 8.8)
        .fillColor(muted ? BRAND.inkMuted : BRAND.ink)
        .text(label, boxX, y, { width: boxW * 0.58 })
        .text(value, boxX + boxW * 0.58, y, { width: boxW * 0.42, align: "right" });
      y += bold ? 16 : 13;
    };
    row("Subtotal (taxable value)", money(totals.taxableMinor, currency));
    row(`Taxes (${rate}%)`, money(totals.taxMinor, currency));
    if (intra) {
      row(`   CGST ${rate / 2}%`, money(totals.cgstMinor, currency), { muted: true });
      row(`   SGST ${rate / 2}%`, money(totals.sgstMinor, currency), { muted: true });
    } else if (Number(totals.igstMinor || 0) > 0) {
      row(`   IGST ${rate}%`, money(totals.igstMinor, currency), { muted: true });
    }
    rule(boxX, y + 1, boxW, { color: BRAND.accent, weight: 1.2 });
    y += 6;
    row(isCredit ? "Total credited" : "Total", money(totals.grossMinor, currency), { bold: true });

    doc.font("Helvetica-Oblique").fontSize(8.4).fillColor(BRAND.inkSoft)
      .text(`Amount in words: ${amountInWords(totals.grossMinor, currency)}`, left, y + 2, { width });
    y += doc.heightOfString("x", { width }) + 10;

    const notes = [];
    if (tax.exportDeclaration) notes.push(tax.exportDeclaration);
    if (tax.gap) notes.push("Amount received inclusive of taxes; the taxable value and taxes above are carved out of it.");
    if (currency !== "INR" && tax.inr?.fxRate) {
      notes.push(`INR equivalent at ${Number(tax.inr.fxRate).toFixed(4)} per ${currency}: taxable ${money(tax.inr.taxableMinor, "INR")}, tax ${money(Number(tax.inr.cgstMinor || 0) + Number(tax.inr.sgstMinor || 0) + Number(tax.inr.igstMinor || 0), "INR")}, total ${money(tax.inr.grossMinor, "INR")}.`);
    }
    if (invoice.providerPaymentId) notes.push(`Payment reference: ${invoice.providerPaymentId}`);
    if (notes.length) {
      ensure(16 * notes.length + 10);
      doc.font("Helvetica").fontSize(7.8).fillColor(BRAND.inkMuted);
      notes.forEach((n) => {
        doc.text(n, left, y, { width });
        y += doc.heightOfString(n, { width }) + 3;
      });
    }

    // ── Signature ────────────────────────────────────────────────────────────
    const [sigW, sigH] = SIGNATURE.boxForWidth(90);
    ensure(sigH + 46);
    y += 14;
    if (SIGNATURE.path) {
      try { doc.image(SIGNATURE.path, right - sigW - 20, y, { width: sigW, height: sigH }); } catch { /* name only */ }
    }
    const sigRuleY = y + sigH + 4;
    rule(right - 200, sigRuleY, 200, { color: BRAND.ink, weight: 0.7 });
    doc.font("Helvetica-Bold").fontSize(8.2).fillColor(BRAND.ink)
      .text(`For ${text(supplier.legalName)}`, right - 200, sigRuleY + 5, { width: 200, align: "right" });
    eyebrow("Authorised Signatory", right - 200, sigRuleY + 17, 200, { align: "right" });

    // ── Footer on every page ─────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const savedBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const footY = doc.page.height - 66;
      rule(left, footY, width);
      doc.font("Helvetica-Bold").fontSize(7).fillColor(BRAND.inkSoft)
        .text(`${text(supplier.legalName)} · GSTIN ${text(supplier.gstin)}`, left, footY + 8, { width: width * 0.7, lineBreak: false });
      doc.font("Helvetica").fontSize(7).fillColor(BRAND.inkMuted)
        .text(`Page ${i - range.start + 1} of ${range.count}`, right - width * 0.25, footY + 8, { width: width * 0.25, align: "right", lineBreak: false });
      // The registered address owns its own line (it is long); the CIN moves to the line below, so
      // neither can wrap into the next — a footer that wraps prints over itself.
      doc.fontSize(6.5).text(text(supplier.address), left, footY + 19, { width, lineBreak: false });
      doc.fontSize(6.5).text(
        `${supplier.cin ? `CIN ${supplier.cin}  ·  ` : ""}Computer-generated ${isCredit ? "credit note" : "tax invoice"}; the authorised signature is affixed electronically.  ·  ${CONTACTS.company}`,
        left, footY + 29, { width, lineBreak: false },
      );
      doc.page.margins.bottom = savedBottom;
    }

    doc.end();
  });
};

export default renderTaxInvoicePdfBuffer;
