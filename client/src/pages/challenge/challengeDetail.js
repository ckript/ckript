import api from "../../services/api";
import publicApi from "../../services/publicApi";
import { isWriterRole } from "../../utils/industryAccess";

export const CHALLENGE_DETAIL_STATUS = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  READY: "ready",
  FAILED: "failed",
});

const text = (value) => String(value ?? "").trim();

const failure = (cause, fallback) => ({
  ok: false,
  cancelled: cause?.code === "ERR_CANCELED",
  statusCode: Number(cause?.response?.status || 0),
  message: cause?.response?.data?.message || fallback,
  cause,
});

export function normalizeChallengeDetail(payload = {}) {
  return {
    competition: payload?.competition || null,
    phase: text(payload?.phase) || null,
    timeline: Array.isArray(payload?.timeline) ? payload.timeline.filter(Boolean) : [],
    results: payload?.results || null,
    serverNow: payload?.serverNow || null,
  };
}

export function challengeDetailPaths(competition = {}, fallbackSlug = "") {
  const slug = text(competition?.slug || fallbackSlug);
  const suffix = slug ? `?c=${encodeURIComponent(slug)}` : "";
  return {
    register: `/challenge/register${suffix}`,
    dashboard: `/challenge/dashboard${suffix}`,
  };
}

export function challengeCountdownTarget(phase, dates = {}) {
  if (phase === "announced") return { target: dates.regOpensAt || null, label: "Registration opens in" };
  if (phase === "registration_open") return { target: dates.regClosesAt || null, label: "Registration closes in" };
  if (phase === "registration_closed") return { target: dates.startsAt || null, label: "Challenge starts in" };
  if (phase === "live") return { target: dates.endsAt || null, label: "Time remaining" };
  return { target: null, label: "" };
}

export function challengeDetailAction({ competition, entry, entryPending = false, phase, user, fallbackSlug = "" } = {}) {
  const paths = challengeDetailPaths(competition, fallbackSlug);
  if (entryPending) return { kind: "pending", label: "Checking your entry…", disabled: true };
  if (entry) return { kind: "dashboard", label: "Open dashboard", to: paths.dashboard, disabled: false };
  if (phase === "registration_open") {
    if (user && !isWriterRole(user)) {
      return {
        kind: "unavailable",
        label: "Writer account required",
        reason: "Only writer accounts can enter a screenwriting challenge.",
        disabled: true,
      };
    }
    return {
      kind: user ? "register" : "authenticate",
      label: "Register now",
      to: paths.register,
      disabled: false,
    };
  }
  if (phase === "announced") return { kind: "unavailable", label: "Registration opens soon", disabled: true };
  if (phase === "registration_closed") return { kind: "unavailable", label: "Writing begins soon", disabled: true };
  if (phase === "live") return { kind: "theme", label: "See the theme", targetId: "theme", disabled: false };
  if (phase === "results") return { kind: "results", label: "See the results", targetId: "results", disabled: false };
  // Between the deadline and the declaration the page has a Results section that says what is
  // coming; a dead "Registration closed" button told a returning entrant nothing.
  if (phase === "judging") return { kind: "results", label: "About the results", targetId: "results", disabled: false };
  return { kind: "unavailable", label: "Registration closed", disabled: true };
}

export async function loadChallengeDetail({ slug, signal } = {}) {
  try {
    const { data } = await publicApi.get("/competitions/active", {
      params: text(slug) ? { c: text(slug) } : undefined,
      signal,
    });
    return { ok: true, data: normalizeChallengeDetail(data) };
  } catch (cause) {
    if (signal?.aborted) return { ok: false, cancelled: true };
    if (cause?.response?.status === 404) {
      return { ok: true, data: normalizeChallengeDetail() };
    }
    return failure(cause, "Could not load this challenge. Please try again.");
  }
}

export async function loadChallengeEntrySummary({ competitionId, signal } = {}) {
  const id = text(competitionId);
  if (!id) return { ok: true, data: null };
  try {
    const { data } = await api.get(`/competitions/${encodeURIComponent(id)}/me`, {
      params: { view: "summary" },
      signal,
    });
    return { ok: true, data: data?.entry || null };
  } catch (cause) {
    if (signal?.aborted) return { ok: false, cancelled: true };
    if ([403, 404].includes(Number(cause?.response?.status))) return { ok: true, data: null };
    return failure(cause, "Could not check your challenge entry. Please try again.");
  }
}
