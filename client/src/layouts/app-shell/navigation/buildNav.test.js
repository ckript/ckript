// The app shell's nav model.
//
// Context that makes these tests worth having: the app used to have TWO
// independent navigation systems — components/Sidebar.jsx (used by MainLayout)
// and this builder (used by the app shell). A writer signed in on /dashboard saw
// this one. The competition feature was added only to the other, so every writer
// had a live competition they could not reach from anywhere in the UI.
//
// Consolidating producers onto the app shell removes the second nav for them, so
// these tests now also guard the producer's destinations.
import { describe, it, expect } from "vitest";
import { buildNav, MOBILE_SLOTS } from "./buildNav";
import { SYMBOLS } from "./symbols";
import { AUDIENCE, KNOWN_ROLES } from "../shellPolicy";

const navFor = (role, profilePath = "/profile/ada", msgCount = 3) =>
  buildNav({ user: { role }, profilePath, msgCount });

const forWriter = (role = "writer") => navFor(role);

const items = (list = []) => list.filter((i) => i && !i.divider);
const paths = (list = []) => items(list).map((i) => i.path);
const lists = (nav) => [nav.primary, nav.drawer, nav.mobile];

describe("buildNav — writer", () => {
  it("puts the live Challenge in the always-visible rail", () => {
    expect(paths(forWriter().primary)).toContain("/challenge");
  });

  it("offers both Challenge and My Competitions in the drawer", () => {
    const drawer = paths(forWriter().drawer);
    expect(drawer).toContain("/challenge");
    // My Competitions is the hub's fourth tab now, not a route of its own.
    expect(drawer).toContain("/challenge?tab=mine");
  });

  it("treats creators the same as writers", () => {
    expect(paths(forWriter("creator").primary)).toContain("/challenge");
  });

  // The bottom nav used to select by POSITION (primary[0], [1], [3]), so
  // inserting Challenge into the rail silently pushed Messages out of the mobile
  // nav. This is the guard for that.
  it("keeps the mobile bottom nav intact when the rail grows", () => {
    const { mobile } = forWriter();
    // 2026-08-07: Create gave its compact slot to Projects (see writerNav's
    // note). Create stays in the rail and drawer, and is the dashboard hero's
    // primary action, so it is still one tap from home.
    expect(paths(mobile)).toEqual(["/dashboard", "/dashboard?tab=projects", "/messages", "/profile/ada"]);
    expect(mobile.length).toBeLessThanOrEqual(MOBILE_SLOTS);
    expect(mobile.every(Boolean)).toBe(true);
  });

  it("keeps Projects compact-only while Create stays in the desktop rail", () => {
    const nav = forWriter();
    expect(paths(nav.primary)).toContain("/create-project");
    expect(paths(nav.primary)).not.toContain("/dashboard?tab=projects");
    expect(paths(nav.mobile)).toContain("/dashboard?tab=projects");
    expect(paths(nav.mobile)).not.toContain("/create-project");
  });

  it("carries the unread badge through to mobile, not just the rail", () => {
    const messages = forWriter().mobile.find((i) => i.path === "/messages");
    expect(messages?.badge).toBe(3);
  });

  it("offers My Projects as the drawer collection", () => {
    expect(forWriter().collection).toMatchObject({
      title: "My Projects",
      endpoint: "/scripts/mine",
    });
  });
});

