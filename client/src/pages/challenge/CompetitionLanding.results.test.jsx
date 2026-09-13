// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../context/AuthContext";
import { CHALLENGE_DETAIL_STATUS } from "./challengeDetail";
import CompetitionLanding from "./CompetitionLanding";

/**
 * The Results section exists from the moment the writing window closes, not only once winners are
 * declared. A closed challenge that said nothing about results read as abandoned: no countdown, a
 * dead Register button, and no word on where the announcement would appear.
 */

const mocks = vi.hoisted(() => ({ detail: vi.fn(), auth: vi.fn() }));
vi.mock("./useChallengeDetail", () => ({ default: (...args) => mocks.detail(...args) }));
vi.mock("../../context/AuthModalContext", () => ({ useAuthModal: () => ({ openAuthModal: mocks.auth }) }));
vi.mock("../hall-of-fame/HallOfFameDetail", () => ({ default: () => <main data-testid="competition-record">Public record</main> }));
vi.mock("../../components/competition/CountdownTimer", () => ({ default: ({ label }) => <span>{label}</span> }));
vi.mock("../../components/competition/PhaseTimeline", () => ({ default: () => <div>Timeline</div> }));
vi.mock("../../components/competition/ParticipantsGrid", () => ({ default: () => <div>Participants</div> }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const competition = {
  _id: "c1",
  slug: "48-hours",
  name: "Forty-Eight Hours",
  visibility: "public",
  overview: "Write a complete screenplay.",
  dates: {
    regClosesAt: "2026-08-25T00:00:00.000Z",
    endsAt: "2026-08-31T11:30:00.000Z",
    resultsAt: "2026-09-15T12:00:00.000Z",
  },
  scriptsSubmitted: 10,
  prizes: {},
};

const detail = ({ phase = "judging", visibility = "public", results = null, serverNow = "2026-09-02T00:00:00.000Z", overrides = {} } = {}) => ({
  public: {
    status: CHALLENGE_DETAIL_STATUS.READY,
    data: { competition: { ...competition, ...overrides, visibility }, phase, timeline: [], results, serverNow },
    failure: null,
  },
  entry: { status: CHALLENGE_DETAIL_STATUS.IDLE, data: null, failure: null },
  refresh: vi.fn(),
  retryEntry: vi.fn(),
});

let container;
let root;

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(
    <MemoryRouter initialEntries={["/challenge/c/48-hours"]}>
      <AuthContext.Provider value={{ user: null }}>
        <Routes><Route path="/challenge/c/:slug" element={<CompetitionLanding />} /></Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  ));
  return container;
}

const section = (el) => el.querySelector("#results");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.detail.mockReturnValue(detail());
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("CompetitionLanding — the Results section after the window closes", () => {
  it("says judging is under way, how many scripts are with the panel, and when to expect the announcement", async () => {
    const el = await mount();
    const results = section(el);
    expect(results).toBeTruthy();
    expect(results.textContent).toContain("Results");
    expect(results.textContent).toContain("Judging in progress");
    expect(results.textContent).toContain("10 scripts are with the panel");
    expect(results.textContent).toMatch(/announced here on .*September.*2026/);
    expect(results.textContent).toContain("permanent place in the Ckript Hall of Fame");
    expect(results.querySelector('a[href="/hall-of-fame"]')).toBeTruthy();
  });

  it("does not repeat an announcement date that has already passed as a promise", async () => {
    mocks.detail.mockReturnValue(detail({ serverNow: "2026-09-20T00:00:00.000Z" }));
    const el = await mount();
    expect(section(el).textContent).toContain("as soon as the panel has finished");
    expect(section(el).textContent).not.toContain("announced here on");
  });

  it("copes with a competition that never set a results date or a submission count", async () => {
    mocks.detail.mockReturnValue(detail({ overrides: { dates: { endsAt: "2026-08-31T11:30:00.000Z" }, scriptsSubmitted: undefined } }));
    const el = await mount();
    const text = section(el).textContent;
    expect(text).toContain("The writing window closed on");
    expect(text).toContain("will be announced here.");
    expect(text).not.toContain("with the panel");
  });

  it("points the hero action at the section during judging instead of a dead 'Registration closed'", async () => {
    const el = await mount();
    const labels = Array.from(el.querySelectorAll("button")).map((b) => b.textContent);
    expect(labels).toContain("About the results");
    expect(labels).not.toContain("Registration closed");
  });

  it("a hidden challenge's declared results say why they are not in the Hall of Fame", async () => {
    mocks.detail.mockReturnValue(detail({
      phase: "results",
      visibility: "hidden",
      results: { winner: { name: "Mira Sen", scriptTitle: "Last Stop" }, runnerUp: null, special: [{ name: "Dev Kapoor", specialTitle: "Best Dialogue" }] },
    }));
    const el = await mount();
    expect(el.querySelector('[data-testid="competition-record"]')).toBeNull();
    const text = section(el).textContent;
    expect(text).toContain("Mira Sen");
    expect(text).toContain("Best Dialogue");
    expect(text).toContain("stay on this page rather than in the public Hall of Fame");
    expect(text).not.toContain("Judging in progress");
  });

  it("a hidden challenge's results include a second runner-up when one was declared", async () => {
    mocks.detail.mockReturnValue(detail({
      phase: "results",
      visibility: "hidden",
      results: { winner: { name: "Mira Sen" }, runnerUp: { name: "Dev Kapoor" }, secondRunnerUp: { name: "Tomás Vega", scriptTitle: "Platform Nine" }, special: [] },
    }));
    const el = await mount();
    const text = section(el).textContent;
    expect(text).toContain("Second Runner-Up");
    expect(text).toContain("Tomás Vega");
  });

  it("shows a second runner-up prize card only when the competition has that tier", async () => {
    mocks.detail.mockReturnValue(detail({ overrides: { prizes: { winner: ["Gold plan for 30 days"], runnerUp: ["Silver plan for 30 days"], secondRunnerUp: [] } } }));
    let el = await mount();
    expect(el.querySelector("#prizes").textContent).not.toContain("Second Runner-Up");
    act(() => root.unmount());
    container.remove();
    mocks.detail.mockReturnValue(detail({ overrides: { prizes: { winner: ["Gold plan for 30 days"], runnerUp: [], secondRunnerUp: ["Silver plan for 14 days", "Second Runner-Up badge"] } } }));
    el = await mount();
    expect(el.querySelector("#prizes").textContent).toContain("Silver plan for 14 days");
  });

  it("still hands a public declared challenge to the permanent record", async () => {
    mocks.detail.mockReturnValue(detail({ phase: "results", results: { winner: { name: "Mira Sen" }, special: [] } }));
    const el = await mount();
    expect(el.querySelector('[data-testid="competition-record"]')).toBeTruthy();
  });
});
