import { Writable } from "stream";
import PDFDocument from "pdfkit";
import { BRAND, LOGO, SIGNATURE } from "./brandAssets.js";
import { CONTACTS, COMPANY } from "./companyContacts.js";

// Participation / achievement certificate for a judged competition entry.
//
// Set like the invoice (invoicePdf.js) and the platform's mail: warm paper, ink, one coral accent,
// serif display type. The previous version was Helvetica inside a thick coral border — a frame from
// a template, not a document from this company. Now the wordmark's own serif sets the award and the
// name (Times, PDFKit's standard face, the same fallback the mail declares), Helvetica sets the
// small caps and the data, and coral marks exactly three things: the square that dots the "i" in
// the logo, the rule under the recipient's name, and nothing else.
//
// Deliberately built on PDFKit's standard-14 faces with NO registerFont call — every business
// document in this repo does the same, and it sidesteps the corrupt-font class of failure entirely
// (PDFKit parses registered fonts lazily, so a damaged TTF throws at first use, not at
// registration). Only the screenplay exporter needs real Courier Prime.
//
// Generated per request and returned as a Buffer: a certificate is cheap to render, always
// reproducible from the entry, and this avoids a hard dependency on Cloudinary env vars.

const AWARD_TITLES = {
  winner: "Winner",
  runner_up: "Runner-Up",
  second_runner_up: "Second Runner-Up",
  special: "Special Award",
  participant: "Certificate of Participation",
  none: "Certificate of Participation",
};

const TAGLINE = "A minimal platform for storytellers.";

const safe = (value, fallback = "") => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
};

const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

/**
 * @returns {Promise<Buffer>} a single-page A4 landscape certificate.
 */
