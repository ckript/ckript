import { Writable } from "stream";
import PDFDocument from "pdfkit";
import { uploadToCloudinary } from "../config/cloudinary.js";
import { CONTACTS, COMPANY } from "./companyContacts.js";
import { LOGO, SIGNATURE, BRAND } from "./brandAssets.js";
import { renderTaxInvoicePdfBuffer } from "./tax/taxInvoicePdf.js";

/**
 * The Ckript invoice.
 *
 * Designed as a document rather than a dashboard: hairline rules instead of rounded cards, one
 * accent instead of a palette, and whitespace doing the work that borders used to. A tax record is
 * something a buyer files, forwards to an accountant and reads years later — it should look like it
 * came from a company, not from a template.
 *
 * The brand does the arranging. The wordmark is a serif, so Times sets the display type and
 * Helvetica sets the data; the red that dots the "i" in the logo is the only colour on the page, and
 * it marks exactly three things — the rule under the masthead, the column heads, and the total.
 * Everything else is ink on paper. (What was here before was built on navy, which appears nowhere in
 * this brand, and a logo that rendered at a third of its box — see brandAssets.js for why.)
 */

/**
 * The document's design iteration. BUMP THIS whenever the layout changes materially.
 *
 * A cached PDF is served from Cloudinary forever once `pdfPath` is set, so a redesign otherwise only
 * reaches invoices issued after it — every existing one keeps its old look, and nobody notices
 * because the code plainly says the new design is in use. The download route compares this against
 * `invoice.pdfDesignVersion` and re-renders once when it is behind.
 *
 * 1 was the original navy-and-rounded-cards layout; 2 is the Ckript document; 3 replaces the
 * typeset founder name with the real authorised signature; 4 corrects the registered office in the
 * footer and adds the CIN. 3 and 4 matter more than a redesign usually would — an invoice already in
 * someone's hands showing a name where the current one shows a signature, or stating an address the
 * company does not use, is exactly what gets a document questioned. 4 is separate from 3 rather than
 * folded into it because 3 shipped first, and anything regenerated in between carries the old
 * address.
 */
export const INVOICE_DESIGN_VERSION = 4;

// Read at RENDER time via COMPANY / CONTACTS, never captured here: dotenv.config() runs in
// server.js's BODY, which is after every import in the graph has already been evaluated, so a
// module-level `process.env.X` is always undefined and the fallback wins permanently. The note about
// this used to sit right above three constants that did exactly that — which is why the footer kept
// printing the Pune address no matter what the environment said.

