// GSTR-1 / GSTR-3B tables from issued documents: every sale lands in exactly one table, credit notes
// reduce what they reverse, and the totals reconcile with the documents.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildGstr1, buildGstr3b, classifyDocument, gstr1Csv } from "./returns.js";
import { buildTaxSnapshot, scaleSnapshot, SUPPLY } from "./engine.js";

const SUPPLIER = { legalName: "CKRIPT PRIVATE LIMITED", gstin: "07AAOCC0556A1ZZ", stateCode: "07" };
let seq = 0;
const invoice = ({ amount, supplyType, pos, gstin = "", currency = "INR", fx = null }) => {
  seq += 1;
  return {
    documentType: "tax_invoice",
    invoiceNumber: `CK/2627/${String(seq).padStart(6, "0")}`,
    invoiceDate: new Date("2026-10-15T10:00:00+05:30"),
    series: "CK",
    fy: "2627",
    seq,
    tax: buildTaxSnapshot({
      lines: [{ kind: "plan_writer_silver", description: "Writer Silver plan", sac: "998439", amountMinor: amount }],
      currency,
      rateBps: 1800,
      supplyType,
      placeOfSupply: pos,
      supplier: SUPPLIER,
      recipient: { name: "Buyer", gstin },
      fx,
    }),
  };
};

describe("which table a sale lands in", () => {
  test("a business tax ID → B2B", () => {
    assert.equal(classifyDocument(invoice({ amount: 39900, supplyType: SUPPLY.INTER, pos: { country: "IN", stateCode: "27" }, gstin: "27AAAPL1234C1ZV" })), "b2b");
  });
  test("a foreign buyer → exports (with payment of tax)", () => {
    assert.equal(classifyDocument(invoice({ amount: 500, currency: "USD", supplyType: SUPPLY.EXPORT, pos: { country: "UNITED STATES" }, fx: { rate: 88 } })), "exp");
  });
  test("a large inter-state B2C invoice → B2CL; small → B2CS", () => {
    assert.equal(classifyDocument(invoice({ amount: 10000000, supplyType: SUPPLY.INTER, pos: { country: "IN", stateCode: "27" } })), "b2cl");
    assert.equal(classifyDocument(invoice({ amount: 39900, supplyType: SUPPLY.INTER, pos: { country: "IN", stateCode: "27" } })), "b2cs");
    assert.equal(classifyDocument(invoice({ amount: 39900, supplyType: SUPPLY.INTRA, pos: { country: "IN", stateCode: "07" } })), "b2cs");
  });
});

describe("GSTR-1", () => {
  const delhi = invoice({ amount: 39900, supplyType: SUPPLY.INTRA, pos: { country: "IN", stateCode: "07" } });
  const mumbai = invoice({ amount: 69900, supplyType: SUPPLY.INTER, pos: { country: "IN", stateCode: "27" } });
  const us = invoice({ amount: 500, currency: "USD", supplyType: SUPPLY.EXPORT, pos: { country: "UNITED STATES" }, fx: { rate: 88 } });
  const b2b = invoice({ amount: 199900, supplyType: SUPPLY.INTER, pos: { country: "IN", stateCode: "29" }, gstin: "29AAAPL1234C1ZX" });
  const credit = {
    documentType: "credit_note",
    invoiceNumber: "CN/2627/000001",
    invoiceDate: new Date("2026-10-20T10:00:00+05:30"),
    series: "CN", fy: "2627", seq: 1,
    originalInvoiceNumber: delhi.invoiceNumber,
    tax: scaleSnapshot(delhi.tax, delhi.tax.totals.grossMinor),
  };
  const cancelled = { documentType: "cancelled", invoiceNumber: "CK/2627/999999", series: "CK", fy: "2627", seq: 999999 };
  const r = buildGstr1({ documents: [delhi, mumbai, us, b2b, credit], cancelled: [cancelled] });

  test("each sale appears once", () => {
    assert.equal(r.b2b.length, 1);
    assert.equal(r.exp.length, 1);
    assert.equal(r.b2cl.length, 0);
  });

  test("B2CS is aggregated by place of supply, and a B2C credit note nets into it", () => {
    const delhiRow = r.b2cs.find((x) => x.placeOfSupply === "07-Delhi");
    assert.equal(delhiRow.taxable, 0, "the full refund cancels the Delhi sale");
    const mumbaiRow = r.b2cs.find((x) => x.placeOfSupply === "27-Maharashtra");
    assert.equal(mumbaiRow.taxable, 69900);
    assert.equal(mumbaiRow.igst, 12582);
  });

  test("exports are reported in INR", () => {
    assert.equal(r.exp[0].taxable, 500 * 88);
    assert.equal(r.exp[0].exportType, "WPAY");
  });

  test("the HSN summary splits B2B and B2C and nets credit notes", () => {
    const b2c = r.hsn.find((x) => x.audience === "B2C");
    const b2bRow = r.hsn.find((x) => x.audience === "B2B");
    assert.equal(b2bRow.taxable, 199900);
    assert.equal(b2c.quantity, 2, "three B2C sales less one credit note");
  });

  test("Table 13 counts each series, including cancelled numbers", () => {
    const ck = r.docs.find((x) => x.series === "CK");
    assert.equal(ck.total, 5);
    assert.equal(ck.cancelled, 1);
    assert.equal(ck.netIssued, 4);
    assert.equal(r.docs.find((x) => x.series === "CN").total, 1);
  });

  test("CSV uses the offline tool's column names and rupee amounts", () => {
    const csv = gstr1Csv("b2b", r.b2b);
    assert.match(csv.split("\r\n")[0], /^GSTIN\/UIN of Recipient,Receiver Name,Invoice Number/);
    assert.match(csv, /1999\.00/);
  });
});

describe("GSTR-3B", () => {
  test("domestic in 3.1(a), exports in 3.1(b), unregistered inter-state in 3.2", () => {
    const docs = [
      invoice({ amount: 39900, supplyType: SUPPLY.INTRA, pos: { country: "IN", stateCode: "07" } }),
      invoice({ amount: 69900, supplyType: SUPPLY.INTER, pos: { country: "IN", stateCode: "27" } }),
      invoice({ amount: 500, currency: "USD", supplyType: SUPPLY.EXPORT, pos: { country: "UNITED STATES" }, fx: { rate: 88 } }),
    ];
    const r = buildGstr3b({ documents: docs });
    const a = r["3.1(a) Outward taxable supplies (other than zero rated, nil rated and exempted)"];
    assert.equal(a.taxable, 39900 + 69900);
    assert.equal(a.cgst, 3591);
    assert.equal(a.igst, 12582);
    assert.equal(r["3.1(b) Outward taxable supplies (zero rated)"].igst, 90 * 88);
    assert.deepEqual(r["3.2 Inter-state supplies to unregistered persons"], [{ placeOfSupply: "27-Maharashtra", taxable: 69900, igst: 12582 }]);
  });
});
