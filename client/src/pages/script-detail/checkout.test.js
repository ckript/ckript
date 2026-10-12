// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api from "../../services/api";
import {
  assertAcceptances,
  CHECKOUT_STANDING,
  createPurchaseOrder,
  confirmFreeAccess,
  describeCheckoutStanding,
  describeOrderCharge,
  describePaymentWindow,
  forgetPendingCharge,
  getCheckoutPricing,
  getPurchasePricing,
  PENDING_CHARGE_TTL_MS,
  purchaseFileName,
  readOrderPricing,
  readPendingCharge,
  rememberPendingCharge,
  verifyPurchase,
} from "./checkout";

vi.mock("../../services/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const industry = { industry: true };
const owner = { owner: true, industry: true };

const approved = (extra = {}) => ({
  _id: "req-1",
  status: "approved",
  amount: 240000,
  paymentDueAt: new Date("2026-08-21T12:00:00.000Z").toISOString(),
  ...extra,
});

const NOW = new Date("2026-08-20T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  forgetPendingCharge();
});

afterEach(() => forgetPendingCharge());

describe("pricing", () => {
  it("matches the server's arithmetic and rounding", () => {
    // getScriptPurchasePricing rounds the tax before adding it, so 249.99 * 0.05 = 12.4995 -> 12.50.
    expect(getPurchasePricing(249.99)).toEqual({
      baseAmount: 249.99,
      platformFeeRate: 0.05,
      platformFeePercent: 5,
      platformFeeAmount: 12.5,
      totalAmount: 262.49,
    });
  });

  it("prices the approved request, not the list price, when the two differ", () => {
    const script = { price: 300000, myPendingRequest: { amount: 240000 } };
    expect(getCheckoutPricing(script).baseAmount).toBe(240000);
    expect(getCheckoutPricing({ price: 300000 }).baseAmount).toBe(300000);
  });

  it("never prices a negative amount", () => {
    expect(getPurchasePricing(-500).totalAmount).toBe(0);
  });

  it("prefers the server's pricing over the local estimate once an order exists", () => {
    const server = { pricing: { baseAmount: 1000, platformFeeAmount: 50, totalAmount: 1050, platformFeeRate: 0.05, platformFeePercent: 5 } };
    expect(readOrderPricing(server, 999).totalAmount).toBe(1050);
    expect(readOrderPricing({}, 1000).totalAmount).toBe(1050);
  });
});

describe("describeOrderCharge", () => {
  it("stays silent about currency when the gateway charges rupees", () => {
    const charge = describeOrderCharge({ currency: "INR", amount: 25200000 });
    expect(charge.isForeign).toBe(false);
    // en-IN grouping, which is the point of formatting through the shared currency util.
    expect(charge.label).toContain("2,52,000");
  });

  it("reads the buyer's own currency back from the created order (DEF-31)", () => {
    const charge = describeOrderCharge({ currency: "USD", amount: 302400, fxRate: 83.3 });
    expect(charge.isForeign).toBe(true);
    expect(charge.currency).toBe("USD");
    expect(charge.label).toContain("3,024");
    expect(charge.fxRate).toBe(83.3);
  });

  it("carries the gateway's INR fallback", () => {
    expect(describeOrderCharge({ currency: "INR", amount: 100, fellBackToINR: true }).fellBackToINR).toBe(true);
  });
});

describe("describePaymentWindow", () => {
  it("says nothing when the server sent no deadline", () => {
    expect(describePaymentWindow(null, NOW)).toEqual({ due: null, expired: false, note: "" });
  });

  it("counts down in hours inside a day and in days beyond one", () => {
    expect(describePaymentWindow(new Date("2026-08-20T15:00:00.000Z"), NOW).note).toContain("3 hours left");
    expect(describePaymentWindow(new Date("2026-08-22T12:00:00.000Z"), NOW).note).toContain("2 days left");
  });

  it("uses minutes in the last hour, because an hour is not a useful unit then", () => {
    expect(describePaymentWindow(new Date("2026-08-20T12:20:00.000Z"), NOW).note).toContain("20 minutes left");
  });

  it("reports an elapsed window as expired and in the past tense", () => {
    const window = describePaymentWindow(new Date("2026-08-19T12:00:00.000Z"), NOW);
    expect(window.expired).toBe(true);
    expect(window.note).toContain("closed");
  });
});

