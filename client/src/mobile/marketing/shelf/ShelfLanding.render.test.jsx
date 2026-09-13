// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../../context/AuthContext";
import LandingMobile from "./ShelfLanding";

const mocks = vi.hoisted(() => ({
  challenge: { phase: "dormant", competition: null, serverNow: null },
  auth: vi.fn(),
  about: vi.fn(),
  pricing: vi.fn(),
  producer: vi.fn(),
  writer: vi.fn(),
}));

vi.mock("../../../context/AuthModalContext", () => ({
  useAuthModal: () => ({
    openAuthModal: mocks.auth,
    openAboutModal: mocks.about,
    openPricingModal: mocks.pricing,
    openProducerOnboarding: mocks.producer,
    openWriterOnboarding: mocks.writer,
  }),
}));

vi.mock("../../../pages/landing/_shared/useChallenge", () => ({
  default: () => mocks.challenge,
  countdownFor: (phase, dates = {}) => (
    phase === "registration_open"
      ? { at: dates.regClosesAt, label: "Registration closes in" }
      : { at: dates.endsAt, label: "Deadline in" }
  ),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container;
let root;

async function mount(user = null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthContext.Provider value={{ user }}>
          <div className="ckm"><LandingMobile user={user} /></div>
        </AuthContext.Provider>
      </MemoryRouter>,
    );
    await Promise.resolve();
  });
  return container;
}

const buttons = (el = container) => [...el.querySelectorAll("button")];
const links = (el = container) => [...el.querySelectorAll("a")];
const buttonNamed = (name, el = container) => buttons(el).find((button) => (
  button.getAttribute("aria-label") === name || button.textContent.includes(name)
));
const buttonsNamed = (name, el = container) => buttons(el).filter((button) => button.textContent.trim() === name);
const linkNamed = (name, el = container) => links(el).find((link) => link.textContent.includes(name));
const dialogNamed = (name) => [...container.querySelectorAll('[role="dialog"]')].find((dialog) => {
  const labelledBy = dialog.getAttribute("aria-labelledby");
  return (labelledBy && document.getElementById(labelledBy)?.textContent === name)
    || dialog.getAttribute("aria-label") === name;
});
const click = async (element) => act(async () => {
  element.click();
  await Promise.resolve();
});

beforeEach(() => {
  mocks.challenge = { phase: "dormant", competition: null, serverNow: null };
  vi.clearAllMocks();
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
});

