import { useContext, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import { getProfileCanonicalPath } from "../../utils/profilePath";
import { buildMobileNav, resolveActiveTabKey } from "../navigation/mobileNav";

/*
 * useMobileNav — the one place mobile chrome asks "who is this and where are
 * they?". AppBar and NavBar both call it, so a screen never has to thread an
 * audience or an active-tab string through its props, and two pieces of chrome
 * can never disagree about which tab is current.
 *
 * `user` may be passed explicitly. That is not a convenience: the development
 * harness and the preview fixture mount deliberate, deterministic accounts, and
 * a hook that could only read the live AuthContext would render the signed-in
 * writer's bar in a fixture meant to show the producer's.
 *
 * The unread-messages badge is a PARAMETER, not something this hook fetches.
 * The count lives in `layouts/app-shell/hooks/useShellNotifications`, which owns
 * a socket and a 30s poll; standing a second copy of that session up here would
 * double the app's notification traffic for a phone that is already running the
 * first one. Wiring it is Phase 2's "wire real services" bullet, and until then
 * the badge is honestly absent rather than dishonestly zero-looking.
 */
export function useMobileNav({ user: userOverride, msgCount = 0 } = {}) {
  const auth = useContext(AuthContext);
  const user = userOverride ?? auth?.user ?? null;
  const { pathname, search } = useLocation();

  const profilePath = useMemo(
    () => getProfileCanonicalPath(user, { viewerId: user?._id, viewerRole: user?.role }),
    [user],
  );

  const nav = useMemo(
    () => buildMobileNav({ user, profilePath, msgCount }),
    [user, profilePath, msgCount],
  );

  /*
   * `search` is part of the answer, not decoration: a destination may be a
   * query-string tab of a page (`/dashboard?tab=projects`), and on pathname
   * alone it is indistinguishable from its host page.
   */
  const activeTabKey = useMemo(
    () => resolveActiveTabKey(nav.tabs, pathname, search),
    [nav.tabs, pathname, search],
  );

  /*
   * Which More-sheet row the current URL is, if any. It is resolved here rather
   * than in the bar for the same reason `activeTabKey` is: the answer depends
   * on the URL, and two pieces of chrome deriving it separately is how they
   * come to disagree.
   *
   * It also decides whether the More cell itself reads as current. Without it,
   * a producer standing on /mandates would see a bar with nothing selected and
   * no clue which cell they arrived through.
   */
  const activeOverflowKey = useMemo(
    () => resolveActiveTabKey(nav.overflow, pathname, search),
    [nav.overflow, pathname, search],
  );

  return { ...nav, activeTabKey, activeOverflowKey };
}

export default useMobileNav;
