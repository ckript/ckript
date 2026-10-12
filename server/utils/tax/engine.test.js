// The tax engine: every amount a buyer pays, and every figure on a tax invoice, comes from here.
//
// The fixtures are the founder's confirmed prices (GST_BILLING_PROMPT.md §2.2): listed pre-tax, 18%
// added at checkout, on the full amount, for every buyer including foreign ones.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SUPPLY,
  allocate,
  amountInWords,
  buildTaxSnapshot,
  carveOutTax,
  classifySupply,
  computeTax,
  publicBreakdown,
  resolvePlaceOfSupply,
  scaleSnapshot,
  validateGstin,
} from "./engine.js";

const RATE = 1800;
const SUPPLIER = { legalName: "CKRIPT PRIVATE LIMITED", gstin: "07AAOCC0556A1ZZ", stateCode: "07" };

describe("taxes added at checkout (exclusive)", () => {
  const cases = [
    ["Writer Silver monthly ₹399", 39900, 7182, 47082, [3591, 3591]],
    ["Writer Gold monthly ₹699", 69900, 12582, 82482, [6291, 6291]],
    ["FIP monthly ₹1,999", 199900, 35982, 235882, [17991, 17991]],
    ["Writer Silver annual ₹4,070", 407000, 73260, 480260, [36630, 36630]],
    ["Writer Gold annual ₹7,130", 713000, 128340, 841340, [64170, 64170]],
    ["FIP annual ₹20,390", 2039000, 367020, 2406020, [183510, 183510]],
    ["Competition entry ₹98", 9800, 1764, 11564, [882, 882]],
    ["Script ₹10,000 + 5% fee", 1050000, 189000, 1239000, [94500, 94500]],
    ["Consultation ₹8,000", 800000, 144000, 944000, [72000, 72000]],
    ["Writer Silver USD $5", 500, 90, 590, [45, 45]],
    ["FIP USD $25", 2500, 450, 2950, [225, 225]],
  ];
  for (const [label, taxable, tax, gross, [cgst, sgst]] of cases) {
    test(label, () => {
      const intra = computeTax({ taxableMinor: taxable, rateBps: RATE, intra: true });
      assert.deepEqual(
        [intra.taxableMinor, intra.taxMinor, intra.cgstMinor, intra.sgstMinor, intra.igstMinor, intra.grossMinor],
        [taxable, tax, cgst, sgst, 0, gross],
      );
      const inter = computeTax({ taxableMinor: taxable, rateBps: RATE, intra: false });
      assert.equal(inter.igstMinor, tax);
      assert.equal(inter.grossMinor, gross, "a buyer in another state must pay the same total");
    });
  }

  test("₹399 is shown as ₹470.82", () => {
    assert.equal(computeTax({ taxableMinor: 39900, rateBps: RATE, intra: false }).grossMinor, 47082);
  });

  test("1 paise carries no tax and never goes negative", () => {
    assert.deepEqual(computeTax({ taxableMinor: 1, rateBps: RATE, intra: true }).grossMinor, 1);
    assert.equal(computeTax({ taxableMinor: -500, rateBps: RATE, intra: true }).grossMinor, 0);
  });
});

describe("taxes carved out of what was already paid (the 4 Oct → cut-over back-fill)", () => {
  test("₹399 paid → 338.14 taxable + 60.86 taxes", () => {
    const r = carveOutTax({ grossMinor: 39900, rateBps: RATE, intra: true });
    assert.deepEqual([r.taxableMinor, r.taxMinor, r.cgstMinor, r.sgstMinor], [33814, 6086, 3043, 3043]);
  });
  test("an odd tax splits CGST/SGST by floor/ceil", () => {
    const r = carveOutTax({ grossMinor: 69900, rateBps: RATE, intra: true });
    assert.deepEqual([r.taxableMinor, r.cgstMinor, r.sgstMinor], [59237, 5331, 5332]);
  });
  test("₹98 paid", () => {
    const r = carveOutTax({ grossMinor: 9800, rateBps: RATE, intra: true });
    assert.deepEqual([r.taxableMinor, r.cgstMinor, r.sgstMinor], [8305, 747, 748]);
  });
});

