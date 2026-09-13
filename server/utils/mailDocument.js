/**
 * The document every transactional mail is set in.
 *
 * Until this existed the platform spoke with two voices in the inbox. The Email Builder's broadcast
 * (client/src/pages/admin/marketing/compiler/emailCompiler.js) reads as the platform — warm paper,
 * ink, one coral accent, serif display type — while every other mail was either a bare <p> fragment
 * with a grey signature stapled underneath (notify.js) or one of twenty hand-rolled documents with a
 * navy gradient header and Arial (emailService.js). A results mail, the one message a writer keeps,
 * was three sentences of unstyled text.
 *
 * This module is the compiler's server-side twin: the same shell, palette and type, with the small
 * set of blocks transactional mail actually needs — a heading, body copy, a button, a facts table, a
 * stats strip, a callout panel, a code, a list, an image — and ONE footer carrying the three contact
 * addresses every outgoing message must show (outgoingMail.test.js pins that contract).
 *
 * Rules, from client/src/index.css and the compiler:
 *   - coral (#d14d37) is an eyebrow and rule colour, never a fill — it only reaches 4.35:1
 *   - the button is ink (#161513), the same as .btn-primary
 *   - no drop shadows; a hairline border does the lifting
 *   - display type is Baskervville → Georgia; body is PT Serif → Georgia
 *
 * Every block escapes what it is given unless its name says otherwise (`fragment`, and `{ html }`
 * items): the values are display names, script titles and admin notes, all typed by somebody. The
 * palette is pinned to the compiler's by emailBuilderPreview.test.jsx across the package boundary.
 */
import { CONTACTS } from "./companyContacts.js";
import { escapeHtml } from "./escapeHtml.js";