describe("buildNav — industry (producer / director / investor)", () => {
  /*
   * Producers previously had two different navs depending on which shell
   * rendered them, and consolidating must not drop a destination either one
   * could reach. These are the ones that only existed in components/Sidebar.jsx
   * and would have been silently lost by moving to the shell's old producer nav.
   */
  it.each([
    ["/dashboard", "their own dashboard"],
    ["/top-script", "top scripts"],
    ["/search", "project search"],
    ["/writers", "the writer directory"],
    ["/messages", "messages"],
    ["/featured", "featured projects"],
    ["/home", "the discovery home"],
  ])("still reaches %s (%s)", (path) => {
    const nav = navFor("producer");
    expect(paths([...nav.primary, ...nav.drawer])).toContain(path);
  });

  it("finally links My Mandates, which no nav in the app pointed at", () => {
    expect(paths(navFor("producer").drawer)).toContain("/mandates");
  });

  it("keeps saved projects reachable via the profile bookmarks tab", () => {
    expect(paths(navFor("producer").drawer)).toContain("/profile/ada?tab=bookmarks");
  });

  /*
   * The bug: the compact bar was Discover / Featured / Messages / Profile, the
   * mobile app has no drawer, and no industry mobile screen links to either of
   * these. A producer on a phone could not open their own deal book or the
   * writer directory from anywhere.
   */
  it.each([
    ["/dashboard", "their own deal book"],
    ["/writers", "the writer directory"],
  ])("puts %s (%s) in the compact bar, not out of reach", (path) => {
    expect(paths(navFor("producer").mobile)).toContain(path);
  });

  it("keeps the rest of the producer's destinations under More", () => {
    const overflow = paths(navFor("producer").mobileOverflow);
    for (const path of ["/featured", "/top-script", "/search", "/mandates", "/profile/ada"]) {
      expect(overflow, `${path} missing from the More sheet`).toContain(path);
    }
  });

  it("offers the Watchlist as the drawer collection", () => {
    expect(navFor("producer").collection).toMatchObject({
      title: "Watchlist",
      endpoint: "/users/watchlist",
    });
  });

  // The roles that used to fall through to the writer nav entirely.
  it.each(["producer", "director", "industry", "professional", "investor", "actor"])(
    "%s gets industry chrome, not a screenwriter's toolbar",
    (role) => {
      const nav = navFor(role);
      expect(nav.audience).toBe(AUDIENCE.INDUSTRY);
      const every = paths([...nav.primary, ...nav.drawer]);
      expect(every).not.toContain("/create-project");
      expect(every).not.toContain("/upload");
      expect(every).toContain("/home");
    },
  );

  it("gives investors and producers the identical nav", () => {
    const investor = navFor("investor");
    const producer = navFor("producer");
    expect(paths(investor.primary)).toEqual(paths(producer.primary));
    expect(paths(investor.drawer)).toEqual(paths(producer.drawer));
  });

  it("keeps professional-only mandates and watchlists out of the actor discovery chrome", () => {
    const actor = navFor("actor");
    expect(paths(actor.drawer)).not.toContain("/mandates");
    expect(paths(actor.drawer).some((path) => path.includes("tab=bookmarks"))).toBe(false);
    expect(actor.collection).toBeNull();
  });
});

describe("buildNav — admin", () => {
  it("links the admin console instead of offering to write a script", () => {
    const nav = navFor("admin");
    const every = paths([...nav.primary, ...nav.drawer]);
    expect(every).toContain("/admin");
    expect(every).not.toContain("/create-project");
    expect(every).not.toContain("/upload");
  });
});

describe("buildNav — competitions stay writer-only", () => {
  it.each(["reader", "investor", "producer", "director", "actor", "admin"])(
    "%s gets no competition entries",
    (role) => {
      const nav = navFor(role);
      const every = paths(lists(nav).flat());
      expect(every.some((p) => p.startsWith("/challenge"))).toBe(false);
    },
  );

  it("readers still land on their own home", () => {
    expect(paths(navFor("reader").primary)).toContain("/reader");
  });
});

/*
 * Invariants that must hold for EVERY audience. These are the cheap guards that
 * catch a typo'd icon key or a duplicated nav key in a new preset, which
 * otherwise surface as an invisible glyph or a React key warning in production.
 */
