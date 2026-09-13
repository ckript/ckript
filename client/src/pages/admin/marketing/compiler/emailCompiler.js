// Ckript email compiler.
//
// Turns the Email Builder's blocks into ONE table-based HTML document that reads as the platform —
// warm paper, ink, a single coral accent, serif display type — rather than the generic SaaS card it
// used to be (cool zinc greys, an 800-weight sans headline, a slate-blue footer, a stock photo).
//
// The rules come from client/src/index.css and pages/landing/landing.css:
//   - coral (#D14D37) is a rule/eyebrow colour, never a button fill — it only reaches 4.35:1
//   - the primary button is ink (#161513), the same as .btn-primary
//   - no drop shadows (--shadow-*: none); a hairline border does the lifting
//   - display type is a serif (Baskervville → Georgia); body is PT Serif → Georgia
//
// Every text field is escaped and every URL is vetted before it lands in the markup. This output is
// mailed verbatim to the whole audience AND rendered in the admin's own browser as the preview, so
// "the admin typed it" is not a reason to trust it.

export const EMAIL_THEME = Object.freeze({
  paper: "#fbfaf7", // page ground — --ck-paper-alt / --surface-overlay
  card: "#ffffff", // --ck-paper
  cream: "#f4efe6", // --ck-cream / --surface-raised
  soft: "#faf7f2", // --ck-soft
  ink: "#0b0a06", // --ck-ink / --text-primary
  bodyInk: "#57544f", // --ck-body-ink / --text-secondary
  muted: "#9a978f", // --ck-muted / --text-tertiary
  italic: "#6f6c66", // --ck-heading-italic
  line: "#e7e5df", // --ck-border / --border-default
  lineSoft: "#f2efe9", // --border-subtle
  accent: "#d14d37", // --ck-red — eyebrow and rule only
  button: "#161513", // .btn-primary
  // Dark scheme, from the app shell's --ck-dark-* tokens. Honoured by Apple Mail; Gmail ignores the
  // media query and inverts on its own, so nothing here may be load-bearing.
  darkGround: "#0f0f0f",
  darkCard: "#1a1a1a",
  darkBand: "#141414",
  darkLine: "#242424",
  darkText: "#d7d7d7",
  darkDim: "#9a9590",
});

/** Every colour the compiler is allowed to emit. Tests hold the output to this list. */
export const EMAIL_PALETTE = Object.freeze([...new Set(Object.values(EMAIL_THEME))]);

export const SITE_URL = "https://ckript.com";
/** The landscape wordmark, served from the site's own public folder. */
export const BRAND_LOGO_URL = "https://ckript.com/ckript-logo-landscape-nobg.png";

/**
 * The footer's two personal links. The unsubscribe URL is signed per recipient and only exists at
 * send time, so the compiled document carries these slots and server/utils/emailService.js fills
 * them for each recipient. The literals must match the server's — emailBuilderPreview.test.jsx
 * pins that across the package boundary.
 */
export const UNSUBSCRIBE_SLOT = "{{UNSUBSCRIBE_URL}}";
export const PREFERENCES_SLOT = "{{PREFERENCES_URL}}";
export const SUBSCRIPTION_NOTICE = "You are receiving this because you subscribed to our updates.";
export const TAGLINE = "A minimal platform for storytellers.";

const T = EMAIL_THEME;
const SERIF = "'Baskervville', 'Spectral', Georgia, 'Times New Roman', serif";
const BODY = "'PT Serif', Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Baskervville:ital@0;1&family=PT+Serif:ital,wght@0,400;0,700;1,400&display=swap";

export const escapeHTML = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

/** http(s) and mailto only. Anything else — javascript:, data:, a bare word — becomes the fallback. */
export const safeUrl = (value, fallback = SITE_URL) => {
  const url = String(value || "").trim();
  return /^(https?:\/\/|mailto:)/i.test(url) ? escapeHTML(url) : fallback;
};

const ALIGN = ["left", "center", "right"];
const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

/**
 * The inbox preview line. The subject is already visible beside it, so repeating the subject wastes
 * the one line of copy the recipient reads before deciding to open: prefer the subtitle, then the
 * first line of the body, then whatever the caller passed.
 */
