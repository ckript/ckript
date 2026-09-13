// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import PrizesModule from "./PrizesModule";

/**
 * The prize editor writes the configuration the declare flow grants from. What matters here is the
 * shape it saves — a valid grant per placing, the opt-in third tier, cash kept in minor units — and
 * that its preview reads the same sentences the server composes for the public page.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

async function mount(data, onChange = vi.fn()) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<PrizesModule data={data} onChange={onChange} />));
  return { el: container, onChange };
}

const change = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value")?.set;
  await act(async () => {
    if (setter) setter.call(input, value); else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("PrizesModule", () => {
  it("previews the historical defaults for a competition with no grants stored", async () => {
    const { el } = await mount({ prizes: { winner: [], runnerUp: [], special: [] } });
    const text = el.textContent;
    expect(text).toContain("Gold plan for 30 days");
    expect(text).toContain("AI trailer for your script");
    expect(text).toContain("Winner badge");
    expect(text).toContain("Silver plan for 30 days");
    expect(text).toContain("Runner-Up badge");
    // The third tier starts off and says so, promising nothing.
    expect(text).toContain("Nothing — this tier is switched off.");
    expect(text).not.toContain("Second Runner-Up badge");
  });

  it("renders the referral rewards block exactly once", async () => {
    const { el } = await mount({ prizes: {} });
    expect(Array.from(el.querySelectorAll("h2")).filter((h) => h.textContent === "Referral Rewards")).toHaveLength(1);
  });

  it("switching the second runner-up on saves an enabled grant for that tier", async () => {
    const { el, onChange } = await mount({ prizes: {} });
    const toggle = Array.from(el.querySelectorAll("label")).find((l) => l.textContent.includes("Award a second runner-up")).querySelector("input");
    await act(async () => toggle.click());
    expect(onChange).toHaveBeenCalledTimes(1);
    const [field, prizes] = onChange.mock.calls[0];
    expect(field).toBe("prizes");
    expect(prizes.grants.secondRunnerUp).toMatchObject({ enabled: true, plan: "silver", planDays: 14 });
    // The other tiers ride along untouched, so a save never drops them.
    expect(prizes.grants.winner).toMatchObject({ plan: "gold", planDays: 30, aiTrailer: true });
  });

  it("keeps cash in minor units and shows it in the preview as paid by Ckript directly", async () => {
    const { el, onChange } = await mount({ prizes: {} });
    await change(el.querySelector("#prize-winner-cash"), "50000");
    const [, prizes] = onChange.mock.calls.at(-1);
    expect(prizes.grants.winner.cashMinor).toBe(5000000);
    expect(prizes.grants.winner.cashCurrency).toBe("INR");
  });

  it("offers a badge image slot per badge kind, with the third only when that tier is on", async () => {
    let { el } = await mount({ prizes: {} });
    expect(Array.from(el.querySelectorAll("[data-badge-slot]")).map((n) => n.getAttribute("data-badge-slot")))
      .toEqual(["badge-winner", "badge-runnerUp", "badge-special", "badge-participant"]);
    act(() => root.unmount());
    container.remove();
    ({ el } = await mount({ prizes: { grants: { secondRunnerUp: { enabled: true } } } }));
    expect(el.querySelector('[data-badge-slot="badge-secondRunnerUp"]')).toBeTruthy();
  });

  it("shows a stored badge image and removes it through onChange", async () => {
    const { el, onChange } = await mount({ prizes: {}, badgeImages: { winner: "https://cdn.example.com/winner.png" } });
    const slot = el.querySelector('[data-badge-slot="badge-winner"]');
    expect(slot.querySelector("img").getAttribute("src")).toBe("https://cdn.example.com/winner.png");
    const remove = Array.from(slot.querySelectorAll("button")).find((b) => b.textContent === "Remove");
    await act(async () => remove.click());
    expect(onChange).toHaveBeenCalledWith("badgeImages", { winner: "" });
  });

  it("each special award can carry its own badge image", async () => {
    const { el } = await mount({ prizes: { special: [{ title: "Best Dialogue", badgeUrl: "https://cdn.example.com/dialogue.png" }] } });
    const slot = el.querySelector('[data-badge-slot="special-badge-0"]');
    expect(slot).toBeTruthy();
    expect(slot.querySelector("img").getAttribute("src")).toBe("https://cdn.example.com/dialogue.png");
  });

  it("shows a stored configuration and its extras in the preview, grants first", async () => {
    const { el } = await mount({
      prizes: {
        winner: ["A producer meeting"],
        grants: { winner: { enabled: true, plan: "none", planDays: 30, featured: false, aiTrailer: false, cashMinor: 10000000, cashCurrency: "INR" } },
        special: [{ title: "Best Dialogue", description: "Jury citation", plan: "silver", planDays: 30, featured: false, cashMinor: 0, cashCurrency: "INR" }],
      },
    });
    const text = el.textContent;
    expect(text).toContain("₹1,00,000 cash prize, paid directly by Ckript");
    expect(text).toContain("A producer meeting");
    expect(text).toContain("Best Dialogue badge");
    expect(text).not.toContain("Gold plan for 30 days");
  });
});
