// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { buildMobileNav, resolveActiveTabKey } from "./mobileNav";
import { buildNav } from "../../layouts/app-shell/navigation/buildNav";
import { SYMBOLS } from "../../layouts/app-shell/navigation/symbols";
import { KNOWN_ROLES, getAudience } from "../../layouts/app-shell/shellPolicy";

const navFor = (role, { profilePath = "/ada", msgCount = 0 } = {}) =>
  buildMobileNav({ user: { role, _id: "u1", name: "Ada Lovelace" }, profilePath, msgCount });

describe("buildMobileNav — the tab sets come from the desktop presets", () => {
  it("gives the writer Dashboard, Projects, Messages and Profile", () => {
    expect(navFor("writer").tabs.map((t) => t.key)).toEqual([
      "dashboard", "projects", "messages", "profile",
    ]);
  });

  /*
   * THE APPROVED WRITER BAR (plan §11 Phase 2 bullet 4, approved 2026-08-08).
   *
   * The keys above are asserted elsewhere in this file too; this case exists to
   * make the *product decision* fail a test rather than live in a document.
   * The alternatives were put to the user with their costs — swapping Projects
   * back to Create (which leaves a writer's own project list with no entry
   * point in the compact bar) and adding a fifth tab (which forks mobileKeys
   * away from the desktop preset, the one thing §8.2 forbids). Neither was
   * chosen, so a change to this set is a change to an approved decision.
   *
   * Labels as well as keys: a rename is as visible to a user as a reorder, and
   * a key-only assertion would let "Projects" silently become something else.
   */
  it("shows exactly the approved writer labels, in the approved order", () => {
    expect(navFor("writer").tabs.map((t) => t.label)).toEqual([
      // "Profile", not the rail's "Writer Profile": buildNav shortens the
      // fourth slot's label for the compact bar, where the audience is already
      // implied and the wider label would clip at 320px.
      "Dashboard", "Projects", "Messages", "Profile",
    ]);
  });

  it("keeps Create out of the writer's compact bar, but not out of the app", () => {
    /*
     * Create gave up its slot to Projects on 2026-08-07 and the user confirmed
     * that on 2026-08-08. It is still one tap away — the dashboard hero's
     * primary action — and it keeps its place in the rail and the drawer. This
     * asserts both halves, because the approval depended on the second one.
     */
    const nav = buildNav({ user: { role: "writer", _id: "u1" }, profilePath: "/ada", msgCount: 0 });

    expect(nav.mobile.map((t) => t.key)).not.toContain("create");
    expect(nav.primary.map((t) => t.key)).toContain("create");
    expect(nav.drawer.filter((t) => !t.divider).map((t) => t.key)).toContain("create");
  });

  /*
   * THE INDUSTRY BAR, changed deliberately.
   *
   * It was Discover / Featured / Messages / Profile. There is no drawer in the
   * mobile app and no industry screen links to /dashboard or /writers, so a
   * producer had no route to their own deal book or to the writer directory
   * from anywhere on a phone. Featured gave up its slot because Discover
   * already surfaces featured projects — it is still one tap away under More,
   * along with Profile.
   */
  it("gives the industry audience Discover, Dashboard, Writers and Messages", () => {
    expect(navFor("producer").tabs.map((t) => t.key)).toEqual([
      "home", "dashboard", "writers", "messages",
    ]);
  });

  it("keeps the producer's remaining destinations under More", () => {
    const overflow = navFor("producer").overflow.map((t) => t.key);
    expect(overflow).toEqual(expect.arrayContaining([
      "featured", "top", "search", "mandates", "saved", "profile",
    ]));
  });

  it("gives the reader Home, Discover, Messages and Profile", () => {
    expect(navFor("reader").tabs.map((t) => t.key)).toEqual([
      "home", "search", "messages", "profile",
    ]);
  });

  it("gives the admin Console, Search, Messages and Profile", () => {
    expect(navFor("admin").tabs.map((t) => t.key)).toEqual([
      "admin", "search", "messages", "profile",
    ]);
  });

  /*
   * The defect this guards is the one shellPolicy exists to prevent: a role
   * nobody mapped falling through to the writer's chrome and being offered
   * "Create Project". Every role the server can issue must land on a real bar.
   */
  it("gives every known role a full four-tab bar", () => {
    for (const role of KNOWN_ROLES) {
      const { tabs } = navFor(role);
      expect(tabs, role).toHaveLength(4);
      expect(tabs.every((t) => t.path && t.label), role).toBe(true);
    }
  });

  /*
   * Profile is no longer pinned to the last slot — the industry bar needs all
   * four for destinations with no other route on a phone. It must still be
   * reachable, from the bar or from More.
   */
  it.each(KNOWN_ROLES)("role %s can still reach Profile", (role) => {
    const nav = navFor(role);
    const reachable = [...nav.tabs, ...nav.overflow].map((t) => t.path);
    expect(reachable).toContain("/ada");
  });

  /*
   * The whole point of the More cell. The bar and its sheet are the entire
   * navigation of the mobile app; anything in the audience's destination list
   * that appears in neither cannot be opened on a phone.
   */
  it.each(KNOWN_ROLES)("role %s can reach every destination it has", (role) => {
    const nav = navFor(role);
    const desktop = buildNav({ user: { role, _id: "u1" }, profilePath: "/ada" });
    const reachable = new Set([...nav.tabs, ...nav.overflow].map((t) => t.path));

    for (const item of desktop.drawer.filter((i) => i && !i.divider)) {
      expect(reachable.has(item.path), `${role}: ${item.label} (${item.path})`).toBe(true);
    }
  });

  it.each(KNOWN_ROLES)("role %s gets renderable, non-duplicated overflow rows", (role) => {
    const nav = navFor(role);
    const ligatures = new Set(Object.values(SYMBOLS));

    for (const row of nav.overflow) {
      expect(row.path && row.label, `${role}/${row.key}`).toBeTruthy();
      expect(ligatures.has(row.glyph), `${role}/${row.key} → ${row.glyph}`).toBe(true);
    }

    const paths = [...nav.tabs, ...nav.overflow].map((t) => t.path);
    expect(new Set(paths).size, `${role} lists a destination twice`).toBe(paths.length);
  });

  it("never offers a writer's authoring destination to a non-writer", () => {
    for (const role of KNOWN_ROLES) {
      if (getAudience(role) === "writer") continue;
      const paths = navFor(role).tabs.map((t) => t.path);
      expect(paths, role).not.toContain("/create-project");
      expect(paths, role).not.toContain("/upload");
    }
  });
});