const derivePreheader = (blocks, fallback) => {
  const heading = blocks.find((b) => b.type === "Heading");
  const text = blocks.find((b) => b.type === "Text");
  const candidate =
    String(heading?.subtitle || "").trim() ||
    String(text?.content || "").trim().split(/\n/)[0].trim() ||
    String(fallback || "").trim() ||
    TAGLINE;
  return candidate.length > 140 ? `${candidate.slice(0, 137).trimEnd()}…` : candidate;
};

// ─── Shell ───────────────────────────────────────────────────────────────────

const wrapInEmailShell = (contentHTML, preheaderText) => `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Ckript</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <style>table, td { font-family: Georgia, 'Times New Roman', serif !important; }</style>
  <![endif]-->
  <!--[if !mso]><!-->
  <link href="${FONT_LINK}" rel="stylesheet" type="text/css">
  <!--<![endif]-->
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body { margin: 0; padding: 0; width: 100%; background-color: ${T.paper}; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table { border-collapse: collapse; border-spacing: 0; mso-table-lspace: 0; mso-table-rspace: 0; }
    img { border: 0; line-height: 100%; outline: none; text-decoration: none; display: block; -ms-interpolation-mode: bicubic; }
    a { color: ${T.bodyInk}; }
    .wrapper { width: 100%; table-layout: fixed; background-color: ${T.paper}; }
    .card { width: 100%; max-width: 640px; margin: 0 auto; background-color: ${T.card}; border: 1px solid ${T.line}; border-radius: 16px; }
    @media (prefers-color-scheme: dark) {
      body, .wrapper { background-color: ${T.darkGround} !important; }
      .card { background-color: ${T.darkCard} !important; border-color: ${T.darkLine} !important; }
      .masthead { background-color: ${T.cream} !important; border-color: ${T.darkLine} !important; }
      h1, h3, p, td, a { color: ${T.darkText} !important; }
      .muted-text { color: ${T.darkDim} !important; }
      .eyebrow { color: ${T.accent} !important; }
      .band, .feature { background-color: ${T.darkBand} !important; border-color: ${T.darkLine} !important; }
      .border-divider { border-color: ${T.darkLine} !important; }
      .cta { background-color: ${T.cream} !important; color: ${T.ink} !important; }
    }
    @media screen and (max-width: 640px) {
      .outer-pad { padding: 0 !important; }
      .card { border-radius: 0 !important; border-left: 0 !important; border-right: 0 !important; }
      .masthead, .band { border-radius: 0 !important; }
      .px-mobile { padding-left: 24px !important; padding-right: 24px !important; }
      .stack-column { display: block !important; width: 100% !important; padding: 0 0 12px 0 !important; }
      h1 { font-size: 27px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${T.paper};">
  <!-- Preheader: the inbox preview line. Hidden in the body, shown beside the subject. -->
  <div style="display:none;font-size:1px;color:${T.paper};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    ${escapeHTML(preheaderText)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>
  <div class="wrapper" style="background-color:${T.paper};">
    <table role="presentation" class="wrapper" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:${T.paper};">
      <tr>
        <td class="outer-pad" align="center" style="padding:44px 12px 52px;">
          <!--[if mso]><table role="presentation" align="center" style="width:640px;"><tr><td><![endif]-->
          <table role="presentation" class="card" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background-color:${T.card};border:1px solid ${T.line};border-radius:16px;">
            ${contentHTML}
          </table>
          <!--[if mso]></td></tr></table><![endif]-->
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
`;

// ─── Blocks ──────────────────────────────────────────────────────────────────
// Each takes one block and returns table rows for the card.

const compileTopBar = (block = {}) => {
  const logo = block.logoUrl ? safeUrl(block.logoUrl, BRAND_LOGO_URL) : BRAND_LOGO_URL;
  // The landscape file has a wide transparent margin; at 280px the mark itself is about 120px.
  return `
<tr>
  <td class="px-mobile masthead" align="center" style="padding:32px 48px 26px;border-bottom:1px solid ${T.lineSoft};border-radius:16px 16px 0 0;">
    <a href="${SITE_URL}" style="text-decoration:none;display:inline-block;">
      <img src="${logo}" alt="Ckript" width="280" style="display:block;width:280px;max-width:70%;height:auto;margin:0 auto;border:0;" />
    </a>
  </td>
</tr>
`;
};

