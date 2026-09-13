// @vitest-environment happy-dom
//
// The admin panel sits behind its own access-code gate, so this mounts AdminCompetitions directly
// with a stubbed adminApi. What matters here is the declare-results flow: it grants irreversible
// rewards, so the winner must be required, the confirmation must state exactly what will be given
// away, and the panel must disappear once results are declared.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
vi.mock("./dashboardShared", () => ({ adminApi: { get: (...a) => get(...a), post: (...a) => post(...a), put: (...a) => put(...a) } }));
vi.mock("../../components/ScreenplayReadOnly", () => ({ default: ({ text }) => <pre>{text}</pre> }));

const { default: AdminCompetitions } = await import("./AdminCompetitions");

const COMPETITION = {
  _id: "c1",
  name: "Global Script Challenge",
  lifecycle: "published",
  phase: "judging",
  entryCount: 3,
  submittedCount: 2,
  dates: { startsAt: "2026-03-01T00:00:00.000Z" },
  resultsDeclaredAt: null,
};

const ENTRIES = [
  { _id: "e1", eventId: "CGSC-AAAAAAAA", status: "ai_processed", submittedAt: "2026-03-03T10:00:00.000Z",
    userId: { name: "Ada", email: "ada@example.com" }, snapshot: { title: "Signals", pageCount: 42, wordCount: 8000, fountainContent: "INT. ROOM - DAY" },
    ai: { logline: "A coder hears a pattern.", evaluation: { overall: 88 } }, result: {} },
  { _id: "e2", eventId: "CGSC-BBBBBBBB", status: "submitted", submittedAt: "2026-03-03T11:00:00.000Z",
    userId: { name: "Bo", email: "bo@example.com" }, snapshot: { title: "Static", pageCount: 30, wordCount: 5000 },
    ai: { error: "Evaluation: the AI returned no usable score." }, result: {} },
  { _id: "e3", eventId: "CGSC-CCCCCCCC", status: "registered", submittedAt: null,
    userId: { name: "Cy", email: "cy@example.com" }, snapshot: {}, ai: {}, result: {} },
];

let container, root;
// AdminCompetitions calls useNavigate, which throws outside a Router. Mounting through
// MemoryRouter keeps these tests about the panel's behaviour rather than about routing.
const mount = async (el) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<MemoryRouter>{el}</MemoryRouter>); });
  return container;
};
const flush = () => act(async () => { await Promise.resolve(); });
const buttons = () => [...container.querySelectorAll("button")];
const byText = (re) => buttons().find((b) => re.test(b.textContent));

beforeEach(() => {
  get.mockReset(); post.mockReset(); put.mockReset();
  get.mockImplementation((url) => {
    if (url === "/admin/competitions") return Promise.resolve({ data: { competitions: [COMPETITION] } });
    if (url.endsWith("/entries")) return Promise.resolve({ data: { entries: ENTRIES, phase: "judging", competition: COMPETITION, rewardLines: REWARD_LINES } });
    return Promise.resolve({ data: {} });
  });
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); delete window.confirm; });

// What the server composes from the competition's reward configuration — the dialog quotes these
// rather than fixed copy, so what the admin confirms is what the declare flow grants.
const REWARD_LINES = {
  winner: ["Gold plan for 30 days", "Featured placement when you publish your script", "AI trailer for your script", "Winner badge"],
  runnerUp: ["Silver plan for 30 days", "Featured placement when you publish your script", "Runner-Up badge"],
  secondRunnerUp: [],
  special: [],
};

describe("AdminCompetitions list", () => {
  it("lists competitions with phase, lifecycle and entry counts", async () => {
    await mount(<AdminCompetitions />);
    await flush();
    const t = container.textContent;
    expect(t).toContain("Global Script Challenge");
    expect(t).toContain("Judging");
    expect(t).toContain("published");
    expect(t).toContain("3 registered");
    expect(t).toContain("2 submitted");
  });
});

describe("declare results", () => {
  const openEntries = async () => {
    await mount(<AdminCompetitions />);
    await flush();
    await act(async () => { byText(/^Entries$/).click(); });
    await flush();
  };

  it("shows every entry with its writer, status and AI state", async () => {
    await openEntries();
    const t = container.textContent;
    expect(t).toContain("Ada");
    expect(t).toContain("ada@example.com");
    expect(t).toContain("CGSC-AAAAAAAA");
    expect(t).toContain("A coder hears a pattern.");
    expect(t).toContain("Score 88");
    // The failed entry offers a retry rather than silently showing nothing.
    expect(t).toContain("Evaluation: the AI returned no usable score.");
    expect(byText(/Retry AI/)).toBeTruthy();
  });

  it("offers only SUBMITTED entries as winner candidates", async () => {
    await openEntries();
    const winnerSelect = container.querySelectorAll("select")[0];
    const options = [...winnerSelect.options].map((o) => o.textContent);
    expect(options.some((o) => o.includes("Ada"))).toBe(true);
    expect(options.some((o) => o.includes("Bo"))).toBe(true);
    // Cy never submitted — awarding them would be wrong, so they must not be selectable.
    expect(options.some((o) => o.includes("Cy"))).toBe(false);
  });

  it("keeps Declare disabled until a winner is chosen", async () => {
    await openEntries();
    expect(byText(/Declare results/).disabled).toBe(true);
  });

  it("states exactly what will be granted before declaring, and aborts if cancelled", async () => {
    await openEntries();
    const select = container.querySelectorAll("select")[0];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
    await act(async () => {
      setter.call(select, "e1");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const confirmSpy = vi.fn().mockReturnValue(false);
    window.confirm = confirmSpy;
    await act(async () => { byText(/Declare results/).click(); });

    const message = confirmSpy.mock.calls[0][0];
    expect(message).toContain("Ada");
    expect(message).toContain("Gold plan for 30 days");
    expect(message).toContain("Winner badge");
    expect(message).toContain("Featured placement when you publish your script");
    expect(message).toContain("AI trailer for your script");
    expect(message).toContain("cannot be undone");
    // Cancelling must not fire the irreversible request.
    expect(post).not.toHaveBeenCalled();
  });

  it("posts the declaration once confirmed", async () => {
    await openEntries();
    const select = container.querySelectorAll("select")[0];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
    await act(async () => {
      setter.call(select, "e1");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    window.confirm = vi.fn().mockReturnValue(true);
    post.mockResolvedValue({ data: { declared: true, counts: { winners: 1, runnerUp: 0, special: 0, participants: 1 } } });
    await act(async () => { byText(/Declare results/).click(); });
    await flush();

    expect(post).toHaveBeenCalledTimes(1);
    const [url, body] = post.mock.calls[0];
    expect(url).toBe("/admin/competitions/c1/results");
    expect(body.winnerEntryId).toBe("e1");
    expect(body.runnerUpEntryId).toBeUndefined();
  });

  it("hides the declare panel once results are already declared", async () => {
    const declared = { ...COMPETITION, resultsDeclaredAt: "2026-03-10T00:00:00.000Z" };
    get.mockImplementation((url) => {
      if (url === "/admin/competitions") return Promise.resolve({ data: { competitions: [declared] } });
      if (url.endsWith("/entries")) return Promise.resolve({ data: { entries: ENTRIES, phase: "results", competition: declared } });
      return Promise.resolve({ data: {} });
    });
    await openEntries();
    expect(byText(/Declare results/)).toBeUndefined();
    expect(container.textContent).toContain("Results declared");
  });
});