describe("buildMobileNav — adaptation for mobile", () => {
  it("resolves every preset icon key to a real Material Symbols ligature", () => {
    const ligatures = new Set(Object.values(SYMBOLS));
    for (const role of KNOWN_ROLES) {
      for (const tab of navFor(role).tabs) {
        // A missing key would fall back to the key itself and render a word.
        expect(ligatures.has(tab.glyph), `${role}/${tab.key} → ${tab.glyph}`).toBe(true);
      }
    }
  });

  it("normalises the badge to a number and only when there is something to say", () => {
    expect(navFor("writer", { msgCount: 0 }).tabs.find((t) => t.key === "messages").badge).toBe(0);
    expect(navFor("writer", { msgCount: 3 }).tabs.find((t) => t.key === "messages").badge).toBe(3);
  });

  it("keeps startFresh on the destinations that declare it", () => {
    // Create is no longer a compact tab, but the flag must still survive the
    // adaptation for the rail and drawer that do show it.
    const { primary } = buildNav({ user: { role: "writer", _id: "u1" }, profilePath: "/ada" });
    expect(primary.find((i) => i.key === "create").fresh).toBe(true);
    expect(navFor("writer").tabs.find((t) => t.key === "messages").fresh).toBe(false);
  });

  /*
   * WCAG SC 3.2.3: a navigation mechanism repeated across pages keeps the same
   * relative order. A badge changes an item's contents, never its index.
   */
  it("does not reorder when a badge appears", () => {
    const quiet = navFor("writer", { msgCount: 0 }).tabs.map((t) => t.key);
    const busy = navFor("writer", { msgCount: 12 }).tabs.map((t) => t.key);
    expect(busy).toEqual(quiet);
  });

  it("reads the reader's own search path from the preset rather than assuming /search", () => {
    expect(navFor("reader").searchPath).toBe("/reader/search");
    expect(navFor("writer").searchPath).toBe("/search");
    expect(navFor("producer").searchPath).toBe("/search");
  });

  it("carries the audience's own home and search copy", () => {
    expect(navFor("writer").homePath).toBe("/dashboard");
    expect(navFor("producer").homePath).toBe("/home");
    expect(navFor("reader").homePath).toBe("/reader");
    expect(navFor("admin").homePath).toBe("/admin");
    expect(navFor("producer").searchPlaceholder).not.toBe(navFor("reader").searchPlaceholder);
  });
});