describe("LandingMobile", () => {
  it("renders every canonical landing beat and keeps anonymous conversion actions modal-owned", async () => {
    const el = await mount();
    const headings = [...el.querySelectorAll("h1,h2")].map((heading) => heading.textContent.trim()).join(" | ");

    /* Every beat of the desktop page still has a heading here. The three that
       carry a <br> read with the break collapsed in textContent, which is how
       the design sets them — the line break is typographic, not semantic. */
    for (const text of [
      "The Journey fromPage to Screen",
      "Find it. Watch it. Own it.",
      "Built for writers. Loved by producers.",
      "One platform. Every format.",
      "Your script, renderedin 30 seconds.",
      "The industry is broken on both sides of the page.",
      "The company we keep.",
      "Your story deservesan audience.",
    ]) expect(headings).toContain(text);

    /* The desktop footer's three columns do not survive a 390pt screen, so the
       Shelf carries their destinations as chips instead. Every one still has a
       way through — which is what the headings were there to organise. */
    const chips = [...el.querySelectorAll(".ckm-landing__chip")].map((c) => c.textContent);
    for (const label of ["Scripts", "Challenge", "For Producers", "Pricing", "About", "Contact"]) {
      expect(chips).toContain(label);
    }

    expect(el.textContent).toContain("U62099DL2026PTC468691");
    expect(buttonsNamed("Browse scripts").length).toBeGreaterThan(0);

    // The Shelf separates the two calls the old bar had conflated: "Sign in"
    // signs in, and the docked "Get started" is what opens plans.
    await click(buttonNamed("Sign in"));
    expect(mocks.auth).toHaveBeenCalledWith();
    await click(buttonNamed("Get started"));
    expect(mocks.pricing).toHaveBeenCalledTimes(1);
    await click(buttonsNamed("Browse scripts")[0]);
    expect(mocks.producer).toHaveBeenCalledTimes(1);
    await click(buttonsNamed("Start with your script")[0]);
    expect(mocks.writer).toHaveBeenCalledTimes(1);
  });

  it("uses links to canonical member destinations instead of reopening onboarding", async () => {
    const el = await mount({ _id: "w1", role: "writer", name: "Mira Sen" });

    expect(linkNamed("Open app", el)?.getAttribute("href")).toBe("/dashboard");
    expect(linkNamed("Create a project", el)?.getAttribute("href")).toBe("/new-project");
    expect(linkNamed("See featured scripts", el)?.getAttribute("href")).toBe("/featured");
    expect(buttonNamed("Sign in", el)).toBeUndefined();
    expect(mocks.writer).not.toHaveBeenCalled();
    expect(mocks.producer).not.toHaveBeenCalled();
  });

  it("opens one tool at a time in a sheet rather than pushing the list off the fold", async () => {
    /*
     * The accordion this replaces expanded in place, which on a 390pt screen
     * pushed the six rows below it off the fold and lost the reader's place in
     * the list they were scanning. The Shelf opens the tool over the page and
     * leaves the list where it was.
     */
    const el = await mount();
    expect(el.querySelector('[role="dialog"]')).toBeNull();

    await click(buttons(el).find((button) => button.textContent.includes("Locked Ideas, Paid Unlocks")));
    const sheet = el.querySelector('[role="dialog"]');
    expect(sheet).toBeTruthy();
    expect(sheet.textContent).toContain("Locked Ideas, Paid Unlocks");
    expect(sheet.textContent).toContain("Public summaries, protected scripts.");

    // One at a time: the list underneath is untouched and still has all seven.
    expect(buttons(el).filter((b) => b.className.includes("ckm-landing__row"))).toHaveLength(7);
  });

  it("opens native navigation with complete marketing actions", async () => {
    await mount();
    await click(buttonNamed("Open menu"));
    const menu = dialogNamed("Explore Ckript");

    expect(menu).toBeTruthy();
    expect(linkNamed("Challenge", menu)?.getAttribute("href")).toBe("/challenges");
    expect(linkNamed("Contact", menu)?.getAttribute("href")).toBe("/contact");
    expect(buttonNamed("Sign in", menu)).toBeTruthy();
  });

  it("opens a native partner dialog with selector and external action", async () => {
    await mount();
    await click(buttonNamed("Learn more about Sceneway Films"));
    const partner = dialogNamed("Sceneway Films");

    expect(partner).toBeTruthy();
    expect(partner.querySelector('[role="radiogroup"][aria-label="Production partner"]')).toBeTruthy();
    expect(linkNamed("Visit belalelaraby.com", partner)?.getAttribute("href")).toBe("https://belalelaraby.com");
  });

  it("plays the sample in a native dialog and stops it on close", async () => {
    const pause = vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    await mount();

    await click(buttonNamed("Watch a sample trailer"));
    const dialog = dialogNamed("Ckript sample trailer");
    const video = dialog.querySelector('video[aria-label="Ckript sample trailer"]');
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(video.getAttribute("src")).toContain("nexara-trailer.MP4");
    await click(buttonNamed("Close", dialog));
    expect(pause).toHaveBeenCalledTimes(1);
    expect(video.currentTime).toBe(0);
  });

  it("preserves the competition registration auth handoff", async () => {
    mocks.challenge = {
      phase: "registration_open",
      competition: {
        name: "Ckript 48",
        slug: "ckript-48",
        dates: { regClosesAt: "2026-09-01T12:00:00.000Z" },
      },
      serverNow: "2026-08-23T12:00:00.000Z",
    };
    await mount();

    await click(buttonNamed("Register"));
    expect(mocks.auth).toHaveBeenCalledWith({ redirect: "/challenge/register?c=ckript-48" });
  });
});
