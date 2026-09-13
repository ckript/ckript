// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BRAND_LOGO_URL,
  EMAIL_PALETTE,
  PREFERENCES_SLOT,
  SUBSCRIPTION_NOTICE,
  UNSUBSCRIBE_SLOT,
  compileEmailBlocksToHtml,
} from "./compiler/emailCompiler";

/**
 * The Email Builder preview, the compiled document and the server's send path must agree.
 *
 * History: the preview once drew "Unsubscribe • Preferences" as decorative spans outside the
 * compiled document while the server injected a different footer with no Preferences link at all —
 * so the one screen whose job is to show what the recipient gets showed a footer nobody received.
 *
 * Now the preview renders the compiled document itself, the document carries one footer with two
 * per-recipient slots, and the server fills those slots at send time. This test pins the three
 * across the package boundary so they cannot drift apart silently again.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const builder = fs.readFileSync(path.join(here, "EmailBuilder.jsx"), "utf8");
const server = fs.readFileSync(path.resolve(here, "../../../../../server/utils/emailService.js"), "utf8");
// The server-side twin of the compiler: every transactional mail (results, receipts, OTPs, invites)
// is set in this document.
const mailDocument = fs.readFileSync(path.resolve(here, "../../../../../server/utils/mailDocument.js"), "utf8");

const broadcast = () => {
  const start = server.indexOf("export const sendAdminBroadcastEmail");
  const end = server.indexOf("export const send", start + 10);
  return server.slice(start, end > -1 ? end : undefined);
};
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const hexes = (s) => [...new Set((s.match(/#[0-9a-f]{3,6}\b/gi) || []).map((h) => h.toLowerCase()))];

describe("the builder preview is the document that is sent", () => {
  it("renders the compiled document in a frame rather than a hand-drawn imitation", () => {
    expect(builder).toMatch(/import \{ compileEmailPreviewHtml \} from "\.\/compiler\/emailCompiler"/);
    expect(builder).toMatch(/srcDoc=\{previewHtml\}/);
    // No second drawing of the mail in React, which is what drifted last time.
    expect(builder).not.toMatch(/<h1 className=/);
    expect(builder).not.toMatch(/8B1E1E/i);
  });

  it("ships no stock photo as the default cover", () => {
    expect(builder).not.toMatch(/unsplash\.com/i);
  });

  it("tells the admin the footer links are personalised at send time", () => {
    // \s+ because the caption wraps across a JSX line.
    expect(builder).toMatch(/added automatically\s+to every send/i);
    expect(builder).toMatch(/personalised per recipient/);
  });

  it("the admin chrome uses console tokens, not bright blue", () => {
    expect(builder).not.toMatch(/\b(bg|text|border|ring)-blue-\d+/);
    expect(builder).toMatch(/var\(--ad-accent\)/);
  });
});

describe("the server fills the slots the compiler emits", () => {
  it("both sides name the same two slots, literal for literal", () => {
    expect(server).toContain(`const UNSUBSCRIBE_SLOT = ${JSON.stringify(UNSUBSCRIBE_SLOT)};`);
    expect(server).toContain(`const PREFERENCES_SLOT = ${JSON.stringify(PREFERENCES_SLOT)};`);
  });

  it("the compiled footer carries both slots as real links", () => {
    const html = compileEmailBlocksToHtml([{ type: "Text", content: "x" }]);
    expect(html).toMatch(/href="\{\{UNSUBSCRIBE_URL\}\}"[^>]*>Unsubscribe<\/a>/);
    expect(html).toMatch(/href="\{\{PREFERENCES_URL\}\}"[^>]*>Preferences<\/a>/);
  });

  it("the server substitutes them per recipient and keeps the injected strip as the fallback", () => {
    const body = stripComments(broadcast());
    expect(body).toMatch(/const hasFooterSlots = isBuilderV2 && finalHtml\.includes\(UNSUBSCRIBE_SLOT\)/);
    expect(body).toMatch(/split\(UNSUBSCRIBE_SLOT\)\.join\(unsubscribeHref\)/);
    expect(body).toMatch(/split\(PREFERENCES_SLOT\)\.join\(preferencesUrl\)/);
    expect(body).toMatch(/const unsubscribeFooter = unsubscribeUrl/);
    expect(body).toMatch(/isBuilderV2 && unsubscribeFooter/);
  });
});

describe("the server's own wrapper and strip speak the same theme as the compiler", () => {
  it("carry the same sentence and both links", () => {
    const body = broadcast();
    expect(body).toContain(SUBSCRIPTION_NOTICE);
    expect(body).toMatch(/>Unsubscribe<\/a>/);
    expect(body).toMatch(/>Preferences<\/a>/);
  });

  it("use only the compiler's palette", () => {
    expect(hexes(stripComments(broadcast())).filter((h) => !EMAIL_PALETTE.includes(h))).toEqual([]);
  });

  it("point at a logo that exists, set in the same serif and the same ink button", () => {
    const body = broadcast();
    expect(body).toContain(BRAND_LOGO_URL);
    expect(body).not.toContain("logo-black.png");
    expect(body).toMatch(/\.title \{[^}]*'Baskervville'/);
    expect(body).toMatch(/\.action-btn \{[^}]*background-color: #161513/);
  });

  it("the Preferences link targets the profile Settings tab", () => {
    expect(broadcast()).toMatch(/buildClientUrl\("\/profile\?tab=settings", clientBaseUrl\)/);
  });
});

describe("the server's transactional document speaks the same theme as the compiler", () => {
  it("uses only the compiler's palette", () => {
    expect(hexes(stripComments(mailDocument)).filter((h) => !EMAIL_PALETTE.includes(h))).toEqual([]);
  });

  it("points at the same wordmark, in the same serif, with the same ink button", () => {
    expect(mailDocument).toContain("ckript-logo-landscape-nobg.png");
    expect(mailDocument).toMatch(/const SERIF = "'Baskervville', 'Spectral', Georgia/);
    expect(mailDocument).toMatch(/const BODY = "'PT Serif', Georgia/);
    expect(mailDocument).toMatch(/button: "#161513"/);
    expect(mailDocument).toMatch(/accent: "#d14d37"/);
  });

  it("every emailService template is set in it — none still carries its own <!DOCTYPE>", () => {
    // The broadcast wrapper is the one document emailService.js still draws itself (the builder's
    // own compiled document goes out verbatim); everything else must come from mailDocument.js.
    const outsideBroadcast = server.replace(broadcast(), "");
    expect(outsideBroadcast.match(/<!DOCTYPE html>/g) || []).toHaveLength(0);
    expect(outsideBroadcast).not.toMatch(/#1e3a5f|#2d5a8f|#0f172a|#1d4ed8|#10b981/i);
    expect(server).toMatch(/from "\.\/mailDocument\.js"/);
  });
});
