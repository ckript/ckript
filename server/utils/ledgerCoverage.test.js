// Does every money-or-grant handler actually reach the ledger?
//
// The finance panel can only be as complete as what feeds it, and the failure mode is silent: a new
// checkout flow ships, works perfectly, takes real money, and simply never appears in the CA's
// totals. Nothing breaks and no test fails — the number is just quietly wrong.
//
// So this file audits the SOURCE. It is not a substitute for testing behaviour (utils/ledger.test.js
// does that against the real schema); it is the check that behaviour is wired in at all, which no
// unit test of the ledger itself can see.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import LedgerEntry from "../models/LedgerEntry.js";
import { planAmountMinor } from "./planCheckout.js";
import { PLAN_PRICES, WRITER_PLAN_KEY } from "../config/pricing.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const controllers = path.join(here, "..", "controllers");

const readController = (file) => fs.readFileSync(path.join(controllers, file), "utf8");

/**
 * The body of one exported handler: from its declaration to the next top-level `export`.
 *
 * Crude on purpose — a real parser would be a dependency for a check whose whole value is being
 * cheap enough that nobody deletes it.
 */
const handlerBody = (source, name) => {
  const start = source.indexOf(`export const ${name} = `);
  assert.notEqual(start, -1, `${name} is not an exported handler any more — update this audit`);
  const next = source.indexOf("\nexport const ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
};

// refundPayment (utils/tax/refunds.js) writes the reversal itself, so it counts as reaching the ledger.
const LEDGER_CALL = /record(Payment|Grant|Reversal)\s*\(|refundPayment\s*\(/;

/**
 * Every handler that takes money or gives away paid access.
 *
 * Adding a checkout or a grant means adding it here too. A handler that belongs on this list and is
 * not on it is exactly the bug this file exists to catch, so keep it honest rather than convenient.
 */
const MONEY_HANDLERS = [
  ["paymentController.js", "verifyRazorpayPayment"],
  ["paymentController.js", "verifyWriterRazorpayPayment"],
  ["paymentController.js", "activateFilmIndustryProfessionalTestCheckout"],
  ["paymentController.js", "activateTestWriterSubscription"],
  ["scriptController.js", "verifyScriptPurchase"],
  ["scriptController.js", "verifyScriptHold"],
  ["scriptController.js", "verifyScriptTrailerPayment"],
  ["scriptController.js", "rejectScriptPurchase"],
  ["adminController.js", "grantPremiumModelToUser"],
  ["adminController.js", "grantWriterPlanToUser"],
  ["adminController.js", "grantFipPlanToUser"],
  // Consultations were entirely outside the books until taxes came in.
  ["consultationController.js", "createOrder"],
  ["consultationController.js", "verifyPayment"],
  ["consultationController.js", "rejectConsultation"],
  ["consultationController.js", "cancelConsultation"],
];

describe("every money-or-grant handler reaches the ledger", () => {
  for (const [file, name] of MONEY_HANDLERS) {
    test(`${file} :: ${name}`, () => {
      const body = handlerBody(readController(file), name);
      assert.match(
        body,
        LEDGER_CALL,
        `${name} moves money or grants paid access but records no ledger entry, so it is invisible in /finance`,
      );
    });
  }

  // Recurring plans: three entry points (checkout verify, webhook, re-sync) and ONE place that books a
  // charge. Audit both halves — the helper must record and invoice, and every entry point must go
  // through it rather than growing a private copy that forgets to.
  test("utils/planSubscription :: applySubscriptionCharge books and invoices every charge", () => {
    const source = fs.readFileSync(path.join(here, "planSubscription.js"), "utf8");
    const start = source.indexOf("export const applySubscriptionCharge = async");
    assert.notEqual(start, -1, "applySubscriptionCharge was renamed — update this audit");
    const body = source.slice(start, source.indexOf("\nexport const ", start + 1));
    assert.match(body, /recordPayment\s*\(/, "a recurring plan charge is not recorded in the ledger");
    assert.match(body, /issuePlanInvoice\s*\(/, "a recurring plan charge issues no invoice");
  });

  for (const [file, name] of [
    ["paymentController.js", "verifyPlanSubscription"],
    ["paymentController.js", "razorpayWebhook"],
  ]) {
    test(`${file} :: ${name} applies charges through the shared helper`, () => {
      const body = handlerBody(readController(file), name);
      assert.match(body, /applySubscriptionCharge\s*\(|handleRazorpayWebhookEvent\s*\(|dispatchRazorpayWebhook\s*\(/, `${name} must not book plan charges on its own`);
    });
  }

  // Not an exported handler: the prize path runs through a module-level helper that adminDeclareResults
  // calls once per placing, so the audit checks the helper rather than the handler around it.
  test("competitionAdminController :: grantSubscription (competition prizes)", () => {
    const source = readController("competitionAdminController.js");
    const start = source.indexOf("const grantSubscription = async");
    assert.notEqual(start, -1, "grantSubscription was renamed — update this audit");
    const body = source.slice(start, source.indexOf("\nconst ", start + 1));
    assert.match(body, LEDGER_CALL, "a competition prize plan is given away without being recorded");
  });
});

describe("every recorded kind is one the schema accepts", () => {
  const allowed = new Set(LedgerEntry.schema.path("kind").enumValues);
  const used = new Set();

  for (const file of fs.readdirSync(controllers).filter((f) => f.endsWith(".js"))) {
    const source = readController(file);
    // Only `kind:` values that sit inside a record*() call — other objects in these files use the
    // same key for unrelated things. `kind` is the first property at every site, so a short window
    // after the opening brace is enough and cannot run into the next call.
    for (const match of source.matchAll(/record(?:Payment|Grant|Reversal)\s*\(\{([\s\S]{0,120})/g)) {
      const kind = match[1].match(/kind:\s*"([^"]+)"/);
      if (kind) used.add(kind[1]);
    }
  }

  test("at least one kind was found (the scan itself still works)", () => {
    assert.ok(used.size > 0, "found no ledger kinds at all — the scan is broken, not the code");
  });

  for (const kind of ["plan_subscription", "script_purchase", "script_hold", "ai_trailer"]) {
    test(`${kind} is recorded somewhere`, () => {
      assert.ok(used.has(kind), `nothing records ${kind}, so that revenue never reaches the panel`);
    });
  }

  test("no handler records a kind the model would reject", () => {
    for (const kind of used) {
      assert.ok(allowed.has(kind), `"${kind}" is not in the LedgerEntry enum — every such entry is silently dropped`);
    }
  });
});

describe("a grant never books zero revenue foregone by accident", () => {
  // `listPriceMinor: planAmountMinor(key, ...) || 0` is the shape at every grant site. A mistyped key
  // returns null, the `|| 0` swallows it, and the grant lands showing nothing given away — the one
  // column the whole "granted free" section exists to report.
  const keys = ["film_industry_professional", ...Object.values(WRITER_PLAN_KEY)];

  for (const key of keys) {
    test(`${key} resolves to a real monthly price`, () => {
      const minor = planAmountMinor(key, "INR", "monthly");
      assert.ok(Number.isInteger(minor) && minor > 0, `planAmountMinor("${key}") gave ${minor}`);
    });

    test(`${key} costs more for a year than for a month`, () => {
      assert.ok(planAmountMinor(key, "INR", "annual") > planAmountMinor(key, "INR", "monthly"));
    });
  }

  test("every plan key used by a grant site exists in the price table", () => {
    for (const key of keys) assert.ok(PLAN_PRICES[key], `${key} is missing from PLAN_PRICES`);
  });

  test("the writer tiers admins can grant both map to a price", () => {
    for (const tier of ["silver", "gold"]) {
      assert.ok(WRITER_PLAN_KEY[tier], `no price key for the "${tier}" tier an admin can grant`);
    }
  });
});
