import { afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import User from "../models/User.js";
import {
  createUnsubscribeToken,
  readUnsubscribeToken,
  buildUnsubscribeUrl,
  UNSUBSCRIBE_CATEGORIES,
} from "../utils/unsubscribeToken.js";
import { filterSubscribed, oneClickUnsubscribe, unsubscribePage } from "./unsubscribeController.js";

/**
 * Unsubscribing.
 *
 * Two properties carry the whole feature, and neither is obvious:
 *
 *   The token must be unforgeable, because the endpoint is public and sessionless. Anything less
 *   lets a stranger silence another person's mail by editing a URL.
 *
 *   The filter must default to SUBSCRIBED. The preference field predates this feature, so most user
 *   documents have no value stored at all — requiring an explicit true would read every one of them
 *   as unsubscribed and silence the platform on the first send.
 */

const controllerSource = fs.readFileSync(new URL("./unsubscribeController.js", import.meta.url), "utf8");
const adminSource = fs.readFileSync(new URL("./adminController.js", import.meta.url), "utf8");
const emailSource = fs.readFileSync(new URL("../utils/emailService.js", import.meta.url), "utf8");

before(() => {
  // The token is signed lazily from the environment; there is no .env in the test process.
  process.env.UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_SECRET || "test-unsubscribe-secret";
});

const originals = { findById: User.findById, updateOne: User.updateOne };
afterEach(() => { User.findById = originals.findById; User.updateOne = originals.updateOne; });

const response = () => {
  const captured = { status: 200, body: null, html: "", type: "" };
  return {
    captured,
    res: {
      status(code) { captured.status = code; return this; },
      json(body) { captured.body = body; return this; },
      type(t) { captured.type = t; return this; },
      send(html) { captured.html = html; return this; },
    },
  };
};

const USER = "507f1f77bcf86cd799439011";
const chain = (value) => ({ select: function () { return this; }, lean: () => Promise.resolve(value) });

describe("the signed token", () => {
  test("round-trips a user and category", () => {
    const token = createUnsubscribeToken(USER, "marketing");
    assert.deepEqual(readUnsubscribeToken(token), { userId: USER, category: "marketing" });
  });

  test("refuses a tampered signature", () => {
    // The property the whole public endpoint rests on: editing the URL must not let one person
    // silence another's mail.
    const token = createUnsubscribeToken(USER, "marketing");
    const [id, category, sig] = token.split(".");
    assert.equal(readUnsubscribeToken(`${id}.${category}.${sig.slice(0, -2)}xx`), null);
  });

  test("refuses a swapped user id, even with a valid signature for someone else", () => {
    const mine = createUnsubscribeToken(USER, "marketing");
    const theirs = "507f1f77bcf86cd799439099";
    const [, category, sig] = mine.split(".");
    assert.equal(readUnsubscribeToken(`${theirs}.${category}.${sig}`), null);
  });

  test("refuses a swapped category", () => {
    const token = createUnsubscribeToken(USER, "marketing");
    const [id, , sig] = token.split(".");
    assert.equal(readUnsubscribeToken(`${id}.messages.${sig}`), null);
  });

  test("refuses malformed input without throwing", () => {
    for (const bad of ["", "x", "a.b", "a.b.c.d", null, undefined, 42, {}, `${USER}.marketing.`]) {
      assert.equal(readUnsubscribeToken(bad), null, `${JSON.stringify(bad)} should not verify`);
    }
  });

  test("a short signature is refused rather than crashing timingSafeEqual", () => {
    // timingSafeEqual THROWS on a length mismatch, so a length check has to come first or a crafted
    // token is a 500 instead of a refusal.
    assert.doesNotThrow(() => readUnsubscribeToken(`${USER}.marketing.short`));
    assert.equal(readUnsubscribeToken(`${USER}.marketing.short`), null);
  });

  test("refuses a category nobody may unsubscribe from", () => {
    // There is deliberately no token for transactional mail — a password reset or a receipt.
    assert.equal(createUnsubscribeToken(USER, "password-reset"), "");
    assert.equal(createUnsubscribeToken(USER, "transactional"), "");
    assert.deepEqual([...UNSUBSCRIBE_CATEGORIES], ["marketing", "system", "messages"]);
  });

  test("builds an absolute URL without a doubled slash", () => {
    const url = buildUnsubscribeUrl("https://ckript.com/", USER, "marketing");
    assert.match(url, /^https:\/\/ckript\.com\/api\/unsubscribe\?token=/);
    assert.equal(url.includes("//api"), false);
  });
});

describe("the filter that decides who still gets mail", () => {
  test("treats a user with NO stored preference as subscribed", () => {
    // The field predates this feature. Requiring an explicit true would read every existing user as
    // unsubscribed and silence the platform on the first send.
    const users = [{ _id: "a" }, { _id: "b", notificationPrefs: {} }, { _id: "c", notificationPrefs: { emailPreferences: {} } }];
    assert.equal(filterSubscribed(users, "marketing").length, 3);
  });

  test("drops only those who explicitly opted out", () => {
    const users = [
      { _id: "in", notificationPrefs: { emailPreferences: { marketing: true } } },
      { _id: "out", notificationPrefs: { emailPreferences: { marketing: false } } },
      { _id: "unset" },
    ];
    const kept = filterSubscribed(users, "marketing").map((u) => u._id);
    assert.deepEqual(kept, ["in", "unset"]);
  });

  test("categories are independent", () => {
    const users = [{ _id: "a", notificationPrefs: { emailPreferences: { marketing: false, messages: true } } }];
    assert.equal(filterSubscribed(users, "marketing").length, 0);
    assert.equal(filterSubscribed(users, "messages").length, 1);
  });
});

describe("one-click (RFC 8058)", () => {
  test("turns the preference off for the right user and category", async () => {
    User.findById = () => chain({ _id: USER, email: "a@example.com" });
    let update = null;
    User.updateOne = (filter, doc) => { update = { filter, doc }; return Promise.resolve({}); };

    const target = response();
    await oneClickUnsubscribe({ query: { token: createUnsubscribeToken(USER, "marketing") }, body: {} }, target.res);

    assert.equal(target.captured.status, 200);
    assert.equal(target.captured.body.unsubscribed, true);
    assert.equal(String(update.filter._id), USER);
    assert.deepEqual(update.doc, { $set: { "notificationPrefs.emailPreferences.marketing": false } });
  });

  test("answers 200 even for a token it cannot resolve", async () => {
    /*
     * Deliberate. A 4xx makes Gmail show "unsubscribe failed", the recipient concludes the sender is
     * ignoring them, and the next thing they press is the spam button — which costs the
     * deliverability of every message the platform sends, not just this one.
     */
    User.findById = () => chain(null);
    User.updateOne = () => { throw new Error("must not write"); };

    const target = response();
    await oneClickUnsubscribe({ query: { token: "garbage" }, body: {} }, target.res);

    assert.equal(target.captured.status, 200);
    assert.equal(target.captured.body.unsubscribed, false);
  });

  test("writes nothing when the token does not verify", async () => {
    User.findById = () => { throw new Error("must not look up"); };
    User.updateOne = () => { throw new Error("must not write"); };

    const target = response();
    await oneClickUnsubscribe({ query: { token: `${USER}.marketing.forged` }, body: {} }, target.res);

    assert.equal(target.captured.body.unsubscribed, false);
  });
});

describe("the human page", () => {
  test("acts on the click rather than asking again, and says which address", async () => {
    User.findById = () => chain({ _id: USER, email: "reader@example.com" });
    let wrote = false;
    User.updateOne = () => { wrote = true; return Promise.resolve({}); };

    const target = response();
    await unsubscribePage({ query: { token: createUnsubscribeToken(USER, "marketing") } }, target.res);

    assert.equal(wrote, true, "the click already WAS the confirmation");
    assert.equal(target.captured.type, "html");
    assert.match(target.captured.html, /unsubscribed/i);
    assert.match(target.captured.html, /reader@example\.com/);
  });

  test("escapes the address rather than reflecting it into the page", async () => {
    // The address comes from the database, but it reaches an HTML page — and this is the one
    // server-rendered page in the product, so it has no framework escaping behind it.
    User.findById = () => chain({ _id: USER, email: '<img src=x onerror="alert(1)">' });
    User.updateOne = () => Promise.resolve({});

    const target = response();
    await unsubscribePage({ query: { token: createUnsubscribeToken(USER, "marketing") } }, target.res);

    assert.equal(target.captured.html.includes("<img src=x"), false);
    assert.match(target.captured.html, /&lt;img/);
  });

  test("says so plainly when the link is no longer valid", async () => {
    User.findById = () => chain(null);
    const target = response();
    await unsubscribePage({ query: { token: "nonsense" } }, target.res);

    assert.equal(target.captured.status, 200);
    assert.match(target.captured.html, /no longer valid/i);
  });
});

describe("it is actually wired into the sending path", () => {
  test("broadcasts filter out people who unsubscribed", () => {
    assert.match(adminSource, /filterSubscribed\(recipients, "marketing"\)/);
  });

  test("the audience query SELECTS the preference it filters on", () => {
    // Without this the filter reads undefined for every recipient, treats them all as subscribed and
    // silently does nothing — a guard that cannot see its own field.
    assert.match(adminSource, /notificationPrefs\.emailPreferences"\)/);
  });

  test("each recipient gets their OWN link", () => {
    // One shared link would let whoever clicked it unsubscribe somebody else.
    //
    // Read as a window from the call, not with [^)]* — the first argument is itself a call, so a
    // paren-bounded pattern stops at ITS closing paren and never reaches the recipient id.
    const at = adminSource.indexOf("buildUnsubscribeUrl(", adminSource.indexOf("sendAdminBroadcastEmail("));
    assert.ok(at > -1, "the broadcast does not build an unsubscribe link at all");
    assert.match(adminSource.slice(at, at + 160), /recipient\._id/);
  });

  test("both List-Unsubscribe headers are set, or neither", () => {
    // One-click needs the -Post header too; List-Unsubscribe alone just opens a URL and the recipient
    // still has to do something.
    assert.match(emailSource, /"List-Unsubscribe":/);
    assert.match(emailSource, /"List-Unsubscribe-Post": "List-Unsubscribe=One-Click"/);
  });

  test("transactional mail carries no unsubscribe header", () => {
    // Only the broadcast sender takes an unsubscribeUrl. A password reset or a receipt offering to
    // switch itself off would be a bug, not a courtesy.
    const senders = [...emailSource.matchAll(/export const (send\w+Email)/g)].map((m) => m[1]);
    assert.ok(senders.length > 3, "expected several senders");
    assert.equal(
      (emailSource.match(/unsubscribeUrl/g) || []).length > 0,
      true
    );
    const broadcastStart = emailSource.indexOf("export const sendAdminBroadcastEmail");
    const nextSender = emailSource.indexOf("export const send", broadcastStart + 10);
    const broadcastBody = emailSource.slice(broadcastStart, nextSender > -1 ? nextSender : undefined);
    // Every mention of the header lives inside the broadcast sender.
    const headerCount = (emailSource.match(/"List-Unsubscribe"/g) || []).length;
    const inBroadcast = (broadcastBody.match(/"List-Unsubscribe"/g) || []).length;
    assert.equal(headerCount, inBroadcast, "an unsubscribe header escaped the broadcast sender");
  });

  test("the endpoints are public — no protect on the router", () => {
    const routes = fs.readFileSync(new URL("../routes/unsubscribeRoutes.js", import.meta.url), "utf8");
    // Comments stripped first. The file EXPLAINS at length why there is no `protect` here, and a
    // rule that forbids explaining itself is a rule the next person deletes.
    const code = routes
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    assert.equal(/\bprotect\b/.test(code), false, "requiring a session defeats the entire feature");
    assert.match(code, /router\.post\("\/"/);
    assert.match(code, /router\.get\("\/"/);
  });

  test("the controller never trusts a category from the request", () => {
    // The category is inside the signed token. Reading it from the query would let anyone unsubscribe
    // anyone from anything by editing a URL.
    assert.equal(/req\.(query|body)\??\.category/.test(controllerSource), false);
  });
});

describe("the link is visible, and points at the right server", () => {
  /*
   * Two bugs found together, after an admin reported no unsubscribe in the mails they sent.
   *
   * The link was only ever in the List-Unsubscribe HEADER and the plain-text part. Gmail renders
   * its header control only for senders with reputation; Outlook and Apple Mail never render it.
   * The HTML body — what people actually read — had no link at all.
   *
   * And the URL was built from the CLIENT's origin. /api/unsubscribe is a route on the API server;
   * in production the SPA lives on a different origin, so the link opened the front-end router and
   * rendered a blank page. Same class as the Google Calendar redirect-URI bug.
   */

  const fakeReq = (host, protocol = "https") => ({ protocol, get: (h) => (h.toLowerCase() === "host" ? host : "") });

  test("resolves the base from the request's own host, behind trust proxy", async () => {
    const { resolveUnsubscribeBaseUrl } = await import("../utils/unsubscribeToken.js");
    const saved = process.env.PUBLIC_API_URL;
    delete process.env.PUBLIC_API_URL;
    try {
      assert.equal(resolveUnsubscribeBaseUrl(fakeReq("ckript-519795868401.asia-south1.run.app")), "https://ckript-519795868401.asia-south1.run.app");
      assert.equal(resolveUnsubscribeBaseUrl(fakeReq("localhost:5000", "http")), "http://localhost:5000");
    } finally {
      if (saved !== undefined) process.env.PUBLIC_API_URL = saved;
    }
  });

  test("PUBLIC_API_URL wins over the request host when set", async () => {
    const { resolveUnsubscribeBaseUrl } = await import("../utils/unsubscribeToken.js");
    const saved = process.env.PUBLIC_API_URL;
    process.env.PUBLIC_API_URL = "https://api.ckript.com/";
    try {
      assert.equal(resolveUnsubscribeBaseUrl(fakeReq("some-proxy-host")), "https://api.ckript.com");
    } finally {
      if (saved === undefined) delete process.env.PUBLIC_API_URL; else process.env.PUBLIC_API_URL = saved;
    }
  });

  test("never builds a relative link — an empty base yields no link, not a dead one", () => {
    // "/api/unsubscribe?token=…" is a working path on a web page and a dead link in an inbox, and
    // because it was non-empty the List-Unsubscribe headers still went out pointing at it.
    assert.equal(buildUnsubscribeUrl("", USER, "marketing"), "");
    assert.equal(buildUnsubscribeUrl("ckript.com", USER, "marketing"), "");
    assert.equal(buildUnsubscribeUrl(undefined, USER, "marketing"), "");
    assert.match(buildUnsubscribeUrl("https://api.ckript.com", USER, "marketing"), /^https:\/\/api\.ckript\.com\/api\/unsubscribe\?token=/);
  });

  test("the broadcast builds the link from the API origin, not the client origin", () => {
    const at = adminSource.indexOf("buildUnsubscribeUrl(", adminSource.indexOf("sendAdminBroadcastEmail("));
    const call = adminSource.slice(at, at + 120);
    assert.match(call, /resolveUnsubscribeBaseUrl\(req\)/);
    assert.equal(/resolveClientOriginFromRequest\(req\)/.test(call), false, "the client origin is the SPA, not the API");
  });

  test("the HTML wrapper footer carries a visible Unsubscribe link", () => {
    const start = emailSource.indexOf("export const sendAdminBroadcastEmail");
    const body = emailSource.slice(start, emailSource.indexOf("export const send", start + 10));
    assert.match(body, /href="\$\{unsubscribeUrl\}">Unsubscribe<\/a>/, "the wrapper footer has no visible unsubscribe link");
    // Gated: transactional-style sends with no unsubscribeUrl must not render a dangling link.
    assert.match(body, /unsubscribeUrl \? ` &nbsp;&middot;&nbsp;/);
  });

  test("a Builder V2 document gets the link injected before </body>", () => {
    const start = emailSource.indexOf("export const sendAdminBroadcastEmail");
    const body = emailSource.slice(start, emailSource.indexOf("export const send", start + 10));
    assert.match(body, /isBuilderV2 && unsubscribeFooter/);
    assert.match(body, /replace\("<\/body>"/);
    assert.match(body, /html: htmlForSend/, "mailOptions must send the injected html, not the raw finalHtml");
  });
});

describe("the delivered footer matches the admin preview — Unsubscribe AND Preferences", () => {
  /*
   * An admin reported Unsubscribe and Preferences visible in the Email Builder preview but absent
   * from the actual mail. The preview drew them as decorative spans outside the compiled document;
   * nothing in the sent path ever rendered "Preferences", and Unsubscribe reached only the header
   * and text part. The server now injects the same footer the preview shows, with real links.
   */
  const start = emailSource.indexOf("export const sendAdminBroadcastEmail");
  const body = emailSource.slice(start, emailSource.indexOf("export const send", start + 10));

  test("Preferences points at the profile Settings tab, built as a CLIENT link", () => {
    // Not the API origin: the notification toggles live in the SPA, the unsubscribe endpoint on the API.
    assert.match(body, /const preferencesUrl = buildClientUrl\("\/profile\?tab=settings", clientBaseUrl\)/);
  });

  test("the wrapper footer carries both links, gated on unsubscribeUrl", () => {
    assert.match(body, /href="\$\{unsubscribeUrl\}">Unsubscribe<\/a>/);
    assert.match(body, /href="\$\{preferencesUrl\}">Preferences<\/a>/);
    // Both live inside the same `unsubscribeUrl ? … : ""` so a transactional send renders neither.
    const gate = body.indexOf('unsubscribeUrl ? ` &nbsp;&middot;&nbsp;');
    assert.ok(gate > -1);
    assert.ok(body.indexOf('href="${preferencesUrl}">Preferences</a>') > gate);
  });

  test("the Builder V2 injection is the preview's footer, word for word", () => {
    assert.match(body, /You are receiving this because you subscribed to our updates\./);
    const footerStart = body.indexOf("const unsubscribeFooter = unsubscribeUrl");
    const footer = body.slice(footerStart, footerStart + 1400);
    assert.match(footer, /href="\$\{unsubscribeUrl\}"[^>]*>Unsubscribe<\/a>/);
    assert.match(footer, /href="\$\{preferencesUrl\}"[^>]*>Preferences<\/a>/);
  });

  test("the plain-text part offers preferences too", () => {
    assert.match(body, /Manage preferences: \$\{preferencesUrl\}/);
  });

  test("preferencesUrl is defined before the wrapper template that uses it", () => {
    // It is referenced inside the finalHtml template literal; declared after it, that is a
    // ReferenceError at send time — the class of bug the no-undef guard exists for.
    assert.ok(body.indexOf("const preferencesUrl") < body.indexOf("const finalHtml"));
  });
});
