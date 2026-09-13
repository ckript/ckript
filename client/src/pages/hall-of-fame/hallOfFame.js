import publicApi from "../../services/publicApi";

export const HALL_OF_FAME_STATUS = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  READY: "ready",
  FAILED: "failed",
  NOT_FOUND: "not_found",
});

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
const positiveInt = (value, fallback = 1) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const failure = (cause, fallback) => ({
  ok: false,
  cancelled: cause?.code === "ERR_CANCELED",
  statusCode: Number(cause?.response?.status || 0),
  message: cause?.response?.data?.message || fallback,
  cause,
});

export function readHallOfFameQuery(search = "") {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  return {
    page: positiveInt(params.get("page")),
    year: text(params.get("year")) || "all",
    competition: text(params.get("competition")) || "all",
  };
}

export function writeHallOfFameQuery(current = "", patch = {}) {
  const params = current instanceof URLSearchParams
    ? new URLSearchParams(current)
    : new URLSearchParams(current);
  const next = { ...readHallOfFameQuery(params), ...patch };
  if (next.page > 1) params.set("page", String(next.page));
  else params.delete("page");
  if (next.year && next.year !== "all") params.set("year", String(next.year));
  else params.delete("year");
  if (next.competition && next.competition !== "all") params.set("competition", next.competition);
  else params.delete("competition");
  return params;
}

export function normalizeHallOfFameList(payload = {}) {
  return {
    items: list(payload.items),
    years: list(payload.years),
    competitions: list(payload.competitions),
    pageInfo: {
      page: positiveInt(payload.pageInfo?.page),
      limit: positiveInt(payload.pageInfo?.limit, 12),
      total: Math.max(0, Number(payload.pageInfo?.total || 0)),
      totalPages: positiveInt(payload.pageInfo?.totalPages),
      hasMore: Boolean(payload.pageInfo?.hasMore),
    },
  };
}

export function normalizeHallOfFameDetail(payload = {}) {
  if (!payload?.competition) return null;
  return {
    ...payload,
    results: payload.results || { winner: null, runnerUp: null, secondRunnerUp: null, special: [] },
    stats: payload.stats || {},
    featuredScripts: list(payload.featuredScripts),
    featuredScriptsPageInfo: {
      page: positiveInt(payload.featuredScriptsPageInfo?.page),
      limit: positiveInt(payload.featuredScriptsPageInfo?.limit, 6),
      total: Math.max(0, Number(payload.featuredScriptsPageInfo?.total || 0)),
      totalPages: positiveInt(payload.featuredScriptsPageInfo?.totalPages),
      hasMore: Boolean(payload.featuredScriptsPageInfo?.hasMore),
    },
  };
}

export async function loadHallOfFameList({ query = {}, signal } = {}) {
  try {
    const { data } = await publicApi.get("/competitions/completed", {
      signal,
      params: {
        page: positiveInt(query.page),
        ...(query.year && query.year !== "all" ? { year: query.year } : {}),
        ...(query.competition && query.competition !== "all" ? { competition: query.competition } : {}),
      },
    });
    return { ok: true, data: normalizeHallOfFameList(data) };
  } catch (cause) {
    if (signal?.aborted) return { ok: false, cancelled: true };
    return failure(cause, "We couldn't load the Hall of Fame just now.");
  }
}

export async function loadHallOfFameDetail({ slug, scriptPage = 1, signal } = {}) {
  const safeSlug = text(slug);
  if (!safeSlug) return failure(null, "This competition record is unavailable.");
  try {
    const { data } = await publicApi.get(`/competitions/hall-of-fame/${encodeURIComponent(safeSlug)}`, {
      signal,
      params: { scriptPage: positiveInt(scriptPage) },
    });
    return { ok: true, data: normalizeHallOfFameDetail(data) };
  } catch (cause) {
    if (signal?.aborted) return { ok: false, cancelled: true };
    return failure(cause, "We couldn't load this competition record.");
  }
}

export function hallOfFameProfilePath(person) {
  if (person?.username) return `/${encodeURIComponent(person.username)}`;
  const id = text(person?.userId || person?._id);
  return id ? `/share/profile/${encodeURIComponent(id)}` : "";
}

export function hallOfFameDetailPath(slug) {
  const safeSlug = text(slug);
  return safeSlug ? `/hall-of-fame/${encodeURIComponent(safeSlug)}` : "/hall-of-fame";
}
