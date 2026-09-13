// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HALL_OF_FAME_STATUS } from "./hallOfFame";
import HallOfFameDetail from "./HallOfFameDetail";

/**
 * A public challenge's landing page becomes this record once results are declared, so the record
 * is the Results section: it says so, lists the winners and the special awards, and states the
 * induction — every honouree holds a permanent place in the Hall of Fame.
 */

const mocks = vi.hoisted(() => ({ detail: vi.fn() }));
vi.mock("./useHallOfFame", () => ({ useHallOfFameDetail: (...args) => mocks.detail(...args), useHallOfFameList: vi.fn() }));
vi.mock("../../components/competition/useDynamicSeo", () => ({ default: () => {} }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const winner = { userId: "w1", name: "Mira Sen", username: "mira", scriptTitle: "Last Stop", logline: "A night bus.", rewards: [] };
const runnerUp = { userId: "w2", name: "Dev Kapoor", username: "dev", scriptTitle: "Signal", rewards: [] };
const special = { userId: "w3", name: "Ana Ruiz", username: "ana", scriptTitle: "Static", specialTitle: "Best Dialogue", rewards: [] };

const record = (results) => ({
  status: HALL_OF_FAME_STATUS.READY,
  failure: null,
  retry: vi.fn(),
  data: {
    competition: {
      _id: "c1",
      slug: "forty-eight-hours",
      name: "Forty-Eight Hours",
      year: 2026,
      dates: { startsAt: "2026-08-26T00:00:00.000Z", endsAt: "2026-08-28T00:00:00.000Z" },
      theme: { title: "The last train home" },
      judges: [],
      sponsors: [],
    },
    results,
    stats: { totalParticipants: 84, countriesRepresented: 9, scriptsSubmitted: 61, completionRate: 73 },
    featuredScripts: [],
  },
});

let container;
let root;

async function mount(results) {
  mocks.detail.mockReturnValue(record(results));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(
    <MemoryRouter initialEntries={["/hall-of-fame/forty-eight-hours"]}>
      <Routes><Route path="/hall-of-fame/:slug" element={<HallOfFameDetail />} /></Routes>
    </MemoryRouter>,
  ));
  return container;
}

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("HallOfFameDetail — the record is the Results section", () => {
  it("labels the roll as results and states the induction for every honouree", async () => {
    const el = await mount({ winner, runnerUp, special: [special] });
    const text = el.textContent;
    expect(text).toContain("Results");
    expect(text).toContain("Winners");
    expect(text).toContain("Special awards");
    expect(text).toContain("Best Dialogue");
    expect(text).toContain("A permanent place");
    expect(text).toContain("Mira Sen, Dev Kapoor and Ana Ruiz now hold a permanent place in the Ckript Hall of Fame");
    // The back link at the top and the induction's own link both lead to the Hall.
    expect(el.querySelectorAll('a[href="/hall-of-fame"]').length).toBeGreaterThanOrEqual(2);
  });

  it("lists a second runner-up between the runner-up and the special awards", async () => {
    const third = { userId: "w4", name: "Tomás Vega", username: "tomas", scriptTitle: "Platform Nine", rewards: [] };
    const el = await mount({ winner, runnerUp, secondRunnerUp: third, special: [special] });
    const text = el.textContent;
    expect(text).toContain("Second Runner-Up");
    expect(text.indexOf("Dev Kapoor")).toBeLessThan(text.indexOf("Tomás Vega"));
    expect(text.indexOf("Tomás Vega")).toBeLessThan(text.indexOf("Best Dialogue"));
    expect(text).toContain("Mira Sen, Dev Kapoor, Tomás Vega and Ana Ruiz now hold a permanent place");
  });

  it("shows the competition's badge artwork on a laureate who was awarded it", async () => {
    const el = await mount({ winner: { ...winner, badgeImage: "https://cdn.example.com/winner.png" }, runnerUp, special: [] });
    const images = Array.from(el.querySelectorAll("img")).map((img) => img.getAttribute("src"));
    expect(images).toContain("https://cdn.example.com/winner.png");
    expect(images.filter((src) => src === "https://cdn.example.com/winner.png")).toHaveLength(1);
  });

  it("handles a single honouree and a record with special awards only", async () => {
    const el = await mount({ winner: null, runnerUp: null, special: [special] });
    const text = el.textContent;
    expect(text).not.toContain("Winners");
    expect(text).toContain("Results");
    expect(text).toContain("Ana Ruiz now holds a permanent place");
  });

  it("states no induction when nobody is visible to honour", async () => {
    const el = await mount({ winner: null, runnerUp: null, special: [] });
    expect(el.textContent).not.toContain("A permanent place");
  });
});
