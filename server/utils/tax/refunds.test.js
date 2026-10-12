// How much a refund sends back. The models are stubbed — this pins the amount rules, not the database.
import { test, describe, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import LedgerEntry from "../../models/LedgerEntry.js";
import Invoice from "../../models/Invoice.js";
import { refundPayment } from "./refunds.js";

/** A stand-in for a Mongoose query: awaitable, and chainable through select()/lean(). */
const query = (value) => {
  const q = { select: () => q, lean: async () => value, then: (ok, ko) => Promise.resolve(value).then(ok, ko) };
  return q;
};

const fakeRazorpay = () => {
  const calls = [];
  return {
    calls,
    payments: {
      refund: async (paymentId, body) => {
        calls.push({ paymentId, ...body });
        return { id: `rfnd_${calls.length}`, amount: body.amount, currency: "INR" };
      },
    },
  };
};

/** Books: the original payment (or none), its earlier refunds, and no tax invoice. */
const stubBooks = ({ original = null, priorRefunds = [] } = {}) => {
  const created = [];
  mock.method(LedgerEntry, "findOne", (filter) => query(filter.settlement === "paid" ? original : null));
  mock.method(LedgerEntry, "find", () => query(priorRefunds));
  mock.method(LedgerEntry, "create", async (doc) => { created.push(doc); return { _id: "rev_1", ...doc }; });
  mock.method(Invoice, "findOne", () => query(null));
  return created;
};

afterEach(() => mock.restoreAll());

describe("refundPayment — the amount", () => {
  const booked = { _id: "led_1", providerPaymentId: "pay_1", settlement: "paid", amountMinor: 47082, currency: "INR", creatorPayoutMinor: 0 };

  test("a booked payment refunds what remains after earlier refunds, taxes included", async () => {
    const created = stubBooks({ original: booked, priorRefunds: [{ amountMinor: -10000 }] });
    const razorpay = fakeRazorpay();
    const result = await refundPayment({ razorpay, paymentId: "pay_1", fallbackAmountMinor: 99999, reason: "test" });
    assert.equal(result.ok, true);
    assert.equal(result.amountMinor, 37082, "the fallback never applies to a booked payment");
    assert.deepEqual(razorpay.calls.map((c) => c.amount), [37082]);
    assert.equal(created.length, 1, "a reversal is written against the original");
    assert.equal(result.taxMinor, 0, "no tax invoice on file, so no taxes are reversed");
  });

  test("never refunds more than remains", async () => {
    stubBooks({ original: booked, priorRefunds: [{ amountMinor: -40000 }] });
    const razorpay = fakeRazorpay();
    const result = await refundPayment({ razorpay, paymentId: "pay_1", amountMinor: 10000 });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(razorpay.calls.length, 0);
  });

  test("a payment that is not on the books is refused without a fallback amount", async () => {
    stubBooks();
    const razorpay = fakeRazorpay();
    const result = await refundPayment({ razorpay, paymentId: "pay_old" });
    assert.equal(result.ok, false);
    assert.equal(razorpay.calls.length, 0);
  });

  test("a payment from before the ledger refunds the fallback amount and invents no reversal", async () => {
    const created = stubBooks();
    const razorpay = fakeRazorpay();
    const result = await refundPayment({ razorpay, paymentId: "pay_old", fallbackAmountMinor: 39900, reason: "denied" });
    assert.equal(result.ok, true);
    assert.deepEqual(razorpay.calls.map((c) => c.amount), [39900]);
    assert.equal(created.length, 0);
  });
});
