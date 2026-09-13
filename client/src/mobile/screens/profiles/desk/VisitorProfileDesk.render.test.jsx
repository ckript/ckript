// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../../../context/AuthContext";
import { AUTHENTICATED_PROFILE_STATUS } from "../../../../pages/profile/authenticatedProfile";
import { ToastContext } from "../../../components/feedback/toastContext";
import VisitorProfileDesk from "./VisitorProfileDesk";

const mocks = vi.hoisted(() => ({
  state: null,
  collection: null,
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock("../../../../pages/profile/useAuthenticatedProfile", () => ({
  useAuthenticatedProfile: () => mocks.state,
}));

vi.mock("../../../../pages/profile/useProfileCollections", () => ({
  useProfileCollections: () => mocks.collection,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const viewer = {
  _id: "producer-1",
  role: "producer",
  email: "producer@studio.example",
  subscription: { contactsLimit: 10, revealedContacts: [] },
};

const readyState = () => ({
  status: AUTHENTICATED_PROFILE_STATUS.READY,
  profile: {
    _id: "writer-1",
    name: "Mira Sen",
    role: "writer",
    bio: "Writes stories about memory and place.",
    email: "must-not-render@example.com",
    phone: "+91 00000 00000",
    followers: [],
    following: [],
    allowIndustryContact: true,
    writerProfile: { username: "mira", genres: ["Drama"] },
  },
  scripts: [{ _id: "project/1", title: "The Archive", primaryGenre: "Drama", logline: "An archivist races a flood." }],
  relationship: {},
  contact: null,
  contactStats: null,
  pending: { follow: false, block: false, message: false, contact: false, pitch: false },
  actionError: "",
  reload: vi.fn(),
  clearActionError: vi.fn(),
  follow: vi.fn().mockResolvedValue(true),
  toggleBlock: vi.fn().mockResolvedValue(true),
  sendMessage: vi.fn().mockResolvedValue(true),
  revealContact: vi.fn().mockResolvedValue(true),
  loadPitchScripts: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  sendPitch: vi.fn().mockResolvedValue(true),
});

let container;
let root;

/* An icon font renders its glyph name as text, and every glyph here is
   aria-hidden, so the accessible name is right and only `textContent` is
   polluted. Read the label the way assistive technology does. */
const labelOf = (element) => [...element.childNodes]
  .filter((node) => !(node.nodeType === 1 && node.classList?.contains("material-symbols-outlined")))
  .map((node) => node.textContent)
  .join("")
  .trim();
const buttonWith = (text) => [...container.querySelectorAll("button")]
  .find((button) => labelOf(button) === text);
const tabWith = (text) => [...container.querySelectorAll('[role="tab"]')]
  .find((tab) => tab.textContent.trim() === text);

beforeEach(() => {
  mocks.state = readyState();
  mocks.collection = {
    status: "ready",
    data: {
      items: [{ _id: "post-1", content: "Public update", counts: { likes: 1, comments: 0, saves: 0 } }],
      counts: { activity: 1, bookmarks: null },
      pagination: { page: 1, total: 1, totalPages: 1, hasPrevious: false, hasNext: false },
    },
    failure: null,
    reload: vi.fn(),
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  vi.clearAllMocks();
});

async function render() {
  await act(async () => {
    root.render(
      <AuthContext.Provider value={{ user: viewer, setUser: vi.fn() }}>
        <ToastContext.Provider value={mocks.toast}>
          <MemoryRouter initialEntries={["/share/profile/mira"]}>
            <div className="ckm">
              <Routes>
                <Route path="/share/profile/:id" element={<VisitorProfileDesk user={viewer} />} />
              </Routes>
            </div>
          </MemoryRouter>
        </ToastContext.Provider>
      </AuthContext.Provider>,
    );
  });
}

describe("VisitorProfileDesk", () => {
  it("names the person in the screen's one heading and shows the shelf first", async () => {
    await render();

    const headings = container.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe("Mira Sen");
    expect(container.querySelector('a[href="/share/project/project%2F1"]')).toBeTruthy();
    expect(tabWith("Scripts")?.getAttribute("aria-selected")).toBe("true");
  });

  it("keeps the cheap actions in the row and the metered one in the dock", async () => {
    await render();

    expect(buttonWith("Follow")).toBeTruthy();
    expect(buttonWith("Message")).toBeTruthy();
    expect(buttonWith("Reveal contact")).toBeTruthy();

    await act(async () => buttonWith("Follow").click());
    expect(mocks.state.follow).toHaveBeenCalledTimes(1);
  });

  it("never renders the writer's raw contact before it has been revealed", async () => {
    await render();
    expect(container.textContent).not.toContain("must-not-render@example.com");
    expect(container.textContent).not.toContain("+91 00000 00000");
  });

  it("states what a reveal costs before spending it", async () => {
    await render();
    await act(async () => buttonWith("Reveal contact").click());

    expect(container.textContent).toContain("Contact reveals used");
    expect(container.textContent).toContain("0 / 10");

    await act(async () => buttonWith("Reveal contact · uses 1").click());
    expect(mocks.state.revealContact).toHaveBeenCalledTimes(1);
  });

  it("moves the activity feed behind its own tab and leaves the owner-only sections out", async () => {
    await render();
    expect(container.textContent).not.toContain("Public update");

    await act(async () => tabWith("Activity").click());
    expect(container.textContent).toContain("Public update");
    expect(container.querySelector('input[value="bookmarks"]')).toBeNull();
  });

  it("keeps a private profile useful through the server-resolved follow target", async () => {
    mocks.state = {
      ...readyState(),
      status: AUTHENTICATED_PROFILE_STATUS.PRIVATE,
      profile: null,
      scripts: [],
      failure: { profileId: "writer-1", message: "This account is private." },
      relationship: { followRequestPending: true },
    };
    await render();

    expect(container.textContent).toContain("This profile is private");
    await act(async () => buttonWith("Cancel follow request").click());
    expect(mocks.state.follow).toHaveBeenCalledTimes(1);
  });

  it("sends a restricted viewer to the plans rather than a dead profile", async () => {
    mocks.state = {
      ...readyState(),
      status: AUTHENTICATED_PROFILE_STATUS.RESTRICTED,
      profile: null,
      scripts: [],
      failure: { message: "Industry access is required." },
    };
    await render();

    expect(container.textContent).toContain("Profile access is restricted");
    expect(container.querySelector('a[href="/pricing"]')).toBeTruthy();
  });
});
