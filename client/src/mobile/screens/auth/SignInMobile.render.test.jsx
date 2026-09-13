// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../../context/AuthContext";
import { ToastContext } from "../../components/feedback/toastContext";
import SignInMobile from "./SignInMobile";

/*
 * Sign in is two fields and one button; almost all of its behaviour is in what
 * happens when it does not work. These tests concentrate there, and on the two
 * refusals that are not failures at all — an unverified account and a Google
 * credential with no Ckript account behind it.
 *
 * GoogleSignInButton renders a third-party <GoogleLogin>, which needs a client
 * id and a live Google script. It is replaced with a plain button that reports
 * the same two callbacks, because what is under test here is what SignInMobile
 * DOES with a Google result, not whether Google's iframe mounts.
 */
vi.mock("./ios/AuthGoogleSlot", () => ({
  default: ({ onSuccess, onError }) => (
    <div>
      <button type="button" onClick={() => onSuccess({ token: "t", name: "Mira", role: "creator" })}>
        google-ok
      </button>
      <button type="button" onClick={() => onError("No account", { accountNotFound: true, email: "mira@example.com" })}>
        google-no-account
      </button>
    </div>
  ),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const noop = vi.fn();
const toast = { info: noop, success: noop, warning: noop, error: noop, show: noop, dismiss: noop };

let host;
let root;
let auth;

const mount = async ({ entry = "/login", user = null, loading = false, login = vi.fn() } = {}) => {
  auth = {
    user,
    loading,
    login,
    adoptSession: vi.fn((data) => data),
    updateSessionUser: noop,
    setUser: noop,
    join: noop,
    googleSignIn: noop,
    logout: noop,
  };
  await act(async () => root.render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthContext.Provider value={auth}>
        <ToastContext.Provider value={toast}>
          <Routes>
            <Route path="/login" element={<SignInMobile />} />
            {/* Real destinations, so a redirect is observable as content. */}
            <Route path="/dashboard" element={<p>dashboard-landed</p>} />
            <Route path="/upload" element={<p>upload-landed</p>} />
            <Route path="/join" element={<p>join-landed</p>} />
          </Routes>
        </ToastContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  ));
  return host;
};

const buttonWith = (el, text) => [...el.querySelectorAll("button")].find((b) => b.textContent.includes(text));

const type = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
};

const fillCredentials = async (el, email = "mira@example.com", password = "Sup3rSecret!") => {
  const inputs = el.querySelectorAll("input");
  await type(inputs[0], email);
  await type(inputs[1], password);
};

describe("SignInMobile", () => {
  beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllMocks(); });

  it("renders as a public-shell screen, not an overlay", async () => {
    const el = await mount();
    expect(el.querySelector('[data-shell-mode="public"]')).not.toBeNull();
    expect(el.querySelector('[data-screen-id="sign-in"]')).not.toBeNull();
    expect(el.querySelectorAll("h1")).toHaveLength(1);
  });

  it("signs in and lands on the audience default", async () => {
    const login = vi.fn().mockResolvedValue({ token: "t", role: "creator", name: "Mira" });
    const el = await mount({ login });
    await fillCredentials(el);
    await act(async () => buttonWith(el, "Sign in").click());

    expect(login).toHaveBeenCalledWith("mira@example.com", "Sup3rSecret!");
    expect(host.textContent).toContain("dashboard-landed");
  });

  it("honours a ?redirect= it was given", async () => {
    const login = vi.fn().mockResolvedValue({ token: "t", role: "creator" });
    const el = await mount({ entry: "/login?redirect=%2Fupload", login });
    await fillCredentials(el);
    await act(async () => buttonWith(el, "Sign in").click());
    expect(host.textContent).toContain("upload-landed");
  });

  it("refuses an off-site ?redirect= and uses the audience default instead", async () => {
    // The open-redirect guard is resolvePostAuthPath/sanitizeLocalReturnPath;
    // this pins that the screen actually routes through it.
    const login = vi.fn().mockResolvedValue({ token: "t", role: "creator" });
    const el = await mount({ entry: "/login?redirect=https%3A%2F%2Fevil.example", login });
    await fillCredentials(el);
    await act(async () => buttonWith(el, "Sign in").click());
    expect(host.textContent).toContain("dashboard-landed");
  });

  it("advances to the OTP step for an unverified account instead of showing an error", async () => {
    // This is the sign-UP flow resuming. An error toast here would strand
    // someone one tap from being in.
    const login = vi.fn().mockRejectedValue({
      response: { status: 403, data: { requiresVerification: true, email: "mira@example.com", otpExpirySeconds: 300 } },
    });
    const el = await mount({ login });
    await fillCredentials(el);
    await act(async () => buttonWith(el, "Sign in").click());

    expect(el.querySelector('[data-screen-id="sign-in-verify"]')).not.toBeNull();
    expect(el.textContent).toContain("mira@example.com");
    expect(el.querySelectorAll(".ckm-auth__otp-box")).toHaveLength(6);
  });

  it("states a frozen account's reason and does not offer a pointless retry", async () => {
    const login = vi.fn().mockRejectedValue({
      response: { status: 403, data: { accountFrozen: true, message: "Account frozen", frozenReason: "Payment dispute" } },
    });
    const el = await mount({ login });
    await fillCredentials(el);
    await act(async () => buttonWith(el, "Sign in").click());

    expect(el.textContent).toContain("Payment dispute");
    expect(buttonWith(el, "Try again")).toBeUndefined();
  });

  it("replaces the form with a halt, because no control on it can change the answer", async () => {
    /*
     * This used to be a banner above a form nobody was allowed to submit. The
     * two things the person actually needs — the reason, and a way to reach a
     * human — were the two the banner had least room for.
     */
    const login = vi.fn().mockRejectedValue({
      response: { status: 403, data: { accountFrozen: true, message: "Account frozen", frozenReason: "Payment dispute" } },
    });
    const el = await mount({ login });
    await fillCredentials(el);
    await act(async () => buttonWith(el, "Sign in").click());

    expect(el.querySelector('[data-screen-id="sign-in-halted"]')).not.toBeNull();
    expect(el.querySelector('input[type="password"]')).toBeNull();
    const support = [...el.querySelectorAll("a")].find((a) => a.textContent.includes("Contact support"));
    expect(support.getAttribute("href")).toMatch(/^mailto:support@ckript\.com/);

    // And it is a detour, not a dead end: the form comes back.
    await act(async () => buttonWith(el, "Sign in").click());
    expect(el.querySelector('input[type="password"]')).not.toBeNull();
  });

  it("shuts a closed account down with its own words rather than the frozen ones", async () => {
    const login = vi.fn().mockRejectedValue({
      response: { status: 403, data: { accountDeleted: true, message: "This account was closed" } },
    });
    const el = await mount({ login });
    await fillCredentials(el);
    await act(async () => buttonWith(el, "Sign in").click());

    expect(el.querySelector("h1").textContent).toContain("closed");
    expect(el.textContent).toContain("This account was closed");
  });

  it("offers a retry when the failure is ours, not theirs", async () => {
    const login = vi.fn().mockRejectedValue({ code: "ERR_NETWORK" });
    const el = await mount({ login });
    await fillCredentials(el);
    await act(async () => buttonWith(el, "Sign in").click());

    expect(el.textContent).toMatch(/connection/i);
    expect(buttonWith(el, "Try again")).toBeDefined();
  });

  it("puts a wrong-password refusal beside the password field", async () => {
    const login = vi.fn().mockRejectedValue({
      response: { status: 401, data: { message: "Invalid email or password" } },
    });
    const el = await mount({ login });
    await fillCredentials(el);
    await act(async () => buttonWith(el, "Sign in").click());

    const invalid = el.querySelector('input[type="password"][aria-invalid="true"]');
    expect(invalid).not.toBeNull();
    expect(el.textContent).toContain("Invalid email or password");
  });

  it("does not mark a field invalid before the first submit", async () => {
    const el = await mount();
    await type(el.querySelectorAll("input")[0], "not-an-email");
    expect(el.querySelector('[aria-invalid="true"]')).toBeNull();
  });

  it("does not re-adopt a Google session AuthContext already adopted", async () => {
    // googleSignIn calls adoptSession itself before this callback fires. Doing
    // it twice is harmless for the session and doubles the auth event, which
    // every sign-in count downstream would then be wrong about.
    const el = await mount();
    await act(async () => buttonWith(el, "google-ok").click());
    expect(auth.adoptSession).not.toHaveBeenCalled();
    expect(host.textContent).toContain("dashboard-landed");
  });

  it("sends a Google user with no account to the role chooser, carrying their email", async () => {
    // Google sign-in is deliberately sign-in only. Before D59 this was a bare
    // error toast at the exact moment someone was trying to join.
    const el = await mount({ entry: "/login?redirect=%2Fupload" });
    await act(async () => buttonWith(el, "google-no-account").click());
    expect(host.textContent).toContain("join-landed");
  });

  it("sends an already-signed-in visitor on rather than leaving them on a sign-in form", async () => {
    await mount({ user: { _id: "u1", role: "creator" } });
    expect(host.textContent).toContain("dashboard-landed");
  });

  it("names every control it renders", async () => {
    const el = await mount();
    for (const input of el.querySelectorAll("input")) {
      const labelled = input.labels?.length > 0
        || input.getAttribute("aria-label")
        || input.getAttribute("aria-labelledby");
      expect(labelled).toBeTruthy();
    }
    for (const button of el.querySelectorAll("button")) {
      const named = button.textContent.trim() || button.getAttribute("aria-label");
      expect(named).toBeTruthy();
    }
  });
});
