// Does every checkout reach the tax engine, and does every captured payment carry its taxes?
//
// The same idea as ledgerCoverage.test.js, for the same reason: the failure is silent. A new checkout
// ships, takes money at the pre-tax price, and nothing fails — the taxes are simply never collected or
// reported. So this file audits the SOURCE: every place that creates a Razorpay order must price it
// through the tax engine, every verify handler must resolve the taxes of what was captured and hand
// them to the ledger and the invoice, and every refund must go through the one refund path.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCT_TAX } from "../config/tax.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(here, "..");
const read = (rel) => fs.readFileSync(path.join(serverRoot, rel), "utf8");

const handlerBody = (source, name) => {
  const start = source.indexOf(`export const ${name} = `);
  assert.notEqual(start, -1, `${name} is not an exported handler any more — update this audit`);
  const next = source.indexOf("\nexport const ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
};

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "uploads", "scripts"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.js$/.test(entry.name) && !/\.test\.js$/.test(entry.name)) out.push(full);
  }
  return out;
};
const sources = walk(serverRoot).map((file) => ({ rel: path.relative(serverRoot, file).replace(/\\/g, "/"), text: fs.readFileSync(file, "utf8") }));

describe("one way to create an order, and it is priced with taxes", () => {
  test("orders.create appears only in utils/razorpayOrder.js", () => {
    const offenders = sources.filter((s) => /\.orders\.create\s*\(/.test(s.text) && s.rel !== "utils/razorpayOrder.js").map((s) => s.rel);
    assert.deepEqual(offenders, [], "an order created outside the shared helper bypasses the tax engine");
  });

  // Every handler that creates an order. Adding a checkout means adding it here.
  const ORDER_HANDLERS = [
    ["controllers/paymentController.js", "createRazorpayOrder", /createPlanOrder\(/],
    ["controllers/paymentController.js", "createWriterRazorpayOrder", /createPlanOrder\(/],
    ["controllers/scriptController.js", "createScriptPurchaseOrder", /priceWithInrFallback\(/],
    ["controllers/scriptController.js", "createScriptHoldOrder", /priceWithInrFallback\(/],
    ["controllers/scriptController.js", "createScriptTrailerOrder", /priceWithInrFallback\(/],
    ["controllers/competitionController.js", "createRegistrationOrder", /priceWithInrFallback\(/],
    ["controllers/consultationController.js", "createOrder", /priceWithInrFallback\(/],
  ];
  for (const [file, name, pattern] of ORDER_HANDLERS) {
    test(`${name} prices through the tax engine and stores the quote`, () => {
      const body = handlerBody(read(file), name);
      assert.match(body, pattern, `${name} creates an order without pricing taxes`);
      if (pattern.source.startsWith("priceWithInrFallback")) assert.match(body, /saveQuote\(/, `${name} does not store its quote`);
    });
  }

  test("the shared plan checkout stores its quote too", () => {
    const source = read("controllers/paymentController.js");
    const start = source.indexOf("const createPlanOrder = async");
    assert.notEqual(start, -1);
    const body = source.slice(start, source.indexOf("\nexport const ", start));
    assert.match(body, /priceWithInrFallback\(/);
    assert.match(body, /saveQuote\(/);
  });

  test("every order handler is on this list", () => {
    const listed = new Set(ORDER_HANDLERS.map(([, name]) => name));
    const callers = [];
    for (const s of sources.filter((x) => x.rel.startsWith("controllers/"))) {
      // Stop at the next top-level const too, so a module-level helper is not counted as part of the
      // export above it.
      const re = /export const (\w+) = async[\s\S]*?(?=\n(?:export )?const |$)/g;
      let m;
      while ((m = re.exec(s.text))) {
        if (/createOrderWithUsdFallback\(/.test(m[0])) callers.push(m[1]);
      }
    }
    const unlisted = callers.filter((name) => !listed.has(name));
    assert.deepEqual(unlisted, [], "a handler creates orders but is not audited here");
  });
});

describe("every captured payment carries its taxes into the books and the document", () => {
  const VERIFY_HANDLERS = [
    ["controllers/paymentController.js", "verifyRazorpayPayment"],
    ["controllers/paymentController.js", "verifyWriterRazorpayPayment"],
    ["controllers/scriptController.js", "verifyScriptPurchase"],
    ["controllers/scriptController.js", "verifyScriptHold"],
    ["controllers/scriptController.js", "verifyScriptTrailerPayment"],
    ["controllers/consultationController.js", "verifyPayment"],
  ];
  for (const [file, name] of VERIFY_HANDLERS) {
    test(`${name}`, () => {
      const body = handlerBody(read(file), name);
      assert.match(body, /resolveCapturedTax\(/, `${name} never works out the taxes of what was captured`);
      assert.match(body, /recordPayment\(\{[\s\S]*?\btax\b/, `${name} books the payment without its taxes`);
      assert.match(body, /issueInvoice\(\{[\s\S]*?\btax\b/, `${name} documents the payment without its taxes`);
    });
  }

  test("competition registration (module-level helper)", () => {
    const source = read("controllers/competitionController.js");
    const start = source.indexOf("const issueRegistrationInvoice = async");
    const body = source.slice(start, source.indexOf("\nconst ", start + 1));
    assert.match(body, /resolveCapturedTax\(/);
    assert.match(body, /recordPayment\(\{[\s\S]*?\btax\b/);
    assert.match(body, /issueInvoice\(\{[\s\S]*?\btax\b/);
  });

  test("recurring plan charges (utils/planSubscription.js)", () => {
    const source = read("utils/planSubscription.js");
    const start = source.indexOf("export const applySubscriptionCharge = async");
    const body = source.slice(start, source.indexOf("\nexport const ", start + 1));
    assert.match(body, /snapshotForPaidAmount\(/);
    assert.match(body, /recordPayment\(\{[^}]*tax: chargeTax/);
  });

  test("verifiers bind the payment to the purchase, not just the signature", () => {
    for (const [file, name] of [
      ["controllers/scriptController.js", "verifyScriptPurchase"],
      ["controllers/scriptController.js", "verifyScriptTrailerPayment"],
      ["controllers/consultationController.js", "verifyPayment"],
    ]) {
      assert.match(handlerBody(read(file), name), /readVerifiedOrder\(/, `${name} trusts a bare signature`);
    }
  });
});

describe("refunds", () => {
  test("payments.refund is called only by the shared refund path", () => {
    const offenders = sources.filter((s) => /\.payments\.refund\s*\(/.test(s.text) && s.rel !== "utils/tax/refunds.js").map((s) => s.rel);
    assert.deepEqual(offenders, [], "a refund outside refundPayment issues no credit note and reverses no taxes");
  });
});

describe("names and constants", () => {
  test("nothing calls the platform fee a tax any more", () => {
    const offenders = sources.filter((s) => /platformTax|PLATFORM_TAX/.test(s.text)).map((s) => s.rel);
    assert.deepEqual(offenders, []);
  });

  test("controllers do no price math of their own", () => {
    const offenders = sources
      .filter((s) => s.rel.startsWith("controllers/") && /\*\s*1\.05\b|\*\s*0\.85\b|\*\s*12\s*\*\s*0\.85/.test(s.text))
      .map((s) => s.rel);
    assert.deepEqual(offenders, [], "price math belongs in config/ and utils/planCheckout.js");
  });

  test("every paid ledger kind has a tax line kind", () => {
    const LINE_KIND_FOR = {
      plan_subscription: ["plan_fip", "plan_writer_silver", "plan_writer_gold"],
      script_purchase: ["script_price", "script_platform_fee"],
      script_hold: ["hold_price", "hold_platform_fee"],
      ai_trailer: ["ai_trailer"],
      competition_registration: ["competition_registration"],
      consultation: ["consultation"],
    };
    for (const [kind, lines] of Object.entries(LINE_KIND_FOR)) {
      for (const line of lines) assert.ok(PRODUCT_TAX[line]?.sac, `${kind} → ${line} has no SAC`);
    }
  });
});

describe("the wording rule: users read 'Taxes', never GST", () => {
  // User-facing templates and documents. The tax invoice PDF and the finance portal are the two
  // exceptions the law requires, so they are deliberately not on this list.
  const USER_FACING = [
    "utils/emailService.js",
    "utils/notify.js",
    "utils/competitionMail.js",
    "utils/mailDocument.js",
    "utils/agreementPdf.js",
    "utils/purchaseRequestAcceptancePdf.js",
    "utils/scriptSubmissionPdf.js",
    "controllers/billingController.js",
  ];
  const GST_IN_STRING = /(["'`])(?:(?!\1)[^\n\\]|\\.)*\b(?:GST|GSTIN|CGST|SGST|IGST)\b(?:(?!\1)[^\n\\]|\\.)*\1/;
  for (const rel of USER_FACING) {
    test(rel, () => {
      const offending = read(rel).split(/\r?\n/).filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line) && GST_IN_STRING.test(line));
      assert.deepEqual(offending, [], `${rel} shows GST wording to users`);
    });
  }

  test("the public tax config carries no GSTIN and no GST wording", async () => {
    const { publicTaxConfig } = await import("../config/tax.js");
    assert.doesNotMatch(JSON.stringify(publicTaxConfig()), /GST|07AAOCC/);
  });
});