describe("the invariant: taxable + CGST + SGST + IGST === total, always", () => {
  // Deterministic pseudo-random so a failure is reproducible.
  let seed = 42;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  test("10,000 amounts × both modes × both splits", () => {
    for (let i = 0; i < 10000; i += 1) {
      const amount = 1 + Math.floor(rand() * 1e8);
      for (const intra of [true, false]) {
        for (const r of [computeTax({ taxableMinor: amount, rateBps: RATE, intra }), carveOutTax({ grossMinor: amount, rateBps: RATE, intra })]) {
          assert.equal(r.taxableMinor + r.cgstMinor + r.sgstMinor + r.igstMinor, r.grossMinor, `amount ${amount}`);
          assert.ok(r.taxMinor >= 0 && r.taxableMinor >= 0);
          assert.ok(Number.isInteger(r.grossMinor) && Number.isInteger(r.taxMinor));
        }
      }
    }
  });
});

describe("allocation", () => {
  test("parts are integers that sum exactly", () => {
    const parts = allocate(189000, [1000000, 50000]);
    assert.equal(parts.reduce((a, b) => a + b, 0), 189000);
    assert.deepEqual(parts, [180000, 9000]);
  });
  test("odd totals still sum", () => {
    const parts = allocate(7, [1, 1, 1]);
    assert.equal(parts.reduce((a, b) => a + b, 0), 7);
  });
  test("zero weights put everything on the first line", () => {
    assert.deepEqual(allocate(5, [0, 0]), [5, 0]);
  });
});

describe("business tax ID (GSTIN)", () => {
  test("Ckript's own GSTIN is valid", () => {
    const r = validateGstin("07AAOCC0556A1ZZ");
    assert.equal(r.valid, true);
    assert.equal(r.stateCode, "07");
    assert.equal(r.pan, "AAOCC0556A");
  });

  test("every single-character mutation is rejected", () => {
    const good = "07AAOCC0556A1ZZ";
    const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (let i = 0; i < good.length; i += 1) {
      for (const ch of alphabet) {
        if (ch === good[i]) continue;
        const mutated = good.slice(0, i) + ch + good.slice(i + 1);
        // The 14th character is the fixed "Z" and any change breaks the format; others break the checksum.
        assert.equal(validateGstin(mutated).valid, false, `${mutated} should be invalid`);
      }
    }
  });

  test("lower case and spaces are normalised", () => {
    assert.equal(validateGstin(" 07aaocc0556a1zz ").valid, true);
  });

  test("an unknown state code is rejected when the caller supplies the table", () => {
    assert.equal(validateGstin("07AAOCC0556A1ZZ", { knownStateCode: () => false }).reason, "state");
  });
});

describe("place of supply decides the split, never the amount", () => {
  const pos = (args) => resolvePlaceOfSupply({ supplierStateCode: "07", ...args });
  const type = (p, isSez = false) => classifySupply({ placeOfSupply: p, supplierStateCode: "07", isSez });

  test("Delhi buyer → CGST + SGST", () => {
    assert.equal(type(pos({ billing: { country: "IN", stateCode: "07" } })), SUPPLY.INTRA);
  });
  test("Maharashtra buyer → IGST", () => {
    assert.equal(type(pos({ billing: { country: "IN", stateCode: "27" } })), SUPPLY.INTER);
  });
  test("a business tax ID's state wins", () => {
    const p = pos({ billing: { country: "IN", stateCode: "29", gstinStateCode: "29" } });
    assert.equal(p.basis, "business_tax_id");
    assert.equal(type(p), SUPPLY.INTER);
    assert.equal(type(pos({ billing: { country: "IN", gstinStateCode: "07" } })), SUPPLY.INTRA);
  });
  test("SEZ business buyer → IGST", () => {
    assert.equal(type(pos({ billing: { country: "IN", stateCode: "27", gstinStateCode: "27" } }), true), SUPPLY.SEZ);
  });
  test("foreign buyer → export on payment of IGST (not zero-rated)", () => {
    const p = pos({ billing: { country: "UNITED STATES" } });
    assert.equal(p.country, "UNITED STATES");
    assert.equal(type(p), SUPPLY.EXPORT);
  });
  test("no address on record → the supplier's own state", () => {
    const p = pos({});
    assert.equal(p.basis, "supplier_location_fallback");
    assert.equal(type(p), SUPPLY.INTRA);
  });
  test("the profile address is used when no billing details were given", () => {
    assert.equal(type(pos({ profile: { country: "IN", stateCode: "33" } })), SUPPLY.INTER);
  });
  test("declared abroad but the IP says India is flagged for review, not blocked", () => {
    const p = pos({ billing: { country: "UNITED KINGDOM" }, geoCountry: "IN" });
    assert.equal(p.needsReview, true);
    assert.equal(type(p), SUPPLY.EXPORT);
  });
});

