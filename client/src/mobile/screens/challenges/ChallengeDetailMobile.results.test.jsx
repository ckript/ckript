// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../../context/AuthContext";
import { CHALLENGE_DETAIL_STATUS } from "../../../pages/challenge/challengeDetail";
import ChallengeDetailMobile from "./ChallengeDetailMobile";

/**
 * The mobile detail's Results section mirrors the desktop landing: present from the moment the
 * window closes (what is coming, when, and that winners enter the Hall of Fame), then the laureates
 * with their induction once declared.
 */

const authModal = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("../../../context/AuthModalContext", () => ({ useAuthModal: () => ({ openAuthModal: authModal.open }) }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const competition = {
  _id: "competition-1",
  slug: "forty-eight-hours",
  name: "Forty-Eight Hours",
  visibility: "public",
  overview: "Write a complete short screenplay.",
  scriptsSubmitted: 10,
  dates: {
    regOpensAt: "2026-08-20T00:00:00.000Z",
    regClosesAt: "2026-08-25T00:00:00.000Z",
    startsAt: "2026-08-26T00:00:00.000Z",
    endsAt: "2026-08-28T00:00:00.000Z",
    resultsAt: "2026-09-15T12:00:00.000Z",
  },
  prizes: { winner: ["Cash prize"] },
};

const ready = ({ phase = "judging", results = null, visibility = "public", serverNow = "2026-09-02T00:00:00.000Z" } = {}) => ({
  public: {
    status: CHALLENGE_DETAIL_STATUS.READY,
    data: { competition: { ...competition, phase, visibility }, phase, timeline: [], results, serverNow },
    failure: null,
  },
  entry: { status: CHALLENGE_DETAIL_STATUS.READY, data: null, failure: null },
  refresh: vi.fn(),
  retryEntry: vi.fn(),
});

let container;
let root;

async function mount(state) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(
    <MemoryRouter initialEntries={["/challenge/c/forty-eight-hours"]}>
      <AuthContext.Provider value={{ user: null }}>
        <div className="ckm"><ChallengeDetailMobile user={null} previewState={state} previewSlug="forty-eight-hours" /></div>
      </AuthContext.Provider>
    </MemoryRouter>,
  ));
  return container;
}

const section = (el) => el.querySelector("#results");

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("ChallengeDetailMobile — Results after the window closes", () => {
  it("during judging says what is coming, when, and where it will live", async () => {
    const el = await mount(ready());
    const results = section(el);
    expect(results).toBeTruthy();
    expect(results.textContent).toContain("Judging in progress");
    expect(results.textContent).toContain("10 scripts are with the panel");
    expect(results.textContent).toMatch(/announced here on .*2026/);
    expect(results.textContent).toContain("permanent place in the Ckript Hall of Fame");
    expect(results.querySelector('a[href="/hall-of-fame"]')).toBeTruthy();
  });

  it("does not repeat a passed announcement date as a promise", async () => {
    const el = await mount(ready({ serverNow: "2026-09-20T00:00:00.000Z" }));
    expect(section(el).textContent).toContain("as soon as the panel has finished");
  });

  it("declared results on a public challenge carry the Hall of Fame induction", async () => {
    const el = await mount(ready({
      phase: "results",
      results: { winner: { userId: "w1", name: "Rhea", scriptTitle: "Last Stop" }, runnerUp: null, special: [{ userId: "w2", name: "Dev", specialTitle: "Best Dialogue" }] },
    }));
    const text = section(el).textContent;
    expect(text).toContain("Rhea");
    expect(text).toContain("Best Dialogue");
    expect(text).toContain("permanent place in the Ckript Hall of Fame");
    expect(section(el).querySelector('a[href="/hall-of-fame"]')).toBeTruthy();
    expect(text).not.toContain("Judging in progress");
  });

  it("declared results list a second runner-up after the runner-up", async () => {
    const el = await mount(ready({
      phase: "results",
      results: { winner: { userId: "w1", name: "Rhea" }, runnerUp: { userId: "w2", name: "Dev" }, secondRunnerUp: { userId: "w3", name: "Tomás", scriptTitle: "Platform Nine" }, special: [] },
    }));
    const text = section(el).textContent;
    expect(text).toContain("Second Runner-Up");
    expect(text.indexOf("Dev")).toBeLessThan(text.indexOf("Tomás"));
  });

  it("a hidden challenge's results say why they are not in the Hall of Fame", async () => {
    const el = await mount(ready({ phase: "results", visibility: "hidden", results: { winner: { userId: "w1", name: "Rhea" }, special: [] } }));
    const text = section(el).textContent;
    expect(text).toContain("stay on this page rather than in the public Hall of Fame");
    expect(section(el).querySelector('a[href="/hall-of-fame"]')).toBeNull();
  });
});
