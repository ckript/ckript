// @vitest-environment happy-dom
//
// Recurring plan checkout: the Razorpay sheet opens on a SUBSCRIPTION (never an order or a client
// amount), a server that can't take a mandate falls back to a one-time sale, and the settings wording
// says plainly whether a plan renews.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api from "../services/api";
import {
  openRecurringPlanCheckout,
  planBillingView,
  recurringStateOf,
  renewsAutomatically,
} from "./planSubscriptionCheckout";

vi.mock("../services/api", () => ({ default: { post: vi.fn(), get: vi.fn() } }));

const DAY = 24 * 60 * 60 * 1000;
const future = (days) => new Date(Date.now() + days * DAY).toISOString();

const userWith = (subscription) => ({ name: "Asha", email: "asha@example.com", subscription });

/* A stand-in for window.Razorpay that records its options and lets the test
   decide whether the member pays or closes the sheet. */
let lastOptions = null;
class FakeRazorpay {
  constructor(options) {
    lastOptions = options;
  }
  open() {}
}

beforeEach(() => {
  vi.clearAllMocks();
  lastOptions = null;
  window.Razorpay = FakeRazorpay;
});

afterEach(() => {
  delete window.Razorpay;
});

describe("recurring state", () => {
  it("treats only a renewing Razorpay status as auto-renew", () => {
    const base = { accessTier: "writer_gold", recurring: { autoRenew: true, status: "active" } };
    expect(recurringStateOf(userWith(base)).autoRenew).toBe(true);
    expect(recurringStateOf(userWith({ ...base, recurring: { autoRenew: true, status: "halted" } })).autoRenew).toBe(false);
    expect(recurringStateOf(userWith({ ...base, recurring: { autoRenew: false, status: "active" } })).autoRenew).toBe(false);
  });

  it("knows which tier renews", () => {
    const user = userWith({ accessTier: "writer_gold", recurring: { autoRenew: true, status: "active" } });
    expect(renewsAutomatically(user, "writer_gold")).toBe(true);
    expect(renewsAutomatically(user, "writer_silver")).toBe(false);
  });

  it("defaults an account with no recurring data to one-time billing", () => {
    expect(recurringStateOf(userWith({})).billingMode).toBe("one_time");
    expect(recurringStateOf(null).autoRenew).toBe(false);
  });
});

describe("plan & billing wording", () => {
  it("describes an auto-renewing plan with its next charge", () => {
    const view = planBillingView(
      userWith({
        accessTier: "writer_gold",
        accessStatus: "active",
        accessExpiresAt: future(20),
        billingMode: "recurring",
        recurring: { autoRenew: true, status: "active", cycle: "monthly", amountMinor: 69900, currency: "INR", nextChargeAt: future(20) },
      }),
    );
    expect(view.paid).toBe(true);
    expect(view.renewing).toBe(true);
    expect(view.title).toBe("Writer Gold · monthly");
    expect(view.description).toMatch(/^Renews automatically on /);
    expect(view.description).toContain("699");
  });

  it("flags a failing renewal so the member can fix their payment method", () => {
    const view = planBillingView(
      userWith({
        accessTier: "writer_silver",
        accessStatus: "active",
        accessExpiresAt: future(2),
        recurring: { autoRenew: true, status: "pending" },
      }),
    );
    expect(view.failing).toBe(true);
    expect(view.description).toMatch(/didn't go through/);
  });

  it("says when a one-time or cancelled plan ends, and offers auto-renew", () => {
    const oneTime = planBillingView(userWith({ accessTier: "writer_silver", accessStatus: "active", accessExpiresAt: future(5) }));
    expect(oneTime.renewing).toBe(false);
    expect(oneTime.description).toMatch(/^One-time purchase · access until /);
    expect(oneTime.actionLabel).toBe("Turn on auto-renew");

    const cancelled = planBillingView(
      userWith({
        accessTier: "writer_silver",
        accessStatus: "active",
        accessExpiresAt: future(5),
        billingMode: "recurring",
        recurring: { autoRenew: false, status: "cancelled", cancelAtPeriodEnd: true },
      }),
    );
    expect(cancelled.description).toMatch(/^Auto-renew is off · access until /);
  });

  it("does not treat the free FIP tier or a lapsed plan as paid", () => {
    expect(planBillingView(userWith({ accessTier: "film_industry_professional", accessStatus: "active", plan: "free" })).paid).toBe(false);
    expect(planBillingView(userWith({ accessTier: "writer_gold", accessStatus: "active", accessExpiresAt: future(-1) })).paid).toBe(false);
  });
});

describe("recurring checkout", () => {
  const created = {
    subscriptionId: "sub_123",
    key: "rzp_test_key",
    amount: 69900,
    currency: "INR",
    description: "Writer Gold — renews monthly",
  };

  it("falls back to a one-time purchase when the server can't take a mandate", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 503, data: { code: "RECURRING_UNAVAILABLE", message: "not now" } } });
    const result = await openRecurringPlanCheckout({ plan: "gold", accessTier: "writer_gold", user: userWith({}) });
    expect(result).toEqual({ outcome: "fallback", message: "not now" });
  });

  it("rethrows a real error (e.g. already subscribed) instead of silently falling back", async () => {
    const conflict = { response: { status: 409, data: { code: "ALREADY_SUBSCRIBED", message: "already" } } };
    api.post.mockRejectedValueOnce(conflict);
    await expect(openRecurringPlanCheckout({ plan: "gold", accessTier: "writer_gold", user: userWith({}) })).rejects.toBe(conflict);
  });

  it("opens Razorpay with the subscription — never an order or an amount", async () => {
    api.post.mockResolvedValueOnce({ data: created });
    const pending = openRecurringPlanCheckout({ plan: "gold", accessTier: "writer_gold", cycle: "monthly", user: userWith({}) });
    await vi.waitFor(() => expect(lastOptions).not.toBeNull());
    expect(api.post).toHaveBeenCalledWith("/payment/subscriptions", { plan: "gold", cycle: "monthly", currency: "INR" });
    expect(lastOptions.subscription_id).toBe("sub_123");
    expect(lastOptions.order_id).toBeUndefined();
    expect(lastOptions.amount).toBeUndefined();
    expect(lastOptions.key).toBe("rzp_test_key");
    lastOptions.modal.ondismiss();
    await expect(pending).resolves.toEqual({ outcome: "dismissed" });
  });

  it("verifies the payment with the subscription id and resolves with the refreshed account", async () => {
    api.post
      .mockResolvedValueOnce({ data: created })
      .mockResolvedValueOnce({ status: 200, data: { status: "active", user: { _id: "u1" } } });
    const pending = openRecurringPlanCheckout({ plan: "gold", accessTier: "writer_gold", user: userWith({}) });
    await vi.waitFor(() => expect(lastOptions).not.toBeNull());
    await lastOptions.handler({
      razorpay_payment_id: "pay_1",
      razorpay_subscription_id: "sub_123",
      razorpay_signature: "sig",
    });
    const result = await pending;
    expect(api.post).toHaveBeenLastCalledWith("/payment/subscriptions/verify", {
      razorpay_payment_id: "pay_1",
      razorpay_subscription_id: "sub_123",
      razorpay_signature: "sig",
      returnTo: "",
    });
    expect(result.outcome).toBe("success");
    expect(result.data.status).toBe("active");
    expect(result.data.user._id).toBe("u1");
  });
});