// The currency is a PARAMETER, not a constant. Competition registration is charged in INR or USD
// depending on what the entrant picked at checkout, and a hardcoded "INR" prefix would have printed
// a $2 entry fee as "INR 2.00" — a document stating the wrong currency is worse than none.
const asCurrency = (value = 0, currency = "INR") =>
  `${String(currency || "INR").toUpperCase()} ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// Long-form date. "15 March 2026" cannot be misread; "3/15/26" and "15/3/26" are the same document
// to two different readers, and an invoice crosses borders.
const asDate = (value) => new Date(value || Date.now()).toLocaleDateString("en-GB", {
  day: "numeric", month: "long", year: "numeric",
});

const toSafeText = (value, fallback = "-") => {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
};

const isWriterPayoutRow = (row = {}) => {
  const item = String(row?.item || "").trim().toLowerCase();
  const type = String(row?.type || "").trim().toLowerCase();
  return item === "writer payout" || type === "settlement";
};

/** The line an invoice is actually about. Reference rows carry no money and must not be mistaken for it. */
const isTotalRow = (row = {}) => String(row?.type || "").trim().toLowerCase() === "total";
const isReferenceRow = (row = {}) => String(row?.type || "").trim().toLowerCase() === "reference";

/**
 * Draw the invoice and return the PDF bytes.
 *
 * Separate from the upload so the document can be rendered and looked at without a Cloudinary
 * account or a network — a layout is not something you can review by reading the code that emits it.
 */
export const renderInvoicePdfBuffer = async ({
  invoice,
  creatorName,
  creatorEmail,
  creatorSid,
  scriptTitle,
  scriptSid,
  details,
  summary,
}) => {
  if (!invoice?._id || !invoice?.invoiceNumber) {
    throw new Error("Invoice details are required to generate PDF");
  }

  const resolvedCreatorSid = creatorSid || invoice.creatorSid || "-";
  const resolvedScriptSid = scriptSid || invoice.scriptSid || "-";
  const resolvedCreatorName = toSafeText(creatorName);
  const resolvedCreatorEmail = toSafeText(creatorEmail, "");
  const resolvedScriptTitle = toSafeText(scriptTitle);
  const resolvedInvoiceId = toSafeText(invoice._id);
  const resolvedCreatorId = toSafeText(invoice.creator?._id || invoice.creator);
  const resolvedScriptId = toSafeText(invoice.script?._id || invoice.script);
  const resolvedPaymentReference = toSafeText(invoice.paymentReference || "", "Pending");
  const issuedAt = asDate(invoice.invoiceDate || invoice.createdAt);
  const invoiceCurrency = invoice.currency || "INR";

  const pdfBuffer = await new Promise((resolve, reject) => {
    const chunks = [];
    // bufferPages: the footer carries "Page 1 of 3", which cannot be written until the last page
    // exists. Buffering lets every page be revisited once the total is known.
    const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
    doc.on("error", reject);
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.pipe(new Writable({ write(_c, _e, cb) { cb(); } }));

    const left = 48;
    const right = doc.page.width - 48;
    const width = right - left;
    // The reserved band at the foot of every page. Content stops here so it can never collide with
    // the footer rule that gets stamped in afterwards.
    const contentBottom = doc.page.height - 78;
    let y = 52;

    // ── Type helpers ────────────────────────────────────────────────────────
    // An uppercase, letterspaced micro-label. Used for every column head and field name, which is
    // what gives the document one voice instead of six font sizes.
    const eyebrow = (text, x, textY, w, { align = "left", color = BRAND.inkMuted } = {}) => {
      doc.font("Helvetica-Bold").fontSize(7).fillColor(color)
        .text(String(text).toUpperCase(), x, textY, { width: w, align, characterSpacing: 1.1 });
      return 11;
    };

    const rule = (x, ruleY, w, { color = BRAND.rule, weight = 0.7 } = {}) => {
      doc.save().moveTo(x, ruleY).lineTo(x + w, ruleY).lineWidth(weight).strokeColor(color).stroke().restore();
    };

    const field = (label, value, x, fieldY, w, align = "left") => {
      let h = eyebrow(label, x, fieldY, w, { align });
      const text = toSafeText(value);
      doc.font("Helvetica").fontSize(9.5).fillColor(BRAND.ink)
        .text(text, x, fieldY + h, { width: w, align });
      return h + doc.heightOfString(text, { width: w, align }) + 2;
    };

    // ── Masthead ────────────────────────────────────────────────────────────
    // Redrawn on every page: a continuation sheet that arrives without the company on it is not
    // recognisably part of the same document.
    const drawMasthead = () => {
      const logoH = 46;
      const [logoW] = LOGO.boxForHeight(logoH);
      const logoPath = LOGO.path;
      let drew = false;

      if (logoPath) {
        try {
          // Width AND height are given, both derived from the asset's real ratio, so the mark fills
          // the space it is allotted rather than being letterboxed inside it.
          doc.image(logoPath, left, y, { width: logoW, height: logoH });
          drew = true;
        } catch { /* fall through to the wordmark */ }
      }
      if (!drew) {
        // The wordmark set in the same serif as the logo, so a missing asset degrades to something
        // still recognisably Ckript rather than to bold Helvetica.
        doc.font("Times-Bold").fontSize(30).fillColor(BRAND.ink)
          .text(COMPANY.name.toLowerCase(), left, y + 8, { characterSpacing: -0.5 });
      }

      // A zero-value record of access granted is not an invoice, and does not call itself one.
      const docTitle = invoice.documentType === "access_confirmation" ? "ACCESS CONFIRMATION" : "INVOICE";
      doc.font("Times-Bold").fontSize(docTitle.length > 10 ? 15 : 27).fillColor(BRAND.ink)
        .text(docTitle, right - 240, y + (docTitle.length > 10 ? 12 : 4), { width: 240, align: "right", characterSpacing: docTitle.length > 10 ? 1.5 : 3 });
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(BRAND.accent)
        .text(toSafeText(invoice.invoiceNumber), right - 240, y + 38, { width: 240, align: "right", characterSpacing: 0.4 });

      // The brand's signature on the page — the one heavy rule, in the logo's own red.
      rule(left, y + logoH + 16, width, { color: BRAND.accent, weight: 2 });
      y += logoH + 28;
    };

    const ensureSpace = (needed) => {
      if (y + needed <= contentBottom) return;
      doc.addPage();
      y = 52;
      drawMasthead();
    };

    drawMasthead();

    // ── Issued / reference strip ────────────────────────────────────────────
    const stripW = width / 3;
    field("Issued", issuedAt, left, y, stripW - 12);
    field("Payment reference", resolvedPaymentReference, left + stripW, y, stripW - 12);
    field("Currency", String(invoiceCurrency).toUpperCase(), left + stripW * 2, y, stripW - 12, "right");
    y += 34;

    // ── Billed to / details ─────────────────────────────────────────────────
    const gap = 28;
    const colW = (width - gap) / 2;

    const billedLines = [resolvedCreatorName, resolvedCreatorEmail, `SID ${resolvedCreatorSid}`].filter(Boolean);
    const detailsTitle = details?.title || "Project";
    const detailLines = details?.lines || [
      resolvedScriptTitle,
      `SID ${resolvedScriptSid}`,
      invoice.accessType === "premium"
        ? `Premium access · ${asCurrency(invoice.scriptPrice || 0, invoiceCurrency)}`
        : "Free access",
    ];

    const drawParty = (title, lines, x) => {
      let partyY = y;
      eyebrow(title, x, partyY, colW);
      partyY += 11;
      rule(x, partyY, colW);
      partyY += 9;
      lines.forEach((line, i) => {
        const text = toSafeText(line);
        // The first line is the name — it is what the reader scans for, so it carries the weight.
        doc.font(i === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(i === 0 ? 11 : 9.5)
          .fillColor(i === 0 ? BRAND.ink : BRAND.inkSoft)
          .text(text, x, partyY, { width: colW });
        partyY += doc.heightOfString(text, { width: colW }) + (i === 0 ? 5 : 3);
      });
      return partyY - y;
    };

    const partyH = Math.max(drawParty("Billed to", billedLines, left), drawParty(detailsTitle, detailLines, left + colW + gap));
    y += partyH + 26;

    // ── Line items ──────────────────────────────────────────────────────────
    const itemW = Math.round(width * 0.55);
    const typeW = Math.round(width * 0.17);
    const amountW = width - itemW - typeW;

    const drawTableHead = () => {
      eyebrow("Description", left, y, itemW, { color: BRAND.accent });
      eyebrow("Type", left + itemW, y, typeW, { color: BRAND.accent });
      eyebrow("Amount", left + itemW + typeW, y, amountW, { align: "right", color: BRAND.accent });
      y += 13;
      rule(left, y, width, { color: BRAND.ink, weight: 0.9 });
      y += 10;
    };

    drawTableHead();

    const allRows = Array.isArray(invoice.rows) ? invoice.rows.filter((r) => !isWriterPayoutRow(r)) : [];
    // The total is pulled out of the table and set as the document's conclusion; leaving it inline as
    // one row among five is what made the old layout read as a list rather than a bill.
    const totalRow = allRows.find(isTotalRow);
    const rows = allRows.filter((r) => !isTotalRow(r) && !isReferenceRow(r));
    const referenceRows = allRows.filter(isReferenceRow);

    if (!rows.length) {
      doc.font("Helvetica-Oblique").fontSize(9.5).fillColor(BRAND.inkMuted)
        .text("No line items recorded.", left, y, { width });
      y += 26;
    }

    rows.forEach((row) => {
      const title = toSafeText(row.item, "Item");
      const detail = toSafeText(row.detail, "");
      const typeText = toSafeText(row.type);
      const amountText = toSafeText(row.amountLabel);

      doc.font("Helvetica-Bold").fontSize(10);
      const titleH = doc.heightOfString(title, { width: itemW - 16 });
      doc.font("Helvetica").fontSize(9);
      const detailH = detail ? doc.heightOfString(detail, { width: itemW - 16 }) + 2 : 0;
      const rowH = Math.max(26, titleH + detailH + 12);

      ensureSpace(rowH + 8);

      doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND.ink)
        .text(title, left, y, { width: itemW - 16 });
      if (detail) {
        doc.font("Helvetica").fontSize(9).fillColor(BRAND.inkMuted)
          .text(detail, left, y + titleH + 2, { width: itemW - 16 });
      }
      doc.font("Helvetica").fontSize(9.5).fillColor(BRAND.inkSoft)
        .text(typeText, left + itemW, y, { width: typeW - 8 });
      doc.font("Helvetica").fontSize(10).fillColor(BRAND.ink)
        .text(amountText, left + itemW + typeW, y, { width: amountW, align: "right" });

      y += rowH;
      rule(left, y - 4, width, { color: BRAND.ruleSoft });
    });

    // ── Total ───────────────────────────────────────────────────────────────
    // Whatever else an invoice says, this is the number it exists to state.
    ensureSpace(86);
    y += 12;

    const totalLabel = totalRow ? toSafeText(totalRow.item, "Total") : (summary?.label || "Net per premium sale");
    const totalValue = totalRow
      ? toSafeText(totalRow.amountLabel)
      : asCurrency(summary ? summary.value || 0 : invoice.writerEarnsPerSale || 0, invoiceCurrency);

    const totalBoxW = 268;
    const totalBoxX = right - totalBoxW;
    const totalBoxH = 54;

    doc.save().rect(totalBoxX, y, totalBoxW, totalBoxH).fill(BRAND.accentSoft).restore();
    rule(totalBoxX, y, totalBoxW, { color: BRAND.accent, weight: 1.6 });

    eyebrow(totalLabel, totalBoxX + 16, y + 13, totalBoxW - 32, { color: BRAND.inkSoft });
    doc.font("Helvetica-Bold").fontSize(17).fillColor(BRAND.accent)
      .text(totalValue, totalBoxX + 16, y + 26, { width: totalBoxW - 32, align: "left" });

    // The secondary figure sits opposite the total, never inside it — one number is the bill and the
    // other is settlement information, and a reader must not have to work out which is which.
    if (totalRow && !summary && Number(invoice.writerEarnsPerSale || 0) > 0) {
      eyebrow("Net per premium sale", left, y + 13, colW, { color: BRAND.inkMuted });
      doc.font("Helvetica").fontSize(11).fillColor(BRAND.inkSoft)
        .text(asCurrency(invoice.writerEarnsPerSale || 0, invoiceCurrency), left, y + 25, { width: colW });
    }

    y += totalBoxH + 26;

    // ── Reference ───────────────────────────────────────────────────────────
    // Gateway references and database ids: needed for a dispute, noise for everyone else. Small,
    // muted, and at the bottom, which is where reference data belongs.
    ensureSpace(80);
    eyebrow("Reference", left, y, width, { color: BRAND.inkMuted });
    y += 11;
    rule(left, y, width);
    y += 8;

    const refs = [
      ["Invoice ID", resolvedInvoiceId],
      ["Buyer ID", resolvedCreatorId],
      ...(details ? [] : [["Content ID", resolvedScriptId]]),
      ...referenceRows.map((r) => [toSafeText(r.item, "Reference"), toSafeText(r.detail, r.amountLabel)]),
    ];

    doc.font("Helvetica").fontSize(8).fillColor(BRAND.inkMuted);
    refs.forEach(([label, value]) => {
      const text = `${label}   ${value}`;
      doc.text(text, left, y, { width });
      y += doc.heightOfString(text, { width }) + 2;
    });

    // ── Authorisation ───────────────────────────────────────────────────────
    //
    // The real signature, not the name set in an italic face pretending to be one. It sits ON the
    // rule the way a signature does on paper — the image is drawn so its baseline lands just above
    // the line, rather than being centred in a box that happens to be near it.
    const SIG_W = 96;
    const [sigW, sigH] = SIGNATURE.boxForWidth(SIG_W);
    const signaturePath = SIGNATURE.path;

    ensureSpace(sigH + 46);
    y += 16;

    const ruleY = y + sigH + 4;
    if (signaturePath) {
      doc.image(signaturePath, left, y, { width: sigW, height: sigH });
    } else {
      // No asset on this deploy: fall back to the name rather than leave the block empty, so an
      // invoice is never issued with an unsigned authorisation area.
      doc.font("Times-Italic").fontSize(21).fillColor(BRAND.ink)
        .text(COMPANY.founder, left, y + sigH - 26);
    }

    rule(left, ruleY, Math.max(172, sigW + 40), { color: BRAND.ink, weight: 0.7 });
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(BRAND.ink)
      .text(COMPANY.founder, left, ruleY + 6, { width: 240, lineBreak: false });
    eyebrow(`Authorized Signatory · ${COMPANY.name}`, left, ruleY + 18, 260);

    // ── Footer on every page ────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);

      // PDFKit appends a page whenever text is drawn below the bottom margin — and a footer, by
      // definition, is drawn below the bottom margin. Left alone it appends one page per line, then
      // those pages get no footer of their own, so every invoice shipped with blank sheets after it.
      // Dropping the margin for the duration of the stamp is what makes the footer a footer.
      const savedBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      const footY = doc.page.height - 70;
      rule(left, footY, width);

      // Three rows, because the registered office is a real address and no longer a city name.
      // It previously shared a 45%-wide box with the company name under `lineBreak: false`, which
      // was fine for "Pune, Maharashtra, India" and would have silently clipped the Delhi address
      // mid-street — the failure mode being a document that looks finished and states an incomplete
      // address. The address now owns a full-width line of its own.
      //
      // lineBreak stays false throughout: a footer that wraps grows downward, off the page edge.
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(BRAND.inkSoft)
        .text(COMPANY.legalName, left, footY + 9, { width: width * 0.45, lineBreak: false });
      doc.font("Helvetica").fontSize(7.5).fillColor(BRAND.inkMuted);
      doc.text(CONTACTS.company, left + width * 0.45, footY + 9, {
        width: width * 0.3, align: "center", lineBreak: false,
      });
      doc.text(`Page ${i - range.start + 1} of ${range.count}`, right - width * 0.25, footY + 9, {
        width: width * 0.25, align: "right", lineBreak: false,
      });

      // CIN alongside the address: Companies Act s.12(3)(c) requires it on every business letter
      // and bill, and an invoice is both.
      doc.font("Helvetica").fontSize(7).fillColor(BRAND.inkMuted)
        .text(`${COMPANY.location}   ·   CIN ${COMPANY.cin}`, left, footY + 21, { width, lineBreak: false });

      // Reworded because the document now carries a real signature: "valid without a physical
      // signature" directly contradicts the mark above it, and a line that argues with the page it
      // is printed on is worse than no line at all.
      doc.text("This is a computer-generated document. The authorised signature above is affixed electronically.",
        left, footY + 32, { width, align: "left", lineBreak: false });

      doc.page.margins.bottom = savedBottom;
    }

    doc.end();
  });

  return pdfBuffer;
};

/** Tax invoices and credit notes have their own (r.46) layout; everything else keeps this one. */
const isTaxDocument = (invoice) => ["tax_invoice", "credit_note"].includes(invoice?.documentType) && Boolean(invoice?.tax);

export const generateAndSaveInvoicePdf = async (args) => {
  const { invoice } = args || {};
  const pdfBuffer = isTaxDocument(invoice)
    ? await renderTaxInvoicePdfBuffer({ invoice })
    : await renderInvoicePdfBuffer(args);
  const safeInvoiceNumber = String(invoice.invoiceNumber).replace(/[^a-zA-Z0-9-_]/g, "_");

  const uploadResult = await uploadToCloudinary(pdfBuffer, {
    folder: "scriptbridge/invoices",
    resource_type: "raw",
    public_id: `invoice-${safeInvoiceNumber}-${invoice._id}`,
    originalFilename: `${safeInvoiceNumber}.pdf`,
    mimeType: "application/pdf",
  });

  return {
    absolutePath: "",
    relativePath: uploadResult.secure_url,
    secureUrl: uploadResult.secure_url,
    publicId: uploadResult.public_id,
  };
};
