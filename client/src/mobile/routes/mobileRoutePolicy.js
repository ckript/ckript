import { matchPath } from "react-router-dom";
import { getAudience } from "../../layouts/app-shell/shellPolicy";
import { normalizeProfileUsernameSegment } from "../../utils/profilePath";
import { isSameProfile } from "../../features/profile-pc/profilePolicy";
import {
  MOBILE_ROUTE_DISPOSITIONS,
  MOBILE_ROUTE_DISPOSITION,
} from "./mobileRouteManifest";

export const MOBILE_EXPERIENCE = Object.freeze({
  MOBILE: "mobile",
  DESKTOP: "desktop",
});

const desktopDecision = (route, reason, disposition = route?.disposition) => ({
  experience: MOBILE_EXPERIENCE.DESKTOP,
  routeId: route?.id ?? null,
  screenId: null,
  disposition: disposition ?? null,
  shell: null,
  protection: route?.protection ?? null,
  reason,
});

const normalizeProfileKey = (value) => String(value || "").trim().toLowerCase();

/**
 * A PRE-LOAD HINT about whether a URL points at the viewer's own profile.
 *
 * IT IS A HINT, NOT THE ANSWER, and the distinction is the whole point.
 *
 * Ownership cannot be decided from a URL. The identity segment is whatever
 * `getProfileCanonicalPath` decided to emit — which may be an id, a sid, a
 * NORMALIZED username (spaces to underscores, punctuation stripped), a
 * `canonicalPath` the server chose, or a segment lifted out of a share link.
 * Reversing that back to "is this me?" means guessing which of the viewer's
 * fields produced it and how it was transformed, and any guess is wrong for
 * some account.
 *
 * It was the answer once, and the bug was exactly this: a viewer opened their
 * own profile, the screen canonicalized the URL to `/ada_lovelace`, this
 * function could not match that against a session username of "Ada Lovelace",
 * and the owner's workspace was replaced by the visitor's view of them. Five of
 * eight realistic identity shapes flipped.
 *
 * So the only caller that renders anything — AuthenticatedProfileRoute — now
 * asks the loaded profile instead (`isSameProfile`, which compares ids), and
 * uses this only to choose the first screen while that request is in flight.
 * A wrong hint costs one frame of the wrong skeleton; it can no longer decide
 * what the viewer ends up looking at.
 *
 * Normalising through the SAME function that builds the segment is what makes
 * the hint right in the cases it can be right about. It still cannot know a
 * server-chosen `canonicalPath`, and it does not have to.
 */
export function isOwnProfileKey(profileKey, user) {
  if (!user) return false;
  const target = normalizeProfileKey(profileKey);
  // A bare /profile is always the viewer's own.
  if (!target) return true;

  const ownKeys = [user?._id, user?.id, user?.sid, user?.username, user?.writerProfile?.username]
    .flatMap((value) => [normalizeProfileKey(value), normalizeProfileUsernameSegment(value)])
    .filter(Boolean);

  return ownKeys.includes(target) || ownKeys.includes(normalizeProfileUsernameSegment(target));
}

/**
 * Whether the profile on screen belongs to the viewer.
 *
 * ONE RULE, IN ONE PLACE, because the two halves of it answer at different
 * times and the old code let the weaker half overrule the stronger one.
 *
 *   loaded   `isSameProfile` — the ids of two documents. Exact, and the same
 *            for every URL form that resolves to the same person, which is what
 *            makes it survive canonicalization.
 *   loading  the URL hint, which is a guess and is allowed to be wrong for one
 *            frame, because nothing else exists yet.
 *
 * The order matters and is the fix: once a profile has loaded, the URL never
 * gets another vote. A screen may rewrite the address bar as often as it likes.
 *
 * @param {Object} options
 * @param {Object} options.viewer   the authenticated user
 * @param {Object|null} options.profile  the loaded profile, or null
 * @param {string} [options.urlKey] the identity segment from the URL
 * @returns {boolean}
 */
export function resolveProfileOwnership({ viewer, profile, urlKey = "" } = {}) {
  if (profile) return isSameProfile(viewer, profile);
  return isOwnProfileKey(urlKey, viewer);
}

function isOwnProfileTarget(route, pathname, user) {
  if (!route?.visitorOnly || !user) return false;
  const match = matchPath({ path: route.pattern, end: true, caseSensitive: false }, pathname);
  const target = match?.params?.id;
  return target || route.id === "profile" ? isOwnProfileKey(target, user) : false;
}

