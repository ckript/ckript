// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  BRAND_LOGO_URL,
  EMAIL_PALETTE,
  PREFERENCES_SLOT,
  SITE_URL,
  SUBSCRIPTION_NOTICE,
  UNSUBSCRIBE_SLOT,
  compileEmailBlocksToHtml,
  compileEmailPreviewHtml,
  safeUrl,
} from "./emailCompiler";

/**
 * The compiled mail is the platform's face in the inbox. These tests hold it to the platform's own
 * palette and type, and to the two guarantees every bulk mail needs: a masthead, and one footer with
 * a way out. The old template failed all of them — cool zinc greys, a slate-blue footer, an
 * 800-weight sans headline, and a footer with no unsubscribe link at all.
 */

const hexes = (html) => [...new Set((html.match(/#[0-9a-f]{3,6}\b/gi) || []).map((h) => h.toLowerCase()))];
const count = (html, needle) => html.split(needle).length - 1;

const sample = [
  { type: "HeroImage", imageUrl: "https://ckript.com/dashboard-hero.png" },
  { type: "Heading", eyebrow: "From Ckript", text: "A note from the desk", subtitle: "Why it matters." },
  { type: "Text", content: "One.\n\nTwo, with a\nline break." },
  { type: "FeatureCards", cards: [{ title: "A", description: "a" }, { title: "B", description: "b" }] },
  { type: "Divider" },
  { type: "CTA", text: "Open Ckript", url: "https://ckript.com/dashboard" },
  { type: "Footer" },
];

describe("the compiled mail is on-theme", () => {
  const html = compileEmailBlocksToHtml(sample, "Subject");

  it("uses only the platform palette", () => {
    expect(hexes(html).filter((h) => !EMAIL_PALETTE.includes(h))).toEqual([]);
  });

  it("carries none of the retired template's colours", () => {
    expect(html).not.toMatch(/#8b1e1e|#f8fafc|#9ca3af|#71717a|#3f3f46|#52525b|#a1a1aa|#fafafa|#111111/i);
  });

  it("sets the headline and subtitle in the serif, the body in PT Serif", () => {
    expect(html).toMatch(/<h1[^>]*font-family:'Baskervville'/);
    expect(html).toMatch(/font-style:italic;font-size:19px/);
    expect(html).toMatch(/font-family:'PT Serif'[^"]*font-size:16px/);
  });

  it("the button is ink, and coral never fills anything", () => {
    expect(html).toMatch(/class="cta"[^>]*background-color:#161513/);
    expect(html).not.toMatch(/background-color:#d14d37/i);
    expect(html).not.toMatch(/fillcolor="#d14d37"/i);
  });

  it("draws no drop shadow", () => {
    expect(html).not.toMatch(/box-shadow/);
  });
});

describe("guarantees", () => {
  it("always opens with the masthead and the real wordmark, once", () => {
    const html = compileEmailBlocksToHtml([{ type: "Text", content: "x" }]);
    expect(count(html, BRAND_LOGO_URL)).toBe(1);
    expect(html).toMatch(/<img src="[^"]*ckript-logo-landscape-nobg\.png" alt="Ckript"/);
  });

  it("keeps a custom TopBar logo when one is given", () => {
    const html = compileEmailBlocksToHtml([{ type: "TopBar", logoUrl: "https://cdn.example.com/mark.png" }]);
    expect(html).toContain("https://cdn.example.com/mark.png");
    expect(html).not.toContain(BRAND_LOGO_URL);
  });

  it("always ends in exactly one footer carrying the personal slots", () => {
    for (const blocks of [[{ type: "Text", content: "x" }], sample]) {
      const html = compileEmailBlocksToHtml(blocks);
      expect(count(html, SUBSCRIPTION_NOTICE)).toBe(1);
      expect(count(html, UNSUBSCRIBE_SLOT)).toBe(1);
      expect(count(html, PREFERENCES_SLOT)).toBe(1);
      expect(html).toMatch(/href="\{\{UNSUBSCRIBE_URL\}\}"[^>]*>Unsubscribe<\/a>/);
      expect(html).toMatch(/href="\{\{PREFERENCES_URL\}\}"[^>]*>Preferences<\/a>/);
    }
  });

  it("keeps the marker the server recognises builder output by", () => {
    expect(compileEmailBlocksToHtml(sample)).toContain("<!-- EMAIL_BUILDER_V2 -->");
  });

  it("the preview is the same document with the personal links made inert", () => {
    const sent = compileEmailBlocksToHtml(sample, "s");
    const preview = compileEmailPreviewHtml(sample, "s");
    expect(preview).not.toContain(UNSUBSCRIBE_SLOT);
    expect(preview).not.toContain(PREFERENCES_SLOT);
    expect(preview).toMatch(/href="#"[^>]*>Unsubscribe<\/a>/);
    const withoutHrefs = (s) => s.replace(/href="[^"]*"/g, "href");
    expect(withoutHrefs(preview)).toBe(withoutHrefs(sent));
  });
});

describe("escaping — the document is mailed verbatim and rendered in the admin's browser", () => {
  it("escapes every text field", () => {
    const hostile = '<script>alert(1)</script>"';
    const html = compileEmailBlocksToHtml(
      [
        { type: "Heading", eyebrow: hostile, text: hostile, subtitle: hostile },
        { type: "Text", content: hostile },
        { type: "CTA", text: hostile, url: "https://ckript.com" },
        { type: "FeatureCards", cards: [{ title: hostile, description: hostile }] },
        { type: "HeroImage", imageUrl: "https://ckript.com/x.png", alt: hostile },
      ],
      hostile
    );
    expect(html).not.toContain("<script>");
    // eyebrow, heading, subtitle, body, button, card title, card copy, hero alt — and the
    // preheader, which is derived from the subtitle.
    expect(count(html, "&lt;script&gt;")).toBe(9);
  });

  it("refuses unsafe URLs", () => {
    expect(safeUrl("javascript:alert(1)")).toBe(SITE_URL);
    expect(safeUrl("data:text/html,hi")).toBe(SITE_URL);
    expect(safeUrl("  https://ckript.com/x?a=1&b=2 ")).toBe("https://ckript.com/x?a=1&amp;b=2");
    expect(safeUrl("mailto:hello@ckript.com")).toBe("mailto:hello@ckript.com");

    const html = compileEmailBlocksToHtml([
      { type: "CTA", text: "Go", url: "javascript:alert(1)" },
      { type: "HeroImage", imageUrl: "data:image/png;base64,AAAA" },
      { type: "TopBar", logoUrl: "javascript:alert(2)" },
    ]);
    expect(html).not.toMatch(/javascript:|data:image/);
    expect(html).toContain(BRAND_LOGO_URL);
  });

  it("derives the inbox preview line from the subtitle, not the subject", () => {
    const html = compileEmailBlocksToHtml(sample, "The subject line");
    const preheader = html.match(/<div style="display:none[^>]*>\s*([^&]*)&zwnj;/)?.[1]?.trim();
    expect(preheader).toBe("Why it matters.");
    expect(html).not.toContain("The subject line");
  });
});