const compileHeroImage = (block = {}) => {
  const src = safeUrl(block.imageUrl, "");
  if (!src) return "";
  const href = safeUrl(block.linkUrl);
  return `
<tr>
  <td align="center" style="padding:0;">
    <a href="${href}" target="_blank" style="text-decoration:none;display:block;">
      <img src="${src}" alt="${escapeHTML(block.alt || "")}" width="638" style="width:100%;max-width:638px;height:auto;display:block;border:0;" />
    </a>
  </td>
</tr>
`;
};

const compileHeading = (block = {}) => {
  const align = pick(block.align, ALIGN, "center");
  const eyebrow = String(block.eyebrow || "").trim();
  const subtitle = String(block.subtitle || "").trim();
  return `
<tr>
  <td class="px-mobile" align="${align}" style="padding:40px 48px 6px;text-align:${align};">
    ${eyebrow ? `<p class="eyebrow" style="margin:0 0 16px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase;color:${T.accent};">${escapeHTML(eyebrow)}</p>` : ""}
    <h1 style="margin:0;font-family:${SERIF};font-size:32px;font-weight:400;line-height:1.2;letter-spacing:-0.3px;color:${T.ink};">${escapeHTML(block.text || "")}</h1>
    ${subtitle ? `<p class="muted-text" style="margin:14px 0 0;font-family:${SERIF};font-style:italic;font-size:19px;line-height:1.5;color:${T.italic};">${escapeHTML(subtitle)}</p>` : ""}
  </td>
</tr>
`;
};