export const MAIL_THEME = Object.freeze({
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

/** Every colour this module is allowed to emit. Tests hold the output to this list. */
export const MAIL_PALETTE = Object.freeze([...new Set(Object.values(MAIL_THEME))]);

export const SITE_URL = "https://ckript.com";
/** The landscape wordmark, served from the site's own public folder. */
export const BRAND_LOGO_URL = `${SITE_URL}/ckript-logo-landscape-nobg.png`;
export const TAGLINE = "A minimal platform for storytellers.";
export const AUTOMATED_NOTICE = "This is an automated message, please do not reply.";
/**
 * Stamped into every document this module renders, so notify.js can tell a finished document from
 * a fragment it still has to dress, and from a foreign document it must leave alone.
 */
export const MAIL_DOCUMENT_MARKER = "<!-- CKRIPT_MAIL_DOCUMENT -->";

const T = MAIL_THEME;
const SERIF = "'Baskervville', 'Spectral', Georgia, 'Times New Roman', serif";
const BODY = "'PT Serif', Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Baskervville:ital@0;1&family=PT+Serif:ital,wght@0,400;0,700;1,400&display=swap";

const BODY_TYPE = `font-family:${BODY};font-size:16px;line-height:1.75;color:${T.bodyInk};`;
const LABEL_TYPE = `font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;`;

const ALIGN = ["left", "center", "right"];
const pickAlign = (value, fallback = "left") => (ALIGN.includes(value) ? value : fallback);
const clean = (value) => String(value ?? "").trim();
const e = escapeHtml;

/** http(s) and mailto only. Anything else — javascript:, data:, a bare word — becomes the fallback. */
export const safeUrl = (value, fallback = SITE_URL) => {
  const url = clean(value);
  return /^(https?:\/\/|mailto:)/i.test(url) ? e(url) : fallback;
};

/** A full HTML document, ours or anyone's — as opposed to a fragment that still needs dressing. */
export const isMailDocument = (html) => /<!doctype\s+html|<html[\s>]/i.test(String(html || ""));
/** One of ours: already carries the masthead, the footer and the contact addresses. */
export const isThemedMailDocument = (html) => String(html || "").includes(MAIL_DOCUMENT_MARKER);

// ─── Text helpers ────────────────────────────────────────────────────────────

/** Escaped text → <p>s: a blank line separates paragraphs, a single newline breaks a line. */
const toParagraphs = (value) => {
  const parts = e(value)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts
    .map((p, i) => `<p style="margin:0 0 ${i === parts.length - 1 ? 0 : 18}px;">${p.replace(/\n/g, "<br />")}</p>`)
    .join("");
};

/** `"text"` is escaped; `{ html }` is trusted — the caller has already escaped what went into it. */
const content = (value) => (value && typeof value === "object" && "html" in value ? String(value.html || "") : e(value));

// ─── Blocks ──────────────────────────────────────────────────────────────────
// Each returns table rows for the card, in the compiler's markup.

export const masthead = () => `
<tr>
  <td class="px-mobile masthead" align="center" style="padding:32px 48px 26px;border-bottom:1px solid ${T.lineSoft};border-radius:16px 16px 0 0;">
    <a href="${SITE_URL}" style="text-decoration:none;display:inline-block;">
      <img src="${BRAND_LOGO_URL}" alt="Ckript" width="280" style="display:block;width:280px;max-width:70%;height:auto;margin:0 auto;border:0;" />
    </a>
  </td>
</tr>
`;

/** Eyebrow in coral caps, a serif headline, an italic subtitle. */
export const heading = ({ eyebrow = "", title = "", subtitle = "", align = "left" } = {}) => {
  const a = pickAlign(align);
  const eye = clean(eyebrow);
  const sub = clean(subtitle);
  return `
<tr>
  <td class="px-mobile" align="${a}" style="padding:40px 48px 6px;text-align:${a};">
    ${eye ? `<p class="eyebrow" style="margin:0 0 16px;${LABEL_TYPE}letter-spacing:2.2px;color:${T.accent};">${e(eye)}</p>` : ""}
    <h1 style="margin:0;font-family:${SERIF};font-size:32px;font-weight:400;line-height:1.2;letter-spacing:-0.3px;color:${T.ink};">${e(clean(title))}</h1>
    ${sub ? `<p class="muted-text" style="margin:14px 0 0;font-family:${SERIF};font-style:italic;font-size:19px;line-height:1.5;color:${T.italic};">${e(sub)}</p>` : ""}
  </td>
</tr>
`;
};

/** Body copy from plain text. Escaped; a blank line starts a new paragraph. */
export const paragraphs = (text, { align = "left" } = {}) => {
  const html = toParagraphs(text);
  if (!html) return "";
  const a = pickAlign(align);
  return `
<tr>
  <td class="px-mobile body" align="${a}" style="padding:22px 48px 6px;text-align:${a};${BODY_TYPE}">
    ${html}
  </td>
</tr>
`;
};

/**
 * Body copy from an HTML fragment the caller built — <p>, <strong>, <a> and the like. TRUSTED:
 * whatever was interpolated into it must already be escaped. This is what dresses the legacy
 * fragment senders, so their markup has to work here unchanged.
 */
export const fragment = (html, { align = "left" } = {}) => {
  const body = clean(html);
  if (!body) return "";
  const a = pickAlign(align);
  return `
<tr>
  <td class="px-mobile body" align="${a}" style="padding:22px 48px 6px;text-align:${a};${BODY_TYPE}">
    ${body}
  </td>
</tr>
`;
};

/** The one button: ink, never coral. */
export const button = ({ text, url, align = "left" } = {}) => {
  const label = clean(text);
  if (!label) return "";
  const a = pickAlign(align);
  const href = safeUrl(url);
  return `
<tr>
  <td class="px-mobile" align="${a}" style="padding:26px 48px 10px;text-align:${a};">
    <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:50px;v-text-anchor:middle;width:240px;" arcsize="20%" stroke="f" fillcolor="${T.button}"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;"><![endif]-->
    <a class="cta" href="${href}" style="display:inline-block;background-color:${T.button};color:#ffffff;font-family:${SANS};font-size:15px;font-weight:600;letter-spacing:0.2px;line-height:50px;padding:0 36px;border-radius:10px;text-decoration:none;mso-hide:all;">${e(label)}</a>
    <!--[if mso]></center></v:roundrect><![endif]-->
  </td>
</tr>
`;
};

export const divider = () => `
<tr>
  <td class="px-mobile" style="padding:18px 48px;">
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
      <tr><td class="border-divider" style="border-top:1px solid ${T.line};font-size:1px;line-height:1px;">&nbsp;</td></tr>
    </table>
  </td>
</tr>
`;

/**
 * Label / value rows in a soft panel: a script and its writer, a date and a time, an entry ID.
 * Rows are `[label, value]`, `[label, value, href]` or `{ label, value, href }`; a row with no value
 * is dropped, so callers can list every field they have and let the data decide.
 */
export const facts = (rows = []) => {
  const list = (Array.isArray(rows) ? rows : [])
    .map((r) => (Array.isArray(r) ? { label: r[0], value: r[1], href: r[2] } : r || {}))
    .map((r) => ({ label: clean(r.label), value: clean(r.value), href: clean(r.href) }))
    .filter((r) => r.label && r.value);
  if (!list.length) return "";
  const cells = list
    .map((r, i) => {
      const border = i === list.length - 1 ? "" : `border-bottom:1px solid ${T.lineSoft};`;
      const value = r.href
        ? `<a href="${safeUrl(r.href)}" style="color:${T.ink};text-decoration:underline;word-break:break-all;">${e(r.value)}</a>`
        : e(r.value);
      return `
          <tr>
            <td valign="top" width="34%" style="padding:11px 16px 11px 0;${border}${LABEL_TYPE}letter-spacing:1.6px;line-height:1.6;color:${T.muted};">${e(r.label)}</td>
            <td valign="top" style="padding:10px 0;${border}font-family:${BODY};font-size:15px;line-height:1.6;color:${T.ink};">${value}</td>
          </tr>`;
    })
    .join("");
  return `
<tr>
  <td class="px-mobile" style="padding:22px 48px 6px;">
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" class="feature" style="background-color:${T.soft};border:1px solid ${T.line};border-radius:12px;">
      <tr>
        <td style="padding:8px 24px;">
          <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">${cells}
          </table>
        </td>
      </tr>
    </table>
  </td>
</tr>
`;
};

/** A strip of large serif numbers with small-caps labels: pages, words, scenes. */
export const stats = (cells = []) => {
  const list = (Array.isArray(cells) ? cells : [])
    .map((c) => (Array.isArray(c) ? { label: c[0], value: c[1] } : c || {}))
    .filter((c) => clean(c.label) && clean(c.value) && clean(c.value) !== "0");
  if (!list.length) return "";
  const width = Math.floor(100 / list.length);
  const tds = list
    .map((c) => `
        <td align="center" width="${width}%" style="padding:18px 8px 16px;">
          <p style="margin:0;font-family:${SERIF};font-size:30px;line-height:1.1;color:${T.ink};">${e(clean(c.value))}</p>
          <p class="muted-text" style="margin:8px 0 0;${LABEL_TYPE}color:${T.muted};">${e(clean(c.label))}</p>
        </td>`)
    .join("");
  return `
<tr>
  <td class="px-mobile" style="padding:26px 48px 4px;">
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
      <tr><td class="border-divider" style="border-top:1px solid ${T.line};font-size:1px;line-height:1px;">&nbsp;</td></tr>
      <tr><td style="padding:0;">
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr>${tds}
        </tr></table>
      </td></tr>
      <tr><td class="border-divider" style="border-top:1px solid ${T.line};font-size:1px;line-height:1px;">&nbsp;</td></tr>
    </table>
  </td>
</tr>
`;
};

/** A callout on the cream band with a coral rule down its left: a note, a reason, a warning. */
export const panel = ({ eyebrow = "", text = "", html = "" } = {}) => {
  const body = html ? clean(html) : toParagraphs(text);
  if (!body) return "";
  const eye = clean(eyebrow);
  return `
<tr>
  <td class="px-mobile" style="padding:22px 48px 6px;">
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" class="band" style="background-color:${T.cream};border-radius:12px;">
      <tr>
        <td style="padding:20px 26px 20px 24px;border-left:3px solid ${T.accent};border-radius:12px;font-family:${BODY};font-size:15px;line-height:1.7;color:${T.ink};">
          ${eye ? `<p class="eyebrow" style="margin:0 0 8px;${LABEL_TYPE}letter-spacing:1.8px;color:${T.accent};">${e(eye)}</p>` : ""}
          ${body}
        </td>
      </tr>
    </table>
  </td>
</tr>
`;
};

/** A one-time code, large and tracked, on the cream band. */
export const code = (value, caption = "Your code") => {
  const digits = clean(value);
  if (!digits) return "";
  return `
<tr>
  <td class="px-mobile" align="center" style="padding:26px 48px 8px;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" class="band" style="background-color:${T.cream};border:1px solid ${T.line};border-radius:14px;">
      <tr>
        <td align="center" style="padding:24px 44px 22px;">
          <p class="muted-text" style="margin:0 0 10px;${LABEL_TYPE}color:${T.muted};">${e(clean(caption))}</p>
          <p style="margin:0;padding-left:10px;font-family:${SERIF};font-size:40px;line-height:1.1;letter-spacing:10px;color:${T.ink};">${e(digits)}</p>
        </td>
      </tr>
    </table>
  </td>
</tr>
`;
};

/** A bulleted list with coral bullets. Items are escaped strings, or `{ html }` when trusted. */
export const list = (items = []) => {
  const rows = (Array.isArray(items) ? items : [])
    .map((item) => content(item))
    .filter((html) => html.trim())
    .map((html) => `
      <tr>
        <td valign="top" width="22" style="padding:5px 0;font-family:${SERIF};font-size:18px;line-height:1.5;color:${T.accent};">&bull;</td>
        <td valign="top" style="padding:5px 0;font-family:${BODY};font-size:16px;line-height:1.6;color:${T.bodyInk};">${html}</td>
      </tr>`)
    .join("");
  if (!rows) return "";
  return `
<tr>
  <td class="px-mobile" style="padding:14px 48px 6px;">
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">${rows}
    </table>
  </td>
</tr>
`;
};

/** An image on its own — a badge, a seal. http(s) only; anything else renders nothing. */
export const image = ({ src, alt = "", width = 120, align = "center" } = {}) => {
  const url = safeUrl(src, "");
  if (!url) return "";
  const w = Math.max(24, Math.min(600, Number(width) || 120));
  const a = pickAlign(align, "center");
  return `
<tr>
  <td class="px-mobile" align="${a}" style="padding:26px 48px 0;text-align:${a};">
    <img src="${url}" alt="${e(clean(alt))}" width="${w}" style="display:inline-block;width:${w}px;max-width:100%;height:auto;border:0;" />
  </td>
</tr>
`;
};

/** Small muted copy: a caveat, a timestamp, a "need help?" line. Escaped, or `{ html }`. */
export const fineprint = (value, { align = "left" } = {}) => {
  const html = content(value).trim();
  if (!html) return "";
  const a = pickAlign(align);
  return `
<tr>
  <td class="px-mobile" align="${a}" style="padding:16px 48px 4px;text-align:${a};font-family:${SANS};font-size:13px;line-height:1.7;color:${T.muted};">
    <p class="muted-text" style="margin:0;">${html}</p>
  </td>
</tr>
`;
};

/** The line under a button that carries the URL in the open, for clients that swallow buttons. */
export const linkFallback = (url) => {
  const href = safeUrl(url, "");
  if (!href) return "";
  return fineprint({ html: `If the button doesn't work, copy and paste this link into your browser:<br /><a href="${href}" style="color:${T.bodyInk};text-decoration:underline;word-break:break-all;">${href}</a>` });
};

/** A row of secondary text links: "See the results &middot; Hall of Fame". */
export const links = (items = [], { align = "left" } = {}) => {
  const list = (Array.isArray(items) ? items : [])
    .map((item) => ({ text: clean(item?.text), url: safeUrl(item?.url, "") }))
    .filter((item) => item.text && item.url);
  if (!list.length) return "";
  const a = pickAlign(align);
  return `
<tr>
  <td class="px-mobile" align="${a}" style="padding:14px 48px 4px;text-align:${a};font-family:${SANS};font-size:13px;letter-spacing:0.3px;line-height:1.9;color:${T.bodyInk};">
    ${list.map((item) => `<a href="${item.url}" style="color:${T.ink};text-decoration:underline;">${e(item.text)}</a>`).join(" &nbsp;&middot;&nbsp; ")}
  </td>
</tr>
`;
};

export const spacer = (height = 34) => `
<tr>
  <td style="padding:0 0 ${Math.max(0, Number(height) || 0)}px;font-size:1px;line-height:1px;">&nbsp;</td>
</tr>
`;

/**
 * The ONE footer: tagline, site links, the three contact addresses, an optional notice, the legal
 * line. The addresses are here rather than stapled on by each sender so no mail can leave without
 * them, which is the contract outgoingMail.test.js enforces.
 */
export const footer = ({ notice = "" } = {}) => {
  const site = CONTACTS.website;
  const note = clean(notice);
  return `
<tr>
  <td class="px-mobile band" align="center" style="padding:34px 48px 38px;background-color:${T.cream};border-top:1px solid ${T.line};border-radius:0 0 16px 16px;text-align:center;">
    <p class="muted-text" style="margin:0;font-family:${SERIF};font-style:italic;font-size:15px;line-height:1.5;color:${T.italic};">${TAGLINE}</p>
    <p style="margin:20px 0 0;font-family:${SANS};font-size:12px;letter-spacing:0.4px;line-height:1.8;color:${T.bodyInk};">
      <a href="${safeUrl(site)}" style="color:${T.bodyInk};text-decoration:none;">Website</a> &nbsp;&middot;&nbsp;
      <a href="${safeUrl(`${site}/privacy-policy`)}" style="color:${T.bodyInk};text-decoration:none;">Privacy</a> &nbsp;&middot;&nbsp;
      <a href="${safeUrl(`${site}/terms-of-service`)}" style="color:${T.bodyInk};text-decoration:none;">Terms</a>
    </p>
    <p class="muted-text" style="margin:18px 0 0;font-family:${SANS};font-size:12px;line-height:1.9;color:${T.muted};">
      Email <a href="mailto:${e(CONTACTS.company)}" style="color:${T.bodyInk};text-decoration:none;">${e(CONTACTS.company)}</a> &nbsp;&middot;&nbsp;
      Support <a href="mailto:${e(CONTACTS.support)}" style="color:${T.bodyInk};text-decoration:none;">${e(CONTACTS.support)}</a> &nbsp;&middot;&nbsp;
      Contact <a href="mailto:${e(CONTACTS.contact)}" style="color:${T.bodyInk};text-decoration:none;">${e(CONTACTS.contact)}</a>
    </p>
    ${note ? `<p class="muted-text" style="margin:14px 0 0;font-family:${SANS};font-size:12px;line-height:1.8;color:${T.muted};">${e(note)}</p>` : ""}
    <p class="muted-text" style="margin:18px 0 0;font-family:${SANS};font-size:11px;letter-spacing:0.3px;line-height:1.6;color:${T.muted};">
      Ckript Private Limited &nbsp;&middot;&nbsp; &copy; ${new Date().getFullYear()} Ckript. All rights reserved.
    </p>
  </td>
</tr>
`;
};

// ─── Shell ───────────────────────────────────────────────────────────────────

const shell = (rows, { title, preheader }) => `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${e(clean(title) || "Ckript")}</title>
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
    img { border: 0; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    a { color: ${T.bodyInk}; }
    .wrapper { width: 100%; table-layout: fixed; background-color: ${T.paper}; }
    .card { width: 100%; max-width: 640px; margin: 0 auto; background-color: ${T.card}; border: 1px solid ${T.line}; border-radius: 16px; }
    .body p { margin: 0 0 18px; }
    .body p:last-child { margin-bottom: 0; }
    .body a { color: ${T.ink}; }
    .body strong { color: ${T.ink}; font-weight: 700; }
    .body ul, .body ol { margin: 0 0 18px; padding-left: 22px; }
    @media (prefers-color-scheme: dark) {
      body, .wrapper { background-color: ${T.darkGround} !important; }
      .card { background-color: ${T.darkCard} !important; border-color: ${T.darkLine} !important; }
      .masthead { background-color: ${T.cream} !important; border-color: ${T.darkLine} !important; }
      h1, h3, p, td, a, li { color: ${T.darkText} !important; }
      .body strong { color: ${T.darkText} !important; }
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
      h1 { font-size: 27px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${T.paper};">
  <!-- Preheader: the inbox preview line. Hidden in the body, shown beside the subject. -->
  <div style="display:none;font-size:1px;color:${T.paper};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    ${e(clean(preheader) || TAGLINE)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>
  <div class="wrapper" style="background-color:${T.paper};">
    <table role="presentation" class="wrapper" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:${T.paper};">
      <tr>
        <td class="outer-pad" align="center" style="padding:44px 12px 52px;">
          <!--[if mso]><table role="presentation" align="center" style="width:640px;"><tr><td><![endif]-->
          <table role="presentation" class="card" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background-color:${T.card};border:1px solid ${T.line};border-radius:16px;">
            ${rows}
          </table>
          <!--[if mso]></td></tr></table><![endif]-->
        </td>
      </tr>
    </table>
  </div>
  ${MAIL_DOCUMENT_MARKER}
</body>
</html>
`;

/**
 * Blocks → the full document. The masthead and the footer are not blocks a caller chooses: a mail
 * without the wordmark is unbranded and a mail without the footer has no contact addresses, so
 * both are always there.
 */
export const renderMailDocument = ({ title = "", preheader = "", blocks = [], notice = "" } = {}) => {
  const rows = [masthead(), ...(Array.isArray(blocks) ? blocks : []).filter(Boolean), spacer(), footer({ notice })].join("");
  return shell(rows, { title, preheader });
};

/**
 * Dress a legacy HTML fragment — the `<p>Hi …</p>` bodies notify.js callers still pass — as a full
 * document, with the sign-off those fragments used to get appended.
 */
export const wrapMailFragment = (html, { title = "", preheader = "", notice = "", signoff = true } = {}) =>
  renderMailDocument({
    title,
    preheader,
    notice,
    blocks: [
      fragment(html),
      signoff ? fragment(`<p>Regards,<br /><strong>Team ${e(CONTACTS.name)}</strong></p>`) : "",
    ],
  });

export default renderMailDocument;