export const generateCompetitionCertificate = async ({
  writerName,
  competitionName,
  scriptTitle = "",
  award = "participant",
  specialTitle = "",
  eventId = "",
  declaredAt = null,
  stats = {},
} = {}) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const competition = safe(competitionName, "Global Script Challenge");
    // Landscape: a certificate reads as a wall document, not a letter.
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 0,
      info: { Title: `${competition} — certificate`, Author: COMPANY.legalName },
    });

    doc.on("error", reject);
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    // The null sink is load-bearing: pdfkit is a readable stream and nothing flows without a consumer.
    doc.pipe(new Writable({ write(_chunk, _enc, cb) { cb(); } }));

    const W = doc.page.width;
    const H = doc.page.height;
    const M = 30;

    // Small caps in Helvetica, the way the invoice sets its labels.
    const caps = (text, x, y, width, { size = 8, color = BRAND.inkMuted, spacing = 2.4, align = "center" } = {}) => {
      doc.font("Helvetica-Bold").fontSize(size).fillColor(color)
        .text(String(text).toUpperCase(), x, y, { width, align, characterSpacing: spacing });
    };
    const rule = (x, y, width, { color = BRAND.rule, weight = 0.7 } = {}) => {
      doc.lineWidth(weight).strokeColor(color).moveTo(x, y).lineTo(x + width, y).stroke();
    };

    // ── Paper and frame ───────────────────────────────────────────────────
    // The page is the warm off-white the site sits on; the certificate itself is a white sheet with
    // an ink hairline and a second, fainter one inside it — a frame, not a border.
    doc.rect(0, 0, W, H).fill(BRAND.paperAlt);
    doc.rect(M, M, W - 2 * M, H - 2 * M).fill(BRAND.paper);
    doc.lineWidth(0.8).strokeColor(BRAND.ink).rect(M, M, W - 2 * M, H - 2 * M).stroke();
    doc.lineWidth(0.5).strokeColor(BRAND.rule).rect(M + 7, M + 7, W - 2 * M - 14, H - 2 * M - 14).stroke();

    // ── Masthead ──────────────────────────────────────────────────────────
    let y = 58;
    const logo = LOGO.path;
    let drewLogo = false;
    if (logo) {
      try {
        // Width from the mark's real aspect, so it is centred on its ink rather than on the box a
        // `fit` would have letterboxed it inside.
        const [logoW, logoH] = LOGO.boxForHeight(28);
        doc.image(logo, W / 2 - logoW / 2, y, { width: logoW, height: logoH });
        y += logoH;
        drewLogo = true;
      } catch {
        // A missing or unreadable image must never take the certificate down.
      }
    }
    if (!drewLogo) {
      doc.font("Times-Bold").fontSize(22).fillColor(BRAND.ink)
        .text(COMPANY.name, 0, y, { width: W, align: "center", characterSpacing: 1 });
      y += 28;
    }

    y += 20;
    caps(competition, 60, y, W - 120, { size: 8.5, spacing: 3 });
    y += 19;
    // The coral square that dots the "i" in the wordmark, as the one ornament on the page.
    doc.rect(W / 2 - 3, y, 6, 6).fill(BRAND.accent);
    y += 24;

    // ── Footer geometry, needed now to centre the middle block ────────────
    const blockW = 180;
    const leftX = 90;
    const rightX = W - 90 - blockW;
    const ruleY = H - 82;
    const [sigW, sigH] = SIGNATURE.boxForWidth(84);

    // ── Award ─────────────────────────────────────────────────────────────
    const title = award === "special" && safe(specialTitle)
      ? safe(specialTitle)
      : (AWARD_TITLES[award] || AWARD_TITLES.participant);
    const titleSize = title.length > 22 ? 34 : 42;
    const name = safe(writerName, "Writer");
    const completed = safe(scriptTitle)
      ? `completed and submitted the screenplay “${safe(scriptTitle)}” during the 48-hour writing window of ${competition}.`
      : `took part in the 48-hour writing window of ${competition}.`;
    const cells = [
      ["Pages", stats.pageCount],
      ["Words", stats.wordCount],
      ["Scenes", stats.sceneCount],
    ].filter(([, v]) => Number(v) > 0);

    // Measure the whole middle block first, then centre it between the masthead and the footer:
    // a participation certificate has no stats strip and would otherwise leave its bottom third
    // empty.
    doc.font("Times-Roman").fontSize(titleSize);
    const titleH = doc.heightOfString(title, { width: W - 120 });
    doc.font("Times-Bold").fontSize(31);
    const nameH = doc.heightOfString(name, { width: W - 120 });
    doc.font("Times-Roman").fontSize(12.5);
    const bodyH = doc.heightOfString(completed, { width: W - 280, lineGap: 4 });
    const middleH = titleH + 12 + 28 + nameH + 8 + 20 + bodyH + (cells.length ? 20 + 56 : 0);
    const middleBottom = ruleY - sigH - 18;
    y += Math.max(0, Math.round((middleBottom - y - middleH) / 2));

    doc.font("Times-Roman").fontSize(titleSize).fillColor(BRAND.ink)
      .text(title, 60, y, { width: W - 120, align: "center" });
    y += titleH + 12;

    doc.font("Times-Italic").fontSize(13).fillColor(BRAND.inkSoft)
      .text("This is to certify that", 0, y, { width: W, align: "center" });
    y += 28;

    // ── Recipient ─────────────────────────────────────────────────────────
    doc.font("Times-Bold").fontSize(31).fillColor(BRAND.ink)
      .text(name, 60, y, { width: W - 120, align: "center" });
    y += nameH + 8;

    rule(W / 2 - 70, y, 140, { color: BRAND.accent, weight: 1.2 });
    y += 20;

    // ── Body ──────────────────────────────────────────────────────────────
    doc.font("Times-Roman").fontSize(12.5).fillColor(BRAND.inkSoft)
      .text(completed, 140, y, { width: W - 280, align: "center", lineGap: 4 });
    y += bodyH + 20;

    // ── Stats strip ───────────────────────────────────────────────────────
    if (cells.length) {
      const cellW = 118;
      const stripW = cells.length * cellW;
      const startX = W / 2 - stripW / 2;
      rule(startX, y, stripW, { color: BRAND.ruleSoft });
      y += 12;
      cells.forEach(([label, value], i) => {
        const x = startX + i * cellW;
        doc.font("Times-Roman").fontSize(21).fillColor(BRAND.ink)
          .text(Number(value).toLocaleString("en-US"), x, y, { width: cellW, align: "center" });
        caps(label, x, y + 25, cellW, { size: 7, spacing: 1.8 });
        if (i > 0) {
          doc.lineWidth(0.5).strokeColor(BRAND.ruleSoft).moveTo(x, y + 2).lineTo(x, y + 32).stroke();
        }
      });
      y += 42;
      rule(startX, y, stripW, { color: BRAND.ruleSoft });
    }

    // ── Footer: signature left, date right, the tagline between ──────────
    const signaturePath = SIGNATURE.path;
    if (signaturePath) {
      try {
        doc.image(signaturePath, leftX + (blockW - sigW) / 2, ruleY - sigH - 3, { width: sigW, height: sigH });
      } catch {
        doc.font("Times-Italic").fontSize(18).fillColor(BRAND.ink)
          .text(COMPANY.founder, leftX, ruleY - 26, { width: blockW, align: "center" });
      }
    } else {
      // No asset on this deploy: the name in italic rather than an empty signature area.
      doc.font("Times-Italic").fontSize(18).fillColor(BRAND.ink)
        .text(COMPANY.founder, leftX, ruleY - 26, { width: blockW, align: "center" });
    }
    rule(leftX, ruleY, blockW, { color: BRAND.ink, weight: 0.7 });
    doc.font("Times-Bold").fontSize(10).fillColor(BRAND.ink)
      .text(COMPANY.founder, leftX, ruleY + 7, { width: blockW, align: "center" });
    caps(`Founder, ${COMPANY.name}`, leftX, ruleY + 21, blockW, { size: 6.5, spacing: 1.6 });

    doc.font("Times-Roman").fontSize(13).fillColor(BRAND.ink)
      .text(formatDate(declaredAt) || formatDate(new Date()), rightX, ruleY - 20, { width: blockW, align: "center" });
    rule(rightX, ruleY, blockW, { color: BRAND.ink, weight: 0.7 });
    caps("Date of issue", rightX, ruleY + 8, blockW, { size: 6.5, spacing: 1.6 });

    doc.font("Times-Italic").fontSize(9.5).fillColor(BRAND.inkMuted)
      .text(TAGLINE, leftX + blockW, ruleY - 8, { width: rightX - leftX - blockW, align: "center" });

    // The event ID is what makes the certificate checkable against a real entry.
    const verify = eventId
      ? `Event ID ${safe(eventId)}   ·   Verify at ${CONTACTS.company}`
      : `Verify at ${CONTACTS.company}`;
    doc.font("Helvetica").fontSize(7).fillColor(BRAND.inkMuted)
      .text(verify, 0, H - 48, { width: W, align: "center", characterSpacing: 0.6 });

    doc.end();
  });
};

export default generateCompetitionCertificate;