describe("resolveActiveTabKey — the URL decides, not component state", () => {
  const writer = navFor("writer").tabs;
  const reader = navFor("reader").tabs;

  it("selects the tab whose route the URL is on", () => {
    expect(resolveActiveTabKey(writer, "/dashboard")).toBe("dashboard");
    expect(resolveActiveTabKey(writer, "/messages")).toBe("messages");
    expect(resolveActiveTabKey(reader, "/reader")).toBe("home");
  });

  it("keeps a tab selected on its nested screens", () => {
    expect(resolveActiveTabKey(writer, "/messages/653f00")).toBe("messages");
    expect(resolveActiveTabKey(reader, "/reader/search")).toBe("search");
  });

  /*
   * A destination may be a query-string tab of a page rather than a page.
   * Projects lives at /dashboard?tab=projects, so on pathname alone it is
   * indistinguishable from Dashboard — which is exactly the bug this guards:
   * without the query, Dashboard would claim the URL and Projects could never
   * light up.
   */
  it("lets a query-string destination win over its own host page", () => {
    expect(resolveActiveTabKey(writer, "/dashboard", "?tab=projects")).toBe("projects");
    expect(resolveActiveTabKey(writer, "/dashboard?tab=projects")).toBe("projects");
  });

  it("keeps the host page selected when the query does not match", () => {
    expect(resolveActiveTabKey(writer, "/dashboard")).toBe("dashboard");
    expect(resolveActiveTabKey(writer, "/dashboard", "?tab=overview")).toBe("dashboard");
    expect(resolveActiveTabKey(writer, "/dashboard", "?tab=reviews")).toBe("dashboard");
  });

  it("still selects exactly one tab on a query-string destination", () => {
    const keys = ["dashboard", "projects", "messages", "profile"];
    const active = resolveActiveTabKey(writer, "/dashboard", "?tab=projects");
    expect(keys.filter((k) => k === active)).toHaveLength(1);
  });

  it("returns null when the URL belongs to no tab", () => {
    // A screenplay detail page is inside no tab, and marking one "current"
    // there would be a lie told to a screen reader on every detail screen.
    expect(resolveActiveTabKey(writer, "/script/653f00")).toBeNull();
    expect(resolveActiveTabKey(writer, "/challenge")).toBeNull();
  });

  it("honours an exact tab so a root home does not swallow its children", () => {
    // Reader home is "/reader" (exact); "/reader/search" is Discover.
    expect(resolveActiveTabKey(reader, "/reader")).toBe("home");
    expect(resolveActiveTabKey(reader, "/reader/search")).toBe("search");
  });

  it("prefers the most specific tab when two could match", () => {
    // Declaration order puts home first; specificity must win regardless.
    const shuffled = [...reader].reverse();
    expect(resolveActiveTabKey(shuffled, "/reader/search")).toBe("search");
  });

  it("matches the profile tab exactly, because its path is user data", () => {
    // The canonical profile path is a bare root segment, and so is half of the
    // canonical PROJECT url (/:projectHeading/:writerUsername). A prefix match
    // would light the profile tab on someone else's project page.
    expect(resolveActiveTabKey(writer, "/ada")).toBe("profile");
    expect(resolveActiveTabKey(writer, "/ada/the-final-draft")).toBeNull();
  });

  it("ignores the query string and hash", () => {
    expect(resolveActiveTabKey(writer, "/messages?thread=9")).toBe("messages");
    expect(resolveActiveTabKey(writer, "/dashboard#top")).toBe("dashboard");
  });

  it("marks at most one tab current", () => {
    for (const path of ["/dashboard", "/messages/1", "/ada", "/script/1", "/"]) {
      const key = resolveActiveTabKey(writer, path);
      const matches = writer.filter((t) => t.key === key);
      expect(matches.length, path).toBeLessThanOrEqual(1);
    }
  });

  it("survives a nonsense pathname", () => {
    expect(resolveActiveTabKey(writer, "")).toBeNull();
    expect(resolveActiveTabKey([], "/dashboard")).toBeNull();
  });
});
