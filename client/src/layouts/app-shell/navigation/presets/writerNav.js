/*
 * writerNav — destinations for the writer / creator audience.
 *
 * Mirrors the "Ckript Dashboard 2B" reference rail, with one deliberate compact
 * adaptation: Projects replaces Create in the phone bottom bar. Create remains
 * in the desktop rail and drawer, while Projects opens the dashboard's canonical
 * query-string tab rather than inventing a mobile-only route.
 *
 * Projects and Reviews are query-string tabs of the dashboard, not pages of
 * their own — the same shape as "My Competitions" (/challenge?tab=mine) below.
 * Added 2026-08-07 (plan §11 Phase 2): the mobile dashboard's Projects and
 * Reviews sections were fully built but reachable from nothing after the tab
 * strip was cut to Overview + Challenge. Declaring the destination here rather
 * than in mobile code is the §8.2 rule — a destination cannot exist in one bar
 * and not the other — and a query tab keeps ONE canonical URL for both
 * platforms, which §5.2 requires and a mobile-only /projects route would break.
 */

/**
 * @param {import("../buildNav").NavContext} context
 * @returns {import("../buildNav").NavPreset}
 */
export const writerNav = ({ profilePath, msgCount }) => ({
  roleLabel: "Screenwriter",
  home: "/dashboard",
  searchPlaceholder: "Search scripts, writers…",

  rail: [
    { key: "dashboard", path: "/dashboard",      label: "Dashboard",      icon: "dashboard", exact: true },
    { key: "create",    path: "/create-project", label: "Create",         icon: "create", fresh: true },
    { key: "challenge", path: "/challenge",      label: "Challenge",      icon: "challenge" },
    { key: "featured",  path: "/featured",       label: "Featured",       icon: "featured" },
    { key: "messages",  path: "/messages",       label: "Messages",       icon: "messages", badge: msgCount },
    { key: "profile",   path: profilePath,       label: "Writer Profile", icon: "profile" },
  ],

  // Grouped exactly like the reference drawer:
  //   Dashboard | Create · Upload | Challenge · My Competitions | Messages
  drawer: [
    { key: "dashboard",    path: "/dashboard",       label: "Dashboard",       icon: "home", exact: true },
    { divider: true },
    { key: "create",       path: "/create-project",  label: "Create Project",  icon: "ideas", fresh: true },
    { key: "upload",       path: "/upload",          label: "Upload Project",  icon: "upload" },
    { divider: true },
    { key: "challenge",    path: "/challenge",       label: "Challenge",       icon: "challenge" },
    { key: "competitions", path: "/challenge?tab=mine", label: "My Competitions", icon: "competitions" },
    { divider: true },
    { key: "featured",     path: "/featured",        label: "Featured Projects", icon: "featured" },
    { key: "top",          path: "/top-script",      label: "Top Scripts",       icon: "top" },
    { divider: true },
    { key: "messages",     path: "/messages",        label: "Messages",        icon: "messages", badge: msgCount },
  ],

  /*
   * Selected by key, never by index — see buildNav. Profile takes the fourth
   * slot automatically, so this is three keys.
   *
   * 2026-08-07: "create" gave up its slot to "projects". Create is still one
   * tap away — it is the dashboard hero's primary action on every visit, and it
   * keeps its place in the rail and drawer — whereas a writer's own project
   * list had no entry point anywhere in the compact bar.
   */
  mobileItems: [
    { key: "projects", path: "/dashboard?tab=projects", label: "Projects", icon: "projects" },
    /*
     * The rail calls this "Writer Profile", which is right beside Dashboard,
     * Create, Upload and Challenge and too long for a fifth of a phone. The
     * compact entry is also what puts Profile in the bar at all now that
     * buildNav no longer pins it there.
     */
    { key: "profile", path: profilePath, label: "Profile", icon: "profile" },
  ],
  /* Same four destinations, in the same order, as before Profile became
     explicit — this preset's bar does not change. */
  mobileKeys: ["dashboard", "projects", "messages", "profile"],

  /*
   * The drawer's contextual list. Writers see the projects they are actively
   * working on, newest first.
   */
  collection: {
    title: "My Projects",
    endpoint: "/scripts/mine",
    // Collaborations belong to someone else's project list, not this one.
    select: (script) => (script?.isCollaborator ? null : script),
  },
});

export default writerNav;
