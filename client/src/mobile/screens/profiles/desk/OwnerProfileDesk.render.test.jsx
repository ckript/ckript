// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../../../context/AuthContext";
import { AUTHENTICATED_PROFILE_STATUS } from "../../../../pages/profile/authenticatedProfile";
import { ToastContext } from "../../../components/feedback/toastContext";
import OwnerProfileDesk from "./OwnerProfileDesk";

const mocks = vi.hoisted(() => ({
  state: null,
  collection: null,
  save: vi.fn(),
  upload: vi.fn(),
  settings: vi.fn(),
  deleteProject: vi.fn(),
  decide: vi.fn(),
  inbox: null,
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock("../../../../pages/profile/useAuthenticatedProfile", () => ({
  useAuthenticatedProfile: () => mocks.state,
}));

vi.mock("../../../../pages/profile/useProfileCollections", () => ({
  useProfileCollections: () => mocks.collection,
}));

vi.mock("../../../../pages/profile/profileEditor", async (importOriginal) => ({
  ...(await importOriginal()),
  saveOwnProfile: mocks.save,
  uploadOwnProfileImage: mocks.upload,
}));

vi.mock("../../../../pages/profile/accountSecurity", async (importOriginal) => ({
  ...(await importOriginal()),
  updateAccountSettings: mocks.settings,
}));

vi.mock("../../../../pages/profile/useOwnerInbox", async (importOriginal) => ({
  ...(await importOriginal()),
  useOwnerInbox: () => mocks.inbox,
}));

vi.mock("../../../../pages/profile/ownerInbox", async (importOriginal) => ({
  ...(await importOriginal()),
  deleteOwnProject: mocks.deleteProject,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const viewer = { _id: "writer-1", role: "writer", name: "Mira Sen", writerProfile: { username: "mira" } };
const readyState = () => ({
  status: AUTHENTICATED_PROFILE_STATUS.READY,
  profile: {
    ...viewer,
    email: "mira@example.com",
    phone: "+91 12345",
    bio: "Writes stories about memory and place.",
    followers: [],
    following: [],
    isPrivate: false,
    allowIndustryContact: true,
    pendingFollowRequestCount: 2,
    profileCompletion: { percentage: 73, completedFields: 8, totalFields: 11, isComplete: false },
    writerProfile: { username: "mira", genres: ["Drama"], specializedTags: ["Raw"] },
  },
  scripts: [{
    _id: "project-1", title: "The Archive", primaryGenre: "Drama", contentType: "feature",
    pageCount: 112, views: 412, status: "published", logline: "An archivist races a flood.",
  }],
  purchasedScripts: [],
  bookmarkedScripts: [],
  relationship: {},
  reload: vi.fn(),
  applyProfileUpdate: vi.fn(),
});

let container;
let root;

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
      items: [{ _id: "post-1", content: "Production update", counts: { likes: 2, comments: 1, saves: 0 } }],
      counts: { activity: 1, bookmarks: 3 },
      pagination: { page: 1, total: 1, totalPages: 1, hasPrevious: false, hasNext: false },
    },
    failure: null,
    removingId: "",
    actionError: "",
    reload: vi.fn(),
    removeSaved: vi.fn(),
  };
  mocks.save.mockResolvedValue({ ok: true, data: { name: "Mira Sen", profileCompletion: { percentage: 73 } } });
  mocks.deleteProject.mockResolvedValue({ ok: true, data: { projectId: "project-1" } });
  mocks.decide.mockResolvedValue({ ok: true });
  mocks.inbox = {
    items: [
      {
        key: "meeting:m1", kind: "meeting", id: "m1", name: "Devan Iyer",
        detail: "Ckript meeting", subject: "About The Archive", when: "Thu 10 Sep · 30 min",
        message: "Can we talk Thursday?", state: "pending", canDecide: true, joinUrl: "", profilePath: "",
      },
      {
        key: "follow:u9", kind: "follow", id: "u9", name: "Rehan Qureshi",
        detail: "Writer", subject: "Wants to follow you", when: "2 days ago",
        message: "", state: "pending", canDecide: true, joinUrl: "", profilePath: "/profile/rehanq",
      },
    ],
    pending: 2,
    status: "ready",
    error: "",
    actingKey: "",
    reload: vi.fn(),
    decide: mocks.decide,
  };
  mocks.settings.mockResolvedValue({ ok: true, data: { user: { isPrivate: true } } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  vi.clearAllMocks();
  localStorage.clear();
});

async function render({ user = viewer } = {}) {
  await act(async () => {
    root.render(
      <AuthContext.Provider value={{ user, setUser: vi.fn() }}>
        <ToastContext.Provider value={mocks.toast}>
          <MemoryRouter initialEntries={["/profile"]}>
            <div className="ckm">
              <Routes><Route path="/profile" element={<OwnerProfileDesk user={user} />} /></Routes>
            </div>
          </MemoryRouter>
        </ToastContext.Provider>
      </AuthContext.Provider>,
    );
  });
}

describe("OwnerProfileDesk", () => {
  it("opens on your own shelf, with completion and the pending queue surfaced above it", async () => {
    await render();

    const headings = container.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe("Mira Sen");
    expect(container.textContent).toContain("Profile 73% complete");
    /* The count lives on the tab, which is where the prototype puts it — a
       banner saying the same thing is noise on a screen you open every day. */
    expect(tabWith("Requests2")).toBeTruthy();
    expect(container.querySelector('a[href="/script/project-1"]')).toBeTruthy();
    expect(container.querySelector('a[href="/create-project"]')).toBeTruthy();
  });

  it("keeps every workspace destination the old screen offered", async () => {
    await render();
    await act(async () => tabWith("About").click());

    expect(container.textContent).toContain("mira@example.com");
    expect(container.querySelector('a[href="/profile?tab=settings"]')).toBeTruthy();
    expect(container.querySelector('a[href="/collaborations"]')).toBeTruthy();
  });

  it("does not offer the writer-only collaboration queue on an industry profile", async () => {
    const producer = { _id: "producer-1", role: "producer", name: "Dev Rao" };
    mocks.state = {
      ...readyState(),
      profile: { ...readyState().profile, ...producer, writerProfile: undefined, industryProfile: { company: "North Star" } },
      scripts: [],
    };

    await render({ user: producer });
    await act(async () => tabWith("About").click());

    expect(container.querySelector('a[href="/collaborations"]')).toBeNull();
    expect(container.querySelector('a[href="/profile?tab=settings"]')).toBeTruthy();
    expect(tabWith("Mandate")).toBeTruthy();
  });

  it("opens the editor and saves through the shared mutation", async () => {
    await render();
    await act(async () => buttonWith("Edit").click());
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    expect(container.textContent).toContain("Managed separately");

    await act(async () => buttonWith("Save profile").click());
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      profile: expect.objectContaining({ _id: "writer-1" }),
      draft: expect.objectContaining({ username: "mira" }),
    }));
    expect(mocks.state.applyProfileUpdate).toHaveBeenCalled();
    expect(mocks.toast.success).toHaveBeenCalled();
  });

  it("writes visibility through the same settings mutation the security tab uses", async () => {
    await render();
    const discoverable = container.querySelector('[role="switch"][aria-label="Discoverable in search"]');
    expect(discoverable.getAttribute("aria-checked")).toBe("true");

    await act(async () => discoverable.click());
    expect(mocks.settings).toHaveBeenCalledWith({ isPrivate: true });
    expect(mocks.state.applyProfileUpdate).toHaveBeenCalledWith({ isPrivate: true });
  });

  it("says so, and offers the way back, when the profile is hidden", async () => {
    mocks.state = { ...readyState(), profile: { ...readyState().profile, isPrivate: true } };
    await render();

    expect(container.textContent).toContain("Your profile is hidden");
    await act(async () => buttonWith("Unhide").click());
    expect(mocks.settings).toHaveBeenCalledWith({ isPrivate: false });
  });

  it("keeps the saved-projects collection behind its own tab", async () => {
    await render();
    expect(container.textContent).not.toContain("Production update");

    /* Selecting it lands on the half only an owner has — bookmarks — with the
       activity feed one tap away in the section control. */
    await act(async () => tabWith("Saved").click());
    expect(container.textContent).toContain("Your saved projects");
    expect(container.querySelectorAll('input[name="profile-collection"]')).toHaveLength(2);
    expect(container.querySelector('input[value="bookmarks"]')?.checked).toBe(true);
  });

  it("gives the owner a workspace, not the visitor's screen with an Edit button", async () => {
    await render();
    const labels = [...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent.trim());
    expect(labels).toEqual(["Scripts", "Requests2", "Saved", "About"]);
  });

  it("shows what is waiting and answers it in place", async () => {
    await render();
    await act(async () => tabWith("Requests2").click());

    expect(container.textContent).toContain("Devan Iyer");
    expect(container.textContent).toContain("About The Archive");
    expect(container.textContent).toContain("Rehan Qureshi");
    expect(container.textContent).toContain("Wants to follow you");

    const accept = buttonWith("Accept meeting");
    await act(async () => accept.click());
    expect(mocks.decide).toHaveBeenCalledWith(expect.objectContaining({ kind: "meeting" }), true);
  });

  it("does not offer a decision on a settled request, but does offer the link", async () => {
    mocks.inbox = {
      ...mocks.inbox,
      pending: 0,
      items: [{
        key: "meeting:m2", kind: "meeting", id: "m2", name: "Sadhana Kulkarni",
        detail: "Ckript meeting", subject: "About The Archive", when: "Fri 11 Sep",
        message: "", state: "accepted", canDecide: false, joinUrl: "https://meet.example/x", profilePath: "",
      }],
    };
    await render();
    await act(async () => tabWith("Requests").click());

    expect(buttonWith("Accept meeting")).toBeUndefined();
    expect(container.querySelector('a[href="https://meet.example/x"]')).toBeTruthy();
    expect(container.textContent).toContain("All caught up");
  });

  it("gives each project the owner-only controls and confirms before deleting one", async () => {
    await render();

    expect(container.textContent).toContain("Published");
    expect(container.textContent).toContain("412 views");

    const more = container.querySelector('[aria-label="Options for The Archive"]');
    await act(async () => more.click());
    expect(container.textContent).toContain("Delete the project");

    await act(async () => buttonWith("Delete the project").click());
    expect(container.querySelector('[role="alertdialog"]')).toBeTruthy();
    expect(mocks.deleteProject).not.toHaveBeenCalled();

    await act(async () => buttonWith("Delete project").click());
    expect(mocks.deleteProject).toHaveBeenCalledWith("project-1");
    expect(container.querySelector('[role="tabpanel"]').textContent).toContain("No projects yet");
  });

  it("leads an industry desk with its queue", async () => {
    const producer = { _id: "producer-1", role: "producer", name: "Dev Rao" };
    mocks.state = {
      ...readyState(),
      profile: { ...readyState().profile, ...producer, writerProfile: undefined, industryProfile: { company: "North Star" } },
      scripts: [],
    };
    await render({ user: producer });

    const labels = [...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent.trim());
    expect(labels).toEqual(["Queue2", "Mandate", "Saved", "About"]);
  });
});
