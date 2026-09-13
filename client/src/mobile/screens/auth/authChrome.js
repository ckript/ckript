import { MOBILE_SHELL_MODE } from "../../shell/mobileShellModes";
import { sanitizeLocalReturnPath } from "../../../routing/audienceTransitions";

/*
 * authChrome — the shell contract for the account-entry family, and the two
 * URL helpers every one of its screens needs (Phase 8, D59).
 *
 * The shell modes are named constants rather than literals in JSX because §8.1
 * requires a mode to be declarable from the manifest and greppable from the
 * code, and because an override has to be a visible decision.
 */

/* Sign in, the role chooser, recovery and invite: public chrome, no bottom tabs. */
export const AUTH_SHELL_MODE = MOBILE_SHELL_MODE.PUBLIC;

/* The stepper is a `flow` surface — §8.1 names onboarding steppers as the
   example — and takes no slot overrides: it wants exactly what the mode says. */
export const SIGNUP_SHELL_MODE = MOBILE_SHELL_MODE.FLOW;

/*
 * NO FONT LOADER HERE, AND THAT IS THE POINT.
 *
 * These screens used to inject the desktop auth pair (Baskervville + PT Serif)
 * at runtime, because the surface they rendered was carried across from the
 * desktop modal. The iOS redesign sets them in the app's own two families —
 * Spectral for display, IBM Plex Sans for everything else — and index.html
 * already loads both, plus Material Symbols, for every mobile screen.
 *
 * So the third-party request this file used to make on the connection least
 * able to afford one is gone, and account entry now renders in the fonts the
 * rest of the app is already holding.
 */

/*
 * The return path an auth screen was given, or "".
 *
 * Every read of `?redirect=` in this family goes through here, because the
 * value is attacker-controllable: it arrives from a URL anyone can send. The
 * guard is `sanitizeLocalReturnPath`, which is already the app's answer to
 * open redirects — it rejects absolute URLs, protocol-relative `//evil.com`,
 * backslash-smuggled paths and control characters, and refuses the auth routes
 * themselves so a return path cannot loop the visitor back to sign-in.
 *
 * Reusing it rather than re-deriving it is deliberate: a second implementation
 * of an open-redirect guard is a second place for it to be subtly wrong.
 */
export function readReturnPath(search) {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  return sanitizeLocalReturnPath(params.get("redirect") || "");
}

/* Carry the current `?redirect=` onto another auth URL, so moving between sign
   in, the role chooser and the stepper never loses where the visitor was
   heading. Already-sanitised input, re-encoded for the URL it is going into. */
export function withReturnPath(path, returnPath = "") {
  if (!returnPath) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}redirect=${encodeURIComponent(returnPath)}`;
}
