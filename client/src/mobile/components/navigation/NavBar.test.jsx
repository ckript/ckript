// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import NavBar from "./NavBar";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  container = null;
  root = null;
});

const WRITER = { role: "writer", _id: "u1", name: "Ada Lovelace", username: "ada" };
const PRODUCER = { role: "producer", _id: "u2", name: "Otto Preminger", username: "otto" };

function render(ui, { route = "/dashboard" } = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>));
  return container;
}

const links = (el) => [...el.querySelectorAll("a")];
const labels = (el) => links(el).map((a) => a.querySelector(".ckm-navbar__label").textContent);

describe("NavBar", () => {
  it("is a labelled navigation landmark holding a real list", () => {
    const el = render(<NavBar user={WRITER} />);

    const nav = el.querySelector("nav");
    expect(nav.getAttribute("aria-label")).toBe("Primary");
    // A list, so a screen reader announces how many destinations there are
    // before the user commits to walking them. Four destinations and the More
    // cell, which is a member of the same set and belongs in the same count.
    expect(el.querySelectorAll("ul > li").length).toBe(5);
    expect(links(el).length).toBe(4);
  });

  it("renders the audience's own destinations", () => {
    // 2026-08-07: Create gave its compact slot to Projects (writerNav's note).
    expect(labels(render(<NavBar user={WRITER} />)))
      .toEqual(["Dashboard", "Projects", "Messages", "Profile"]);

    act(() => root.unmount());
    container.remove();

    // 2026-09-03: Featured and Profile moved under More so the bar could carry
    // /dashboard and /writers, which no mobile screen linked to and which the
    // old bar had no room for — leaving them unreachable on a phone.
    expect(labels(render(<NavBar user={PRODUCER} route="/home" />)))
      .toEqual(["Discover", "Dashboard", "Writers", "Messages"]);
  });

  /*
   * The defect this replaces: the old bar took `active="dashboard"` as a prop
   * and every caller passed the constant, so the bar claimed the dashboard was
   * current on every screen in the app.
   */
  it("takes the current tab from the URL, not from a prop", () => {
    const el = render(<NavBar user={WRITER} />, { route: "/messages/653f" });

    const current = links(el).filter((a) => a.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain("Messages");
  });

  it("marks no tab current on a screen that belongs to none", () => {
    const el = render(<NavBar user={WRITER} />, { route: "/script/653f" });
    expect(links(el).filter((a) => a.getAttribute("aria-current"))).toHaveLength(0);
  });

  it("never marks more than one tab current", () => {
    for (const route of ["/dashboard", "/dashboard?tab=projects", "/ada", "/messages"]) {
      const el = render(<NavBar user={WRITER} />, { route });
      expect(links(el).filter((a) => a.getAttribute("aria-current") === "page").length, route)
        .toBeLessThanOrEqual(1);
      act(() => root.unmount());
      container.remove();
      root = null;
      container = null;
    }
  });

  it("navigates with real hrefs, so a destination can be opened however the user likes", () => {
    const el = render(<NavBar user={WRITER} />);
    expect(links(el).map((a) => a.getAttribute("href")))
      .toEqual(["/dashboard", "/dashboard?tab=projects", "/messages", "/ada"]);

    /*
     * Every DESTINATION is a link. The single button is the More cell, which
     * discloses a sheet rather than navigating — the distinction the original
     * "no buttons" rule was really drawing. A button that went somewhere would
     * still be the defect it always was.
     */
    const buttons = [...el.querySelectorAll("button")];
    expect(buttons).toHaveLength(1);
    expect(buttons[0].className).toContain("ckm-navbar__link--more");
    expect(buttons[0].getAttribute("aria-haspopup")).toBe("dialog");
  });

  /*
   * The bar plus its sheet is the whole of navigation in the mobile app. These
   * cover the cell that makes the second half reachable at all.
   */
  describe("the More cell", () => {
    const moreButton = (el) => el.querySelector(".ckm-navbar__link--more");

    it("opens a sheet listing the destinations the bar could not hold", () => {
      const el = render(<NavBar user={PRODUCER} />, { route: "/home" });
      expect(moreButton(el).getAttribute("aria-expanded")).toBe("false");

      act(() => moreButton(el).click());

      expect(moreButton(el).getAttribute("aria-expanded")).toBe("true");
      const sheetLinks = [...el.ownerDocument.querySelectorAll(".ckm-row__main")]
        .map((a) => a.getAttribute("href"))
        .filter(Boolean);
      expect(sheetLinks).toEqual(expect.arrayContaining(["/featured", "/top-script", "/mandates"]));
    });

    it("reads as current when the viewer is on one of its destinations", () => {
      const el = render(<NavBar user={PRODUCER} />, { route: "/mandates" });
      expect(moreButton(el).className).toContain("is-active");
      // …and no tab claims a URL that is not its own.
      expect(links(el).filter((a) => a.getAttribute("aria-current"))).toHaveLength(0);
    });

    it("is not current when a real tab owns the URL", () => {
      const el = render(<NavBar user={PRODUCER} />, { route: "/writers" });
      expect(moreButton(el).className).not.toContain("is-active");
      expect(links(el).filter((a) => a.getAttribute("aria-current") === "page")).toHaveLength(1);
    });
  });

  it("puts an unread count in the accessible name, not only in the badge", () => {
    const el = render(<NavBar user={WRITER} msgCount={3} />);
    const messages = links(el).find((a) => a.textContent.includes("Messages"));

    expect(messages.textContent).toContain("3 unread");
    // The drawn badge is decoration and must not be announced twice.
    expect(messages.querySelector(".ckm-navbar__badge").getAttribute("aria-hidden")).toBe("true");
  });

  it("caps an implausible badge instead of stretching the bar", () => {
    const el = render(<NavBar user={WRITER} msgCount={1240} />);
    expect(el.querySelector(".ckm-navbar__badge").textContent).toBe("99+");
    // The true count still reaches a screen reader.
    expect(el.textContent).toContain("1240 unread");
  });

  it("shows no badge when there is nothing unread", () => {
    const el = render(<NavBar user={WRITER} msgCount={0} />);
    expect(el.querySelector(".ckm-navbar__badge")).toBeNull();
    expect(el.textContent).not.toContain("unread");
  });

  it("keeps every label visible — icon-only primary navigation is not allowed", () => {
    const el = render(<NavBar user={WRITER} />);
    for (const label of el.querySelectorAll(".ckm-navbar__label")) {
      expect(label.textContent.trim().length).toBeGreaterThan(0);
    }
  });

  /*
   * Projects is a query-string destination on the dashboard's own URL, so the
   * bar has to tell it apart from Dashboard by more than the path. Without
   * that, both would resolve to "dashboard" and Projects could never be marked
   * current — which is the whole reason the section was unreachable.
   */
  it("selects Projects, not Dashboard, on the projects URL", () => {
    const el = render(<NavBar user={WRITER} />, { route: "/dashboard?tab=projects" });
    const current = links(el).filter((a) => a.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute("href")).toBe("/dashboard?tab=projects");
  });

  it("selects Dashboard on the bare dashboard URL", () => {
    const el = render(<NavBar user={WRITER} />, { route: "/dashboard" });
    const current = links(el).filter((a) => a.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute("href")).toBe("/dashboard");
  });
});
