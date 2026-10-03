import { matchPath } from "react-router-dom";
import { AUDIENCE, getAudience, isKnownRole } from "../layouts/app-shell/shellPolicy";
import { FILM_PROFESSIONAL_ROLE_LIST } from "../utils/industryAccess";

const normalizeRole = (value) => String(value || "").trim().toLowerCase();
const FILM_PROFESSIONAL_ROLES = Object.freeze([...FILM_PROFESSIONAL_ROLE_LIST]);

/*
 * Routes in this table are not merely presented differently by audience: their
 * content belongs to that audience. Shared discovery, messages, profiles,
 * challenges and public routes stay deliberately absent.
 *
 * The table is ordered from specific to general because React Router patterns
 * can overlap (`/script/:first/:second` also matches the payment route).
 */
export const AUDIENCE_ROUTE_RULES = Object.freeze([
  { id: "reader-project", patterns: ["/reader/script/:id"], audiences: [AUDIENCE.READER], roles: ["reader"] },
  { id: "reader-profile", patterns: ["/reader/profile/:id?"], audiences: [AUDIENCE.READER], roles: ["reader"] },
  { id: "reader-search", patterns: ["/reader/search"], audiences: [AUDIENCE.READER], roles: ["reader"] },
  { id: "reader-home", patterns: ["/reader"], audiences: [AUDIENCE.READER], roles: ["reader"] },

  { id: "writer-create", patterns: ["/new-project", "/create-project", "/create-project/:draftId", "/upload"], audiences: [AUDIENCE.WRITER] },
  { id: "writer-collaboration", patterns: ["/collaborations"], audiences: [AUDIENCE.WRITER] },
  { id: "writer-ai", patterns: ["/ai-tools"], audiences: [AUDIENCE.WRITER] },

  { id: "industry-mandates", patterns: ["/mandates"], audiences: [AUDIENCE.INDUSTRY], roles: FILM_PROFESSIONAL_ROLES },
  { id: "industry-holds", patterns: ["/offer-holds"], audiences: [AUDIENCE.INDUSTRY], roles: FILM_PROFESSIONAL_ROLES },
  { id: "industry-onboarding", patterns: ["/industry-onboarding"], audiences: [AUDIENCE.INDUSTRY], roles: ["professional"] },
  { id: "industry-roster", patterns: ["/writers"], audiences: [AUDIENCE.INDUSTRY] },
  { id: "industry-home", patterns: ["/home"], audiences: [AUDIENCE.INDUSTRY] },

  { id: "member-dashboard", patterns: ["/dashboard"], audiences: [AUDIENCE.WRITER, AUDIENCE.INDUSTRY] },
  { id: "authenticated-project", patterns: ["/script/:id/pay", "/script/:projectHeading/:writerUsername", "/script/:id"], audiences: [AUDIENCE.WRITER, AUDIENCE.INDUSTRY] },

  { id: "admin", patterns: ["/admin", "/admin/competitions/:id", "/admin/scripts/:id", "/admin/agreements"] },
  { id: "finance", patterns: ["/finance"], roles: ["admin", "finance"] },
  // Judge only — NOT admin, unlike the finance rule above. The server refuses an admin at
  // /api/judge for the same reason: every score has to be attributable to a named judge, and an
  // admin who could reach the console would produce scores nobody assigned.
  { id: "judge", patterns: ["/judge"], roles: ["judge"] },
]);

export function getDefaultAuthenticatedPath(userOrRole) {
  const role = normalizeRole(typeof userOrRole === "string" ? userOrRole : userOrRole?.role);
  if (role === "finance") return "/finance";
  // Console-only roles are answered BEFORE the audience switch. `judge` is mapped to READER in
  // shellPolicy so the role-coverage test stays honest, but a judge has nothing to do at /reader —
  // falling through would land them on a browsing surface with no route back to their panel.
  if (role === "judge") return "/judge";
  if (!isKnownRole(role)) return "/profile";

  switch (getAudience(role)) {
    case AUDIENCE.WRITER:
      return "/dashboard";
    case AUDIENCE.INDUSTRY:
      return "/home";
    case AUDIENCE.ADMIN:
      return "/admin";
    case AUDIENCE.READER:
    default:
      return "/reader";
  }
}

export function findAudienceRouteRule(pathname = "/") {
  const path = String(pathname || "/").split(/[?#]/, 1)[0] || "/";
  return AUDIENCE_ROUTE_RULES.find((rule) => rule.patterns.some((pattern) => (
    matchPath({ path: pattern, end: true, caseSensitive: false }, path)
  ))) || null;
}

export function resolveAudienceRouteAccess({ pathname = "/", user, authLoading = false } = {}) {
  const rule = findAudienceRouteRule(pathname);
  if (!rule) return { status: "shared", allowed: true, ruleId: null, redirectTo: null };
  if (authLoading) return { status: "loading", allowed: false, ruleId: rule.id, redirectTo: null };
  if (!user) return { status: "authentication-required", allowed: false, ruleId: rule.id, redirectTo: null };

  const role = normalizeRole(user.role);
  const audience = getAudience(role);
  const audienceAllowed = !rule.audiences || rule.audiences.includes(audience);
  const roleAllowed = !rule.roles || rule.roles.includes(role);

  if (audienceAllowed && roleAllowed) {
    return { status: "allowed", allowed: true, ruleId: rule.id, redirectTo: null };
  }

  return {
    status: "audience-forbidden",
    allowed: false,
    ruleId: rule.id,
    redirectTo: getDefaultAuthenticatedPath(user),
  };
}

export function sanitizeLocalReturnPath(value = "") {
  const raw = String(value || "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "";
  if (raw.includes("\\")) return "";
  for (const character of raw) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return "";
  }

  let parsed;
  try {
    parsed = new URL(raw, "https://ckript.local");
  } catch {
    return "";
  }
  if (parsed.origin !== "https://ckript.local") return "";

  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  if (/^\/(?:login|join|signup)(?:[/?#]|$)/i.test(path)) return "";
  return path;
}

export function resolvePostAuthPath({ requestedPath = "", user } = {}) {
  const safePath = sanitizeLocalReturnPath(requestedPath);
  if (!safePath) return getDefaultAuthenticatedPath(user);

  const access = resolveAudienceRouteAccess({
    pathname: safePath,
    user,
    authLoading: false,
  });
  return access.allowed ? safePath : getDefaultAuthenticatedPath(user);
}
