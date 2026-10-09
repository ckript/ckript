/*
 * buildNav — the app shell's navigation model.
 *
 * The shell renders whatever this returns, so adding a destination is a data
 * edit in one preset file, never JSX surgery. The registry below dispatches on
 * AUDIENCE (from shellPolicy), which replaced a chain of
 * `if (role === "reader") … if (role === "investor" || role === "producer") …`
 * whose final `else` quietly swallowed every role nobody had thought about.
 *
 * SHAPES
 * ------
 * `rail`   compact icon rail, always visible.
 * `drawer` the overlay drawer: same destinations, longer labels, `{divider:true}`
 *          separators between groups.
 * `mobile` bottom bar, hard-capped at MOBILE_SLOTS.
 *
 * A nav item is:
 *   { key, path, label, icon, exact?, badge?, fresh? }
 *     key    unique within its list; also how the mobile bar picks items
 *     icon   a key in navigation/icons SYMBOLS
 *     exact  match the path exactly instead of by prefix (for "/" style roots)
 *     badge  number; renders a pill when > 0
 *     fresh  pass `state: { startFresh: true }` on navigation
 */

import { AUDIENCE, getAudience } from "../shellPolicy";
import writerNav from "./presets/writerNav";
import industryNav from "./presets/industryNav";
import readerNav from "./presets/readerNav";
import adminNav from "./presets/adminNav";

/**
 * @typedef {Object} NavContext
 * @property {Object} user
 * @property {string} profilePath
 * @property {number} msgCount
 *
 * @typedef {Object} NavPreset
 * @property {Array}  rail
 * @property {Array}  drawer
 * @property {Array}  [mobileItems]
 * @property {string[]} mobileKeys
 * @property {{title: string, endpoint: string, select?: Function}|null} collection
 */

/*
 * Audience → preset. The one place a new audience is wired in.
 */
const PRESETS = {
  [AUDIENCE.WRITER]: writerNav,
  [AUDIENCE.INDUSTRY]: industryNav,
  [AUDIENCE.READER]: readerNav,
  [AUDIENCE.ADMIN]: adminNav,
};

/*
 * The mobile bar is a fixed row of four destinations. The chrome adds a fifth
 * "More" cell of its own when there is anything left over (see mobileOverflow).
 *
 * Profile used to be appended here as a hard-coded fourth slot, so a preset
 * chose three. That was fine while every audience wanted Profile in the bar and
 * fatal for the one that does not: the industry audience needs Discover,
 * Dashboard, Writers and Messages, and a pinned Profile left no room for the
 * two that matter most. A producer on a phone could reach neither their own
 * deal book nor Browse Writers — from the bar or from anywhere else.
 *
 * So the slot is no longer magic. Each preset names all four keys it wants,
 * Profile included, and whatever it leaves out is still reachable under More.
 */
export const MOBILE_SLOTS = 4;

/**
 * Build the mobile bar by KEY rather than by index.
 *
 * The original selected `[primary[0], primary[1], primary[3]]`, so inserting one
 * item into the rail silently pushed Messages out of the bottom bar on phones —
 * which is exactly what happened when Challenge was added. Selecting by key
 * means the rail can be reordered or grown without touching mobile.
 */
const buildMobile = (rail, mobileKeys, mobileItems = []) => {
  // Most compact destinations come from the rail. A preset may also publish a
  // compact-only destination when the phone's information architecture differs
  // deliberately — for example, Projects replaces Create for writers without
  // adding a query-tab destination to the desktop rail. `mobileItems` is listed
  // second so it WINS on a shared key: the rail calls a writer's profile
  // "Writer Profile", which is right beside five other writer destinations and
  // too long for a 1/5 column.
  const byKey = new Map(
    [...rail, ...mobileItems].filter((item) => item?.key).map((item) => [item.key, item]),
  );

  return mobileKeys
    .map((key) => byKey.get(key))
    .filter(Boolean)
    .slice(0, MOBILE_SLOTS);
};

/**
 * Everything this audience can reach that the four-slot bar could not hold.
 *
 * Derived from the DRAWER — the audience's complete destination list, which the
 * desktop shell has always treated as exhaustive — rather than declared as a
 * second list. That is the same decision mobileNav.js records for the tab sets,
 * and for the same reason: the app once shipped a live Challenge feature no
 * writer could reach because two navigation lists had drifted apart. A
 * destination added to a preset's drawer now appears on the phone by itself.
 *
 * Matching is by PATH, not by key. The bar's "projects" is the drawer's
 * `/dashboard?tab=projects` under a different name, and two entries for one URL
 * in the same menu is a bug the user sees.
 */
const buildMobileOverflow = (drawer = [], bar = [], profileItem = null) => {
  const inBar = new Set(bar.map((item) => item?.path).filter(Boolean));

  // Profile is a destination like any other; it is simply not in every drawer,
  // because the desktop drawer shows it as an identity card instead of a row.
  const candidates = [...drawer, profileItem];

  const seen = new Set();
  return candidates.filter((item) => {
    if (!item || item.divider || !item.path) return false;
    if (inBar.has(item.path) || seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  });
};

/**
 * @param {Object} options
 * @param {Object} options.user         current auth user
 * @param {string} options.profilePath  canonical profile path for this viewer
 * @param {number} [options.msgCount]   unread messages badge
 * @returns {{ primary: Array, drawer: Array, mobile: Array, collection: Object|null, audience: string }}
 */
export function buildNav({ user, profilePath, msgCount = 0 } = {}) {
  const audience = getAudience(user?.role);

  // getAudience is exhaustive and falls back to READER, so this cannot be
  // undefined — the `||` is belt-and-braces for a preset removed by mistake.
  const preset = (PRESETS[audience] || PRESETS[AUDIENCE.READER])({
    user,
    profilePath,
    msgCount,
  });

  /*
   * The compact Profile entry. Presets name it in `mobileItems` when they want
   * it in the bar; it is resolved here as well so that an audience which leaves
   * it out of the bar still finds it under More rather than losing it.
   */
  const profileItem = { key: "profile", path: profilePath, label: "Profile", icon: "profile" };
  const mobile = buildMobile(preset.rail, preset.mobileKeys, preset.mobileItems);

  return {
    // `primary` is the historical name for the rail; kept so existing call
    // sites and tests read the same.
    primary: preset.rail,
    drawer: preset.drawer,
    mobile,
    mobileOverflow: buildMobileOverflow(preset.drawer, mobile, profileItem),
    collection: preset.collection ?? null,

    // Per-audience chrome. The topbar and drawer read these instead of
    // hard-coding the writer's logo target and search copy for everyone.
    audience,
    roleLabel: preset.roleLabel || "Member",
    homePath: preset.home || profilePath,
    searchPlaceholder: preset.searchPlaceholder || "Search…",
  };
}

export default buildNav;
