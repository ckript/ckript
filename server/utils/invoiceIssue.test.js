// Does every payment surface hand the buyer a document, and is that document well formed?
//
// Four surfaces used to take real money and produce nothing: plan subscriptions, script holds, AI
// trailers, and free-access script grants. The failure was silent in the same way the ledger gap was
// — the payment worked, the entitlement landed, and only the buyer noticed there was no receipt.
//
// So this file audits the SOURCE for coverage, and exercises the real schema for correctness. Both
// halves matter: a well-formed invoice nobody issues is worth nothing.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Invoice from "../models/Invoice.js";
import { INVOICE_KINDS, buildInvoiceNumber, totalRow, gatewayRow, formatInvoiceMoney } from "./invoiceIssue.js";
import { INVOICE_DESIGN_VERSION } from "./invoicePdf.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const controllers = path.join(here, "..", "controllers");
const read = (file) => fs.readFileSync(path.join(controllers, file), "utf8");

const handlerBody = (source, name) => {
  const start = source.indexOf(`export const ${name} = `);
  assert.notEqual(start, -1, `${name} is not an exported handler any more — update this audit`);
  const next = source.indexOf("\nexport const ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
};

/**
 * Every handler that takes money or grants paid access must issue an invoice.
 *
 * Add a checkout here when you add one to the product. A surface that belongs on this list and is
 * missing from it is the exact bug this file exists to catch.
 */
const PAID_SURFACES = [
  ["paymentController.js", "verifyRazorpayPayment", "FIP subscription"],
  ["paymentController.js", "verifyWriterRazorpayPayment", "writer plan"],
  ["scriptController.js", "verifyScriptPurchase", "script purchase (paid and free)"],
  ["scriptController.js", "verifyScriptHold", "script hold"],
  ["scriptController.js", "verifyScriptTrailerPayment", "AI trailer"],
  ["consultationController.js", "verifyPayment", "consultation"],
];

describe("every payment surface issues an invoice", () => {
  for (const [file, name, label] of PAID_SURFACES) {
    test(`${label} (${name})`, () => {
      const body = handlerBody(read(file), name);
      assert.match(
        body,
        /issueInvoice\(|Invoice\.create\(/,
        `${name} takes money but issues no invoice, so the buyer receives no document`,
      );
    });
  }

  test("competition registration issues one (module-level helper, not an export)", () => {
    const source = read("competitionController.js");
    const start = source.indexOf("const issueRegistrationInvoice = async");
    assert.notEqual(start, -1, "issueRegistrationInvoice was renamed — update this audit");
    assert.match(source.slice(start, start + 2500), /issueInvoice\(/);
  });

  test("the free-access branch is no longer gated out of invoicing", () => {
    // It used to be: both the lookup and the create sat behind !isFreeAccessRequest, so a buyer who
    // took a zero-price script walked away with no record of what they had been granted.
    const body = handlerBody(read("scriptController.js"), "verifyScriptPurchase");
    assert.match(body, /if \(isFreeAccessRequest && !purchaseInvoice\)/, "free access issues nothing");
  });
});

describe("invoice numbering", () => {
  test("every kind has a distinct prefix", () => {
    const prefixes = Object.values(INVOICE_KINDS).map((k) => k.prefix);
    assert.equal(new Set(prefixes).size, prefixes.length, "two kinds share a prefix");
  });

  test("a number carries its kind, the date, and the payment's tail", () => {
    const number = buildInvoiceNumber("plan_subscription", "pay_Qk8vN2mXfLr4Ta");
    assert.match(number, /^CKR-PLN-\d{8}-[A-Z0-9]{8}$/);
    assert.ok(number.endsWith("N2MXFLR4TA".slice(-8)), `suffix not from the payment id: ${number}`);
  });

  test("falls back to a timestamp when there is no payment id (free access)", () => {
    assert.match(buildInvoiceNumber("script", ""), /^INV-SCP-\d{8}-\d{8}$/);
  });

  test("an unknown kind still produces a usable number rather than throwing", () => {
    assert.match(buildInvoiceNumber("nonsense", "pay_x"), /^CKR-INV-/);
  });
});

describe("the schema accepts every kind the issuer can produce", () => {
  const base = {
    invoiceNumber: "TEST-1",
    invoiceDate: new Date(),
    creator: "507f1f77bcf86cd799439011",
  };

  for (const kind of Object.keys(INVOICE_KINDS)) {
    const needsScript = ["script", "script_hold", "ai_trailer"].includes(kind);
    test(`${kind} validates`, () => {
      const doc = new Invoice({
        ...base,
        kind,
        ...(needsScript ? { script: "507f1f77bcf86cd799439012" } : {}),
      });
      assert.equal(doc.validateSync(), undefined, `${kind} failed validation`);
    });

    if (!needsScript) {
      test(`${kind} does not demand a script reference`, () => {
        // The old rule was "required unless competition_registration", which silently made `script`
        // mandatory for every kind added afterwards — it would have blocked plan invoices outright.
        const doc = new Invoice({ ...base, kind });
        assert.equal(doc.validateSync(), undefined, `${kind} wrongly requires a script`);
      });
    }
  }

  test("a kind outside the enum is rejected rather than silently stored", () => {
    const doc = new Invoice({ ...base, kind: "made_up", script: "507f1f77bcf86cd799439012" });
    assert.ok(doc.validateSync(), "an unknown kind validated");
  });

  test("a new invoice records nothing about a PDF until one is rendered", () => {
    const doc = new Invoice({ ...base, script: "507f1f77bcf86cd799439012" });
    assert.equal(doc.pdfPath, "");
    // 0, not the current version: an unrendered invoice must look stale so the route draws it.
    assert.equal(doc.pdfDesignVersion, 0);
    assert.ok(INVOICE_DESIGN_VERSION > 0);
  });
});

describe("stale cached PDFs re-render exactly once", () => {
  const source = fs.readFileSync(path.join(controllers, "invoiceController.js"), "utf8");

  test("the download route compares the stored design version", () => {
    // Without this, a redesign only ever reaches invoices issued afterwards: pdfPath is set, so the
    // cached bytes are served forever and every historical invoice keeps the old look.
    assert.match(source, /Number\(invoice\.pdfDesignVersion \|\| 0\) < INVOICE_DESIGN_VERSION/);
    assert.match(source, /!hasRemotePdf \|\| forcedRefresh \|\| isStaleDesign/);
  });

  test("and stamps the version after rendering, so it re-renders once and not every time", () => {
    assert.match(source, /invoice\.pdfDesignVersion = INVOICE_DESIGN_VERSION/);
  });

  test("the panel comes off the invoice, so a new kind needs no change to this route", () => {
    assert.match(source, /invoice\.detailLines/);
  });
});

describe("row helpers", () => {
  test("the total row is typed so the document lifts it out of the table", () => {
    const row = totalRow(47250, "INR");
    assert.equal(row.type, "Total");
    assert.equal(row.amountLabel, "INR 47250.00");
    assert.equal(row.amountValue, 47250);
  });

  test("the gateway row carries no money", () => {
    const row = gatewayRow("pay_abc");
    assert.equal(row.type, "Reference");
    assert.equal(row.amountValue, 0);
    assert.match(row.detail, /pay_abc/);
  });

  test("money is labelled in the currency actually charged", () => {
    // A USD entry fee printed as "INR 25.00" is a document stating the wrong thing.
    assert.equal(formatInvoiceMoney(25, "USD"), "USD 25.00");
    assert.equal(formatInvoiceMoney(1999, "inr"), "INR 1999.00");
    assert.equal(formatInvoiceMoney(0), "INR 0.00");
  });
});
