// Billing details: what the buyer may enter, and what the tax invoice is addressed to.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeBillingInput, resolveBilling, countryKey, publicBillingProfile } from "./billing.js";

describe("billing input", () => {
  test("an Indian individual needs a state", () => {
    const r = normalizeBillingInput({ country: "India" });
    assert.equal(r.ok, false);
    assert.ok(r.errors.stateCode);
  });

  test("a valid Delhi address is accepted", () => {
    const r = normalizeBillingInput({ country: "India", stateCode: "7", pincode: "110016", name: "Asha" });
    assert.equal(r.ok, true);
    assert.equal(r.billing.stateCode, "07");
  });

  test("a business tax ID must match the selected state", () => {
    const r = normalizeBillingInput({ country: "India", stateCode: "27", businessTaxId: "07AAOCC0556A1ZZ" });
    assert.equal(r.ok, false);
    assert.match(r.errors.gstin, /different state/);
  });

  test("a mistyped business tax ID is refused without the word GST", () => {
    const r = normalizeBillingInput({ country: "India", stateCode: "07", businessTaxId: "07AAOCC0556A1ZY" });
    assert.equal(r.ok, false);
    assert.doesNotMatch(JSON.stringify(r.errors), /GST/);
  });

  test("a business buyer needs a legal name and an address", () => {
    const r = normalizeBillingInput({ type: "business", country: "India", stateCode: "07", businessTaxId: "07AAOCC0556A1ZZ" });
    assert.equal(r.ok, false);
    assert.ok(r.errors.legalName && r.errors.line1);
  });

  test("a foreign buyer needs no state, and cannot add an Indian tax ID", () => {
    assert.equal(normalizeBillingInput({ country: "United States" }).ok, true);
    const r = normalizeBillingInput({ country: "United States", businessTaxId: "07AAOCC0556A1ZZ" });
    assert.equal(r.ok, false);
  });

  test("an unknown country is refused", () => {
    assert.equal(normalizeBillingInput({ country: "Atlantis" }).ok, false);
  });

  test("a 5-digit PIN is refused", () => {
    assert.equal(normalizeBillingInput({ country: "India", stateCode: "07", pincode: "11001" }).ok, false);
  });
});

describe("which details a purchase uses", () => {
  test("saved billing details win over the profile address", () => {
    const { billing } = resolveBilling({
      name: "Asha",
      billingProfile: { country: "India", stateCode: "27", gstin: "" },
      address: { country: "India", state: "Delhi" },
    });
    assert.equal(billing.country, "IN");
    assert.equal(billing.stateCode, "27");
  });

  test("with nothing saved, the profile address is the evidence", () => {
    const { billing, profile } = resolveBilling({ name: "Asha", address: { country: "India", state: "New Delhi" } });
    assert.equal(billing.country, "");
    assert.deepEqual(profile, { country: "IN", stateCode: "07" });
  });

  test("India in any spelling", () => {
    for (const v of ["India", "IN", "india", "IND", "Bharat"]) assert.equal(countryKey(v), "IN");
  });

  test("the public view never says GST", () => {
    const view = publicBillingProfile({ billingProfile: { country: "India", stateCode: "07", gstin: "07AAOCC0556A1ZZ" } });
    assert.equal(view.businessTaxId, "07AAOCC0556A1ZZ");
    assert.doesNotMatch(JSON.stringify(Object.keys(view)), /gst/i);
  });
});
