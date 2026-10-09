/*
 * adminNav — destinations for the admin audience.
 *
 * Admins had no preset at all. The role fell through to the writer default, so
 * an admin's rail advertised "Create Project", "Upload Project" and
 * "Challenge", and did not link to /admin — the one place they actually work.
 *
 * Admin pages render outside both shells today, so this preset mostly matters
 * for the impersonation flow (AdminLoginHandler drops an admin onto /dashboard)
 * and for whenever the admin console moves inside the shell.
 */

/**
 * @param {import("../buildNav").NavContext} context
 * @returns {import("../buildNav").NavPreset}
 */
export const adminNav = ({ profilePath, msgCount }) => ({
  roleLabel: "Administrator",
  home: "/admin",
  searchPlaceholder: "Search projects, writers…",

  rail: [
    { key: "admin",    path: "/admin",      label: "Console",  icon: "admin", exact: true },
    { key: "search",   path: "/search",     label: "Search",   icon: "search" },
    { key: "top",      path: "/top-script", label: "Top",      icon: "top" },
    { key: "messages", path: "/messages",   label: "Messages", icon: "messages", badge: msgCount },
  ],

  drawer: [
    { key: "admin",      path: "/admin",            label: "Admin Console", icon: "admin", exact: true },
    { key: "agreements", path: "/admin/agreements", label: "Agreements",    icon: "terms" },
    { divider: true },
    { key: "search",     path: "/search",     label: "Search Projects", icon: "search" },
    { key: "top",        path: "/top-script", label: "Top Scripts",     icon: "top" },
    { divider: true },
    { key: "messages",   path: "/messages",   label: "Messages", icon: "messages", badge: msgCount },
    { key: "profile",    path: profilePath,   label: "Profile",  icon: "profile" },
  ],

  mobileItems: [
    { key: "profile", path: profilePath, label: "Profile", icon: "profile" },
  ],
  mobileKeys: ["admin", "search", "messages", "profile"],

  collection: null,
});

export default adminNav;
