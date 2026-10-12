// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../context/AuthContext";
import { CurrencyContext } from "../context/CurrencyContext";
import DarkModeContext from "../context/DarkModeContext";
import { forgetPendingCharge, rememberPendingCharge } from "./script-detail/checkout";
import api from "../services/api";
import ScriptPaymentPage from "./ScriptPaymentPage";

/*
 * The desktop half of D30's shared checkout.
 *
 * The rules are tested once, in `script-detail/checkout.test.js` and `useProjectCheckout.test.jsx`.
 * What is left to prove here is that this page is now a PRESENTATION of those rules — that it
 * renders the shared standing rather than three banners of its own, prices from the shared pricing
 * rather than a private 5%, states the payment window it never used to mention, and offers the same
 * recovery for an unverified charge that the phone does.
 */
vi.mock("../services/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const producer = { _id: "viewer-1", name: "Ravi", role: "producer", email: "ravi@studio.com", favoriteScripts: [] };

const project = (extra = {}) => ({
  _id: "p1",
  title: "The Monsoon Archive",
  price: 240000,
  creator: { _id: "writer-1", name: "Mira Sen", username: "mira" },
  canPurchase: true,
  rightsLicensing: { rightsType: "exclusive_license", negotiationMode: "ckript_not_involved" },
  myPendingRequest: {
    _id: "req-1",
    investor: "viewer-1",
    status: "approved",
    amount: 240000,
    paymentDueAt: new Date(Date.now() + 40 * 3600 * 1000).toISOString(),
  },
  ...extra,
});

let container;
let root;
let opened;

async function mount({ user = producer } = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/script/p1/pay"]}>
        <AuthContext.Provider value={{ user, setUser: vi.fn() }}>
          <DarkModeContext.Provider value={{ isDarkMode: false, toggleDarkMode: vi.fn() }}>
            <CurrencyContext.Provider value={{ currency: "INR", setCurrency: vi.fn(), format: String, formatSubunits: String }}>
              <Routes>
                <Route path="/script/:id/pay" element={<ScriptPaymentPage />} />
              </Routes>
            </CurrencyContext.Provider>
          </DarkModeContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return container;
}

const buttonWith = (el, label) => Array.from(el.querySelectorAll("button"))
  .find((button) => button.textContent.includes(label));

beforeEach(() => {
  vi.clearAllMocks();
  forgetPendingCharge();
  opened = [];
  window.Razorpay = function Razorpay(options) {
    return { open: () => opened.push(options) };
  };
  // happy-dom has no window.confirm at all; the stub is what makes "it was never called" a real
  // assertion rather than an accident of the environment.
  window.confirm = vi.fn();
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  forgetPendingCharge();
  delete window.Razorpay;
});

describe("ScriptPaymentPage", () => {
  it("prices from the shared pricing and states the deadline the server enforces", async () => {
    api.get.mockResolvedValue({ data: project() });
    const el = await mount();

    expect(el.textContent).toContain("2,52,000");
    expect(el.textContent).toContain("Platform fee (5%)");
    expect(el.textContent).toContain("Pay by");
  });

  it("renders the shared standing, in the shared words", async () => {
    api.get.mockResolvedValue({ data: project({ isUnlocked: true, canPurchase: false, myPendingRequest: null }) });
    const el = await mount();

    expect(el.textContent).toContain("You already bought this project");
    expect(buttonWith(el, "Pay ")).toBeFalsy();
  });

  it("reads the shared deal vocabulary rather than its own copy of the enums (DEF-28)", async () => {
    api.get.mockResolvedValue({ data: project() });
    const el = await mount();
    expect(el.textContent).toContain("Ckript not involved");
  });

  it("keeps the pay control pressable and states which box is missing", async () => {
    api.get.mockResolvedValue({ data: project() });
    const el = await mount();

    const pay = buttonWith(el, "Pay ");
    expect(pay.disabled).toBe(false);
    expect(el.textContent).toContain("Accept the Platform and Writer Terms");

    await act(async () => { pay.click(); });
    expect(api.post).not.toHaveBeenCalled();
  });

  it("offers the same recovery for an unverified charge that the phone does (DEF-32)", async () => {
    rememberPendingCharge({
      scriptId: "p1",
      userId: "viewer-1",
      payment: { razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", razorpay_signature: "sig" },
    });
    api.get.mockResolvedValue({ data: project() });
    api.post.mockRejectedValue({ response: { status: 503, data: { message: "Try again shortly." } } });

    const el = await mount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(el.textContent).toContain("never confirmed");
    expect(buttonWith(el, "Confirm it now")).toBeTruthy();
  });

  it("offers the two documents as buttons after a payment, and raises no browser dialog", async () => {
    api.get.mockResolvedValue({ data: project() });
    api.post
      .mockResolvedValueOnce({ data: { orderId: "order_1", amount: 25200000, currency: "INR", keyId: "key" } })
      .mockResolvedValueOnce({ data: { success: true, message: "Payment successful.", invoice: { _id: "inv-1", invoiceNumber: "CK-1" }, purchaseRequest: { id: "req-1" } } });

    const el = await mount();
    const boxes = Array.from(el.querySelectorAll('input[type="checkbox"]'));
    for (const box of boxes) {
      await act(async () => { box.click(); });
    }
    await act(async () => { buttonWith(el, "Pay ").click(); await Promise.resolve(); });
    await act(async () => {
      await opened[0].handler({ razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", razorpay_signature: "sig" });
    });

    expect(el.textContent).toContain("Invoice CK-1");
    expect(buttonWith(el, "Download Invoice")).toBeTruthy();
    expect(buttonWith(el, "Download Accepted Terms PDF")).toBeTruthy();
    // The old page fired window.confirm 120ms after this banner, over these same two buttons.
    expect(window.confirm).not.toHaveBeenCalled();
  });
});
