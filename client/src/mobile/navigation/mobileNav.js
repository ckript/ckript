import { matchPath } from "react-router-dom";
import { buildNav } from "../../layouts/app-shell/navigation/buildNav";
import { SYMBOLS } from "../../layouts/app-shell/navigation/symbols";

/*
 * mobileNav — the mobile chrome's navigation model (plan §8.2).
 *
 * WHERE THE TAB SETS COME FROM
 * ----------------------------
 * They are NOT declared here. `layouts/app-shell/navigation/` already owns the
 * app's destinations: one preset per audience, each naming the three keys its
 * compact bar shows, with Profile taking the fourth slot. The desktop shell has
 * been building a four-slot mobile bar from that model for as long as it has
 * existed.
 *
 * Plan §8.2 originally proposed a *second*, five-tab set per audience. That was
 * written before this model was found, and the user chose the presets over it on
 * 2026-08-07 for the reason that decides most questions of this shape: a
 * destination added to a preset must appear in both bars, and two independent
 * lists is how the app previously ended up with a live Challenge feature that no
 * writer could reach from anywhere in the UI (see buildNav.test.js's own note).
 *
 * So this module ADAPTS rather than declares. It contributes exactly three
 * things the desktop model does not have:
 *
 *   1. mobile glyphs — presets name icon KEYS, and the desktop rail resolves
 *      them through its own React component; mobile's <Icon> takes the Material
 *      Symbols ligature directly, so the same key map is resolved here;
 *   2. the active tab, derived from the URL — §8.2 is explicit that "a URL
 *      determines the active tab; local component state does not";
 *   3. a stable order guarantee — see the note on ordering below.
 *
 * ORDERING IS PART OF THE CONTRACT (WCAG SC 3.2.3, source 23)
 * -----------------------------------------------------------
 * "Navigational mechanisms that are repeated on multiple web pages … occur in
 * the same relative order each time they are repeated, unless a change is
 * initiated by the user." Per-audience tab sets do NOT violate this: a viewer's
 * audience does not change from page to page, so the bar this viewer sees is the
 * same bar in the same order everywhere. What WOULD violate it is reordering by
 * recency, by badge count, or by "most used" — so this module never sorts, and a
 * badge appearing or disappearing changes an item's contents, never its index.
 */

/**
 * Icon key → Material Symbols ligature, for the keys the four presets' mobile
 * slots can actually produce. Falling back to the key itself is deliberate: a
 * new preset key renders *something* legible rather than an empty box, and
 * `mobileNav.test.js` fails so the omission is fixed rather than shipped.
 */
const glyphFor = (iconKey) => SYMBOLS[iconKey] || String(iconKey || "circle");

/*
 * The profile tab is the one whose path is USER DATA rather than a declared
 * route: `getProfileCanonicalPath` returns "/ada" — a bare root segment —
 * whenever the account has a username, and only "/profile/<id>" when it does
 * not. Every other tab path is a literal route the app declares.
 */
const isDataDerivedPath = (key) => key === "profile";

/**
 * The mobile bar is the desktop preset's compact bar, adapted.
 *
 * @param {Object} options
 * @param {Object} options.user         the authenticated user
 * @param {string} options.profilePath  canonical profile path for this viewer
 * @param {number} [options.msgCount]   unread messages badge
 * @returns {{
 *   audience: string,
 *   roleLabel: string,
 *   homePath: string,
 *   searchPath: string,
 *   searchPlaceholder: string,
 *   tabs: Array<{key: string, path: string, label: string, glyph: string, exact: boolean, badge: number, fresh: boolean}>,
 * }}
 */
/**
 * One nav item, in the shape the chrome renders. Used for both the bar and the
 * More sheet, so an overflow row cannot drift from a tab: same glyph
 * resolution, same badge normalisation, same matching rules.
 */
const toDestination = (item) => ({
  key: item.key,
  path: item.path,
  label: item.label,
  glyph: glyphFor(item.icon),
  /*
   * Prefix matching is what keeps Messages selected on /messages/123, so it
   * is the default. It is wrong for exactly one tab: Profile. Its path is a
   * bare root segment ("/ada"), and the app's canonical PROJECT url is also
   * two root segments ("/:projectHeading/:writerUsername") — so a prefix match
   * would light the profile tab on someone else's project page whenever a
   * heading happened to collide with the viewer's username. Matching it
   * exactly costs nothing: the profile's own sub-views are query-string tabs
   * ("?tab=bookmarks"), not path segments.
   */
  exact: Boolean(item.exact) || isDataDerivedPath(item.key),
  // Normalised to a number here so the bar never has to ask whether an
  // absent badge is undefined, null, 0 or "".
  badge: Number(item.badge) > 0 ? Number(item.badge) : 0,
  // `state: { startFresh: true }` — Create must open a new draft rather than
  // resuming the last one, and that survives the trip through mobile.
  fresh: Boolean(item.fresh),
});