describe("describeCheckoutStanding", () => {
  const standing = (script, capabilities = industry) => describeCheckoutStanding({ script, capabilities, now: NOW });

  it("asks the server's questions in the server's order", () => {
    // Owner beats everything: the server refuses "you cannot purchase your own script" before it
    // looks at requests, price or availability.
    expect(standing({ myPendingRequest: approved(), isUnlocked: true }, owner).id).toBe(CHECKOUT_STANDING.OWN_PROJECT);
    // Already-purchased beats the role gate, so a buyer whose role later changed still reads truth.
    expect(standing({ isUnlocked: true }, { industry: false }).id).toBe(CHECKOUT_STANDING.OWNED);
    // Sold beats "no request": there is no point sending one.
    expect(standing({ isSold: true }).id).toBe(CHECKOUT_STANDING.SOLD);
  });

  it("names the payable state and keeps the deadline beside it rather than inside it", () => {
    const result = standing({ myPendingRequest: approved() });
    expect(result.id).toBe(CHECKOUT_STANDING.PAYABLE);
    expect(result.canPay).toBe(true);
    expect(result.pricing.totalAmount).toBe(252000);
    // Separate, so a screen that also prints it beside the amount does not print it twice.
    expect(result.note).not.toContain("Pay by");
    expect(result.window.note).toContain("Pay by");
  });

  it("refuses an approved request whose 72-hour window has closed", () => {
    const result = standing({ myPendingRequest: approved({ paymentDueAt: "2026-08-19T12:00:00.000Z" }) });
    expect(result.id).toBe(CHECKOUT_STANDING.EXPIRED);
    expect(result.canPay).toBe(false);
    expect(result.note).toContain("new purchase request");
  });

  it("treats a released payment as owned even when the project payload lags", () => {
    expect(standing({ myPendingRequest: approved({ paymentStatus: "released" }) }).id).toBe(CHECKOUT_STANDING.OWNED);
  });

  it("separates a free unlock from a payment", () => {
    const result = standing({ price: 0, myPendingRequest: approved({ amount: 0 }) });
    expect(result.id).toBe(CHECKOUT_STANDING.FREE);
    expect(result.canPay).toBe(true);
  });

  it("explains a pending request and a missing one differently", () => {
    expect(standing({ myPendingRequest: { status: "pending" } }).id).toBe(CHECKOUT_STANDING.PENDING);
    expect(standing({}).id).toBe(CHECKOUT_STANDING.NO_REQUEST);
  });

  it("gives every standing words, and only the two payable ones a way to pay", () => {
    const cases = [
      [{ myPendingRequest: approved() }, industry],
      [{ isUnlocked: true }, industry],
      [{ isSold: true }, industry],
      [{}, industry],
      [{}, { industry: false }],
      [{ myPendingRequest: { status: "pending" } }, industry],
      [{ myPendingRequest: approved({ paymentDueAt: "2026-08-19T12:00:00.000Z" }) }, industry],
      [{}, owner],
    ];
    const payable = [];
    cases.forEach(([script, capabilities]) => {
      const result = describeCheckoutStanding({ script, capabilities, now: NOW });
      expect(result.headline.length).toBeGreaterThan(0);
      expect(result.note.length).toBeGreaterThan(0);
      if (result.canPay) payable.push(result.id);
    });
    expect(payable).toEqual([CHECKOUT_STANDING.PAYABLE]);
  });
});

describe("assertAcceptances", () => {
  it("asks for the platform and writer terms first, together", () => {
    expect(assertAcceptances({ acceptances: {}, script: {} })).toContain("Platform and Writer");
  });

  it("asks for the rights summary next", () => {
    expect(assertAcceptances({ acceptances: { platform: true, writer: true }, script: {} }))
      .toContain("rights and licensing");
  });

  it("only asks for the writer's own conditions when the writer wrote any", () => {
    const ticked = { platform: true, writer: true, rights: true };
    expect(assertAcceptances({ acceptances: ticked, script: {} })).toBe("");
    expect(assertAcceptances({ acceptances: ticked, script: { legal: { customInvestorTerms: "Credit me." } } }))
      .toContain("own conditions");
  });
});

