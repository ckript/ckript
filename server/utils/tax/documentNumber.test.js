// Tax document numbers: consecutive, ≤ 16 characters, unique per financial year, dated in India.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DOCUMENT_NUMBER_PATTERN,
  financialYearOf,
  formatDocumentNumber,
  istParts,
  periodBounds,
  taxPeriodOf,
} from "./documentNumber.js";

describe("financial year (India time)", () => {
  test("31 March 23:59:59 IST and 1 April 00:00 IST are different years", () => {
    assert.equal(financialYearOf(new Date("2027-03-31T23:59:59+05:30")), "2627");
    assert.equal(financialYearOf(new Date("2027-04-01T00:00:00+05:30")), "2728");
  });
  test("00:30 IST on 1 April is still the NEW year even though it is 31 March in UTC", () => {
    const at = new Date("2027-04-01T00:30:00+05:30");
    assert.equal(at.getUTCDate(), 31);
    assert.equal(financialYearOf(at), "2728");
    assert.deepEqual(istParts(at), { year: 2027, month: 4, day: 1 });
  });
  test("the registration month", () => {
    assert.equal(financialYearOf(new Date("2026-10-04T00:00:00+05:30")), "2627");
  });
});

describe("number format", () => {
  test("CK/2627/000123 is 14 characters and allowed by r.46", () => {
    const n = formatDocumentNumber("CK", "2627", 123);
    assert.equal(n, "CK/2627/000123");
    assert.ok(n.length <= 16);
    assert.match(n, DOCUMENT_NUMBER_PATTERN);
  });
  test("even the largest sequence fits in 16", () => {
    assert.match(formatDocumentNumber("CN", "2627", 999999), DOCUMENT_NUMBER_PATTERN);
  });
});

describe("return periods", () => {
  test("a payment at 00:30 IST on 1 Nov belongs to November", () => {
    assert.equal(taxPeriodOf(new Date("2026-11-01T00:30:00+05:30")), "2026-11");
  });
  test("bounds are IST midnight to IST midnight", () => {
    const { start, end } = periodBounds("2026-10");
    assert.equal(start.toISOString(), "2026-09-30T18:30:00.000Z");
    assert.equal(end.toISOString(), "2026-10-31T18:30:00.000Z");
    assert.equal(periodBounds("2026-13"), null);
  });
});
