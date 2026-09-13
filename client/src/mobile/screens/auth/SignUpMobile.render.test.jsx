// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../../context/AuthContext";
import { ToastContext } from "../../components/feedback/toastContext";
import SignUpMobile from "./SignUpMobile";

/*
 * The stepper's whole architecture is "the step is in the URL", so these tests
 * assert against the URL as much as against the DOM: what the visitor sees, and
 * what a refresh or a back press would restore, have to be the same thing.
 */

const put = vi.fn().mockResolvedValue({ data: {} });
const post = vi.fn().mockResolvedValue({ data: {} });
const get = vi.fn().mockResolvedValue({ data: { available: true } });
vi.mock("../../../services/api", () => ({
  default: {
    get: (...args) => get(...args),
    put: (...args) => put(...args),
    post: (...args) => post(...args),
  },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const noop = vi.fn();
const toast = { info: noop, success: noop, warning: noop, error: noop, show: noop, dismiss: noop };

let host;
let root;
let auth;

/* The URL is this screen's state, so the tests read it. Rendering it into the
   DOM rather than assigning it to an outer variable keeps the probe pure —
   reassigning during render is a side effect, and React's lint rules are right
   to refuse it. */
function LocationProbe() {
  const { pathname, search } = useLocation();
  return <span data-route-url>{`${pathname}${search}`}</span>;
}

const currentUrl = () => host.querySelector("[data-route-url]").textContent;

const mount = async ({ entry = "/signup?as=writer", user = null, join = vi.fn().mockResolvedValue({ token: "t" }) } = {}) => {
  auth = {
    user,
    loading: false,
    join,
    adoptSession: vi.fn((data) => data),
    updateSessionUser: noop,
    setUser: noop,
    login: noop,
    googleSignIn: noop,
    logout: noop,
  };
  await act(async () => root.render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthContext.Provider value={auth}>
        <ToastContext.Provider value={toast}>
          <LocationProbe />
          <Routes>
            <Route path="/signup" element={<SignUpMobile />} />
            <Route path="/dashboard" element={<p>dashboard-landed</p>} />
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

/*
 * Answer one of the "picks" rows. The redesign replaced the native <select>
 * with a row that opens the family's wheel sheet, so the test drives what the
 * visitor drives: tap the row, tap the option.
 */
const choose = async (el, rowLabel, optionLabel) => {
  const row = [...el.querySelectorAll("button")]
    .find((button) => button.textContent.trim().startsWith(rowLabel));
  await act(async () => row.click());

  const option = [...el.querySelectorAll("[role='option']")]
    .find((entry) => entry.textContent.trim() === optionLabel);
  await act(async () => option.click());
};

/* Fill the About step's two required demographics and walk to Links. */
const walkAboutToLinks = async (el) => {
  await choose(el, "Gender", "Female");
  await choose(el, "Nationality", "Indian");
  await advance(el);                        // -> Guilds
  await advance(el);                        // -> Links
};

const advance = async (el) => {
  const next = buttonWith(el, "Continue")
    || buttonWith(el, "Create my account")
    || buttonWith(el, "Finish and enter Ckript");
  await act(async () => next.click());
};

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("SignUpMobile — one stepper, three roles", () => {
  it("renders in the flow shell with the role's own step count", async () => {
    const el = await mount();
    expect(el.querySelector('[data-shell-mode="flow"]')).not.toBeNull();
    expect(el.querySelector('[data-screen-id="sign-up"]')).not.toBeNull();
    expect(el.textContent).toContain("Step 1 of 9");
    expect(el.textContent).toContain("Joining as Writer");
  });

  it("gives the producer and industry flows their own lengths from the same screen", async () => {
    let el = await mount({ entry: "/signup?as=producer" });
    expect(el.textContent).toContain("Step 1 of 8");
    expect(el.textContent).toContain("Joining as Producer or Director");

    act(() => root.unmount());
    root = createRoot(host);
    el = await mount({ entry: "/signup?as=industry" });
    expect(el.textContent).toContain("Step 1 of 7");
  });

  it("falls back to the writer flow for an unrecognised ?as=", async () => {
    const el = await mount({ entry: "/signup?as=astronaut" });
    expect(el.textContent).toContain("Joining as Writer");
  });

  it("clamps a ?step= outside the role's range rather than rendering nothing", async () => {
    const el = await mount({ entry: "/signup?as=writer&step=99" });
    expect(el.textContent).toContain("Step 9 of 9");
  });
});

describe("SignUpMobile — the step lives in the URL", () => {
  it("pushes the step into the URL so back means 'previous step'", async () => {
    const el = await mount();
    await type(el.querySelector("input"), "Mira Sen");
    await advance(el);

    // The URL is the state. A refresh here resumes on step 2.
    expect(currentUrl()).toContain("step=2");
    expect(el.textContent).toContain("Step 2 of 9");
  });

  it("keeps the referral and the return path across every step change", async () => {
    const el = await mount({ entry: "/signup?as=writer&ref=ABC123&redirect=%2Fupload" });
    await type(el.querySelector("input"), "Mira Sen");
    await advance(el);

    expect(currentUrl()).toContain("ref=ABC123");
    expect(currentUrl()).toContain("redirect=%2Fupload");
  });

  it("prefills a referral from the URL into the field the visitor can see", async () => {
    const el = await mount({ entry: "/signup?as=writer&ref=ABC123&step=2" });
    const values = [...el.querySelectorAll("input")].map((input) => input.value);
    expect(values).toContain("ABC123");
  });

  it("prefills an email handed over by the Google role-chooser detour", async () => {
    const el = await mount({ entry: "/signup?as=writer&email=mira%40example.com&step=2" });
    const values = [...el.querySelectorAll("input")].map((input) => input.value);
    expect(values).toContain("mira@example.com");
  });
});

describe("SignUpMobile — validation before the round trip", () => {
  it("refuses to advance an empty required field and says why, in place", async () => {
    const el = await mount();
    await advance(el);
    expect(el.textContent).toContain("Tell us your name.");
    // A refused advance must not push history either — otherwise a back press
    // after three refusals walks back through three identical steps.
    expect(currentUrl()).not.toContain("step=2");
    expect(el.textContent).toContain("Step 1 of 9");
  });

  it("mirrors the server's five password rules rather than making someone guess", async () => {
    const el = await mount({ entry: "/signup?as=writer&step=3" });
    const password = el.querySelector('input[type="password"]');
    await type(password, "abc");

    // All five outstanding rules are visible at once; the server names one.
    expect(el.textContent).toContain("At least 8 characters");
    expect(el.textContent).toContain("An uppercase letter");
    expect(el.textContent).toContain("A number");
    expect(el.textContent).toContain("A symbol");
  });

  it("does not call the server for a password it already knows is refused", async () => {
    const el = await mount({ entry: "/signup?as=writer&step=3" });
    await type(el.querySelector('input[type="password"]'), "abc");
    await advance(el);
    expect(auth.join).not.toHaveBeenCalled();
  });
});

describe("SignUpMobile — the account is created in the middle", () => {
  const reachPasswordStep = async () => {
    const el = await mount({ entry: "/signup?as=writer&step=3" });
    return el;
  };

  it("labels the account-creating step for what it does", async () => {
    const el = await reachPasswordStep();
    expect(buttonWith(el, "Create my account")).toBeDefined();
    expect(el.textContent).toContain("creates your account and emails you a 6-digit code");
  });

  it("sends the server's role name, not the product's", async () => {
    // The catalogue exists because these differ: writer -> creator.
    const join = vi.fn().mockResolvedValue({ token: "t" });
    const el = await mount({ entry: "/signup?as=writer&step=3", join });
    await type(el.querySelector('input[type="password"]'), "Sup3rSecret!");
    await advance(el);
    expect(join).toHaveBeenCalledWith(expect.objectContaining({ role: "creator" }));
  });

  it("shows the OTP step when the server asks for verification", async () => {
    const join = vi.fn().mockResolvedValue({
      requiresVerification: true, email: "mira@example.com", otpExpirySeconds: 300,
    });
    const el = await mount({ entry: "/signup?as=writer&step=3", join });
    await type(el.querySelector('input[type="password"]'), "Sup3rSecret!");
    await advance(el);

    expect(el.querySelector('[data-screen-id="sign-up-verify"]')).not.toBeNull();
    expect(el.querySelectorAll(".ckm-auth__otp-box")).toHaveLength(6);
    // The account already exists, and the screen says so rather than implying
    // that leaving now loses it.
    expect(el.textContent).toContain("Your account is created");
  });

  it("does not bounce an authenticated visitor out of a flow that is mid-way", async () => {
    // The reason the manifest entry is deliberately not `signedOutOnly`: from
    // step 3 on, being signed in is the SUCCESS state.
    const el = await mount({ entry: "/signup?as=writer&step=5", user: { _id: "u1", role: "creator" } });
    expect(host.textContent).not.toContain("dashboard-landed");
    expect(el.textContent).toContain("Step 5 of 9");
  });

  it("does send an authenticated visitor away from a fresh step 1", async () => {
    // A stale link or a bookmark — not a flow in progress.
    await mount({ entry: "/signup?as=writer", user: { _id: "u1", role: "creator" } });
    expect(host.textContent).toContain("dashboard-landed");
  });
});

describe("SignUpMobile — the draft", () => {
  it("keeps typing across a remount and offers to resume rather than restoring silently", async () => {
    let el = await mount();
    await type(el.querySelector("input"), "Mira Sen");
    await advance(el);

    act(() => root.unmount());
    root = createRoot(host);
    el = await mount();

    expect(el.querySelector('[data-screen-id="sign-up-resume"]')).not.toBeNull();
    expect(buttonWith(el, "Continue where I stopped")).toBeDefined();
    expect(buttonWith(el, "Start again")).toBeDefined();
  });

  it("tells the visitor their password was not kept", async () => {
    let el = await mount();
    await type(el.querySelector("input"), "Mira Sen");
    await advance(el);
    act(() => root.unmount());
    root = createRoot(host);
    el = await mount();
    expect(el.textContent).toContain("password isn't saved");
  });

  it("never writes the password to storage", async () => {
    const el = await mount({ entry: "/signup?as=writer&step=3" });
    await type(el.querySelector('input[type="password"]'), "Sup3rSecret!");
    const stored = JSON.stringify(window.sessionStorage);
    expect(stored).not.toContain("Sup3rSecret!");
  });
});

describe("SignUpMobile — the long lists, and the end", () => {
  it("keeps both selections when two rows are tapped before a re-render", async () => {
    /*
     * The genre list is forty-eight rows, so two taps landing in one render
     * pass is ordinary use rather than a corner case. A toggle written against
     * the closed-over array loses the first of them — see SignUpPanels.toggleIn.
     */
    const el = await mount({ entry: "/signup?as=writer&step=8", user: { _id: "u1", role: "creator" } });
    const rows = [...el.querySelectorAll("[aria-pressed]")];
    await act(async () => { rows[0].click(); rows[3].click(); });

    expect(rows[0].getAttribute("aria-pressed")).toBe("true");
    expect(rows[3].getAttribute("aria-pressed")).toBe("true");
  });

  it("ends on a finish that names the account and offers that role's first act", async () => {
    // Landing straight in the app would be correct and silent. This says which
    // account now exists, which is the one thing the flow never confirmed.
    const el = await mount({ entry: "/signup?as=industry&step=7", user: { _id: "u1", role: "professional" } });
    const boxes = [...el.querySelectorAll("[role='checkbox']")];
    await act(async () => boxes[0].click());
    await act(async () => boxes[1].click());
    await advance(el);

    expect(el.querySelector('[data-screen-id="sign-up-done"]')).not.toBeNull();
    expect(el.textContent).toContain("Industry professional account created");
    expect([...el.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toContain("/writers");
    // And the audience default is still one tap away for anyone who does not
    // want to be sent anywhere in particular.
    expect(buttonWith(el, "Look around first")).toBeDefined();
  });

  it("does not bounce the visitor away from the finish just because they are signed in", async () => {
    const el = await mount({ entry: "/signup?as=industry&step=7", user: { _id: "u1", role: "professional" } });
    const boxes = [...el.querySelectorAll("[role='checkbox']")];
    await act(async () => boxes[0].click());
    await act(async () => boxes[1].click());
    await advance(el);
    expect(host.textContent).not.toContain("dashboard-landed");
  });
});

describe("SignUpMobile — accessibility", () => {
  it("keeps one h1 and names every control", async () => {
    const el = await mount();
    expect(el.querySelectorAll("h1")).toHaveLength(1);
    for (const input of el.querySelectorAll("input")) {
      expect(input.labels?.length > 0 || input.getAttribute("aria-label")).toBeTruthy();
    }
    for (const button of el.querySelectorAll("button")) {
      expect(button.textContent.trim() || button.getAttribute("aria-label")).toBeTruthy();
    }
  });

  it("announces the step as structure, not only as a bar", async () => {
    const el = await mount();
    const live = el.querySelector('[aria-live="polite"]');
    expect(live.textContent).toContain("Step 1 of 9");
  });

  it("moves focus to the step heading so the panel change is announced", async () => {
    const el = await mount();
    expect(document.activeElement).toBe(el.querySelector("h1"));
  });
});

describe("SignUpMobile — the writer profile the server will actually accept", () => {
  it("asks for the gender and nationality PUT /onboarding/writer-profile requires", async () => {
    // Without both, the server refuses the profile write with 400 "Gender and
    // Nationality are required" — i.e. a writer would complete eight steps and
    // fail on the ninth. Both lists carry "Prefer not to say".
    const el = await mount({ entry: "/signup?as=writer&step=5" });
    expect(el.textContent).toContain("Gender");
    expect(el.textContent).toContain("Nationality");

    await advance(el);
    expect(el.textContent).toContain('Choose one, or "Prefer not to say"');
    expect(currentUrl()).not.toContain("step=6");
  });

  it("does not ask a producer for them, because their endpoint does not want them", async () => {
    const el = await mount({ entry: "/signup?as=producer&step=5" });
    expect(el.textContent).not.toContain("Nationality");
  });

  it("sends the profile on leaving Links, with the demographics the server demands", async () => {
    // Walked rather than jumped: the point is that the two answers collected on
    // About (step 5) reach the payload sent on leaving Links (step 7).
    const el = await mount({ entry: "/signup?as=writer&step=5", user: { _id: "u1", role: "creator" } });
    await walkAboutToLinks(el);
    await advance(el);

    expect(put).toHaveBeenCalledWith("/onboarding/writer-profile", expect.objectContaining({
      diversity: expect.objectContaining({ gender: "Female", nationality: "Indian" }),
    }));
  });

  it("sends a resumed writer back to About rather than letting the server refuse", async () => {
    /*
     * The draft never persists the demographics, so a resume arrives without
     * them. Without this the profile write two steps later would 400 with
     * "Gender and Nationality are required" — a message about a question that
     * is now behind the person, on a step whose form cannot show it.
     */
    const el = await mount({ entry: "/signup?as=writer&step=7", user: { _id: "u1", role: "creator" } });
    await advance(el);

    expect(put).not.toHaveBeenCalled();
    expect(currentUrl()).toContain("step=5");
    expect(el.textContent).toContain("don't keep these two answers");
  });

  it("never writes the demographics to storage, even while they are on screen", async () => {
    const el = await mount({ entry: "/signup?as=writer&step=5" });
    await choose(el, "Gender", "Female");
    expect(el.textContent).toContain("Female");
    expect(JSON.stringify(window.sessionStorage)).not.toContain("Female");
  });
});
