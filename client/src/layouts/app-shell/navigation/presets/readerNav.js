/*
 * readerNav — destinations for the reader audience.
 *
 * Readers still render in MainLayout today (see shellPolicy: they are the last
 * audience besides admin that has not moved). This preset is kept in step with
 * them anyway so migrating readers is a one-line change to
 * APP_SHELL_AUDIENCES rather than a nav rewrite.
 */

/**
 * @param {import("../buildNav").NavContext} context
 * @returns {import("../buildNav").NavPreset}
 */
export const readerNav = ({ profilePath, msgCount }) => ({
  roleLabel: "Reader",
  home: "/reader",
  searchPlaceholder: "Search projects…",

  rail: [
    { key: "home",     path: "/reader",        label: "Home",     icon: "home", exact: true },
    { key: "search",   path: "/reader/search", label: "Discover", icon: "search" },
    { key: "featured", path: "/featured",      label: "Featured", icon: "featured" },
    { key: "messages", path: "/messages",      label: "Messages", icon: "messages", badge: msgCount },
    { key: "profile",  path: profilePath,      label: "Profile",  icon: "profile" },
  ],

  drawer: [
    { key: "home",     path: "/reader",        label: "Home",     icon: "home", exact: true },
    { key: "search",   path: "/reader/search", label: "Discover", icon: "search" },
    { divider: true },
    { key: "featured", path: "/featured",      label: "Featured Projects", icon: "featured" },
    { key: "top",      path: "/top-script",    label: "Top Scripts",       icon: "top" },
    { divider: true },
    { key: "messages", path: "/messages",      label: "Messages", icon: "messages", badge: msgCount },
    { key: "profile",  path: profilePath,      label: "Profile",  icon: "profile" },
  ],

  mobileItems: [
    { key: "profile", path: profilePath, label: "Profile", icon: "profile" },
  ],
  mobileKeys: ["home", "search", "messages", "profile"],

  // Readers do not own a project list; the drawer simply omits the section.
  collection: null,
});

export default readerNav;
