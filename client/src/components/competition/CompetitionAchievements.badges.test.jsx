// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import CompetitionAchievements from "./CompetitionAchievements";

/**
 * A badge awarded with the competition's own artwork shows that artwork on the profile; one without
 * keeps the medal chip. The label is visible either way.
 */

vi.mock("../../services/publicApi", () => ({ default: { get: vi.fn().mockResolvedValue({ data: { history: [] } }) } }));
vi.mock("../../services/api", () => ({ default: { get: vi.fn().mockResolvedValue({ data: { history: [] } }) } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

async function mount(badges) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(
    <MemoryRouter>
      <CompetitionAchievements userId="u1" badges={badges} />
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

describe("CompetitionAchievements badge artwork", () => {
  it("renders the uploaded image for a badge that carries one and the medal chip for one that does not", async () => {
    const el = await mount([
      { id: "challenge_winner", label: "Global Script Challenge Winner", imageUrl: "https://cdn.example.com/winner.png", awardedAt: "2026-09-10T00:00:00.000Z" },
      { id: "challenge_participant", label: "Global Script Challenge Participant", awardedAt: "2026-09-10T00:00:00.000Z" },
    ]);
    const images = Array.from(el.querySelectorAll("img"));
    expect(images.map((img) => img.getAttribute("src"))).toEqual(["https://cdn.example.com/winner.png"]);
    expect(el.textContent).toContain("Global Script Challenge Winner");
    expect(el.textContent).toContain("Global Script Challenge Participant");
    expect(el.querySelectorAll("[data-badge-image]")).toHaveLength(1);
  });
});