const compileText = (block = {}) => {
  const align = pick(block.align, ALIGN, "left");
  const paragraphs = escapeHTML(block.content || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 18px;">${p.replace(/\n/g, "<br />").replace(/ {2}/g, " &nbsp;")}</p>`)
    .join("");
  if (!paragraphs) return "";
  return `
<tr>
  <td class="px-mobile" align="${align}" style="padding:22px 48px 6px;text-align:${align};font-family:${BODY};font-size:16px;line-height:1.75;color:${T.bodyInk};">
    ${paragraphs}
  </td>
</tr>
`;
};

const compileCTA = (block = {}) => {
  const text = String(block.text || "").trim();
  if (!text) return "";
  const align = pick(block.align, ALIGN, "center");
  const href = safeUrl(block.url);
  return `
<tr>
  <td class="px-mobile" align="${align}" style="padding:24px 48px 44px;text-align:${align};">
    <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:50px;v-text-anchor:middle;width:240px;" arcsize="20%" stroke="f" fillcolor="${T.button}"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;"><![endif]-->
    <a class="cta" href="${href}" style="display:inline-block;background-color:${T.button};color:#ffffff;font-family:${SANS};font-size:15px;font-weight:600;letter-spacing:0.2px;line-height:50px;padding:0 36px;border-radius:10px;text-decoration:none;mso-hide:all;">${escapeHTML(text)}</a>
    <!--[if mso]></center></v:roundrect><![endif]-->
  </td>
</tr>
`;
};

const compileDivider = () => `
<tr>
  <td class="px-mobile" style="padding:8px 48px;">
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
      <tr><td class="border-divider" style="border-top:1px solid ${T.line};font-size:1px;line-height:1px;">&nbsp;</td></tr>
    </table>
  </td>
</tr>
`;

const compileFeatureCardRow = (block = {}) => {
  const cards = Array.isArray(block.cards) ? block.cards.filter(Boolean).slice(0, 3) : [];
  if (cards.length === 0) return "";
  const width = Math.floor(100 / cards.length);
  const cells = cards
    .map((card) => {
      const icon = safeUrl(card.iconUrl, "");
      return `
      <td class="stack-column" valign="top" width="${width}%" style="padding:0 6px;">
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" class="feature" style="background-color:${T.soft};border:1px solid ${T.line};border-radius:12px;">
          <tr>
            <td style="padding:20px 20px 22px;text-align:left;">
              ${icon ? `<img src="${icon}" alt="" width="28" style="width:28px;height:auto;margin:0 0 14px;" />` : ""}
              <h3 style="margin:0 0 8px;font-family:${SERIF};font-size:17px;font-weight:400;line-height:1.3;color:${T.ink};">${escapeHTML(card.title || "Feature")}</h3>
              <p class="muted-text" style="margin:0;font-family:${BODY};font-size:14px;line-height:1.6;color:${T.bodyInk};">${escapeHTML(card.description || "")}</p>
            </td>
          </tr>
        </table>
      </td>`;
    })
    .join("");
  return `
<tr>
  <td class="px-mobile" style="padding:24px 42px 12px;">
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
      <tr>${cells}</tr>
    </table>
  </td>
</tr>
`;
};

/**
 * The ONE footer. It carries the tagline, the site links and — through per-recipient slots — the
 * Unsubscribe and Preferences links, so a broadcast never ends in two stacked footers of different
 * greys the way it did when the server bolted its own strip underneath the document.
 */
const compileFooter = () => `
<tr>
  <td class="px-mobile band" align="center" style="padding:34px 48px 38px;background-color:${T.cream};border-top:1px solid ${T.line};border-radius:0 0 16px 16px;text-align:center;">
    <p class="muted-text" style="margin:0;font-family:${SERIF};font-style:italic;font-size:15px;line-height:1.5;color:${T.italic};">${TAGLINE}</p>
    <p style="margin:20px 0 0;font-family:${SANS};font-size:12px;letter-spacing:0.4px;line-height:1.8;color:${T.bodyInk};">
      <a href="${SITE_URL}" style="color:${T.bodyInk};text-decoration:none;">Website</a> &nbsp;&middot;&nbsp;
      <a href="${SITE_URL}/privacy-policy" style="color:${T.bodyInk};text-decoration:none;">Privacy</a> &nbsp;&middot;&nbsp;
      <a href="${SITE_URL}/terms-of-service" style="color:${T.bodyInk};text-decoration:none;">Terms</a>
    </p>
    <p class="muted-text" style="margin:22px 0 0;font-family:${SANS};font-size:12px;line-height:1.8;color:${T.muted};">
      ${SUBSCRIPTION_NOTICE}<br />
      <a href="${UNSUBSCRIBE_SLOT}" style="color:${T.bodyInk};text-decoration:underline;">Unsubscribe</a> &nbsp;&middot;&nbsp;
      <a href="${PREFERENCES_SLOT}" style="color:${T.bodyInk};text-decoration:underline;">Preferences</a>
    </p>
    <p class="muted-text" style="margin:18px 0 0;font-family:${SANS};font-size:11px;letter-spacing:0.3px;line-height:1.6;color:${T.muted};">
      Ckript Private Limited &nbsp;&middot;&nbsp; &copy; ${new Date().getFullYear()} Ckript. All rights reserved.
    </p>
  </td>
</tr>
`;

const COMPILERS = {
  TopBar: compileTopBar,
  HeroImage: compileHeroImage,
  Heading: compileHeading,
  Text: compileText,
  CTA: compileCTA,
  Divider: compileDivider,
  FeatureCards: compileFeatureCardRow,
  Footer: compileFooter,
};

/**
 * Blocks → full HTML document. The masthead and the footer are guaranteed: a mail with no logo is
 * unbranded and a mail with no footer has no way out, so both are added when the blocks lack them.
 */
export const compileEmailBlocksToHtml = (blocks = [], preheaderText = "") => {
  const list = (Array.isArray(blocks) ? blocks : []).filter(Boolean);
  let contentHTML = "";

  if (!list.some((b) => b.type === "TopBar")) contentHTML += compileTopBar({});
  list.forEach((block) => {
    const compile = COMPILERS[block.type];
    if (compile) contentHTML += compile(block);
    else console.warn("Unknown block type:", block.type);
  });
  if (!list.some((b) => b.type === "Footer")) contentHTML += compileFooter();

  // The server recognises builder output by this marker and fills the footer slots per recipient.
  contentHTML += "\n<!-- EMAIL_BUILDER_V2 -->\n";

  return wrapInEmailShell(contentHTML, derivePreheader(list, preheaderText));
};

/** The same document with the personal slots made inert, for rendering inside the builder. */
export const compileEmailPreviewHtml = (blocks = [], preheaderText = "") =>
  compileEmailBlocksToHtml(blocks, preheaderText).split(UNSUBSCRIBE_SLOT).join("#").split(PREFERENCES_SLOT).join("#");
