import { isFilmIndustryProfessionalRole } from "../../../../utils/industryAccess";

/*
 * industryNav — destinations for the film-industry audience: producers,
 * directors, investors and other industry professionals (see shellPolicy).
 *
 * WHERE THIS SET COMES FROM
 * -------------------------
 * Producers previously had TWO different navs depending on which shell rendered
 * them, and neither was complete:
 *
 *   components/Sidebar.jsx  Dashboard · Saved projects · Profile · Search ·
 *                           Top Script · Messages · Browse Writers
 *                           (no Home, and Featured was investor-only)
 *   navConfig.js            Home · Featured · Writers · Messages · Search
 *                           (no Dashboard, no Top Script, no saved projects)
 *
 * Consolidating on one shell means one nav, so this is deliberately the UNION
 * of both — nobody loses a destination they could reach yesterday. Two things
 * are genuinely new:
 *
 *   · "My Mandates" (/mandates) was a live, working route that no nav in the
 *     app linked to. Producers could only arrive there from onboarding and had
 *     no way back. It is the page where they declare what they are looking for,
 *     so it belongs in the drawer.
 *   · Investors keep Home/Featured/Top Scripts, which the old shared industry
 *     list gated to investors only for no discoverable reason.
 */

/*
 * One audience, several job titles. The drawer's identity card shows the real
 * one; the navigation is identical for all of them.
 */
const INDUSTRY_ROLE_LABELS = {
  producer: "Producer",
  director: "Director",
  investor: "Investor",
  actor: "Actor",
  industry: "Industry Professional",
  professional: "Industry Professional",
};

/**
 * @param {import("../buildNav").NavContext} context
 * @returns {import("../buildNav").NavPreset}
 */
export const industryNav = ({ user, profilePath, msgCount }) => {
  const professional = isFilmIndustryProfessionalRole(user);
  return {
    /*
     * The identity card shows the person's actual role rather than a single label
     * for the whole audience — a director should not be told they are a "Producer".
     */
    roleLabel: INDUSTRY_ROLE_LABELS[String(user?.role || "").toLowerCase()] || "Industry Professional",
    home: "/home",
    searchPlaceholder: "Search projects, writers…",

    rail: [
      { key: "home",      path: "/home",      label: "Discover",  icon: "home", exact: true },
      { key: "dashboard", path: "/dashboard", label: "Dashboard", icon: "dashboard", exact: true },
      { key: "featured",  path: "/featured",  label: "Featured",  icon: "featured" },
      { key: "writers",   path: "/writers",   label: "Writers",   icon: "writers" },
      { key: "messages",  path: "/messages",  label: "Messages",  icon: "messages", badge: msgCount },
      { key: "profile",   path: profilePath,  label: "Profile",   icon: "profile" },
    ],

    drawer: [
      { key: "home",      path: "/home",      label: "Discover",        icon: "home", exact: true },
      { key: "dashboard", path: "/dashboard", label: "Dashboard",       icon: "dashboard", exact: true },
      { key: "search",    path: "/search",    label: "Search Projects", icon: "search" },
      { divider: true },
      { key: "featured",  path: "/featured",   label: "Featured Projects", icon: "featured" },
      { key: "top",       path: "/top-script", label: "Top Scripts",       icon: "top" },
      { key: "writers",   path: "/writers",    label: "Browse Writers",    icon: "writers" },
      ...(professional ? [
        { divider: true },
        // What I am looking for, and what I have kept. Actors share discovery
        // chrome but do not receive professional mandates, options, or watchlists.
        { key: "mandates", path: "/mandates", label: "My Mandates", icon: "offers" },
        { key: "saved", path: `${profilePath}?tab=bookmarks`, label: "Saved Projects", icon: "bookmark" },
      ] : []),
      { divider: true },
      { key: "messages",  path: "/messages",  label: "Messages", icon: "messages", badge: msgCount },
    ],

    /*
     * THE FOUR A PRODUCER WORKS FROM, in the order they work: the feed, their
     * own deal book, the people they are looking for, the conversations that
     * come out of it.
     *
     * Two of those were previously unreachable on a phone, not merely absent
     * from the bar. The bar was Discover / Featured / Messages / Profile, there
     * is no drawer in the mobile app, and no industry screen links to
     * /dashboard or /writers — so a producer had no route at all to their own
     * ledger or to Browse Writers. Featured swaps out because Discover already
     * surfaces featured projects; nothing else surfaces those two.
     *
     * Profile leaves the bar and lands under More, alongside Featured, Top
     * Scripts, Search, My Mandates and Saved Projects. This preset is the only
     * one whose bar changes.
     */
    mobileKeys: ["home", "dashboard", "writers", "messages"],

  /*
   * The producer's equivalent of the writer's "My Projects": the scripts they
   * have bookmarked. Same endpoint shape (an array of Scripts), so the drawer
   * renders it with the same code — the only difference is data.
   */
    collection: professional ? {
      title: "Watchlist",
      endpoint: "/users/watchlist",
    } : null,
  };
};

export default industryNav;