describe("the three requests", () => {
  it("refuses to create an order before the boxes are ticked, without a round trip", async () => {
    const result = await createPurchaseOrder({ scriptId: "p1", acceptances: {}, script: {} });
    expect(result.ok).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("sends the currency it displayed (DEF-31) and the recorded acceptances", async () => {
    api.post.mockResolvedValueOnce({ data: { orderId: "order_1" } });
    await createPurchaseOrder({
      scriptId: "p1",
      acceptances: { platform: true, writer: true, rights: true, custom: true },
      script: { legal: { customInvestorTerms: "Credit me." } },
      currency: "usd",
    });
    expect(api.post).toHaveBeenCalledWith("/scripts/purchase/create-order", expect.objectContaining({
      scriptId: "p1",
      acceptedCustomWriterTerms: true,
      acceptedLegalDisclaimer: true,
      currency: "USD",
    }));
  });

  it("never claims a custom-terms acceptance the project has no custom terms for", async () => {
    api.post.mockResolvedValueOnce({ data: {} });
    await createPurchaseOrder({
      scriptId: "p1",
      acceptances: { platform: true, writer: true, rights: true, custom: true },
      script: {},
    });
    expect(api.post.mock.calls[0][1].acceptedCustomWriterTerms).toBe(false);
  });

  it("treats a 200 with success:false as a refusal, not as an unlock", async () => {
    api.post.mockResolvedValueOnce({ data: { success: false, message: "Invalid signature" } });
    const result = await verifyPurchase({ scriptId: "p1", payment: { razorpay_payment_id: "pay_1" } });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Invalid signature");
  });

  it("keeps the server's own sentence on a refusal", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 410, data: { message: "Payment window expired for this approved request." } } });
    const result = await confirmFreeAccess({ scriptId: "p1" });
    expect(result.status).toBe(410);
    expect(result.message).toContain("window expired");
  });
});

describe("the charge that was taken but never verified (DEF-32)", () => {
  const payment = { razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", razorpay_signature: "sig" };

  it("records a payment and reads it back for the same project and buyer", () => {
    rememberPendingCharge({ scriptId: "p1", userId: "u1", title: "The Monsoon Archive", payment });
    expect(readPendingCharge({ scriptId: "p1", userId: "u1" }).payment.razorpay_payment_id).toBe("pay_1");
  });

  it("does not offer one buyer's charge to another, or one project's to another", () => {
    rememberPendingCharge({ scriptId: "p1", userId: "u1", payment });
    expect(readPendingCharge({ scriptId: "p1", userId: "u2" })).toBeNull();
    expect(readPendingCharge({ scriptId: "p2", userId: "u1" })).toBeNull();
  });

  it("refuses to record a payment with no payment id", () => {
    expect(rememberPendingCharge({ scriptId: "p1", userId: "u1", payment: {} })).toBe(false);
    expect(readPendingCharge({ scriptId: "p1", userId: "u1" })).toBeNull();
  });

  it("expires a record nobody came back for, and clears it", () => {
    rememberPendingCharge({ scriptId: "p1", userId: "u1", payment, at: Date.now() - PENDING_CHARGE_TTL_MS - 1 });
    expect(readPendingCharge({ scriptId: "p1", userId: "u1" })).toBeNull();
    expect(localStorage.getItem("ckript.pendingScriptCharge")).toBeNull();
  });

  it("survives unreadable storage instead of throwing into the screen", () => {
    localStorage.setItem("ckript.pendingScriptCharge", "{not json");
    expect(readPendingCharge({ scriptId: "p1", userId: "u1" })).toBeNull();
  });
});

describe("purchaseFileName", () => {
  it("makes a writer-authored title safe without losing it", () => {
    expect(purchaseFileName("The Monsoon Archive: Part 2!", "invoice")).toBe("The_Monsoon_Archive_Part_2_invoice.pdf");
  });

  it("falls back rather than producing a nameless file", () => {
    expect(purchaseFileName("!!!", "invoice")).toBe("screenplay_invoice.pdf");
  });
});