export function findMobileRoute(pathname = "") {
  const normalizedPath = String(pathname || "/").split(/[?#]/, 1)[0] || "/";
  return MOBILE_ROUTE_DISPOSITIONS.find(({ pattern }) => (
    matchPath({ path: pattern, end: true, caseSensitive: false }, normalizedPath)
  )) ?? null;
}

/**
 * Decide whether the current canonical URL may replace the existing route tree
 * with a native-style mobile screen. A non-mobile decision always means
 * "render children" in RootExperience; it is never a redirect or dashboard
 * fallback.
 */
/**
 * Whether a route's declared query exclusion applies to the current URL.
 *
 * A route can be implemented for mobile in general and deliberately NOT
 * implemented for one query-defined entry mode. D37 removed the last current
 * exclusion, but the policy remains here for future partial route ports.
 *
 * It lives in the manifest rather than inside the screen because the manifest is
 * the file that answers "what does mobile cover?", and an exception hidden in a
 * component is an exception nobody finds.
 */
function isQueryExcluded(route, search) {
  if (!route?.excludeQuery) return false;
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  return Object.entries(route.excludeQuery).every(([key, value]) => params.get(key) === value);
}

/*
 * Whether this route's answer can still change once the session is known.
 *
 * `authLoading` exists so the app does not resolve a route against a viewer it
 * has not finished restoring. That is right for every route below whose branch
 * reads `user` — and it is pointless for one whose answer is the same for
 * everybody.
 *
 * For the account-entry family it was worse than pointless, and that is the
 * reason this predicate exists. While the mobile branch waited, RootExperience
 * rendered the DESKTOP tree, where App.jsx answers /login, /join and /signup
 * with `<Navigate to="/" replace />`. That redirect commits on the first frame
 * and rewrites the URL, so by the time the session resolved there was no route
 * left to mount: every native account-entry screen was unreachable by direct
 * link, bookmark, refresh or share — the exact property D59 built them as
 * routes to have. An in-app tap still worked, because a client-side navigation
 * happens long after `loading` has settled, which is why this survived both the
 * unit suite and a walk through the app.
 *
 * The original guard carried the note "deciding here would flash a sign-in
 * screen at someone who is signed in". That cost is real but small and now
 * paid where it belongs: each screen holds its own `!loading && user` redirect,
 * so a signed-in viewer who opens /login is sent on — honouring `?redirect=`,
 * which the desktop `<Navigate to="/">` never could.
 */
function dependsOnViewer(route) {
  return Boolean(
    route.protection === "authenticated"
    || route.signedOutOnly
    || route.visitorOnly
    || route.authenticatedScreenId
    || route.ownScreenId
    || route.audiences?.length
    || route.roles?.length,
  );
}

export function resolveMobileExperience({
  isMobile = false,
  authLoading = false,
  user = null,
  pathname = "/",
  search = "",
  isDev = false,
} = {}) {
  const route = findMobileRoute(pathname);

  if (!route) return desktopDecision(null, "unregistered-route", null);
  if (!isMobile) return desktopDecision(route, "viewport");
  // Only wait for the session where the session can change the answer.
  if (authLoading && dependsOnViewer(route)) return desktopDecision(route, "auth-loading");

  if (route.disposition === MOBILE_ROUTE_DISPOSITION.DEV_ONLY) {
    // Development fixtures are ordinary App.jsx routes that mount MobileApp
    // with their own deterministic context. RootExperience must not intercept
    // them or it would replace that fixture context with the live account.
    return desktopDecision(route, isDev ? "dev-route-owned" : "dev-only");
  }

  if (
    route.disposition !== MOBILE_ROUTE_DISPOSITION.SCREEN
    && route.disposition !== MOBILE_ROUTE_DISPOSITION.SHARED_PUBLIC_SCREEN
  ) {
    return desktopDecision(route, route.disposition);
  }

  if (isQueryExcluded(route, search)) {
    return desktopDecision(route, route.excludeReason || "query-excluded", route.fallbackDisposition);
  }

  if (route.protection === "authenticated" && !user) {
    return desktopDecision(route, "authentication-required", route.fallbackDisposition);
  }

  // Some canonical share URLs branch by authentication in App.jsx. Their
  // public mobile presentation must not replace the richer authenticated page
  // when an account opens the same copied link.
  if (route.signedOutOnly && user) {
    return desktopDecision(route, "authenticated-variant-pending", route.fallbackDisposition);
  }

  const ownProfileTarget = isOwnProfileTarget(route, pathname, user);
  if (ownProfileTarget && !route.ownScreenId) {
    return desktopDecision(route, "own-profile-variant-pending", route.fallbackDisposition);
  }

  const audience = getAudience(user?.role);
  if (route.audiences?.length && !route.audiences.includes(audience)) {
    return desktopDecision(route, "audience-not-implemented", route.fallbackDisposition);
  }

  const role = String(user?.role || "").trim().toLowerCase();
  if (route.roles?.length && !route.roles.includes(role)) {
    return desktopDecision(route, "role-not-implemented", route.fallbackDisposition);
  }

  return {
    experience: MOBILE_EXPERIENCE.MOBILE,
    routeId: route.id,
    screenId: ownProfileTarget
      ? route.ownScreenId
      : user && route.authenticatedScreenId ? route.authenticatedScreenId : route.screenId,
    disposition: route.disposition,
    // The declared shell mode and protection travel with the decision so a
    // caller can act on them without re-reading the manifest. RootExperience
    // uses `protection` to answer one question the disposition alone could not:
    // is this a public surface that a visitor with no account arrived at cold,
    // and therefore is the app-boot skeleton honest chrome or a stall in front
    // of a sign-in form?
    shell: route.shell ?? null,
    protection: route.protection ?? null,
    reason: "implemented-screen",
  };
}
