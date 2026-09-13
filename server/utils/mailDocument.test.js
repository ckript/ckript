import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AUTOMATED_NOTICE,
  BRAND_LOGO_URL,
  MAIL_DOCUMENT_MARKER,
  MAIL_PALETTE,
  SITE_URL,
  button,
  code,
  facts,
  fineprint,
  fragment,
  heading,
  image,
  isMailDocument,
  isThemedMailDocument,
  linkFallback,
  links,
  list,
  panel,
  paragraphs,
  renderMailDocument,
  safeUrl,
  stats,
  wrapMailFragment,
} from "./mailDocument.js";

/**
 * The document every transactional mail is set in. These tests hold it to the platform's own palette
 * and type, to the guarantees every mail needs — a masthead, one footer with the three contact
 * addresses — and to the rule that everything typed by somebody is escaped before it lands in the
 * markup. The addresses are literals on purpose: a test that imported the constants it checks would
 * keep passing whatever they were changed to.
 */

// `(?<!&)` keeps numeric entities such as &#8226; from reading as colours.
const hexes = (html) => [...new Set((html.match(/(?<!&)#[0-9a-f]{3,6}\b/gi) || []).map((h) => h.toLowerCase()))];
const count = (html, needle) => html.split(needle).length - 1;

const everyBlock = () => [
  heading({ eyebrow: "Eyebrow", title: "A headline", subtitle: "An italic line." }),
  paragraphs("One.\n\nTwo, with a\nline break."),
  fragment("<p>Hi <strong>you</strong>,</p><p>A fragment.</p>"),
  facts([["Script", "Title"], { label: "Link", value: "example.com/x", href: "https://example.com/x" }, ["Empty", ""]]),
  stats([["Pages", "56"], ["Words", "3,324"], ["Scenes", "0"]]),
  panel({ eyebrow: "Note", text: "Something to know." }),
  code("123456", "Your code"),
  list(["First", { html: "<strong>Second</strong>" }, ""]),
  image({ src: "https://ckript.com/badges/winner.png", alt: "Winner badge" }),
  fineprint("Small print."),
  linkFallback("https://ckript.com/login"),
  links([{ text: "One", url: "https://ckript.com/one" }, { text: "Two", url: "https://ckript.com/two" }]),
  button({ text: "Open Ckript", url: "https://ckript.com/dashboard" }),
];

describe("the document is on-theme", () => {
  const html = renderMailDocument({ title: "Subject", preheader: "Preview", blocks: everyBlock(), notice: AUTOMATED_NOTICE });

  test("uses only the platform palette", () => {
    assert.deepEqual(hexes(html).filter((h) => !MAIL_PALETTE.includes(h)), []);
  });

  test("carries none of the retired templates' colours", () => {
    assert.doesNotMatch(html, /#1e3a5f|#2d5a8f|#f8f9fa|#6b7280|#e5e7eb|#1d4ed8|#0f172a|#10b981|#111827|#9ca3af/i);
  });

  test("sets the headline in the serif, the body in PT Serif, and fills nothing with coral", () => {
    assert.match(html, /<h1[^>]*font-family:'Baskervville'/);
    assert.match(html, /font-family:'PT Serif'[^"]*font-size:16px/);
    assert.match(html, /class="cta"[^>]*background-color:#161513/);
    assert.doesNotMatch(html, /background-color:#d14d37/i);
    assert.doesNotMatch(html, /box-shadow/);
  });
});

describe("guarantees", () => {
  test("opens with the masthead once and ends in exactly one footer with the three addresses", () => {
    for (const blocks of [[], everyBlock()]) {
      const html = renderMailDocument({ blocks });
      assert.equal(count(html, BRAND_LOGO_URL), 1);
      assert.equal(count(html, "All rights reserved."), 1);
      for (const address of ["info@ckript.com", "support@ckript.com", "contact@ckript.com"]) {
        assert.equal(count(html, `mailto:${address}`), 1, address);
      }
      assert.equal(count(html, MAIL_DOCUMENT_MARKER), 1);
    }
  });

  test("the notice is optional and escaped", () => {
    assert.ok(!renderMailDocument({ blocks: [] }).includes(AUTOMATED_NOTICE));
    const html = renderMailDocument({ blocks: [], notice: "<b>x</b>" });
    assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"));
  });

  test("the preheader falls back to the tagline and is escaped", () => {
    assert.match(renderMailDocument({ blocks: [] }), /A minimal platform for storytellers\.&zwnj;/);
    assert.match(renderMailDocument({ blocks: [], preheader: "<i>" }), /&lt;i&gt;&zwnj;/);
  });

  test("never leaks an escaped newline into markup", () => {
    assert.ok(!renderMailDocument({ blocks: everyBlock() }).includes("\\n"));
  });

  test("tells a finished document from a fragment", () => {
    const document = renderMailDocument({ blocks: [] });
    assert.equal(isThemedMailDocument(document), true);
    assert.equal(isMailDocument(document), true);
    assert.equal(isMailDocument("<p>Hi</p>"), false);
    assert.equal(isThemedMailDocument("<!DOCTYPE html><html><body>x</body></html>"), false);
    assert.equal(isMailDocument("<!DOCTYPE html><html><body>x</body></html>"), true);
  });

  test("dresses a fragment verbatim, with the team sign-off", () => {
    const html = wrapMailFragment("<p>Hi <strong>Jiya</strong>,</p><p>Your script is with the judges.</p>", { title: "Judging" });
    assert.ok(html.includes("<p>Hi <strong>Jiya</strong>,</p><p>Your script is with the judges.</p>"));
    assert.match(html, /Regards,<br \/><strong>Team CKRIPT<\/strong>/);
    assert.ok(html.includes("<title>Judging</title>"));
    assert.ok(!wrapMailFragment("<p>x</p>", { signoff: false }).includes("Regards,"));
  });
});

describe("blocks drop what they cannot show", () => {
  test("facts skip rows without a value, and link a value only through a safe href", () => {
    assert.equal(facts([["Empty", ""], ["Nothing", undefined]]), "");
    const html = facts([["Script", "Title"], { label: "Bad", value: "x", href: "javascript:alert(1)" }]);
    assert.ok(html.includes("Title"));
    assert.ok(!html.includes("javascript:"));
    assert.ok(html.includes(`href="${SITE_URL}"`), "an unsafe href falls back to the site, never to nothing quoted");
  });

  test("stats skip zeros and empties; list skips blanks; image refuses non-http sources", () => {
    assert.equal(stats([["Pages", 0], ["Words", ""]]), "");
    assert.equal(count(stats([["Pages", "12"], ["Words", "0"]]), "<p style=\"margin:0;font-family:'Baskervville'"), 1);
    assert.equal(list(["", null, { html: "" }]), "");
    assert.equal(image({ src: "data:image/png;base64,AAAA" }), "");
    assert.equal(image({ src: "" }), "");
    assert.equal(button({ text: "", url: "https://x.y" }), "");
    assert.equal(paragraphs("   "), "");
    assert.equal(panel({ text: "" }), "");
    assert.equal(code(""), "");
    assert.equal(linkFallback("javascript:alert(1)"), "");
    assert.equal(links([{ text: "x", url: "data:x" }]), "");
  });
});

describe("escaping — the values are names, titles and notes somebody typed", () => {
  const hostile = '<script>alert(1)</script>"';

  test("every text-taking block escapes", () => {
    const html = renderMailDocument({
      title: hostile,
      preheader: hostile,
      notice: hostile,
      blocks: [
        heading({ eyebrow: hostile, title: hostile, subtitle: hostile }),
        paragraphs(hostile),
        facts([[hostile, hostile]]),
        stats([[hostile, hostile]]),
        panel({ eyebrow: hostile, text: hostile }),
        code(hostile, hostile),
        list([hostile]),
        image({ src: "https://ckript.com/x.png", alt: hostile }),
        fineprint(hostile),
        links([{ text: hostile, url: "https://ckript.com" }]),
        button({ text: hostile, url: "https://ckript.com" }),
      ],
    });
    assert.ok(!html.includes("<script>"));
    // title, preheader, notice, eyebrow, heading, subtitle, paragraph, fact label, fact value, stat
    // value, stat label, panel eyebrow, panel text, code caption, code, list item, alt, fineprint,
    // link text, button text.
    assert.equal(count(html, "&lt;script&gt;"), 20);
  });

  test("refuses unsafe URLs everywhere a URL lands", () => {
    assert.equal(safeUrl("javascript:alert(1)"), SITE_URL);
    assert.equal(safeUrl("data:text/html,hi"), SITE_URL);
    assert.equal(safeUrl("  https://ckript.com/x?a=1&b=2 "), "https://ckript.com/x?a=1&amp;b=2");
    assert.equal(safeUrl("mailto:hello@ckript.com"), "mailto:hello@ckript.com");
    const html = renderMailDocument({
      blocks: [
        button({ text: "Go", url: "javascript:alert(1)" }),
        image({ src: "javascript:alert(2)" }),
        links([{ text: "x", url: "javascript:alert(3)" }]),
      ],
    });
    assert.doesNotMatch(html, /javascript:/);
  });
});
