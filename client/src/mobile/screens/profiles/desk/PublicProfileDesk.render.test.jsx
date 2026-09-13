// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_PROFILE_STATUS } from "../../../../pages/profile/usePublicProfile";
import PublicProfileDesk from "./PublicProfileDesk";

const mocks = vi.hoisted(() => ({ state: null }));

vi.mock("../../../../pages/profile/usePublicProfile", async (importOriginal) => ({
  ...(await importOriginal()),
  usePublicProfile: () => mocks.state,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const readyState = () => ({
  status: PUBLIC_PROFILE_STATUS.READY,
  profile: {
    _id: "writer-1",
    name: "Mira Sen",
    role: "writer",
    bio: "Writes stories about memory and place.",
    email: "must-not-render@example.com",
    phone: "+91 00000 00000",
    followerCount: 12,
    followingCount: 4,
    writerProfile: { username: "mira", genres: ["Drama"], links: { imdb: "https://www.imdb.com/name/nm1" } },
  },
  scripts: [{ _id: "project-1", title: "The Archive", primaryGenre: "Drama", logline: "An archivist races a flood." }],
  message: "",
  retry: vi.fn(),
});

let container;
let root;

const tabWith = (text) => [...container.querySelectorAll('[role="tab"]')]
  .find((tab) => tab.textContent.trim() === text);

beforeEach(() => {
  mocks.state = readyState();
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
      <MemoryRouter initialEntries={["/share/profile/mira"]}>
        <div className="ckm">
          <Routes>
            <Route path="/share/profile/:id" element={<PublicProfileDesk />} />
          </Routes>
        </div>
      </MemoryRouter>,
    );
  });
}

describe("PublicProfileDesk", () => {
  it("shows the public shelf and asks the one thing a signed-out visitor can do", async () => {
    await render();

    const headings = container.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe("Mira Sen");
    expect(container.querySelector('a[href="/share/project/project-1"]')).toBeTruthy();
    expect(container.querySelector('a[href="/login?next=%2Fshare%2Fprofile%2Fmira"]')).toBeTruthy();
    expect(container.textContent).toContain("Sign in to connect");
  });

  it("never leaks the projection's private fields", async () => {
    await render();
    expect(container.textContent).not.toContain("must-not-render@example.com");
    expect(container.textContent).not.toContain("+91 00000 00000");
  });

  it("offers no Activity tab, because the public projection has no collection behind it", async () => {
    await render();
    const labels = [...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent.trim());
    expect(labels).toEqual(["Scripts", "About"]);
  });

  it("opens external links as links rather than routes", async () => {
    await render();
    await act(async () => tabWith("About").click());

    const imdb = container.querySelector('a[href="https://www.imdb.com/name/nm1"]');
    expect(imdb).toBeTruthy();
    expect(imdb.getAttribute("rel")).toContain("noreferrer");
  });

  it("keeps a private or missing profile actionable", async () => {
    mocks.state = { ...readyState(), status: PUBLIC_PROFILE_STATUS.PRIVATE, profile: null, scripts: [], message: "This account is private." };
    await render();

    expect(container.textContent).toContain("This profile is private");
    expect(container.querySelector('a[href="/login?next=%2Fshare%2Fprofile%2Fmira"]')).toBeTruthy();
  });
});