export function buildMobileNav({ user, profilePath, msgCount = 0 } = {}) {
  const nav = buildNav({ user, profilePath, msgCount });

  const tabs = nav.mobile.map(toDestination);

  /*
   * The destinations the four-slot bar could not hold. The desktop shell puts
   * these in a drawer; the mobile app has no drawer, so before this existed
   * they were simply unreachable on a phone — for a producer that was their own
   * dashboard, the writer directory, Top Scripts, Search, Mandates and Saved
   * Projects. The chrome renders a fifth "More" cell whenever this is non-empty.
   */
  const overflow = nav.mobileOverflow.map(toDestination);

  return {
    audience: nav.audience,
    roleLabel: nav.roleLabel,
    homePath: nav.homePath,
    // Readers search their own catalogue; everyone else shares /search. The
    // preset already names the reader's, so read it from the drawer rather than
    // hard-coding an audience test in the chrome.
    searchPath: findSearchPath(nav),
    searchPlaceholder: nav.searchPlaceholder,
    tabs,
    overflow,
  };
}

/*
 * Every preset has a "search" destination in its drawer, but the reader's is
 * /reader/search and the rest are /search. Reading it from the model keeps the
 * one exception in the preset that owns it.
 */
function findSearchPath(nav) {
  const fromDrawer = (nav.drawer || []).find((item) => item?.key === "search")?.path;
  if (fromDrawer) return fromDrawer;
  const fromRail = (nav.primary || []).find((item) => item?.key === "search")?.path;
  return fromRail || "/search";
}

/**
 * Which tab, if any, the current URL belongs to.
 *
 * Returns `null` when no tab owns the URL, and that is a legitimate answer, not
 * a failure: a writer reading /script/abc is inside no tab, and MDN's rule for
 * `aria-current` is that at most ONE element in a set carries it (source 24).
 * Marking a fallback tab "current" on an unrelated screen would be a lie told to
 * a screen reader on every detail page in the app.
 *
 * Matching is by SEGMENT, via React Router's own matcher rather than a
 * `pathname.includes()` chain (plan §5.2). The most specific match wins, so
 * /reader/search selects Discover rather than Home even though Home is
 * declared first.
 *
 * QUERY STRINGS COUNT (added 2026-08-07)
 * --------------------------------------
 * A destination may be a query-string tab of a page rather than a page —
 * `/challenge?tab=mine` was already in the writer preset, and Phase 2 added
 * `/dashboard?tab=projects`. On path alone those are indistinguishable from
 * their host page, so Projects could never light and Dashboard would claim the
 * URL instead. So a pattern's query params, if it has any, must ALL be present
 * in the current search to match at all, and each one earns a point of
 * specificity. That ordering is what makes `/dashboard?tab=projects` beat
 * `/dashboard` on the projects URL while `/dashboard` still wins on its own.
 *
 * Used for the bar AND for its More sheet: the sheet's rows light the same way
 * a tab does, and the More cell itself is "current" exactly when one of them
 * wins. Because the bar and the overflow hold disjoint paths (buildNav dedupes
 * them), at most one of the two can claim any URL.
 *
 * @param {Array} tabs      from buildMobileNav — `tabs` or `overflow`
 * @param {string} pathname current location.pathname
 * @param {string} [search] current location.search
 * @returns {string|null}   the winning tab's key
 */
export function resolveActiveTabKey(tabs = [], pathname = "/", search = "") {
  const raw = String(pathname || "/");
  // Tolerate a full "path?query" being passed as `pathname`, which is what
  // callers that only have one string will do.
  const [pathPart, inlineQuery = ""] = raw.split(/[?#]/);
  const path = pathPart || "/";
  const current = new URLSearchParams(String(search || inlineQuery || "").replace(/^[?#]/, ""));

  let best = null;
  let bestScore = -1;

  for (const tab of tabs) {
    const [pattern, patternQuery = ""] = String(tab.path || "").split(/[?#]/);
    if (!pattern) continue;

    const match = matchPath({ path: pattern, end: Boolean(tab.exact), caseSensitive: false }, path);
    if (!match) continue;

    // Specificity = how much of the URL the pattern actually claimed. "/" would
    // otherwise swallow every URL in the app for an audience whose home is "/".
    let score = pattern.split("/").filter(Boolean).length;

    const required = [...new URLSearchParams(patternQuery)];
    // Every param the destination names must be present with that value; a
    // partial match is not this destination.
    if (required.some(([key, value]) => current.get(key) !== value)) continue;
    score += required.length;

    if (score > bestScore) {
      best = tab.key;
      bestScore = score;
    }
  }

  return best;
}

export default buildMobileNav;