describe("snapshots", () => {
  const scriptLines = [
    { kind: "script_price", description: "Screenplay rights", sac: "997336", amountMinor: 1000000 },
    { kind: "script_platform_fee", description: "Platform fee", sac: "998599", amountMinor: 50000 },
  ];

  test("tax is on the FULL amount, and each column sums to its total", () => {
    const s = buildTaxSnapshot({
      lines: scriptLines, currency: "INR", rateBps: RATE, mode: "exclusive", supplyType: SUPPLY.INTER,
      placeOfSupply: { country: "IN", stateCode: "27" }, supplier: SUPPLIER,
    });
    assert.equal(s.totals.grossMinor, 1239000);
    assert.equal(s.lines.reduce((a, l) => a + l.igstMinor, 0), s.totals.igstMinor);
    assert.equal(s.lines.reduce((a, l) => a + l.totalMinor, 0), s.totals.grossMinor);
    assert.equal(s.lines[1].taxMinor, 9000, "the fee carries its 18% too");
  });

  test("an export says so on the document", () => {
    const s = buildTaxSnapshot({
      lines: [{ kind: "plan_writer_silver", amountMinor: 500 }], currency: "USD", rateBps: RATE,
      supplyType: SUPPLY.EXPORT, placeOfSupply: { country: "UNITED STATES" }, supplier: SUPPLIER,
      fx: { rate: 88, source: "test", date: new Date() },
    });
    assert.equal(s.totals.grossMinor, 590);
    assert.match(s.exportDeclaration, /export on payment of IGST/);
    assert.equal(s.inr.grossMinor, 590 * 88);
  });

  test("no consideration carries no tax", () => {
    const s = buildTaxSnapshot({
      lines: [{ kind: "script_price", amountMinor: 0 }], rateBps: RATE, supplyType: SUPPLY.NO_CONSIDERATION, supplier: SUPPLIER,
    });
    assert.equal(s.totals.taxMinor, 0);
    assert.equal(s.rateBps, 0);
  });

  test("the client breakdown says Taxes, never GST", () => {
    const s = buildTaxSnapshot({
      lines: [{ kind: "plan_writer_silver", description: "Writer Silver plan", amountMinor: 39900 }], rateBps: RATE,
      supplyType: SUPPLY.INTRA, placeOfSupply: { country: "IN", stateCode: "07" }, supplier: SUPPLIER,
    });
    const b = publicBreakdown(s);
    assert.equal(b.taxLabel, "Taxes (18%)");
    assert.equal(b.subtotalMinor, 39900);
    assert.equal(b.taxMinor, 7182);
    assert.equal(b.totalMinor, 47082);
    assert.doesNotMatch(JSON.stringify(b), /GST/);
  });

  test("a partial refund scales every column without exceeding the original", () => {
    const s = buildTaxSnapshot({
      lines: scriptLines, rateBps: RATE, supplyType: SUPPLY.INTRA, placeOfSupply: { country: "IN", stateCode: "07" }, supplier: SUPPLIER,
    });
    const half = scaleSnapshot(s, 619500);
    const t = half.totals;
    assert.equal(t.taxableMinor + t.cgstMinor + t.sgstMinor + t.igstMinor, 619500);
    assert.equal(half.lines.reduce((a, l) => a + l.totalMinor, 0), 619500);
    assert.equal(scaleSnapshot(s, 99999999).totals.grossMinor, s.totals.grossMinor, "never more than charged");
  });
});

describe("amount in words", () => {
  test("Indian numbering", () => {
    assert.equal(amountInWords(47082), "Rupees Four Hundred Seventy and Eighty Two Paise Only");
    assert.equal(amountInWords(1239000), "Rupees Twelve Thousand Three Hundred Ninety Only");
    assert.equal(amountInWords(2406020), "Rupees Twenty Four Thousand Sixty and Twenty Paise Only");
    assert.equal(amountInWords(1500000000), "Rupees One Crore Fifty Lakh Only");
  });
  test("dollars", () => {
    assert.equal(amountInWords(590, "USD"), "US Dollars Five and Ninety Cents Only");
  });
});
