// A checkout callback must be the payment for THIS purchase, not merely a genuine payment.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateCapturedOrder } from "./razorpayCapture.js";

const order = (over = {}) => ({
  id: "order_1",
  amount: 1239000,
  amount_paid: 1239000,
  currency: "INR",
  status: "paid",
  notes: { type: "script_purchase_after_approval", userId: "u1", scriptId: "s1", fxRate: "88" },
  ...over,
});
const payment = (over = {}) => ({
  id: "pay_1",
  order_id: "order_1",
  amount: 1239000,
  currency: "INR",
  status: "captured",
  created_at: 1791662700,
  fee: 24780,
  tax: 4460,
  ...over,
});
const check = (o = {}, p = {}, extra = {}) => validateCapturedOrder({
  order: order(o),
  payment: payment(p),
  orderId: "order_1",
  paymentId: "pay_1",
  expectNotes: { type: "script_purchase_after_approval", userId: "u1", scriptId: "s1" },
  ...extra,
});

describe("what a verifier must refuse", () => {
  test("a genuine payment for another purchase (the ₹98 competition replay)", () => {
    const r = check({ notes: { purpose: "competition_registration", userId: "u1" } });
    assert.equal(r.ok, false);
    assert.match(r.message, /does not belong/);
  });
  test("another user's order", () => {
    assert.equal(check({ notes: { type: "script_purchase_after_approval", userId: "u2", scriptId: "s1" } }).ok, false);
  });
  test("a payment for a different order", () => {
    assert.equal(check({}, { order_id: "order_2" }).ok, false);
  });
  test("an amount other than what the server priced", () => {
    assert.equal(check({}, {}, { expectedAmountMinor: 1050000 }).ok, false);
  });
  test("an order not yet paid is pending, not rejected", () => {
    const r = check({ status: "attempted", amount_paid: 0 });
    assert.equal(r.ok, false);
    assert.equal(r.pending, true);
  });
  test("an authorised-but-uncaptured payment is pending", () => {
    assert.equal(check({}, { status: "authorized" }).pending, true);
  });
  test("a currency mismatch", () => {
    assert.equal(check({}, { currency: "USD" }).ok, false);
  });
});

describe("what it records", () => {
  test("the captured amount, gateway fee and the tax on it", () => {
    const r = check({}, {}, { expectedAmountMinor: 1239000 });
    assert.equal(r.ok, true);
    assert.equal(r.charge.amountMinor, 1239000);
    assert.equal(r.charge.fee, 24780);
    assert.equal(r.charge.feeTax, 4460);
  });
  test("an INR charge has an FX rate of 1 even when the notes carry the USD rate", () => {
    // The order fell back from USD to INR; its notes still say 88. That is not the rate of an INR charge.
    assert.equal(check().charge.fxRate, 1);
  });
  test("a USD charge keeps its rate", () => {
    const r = check({ currency: "USD", amount: 14080, amount_paid: 14080 }, { currency: "USD", amount: 14080 });
    assert.equal(r.charge.fxRate, 88);
  });
});