describe("buildNav — invariants across every role", () => {
  const everyRole = [...KNOWN_ROLES, "wizard", "", undefined];

  it.each(everyRole)("role %s produces a complete, renderable model", (role) => {
    const nav = navFor(role);

    expect(Array.isArray(nav.primary)).toBe(true);
    expect(nav.primary.length).toBeGreaterThan(0);
    expect(Array.isArray(nav.drawer)).toBe(true);
    expect(nav.mobile.length).toBeLessThanOrEqual(MOBILE_SLOTS);
    expect(nav.mobile.every(Boolean)).toBe(true);
  });

  it.each(everyRole)("role %s uses only icons that resolve to a symbol", (role) => {
    const nav = navFor(role);
    for (const item of items(lists(nav).flat())) {
      expect(SYMBOLS[item.icon], `icon "${item.icon}" is not in SYMBOLS`).toBeTruthy();
    }
  });

  it.each(everyRole)("role %s gives every item a unique key per list", (role) => {
    for (const list of lists(navFor(role))) {
      const keys = items(list).map((i) => i.key);
      expect(new Set(keys).size, `duplicate key in ${JSON.stringify(keys)}`).toBe(keys.length);
    }
  });

  it.each(everyRole)("role %s gives every item a path and a label", (role) => {
    for (const item of items(lists(navFor(role)).flat())) {
      expect(item.path, `${item.key} has no path`).toBeTruthy();
      expect(item.label, `${item.key} has no label`).toBeTruthy();
    }
  });

  /*
   * Profile is no longer pinned to the last slot — the industry audience needs
   * all four for destinations that have no other route on a phone. What must
   * still hold is that it is never LOST: it is in the bar, or it is under More.
   */
  it.each(KNOWN_ROLES)("role %s can still reach Profile on a phone", (role) => {
    const profilePath = "/profile/ada";
    const nav = navFor(role, profilePath);
    const reachable = [...nav.mobile, ...nav.mobileOverflow].map((item) => item.path);
    expect(reachable).toContain(profilePath);
  });

  it.each(KNOWN_ROLES)("role %s fills at most the four slots the bar has", (role) => {
    expect(navFor(role).mobile.length).toBeLessThanOrEqual(MOBILE_SLOTS);
  });

  /*
   * THE PHONE INVARIANT.
   *
   * The mobile app has no drawer. The bar plus its More sheet is the whole of
   * navigation there, so any drawer destination missing from both is a page
   * that cannot be reached on a phone at all — which is exactly how /dashboard
   * and /writers went missing for producers.
   */
  it.each(KNOWN_ROLES)("role %s can reach every drawer destination on a phone", (role) => {
    const nav = navFor(role);
    const reachable = new Set([...nav.mobile, ...nav.mobileOverflow].map((item) => item.path));

    for (const item of items(nav.drawer)) {
      expect(
        reachable.has(item.path),
        `"${item.label}" (${item.path}) is in the drawer but in neither the `
        + "mobile bar nor its More sheet, so a phone cannot reach it",
      ).toBe(true);
    }
  });

  /* One URL, one row. The bar's "Projects" is the drawer's
     /dashboard?tab=projects under another name. */
  it.each(KNOWN_ROLES)("role %s never lists one destination twice on a phone", (role) => {
    const nav = navFor(role);
    const paths = [...nav.mobile, ...nav.mobileOverflow].map((item) => item.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it.each(KNOWN_ROLES)("role %s gets renderable overflow entries", (role) => {
    for (const item of navFor(role).mobileOverflow) {
      expect(item.path, `${item.key} has no path`).toBeTruthy();
      expect(item.label, `${item.key} has no label`).toBeTruthy();
      expect(SYMBOLS[item.icon], `icon "${item.icon}" is not in SYMBOLS`).toBeTruthy();
    }
  });

  it("never throws on a missing user or profile path", () => {
    expect(() => buildNav({})).not.toThrow();
    expect(() => buildNav()).not.toThrow();
  });

  it.each(everyRole)("role %s gets chrome copy for the topbar and drawer", (role) => {
    const nav = navFor(role);
    expect(nav.roleLabel).toBeTruthy();
    expect(nav.homePath).toBeTruthy();
    expect(nav.searchPlaceholder).toBeTruthy();
  });
});

/*
 * The topbar used to hard-code the writer's logo target and search copy, so a
 * producer clicking the logo went to a page built for someone else.
 */
describe("buildNav — per-audience chrome", () => {
  it("sends each audience's logo somewhere that belongs to them", () => {
    expect(navFor("writer").homePath).toBe("/dashboard");
    expect(navFor("producer").homePath).toBe("/home");
    expect(navFor("reader").homePath).toBe("/reader");
    expect(navFor("admin").homePath).toBe("/admin");
  });

  // A director should not be greeted as a "Producer".
  it("labels each industry role by its actual job title", () => {
    expect(navFor("producer").roleLabel).toBe("Producer");
    expect(navFor("director").roleLabel).toBe("Director");
    expect(navFor("investor").roleLabel).toBe("Investor");
    expect(navFor("actor").roleLabel).toBe("Actor");
    expect(navFor("writer").roleLabel).toBe("Screenwriter");
  });
});
