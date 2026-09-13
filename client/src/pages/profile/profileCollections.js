import api from "../../services/api";

export const PROFILE_COLLECTION_SECTIONS = Object.freeze([
  { key: "activity", label: "Activity" },
  { key: "bookmarks", label: "Saved" },
]);

export const PROFILE_COLLECTION_STATUS = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  READY: "ready",
  FAILED: "failed",
});

export const PROFILE_SAVED_SOURCE = Object.freeze({
  FAVORITES: "favorites",
  WATCHLIST: "watchlist",
});

const text = (value) => String(value ?? "").trim();
/*
 * An id, or nothing.
 *
 * The previous form fell through to `String(value)` for a record carrying
 * neither `_id` nor `id`, which turns a MISSING id into the string
 * "[object Object]" — a value that is truthy, passes every `if (id)` guard, and
 * then quietly fails to match anything or reaches an endpoint as a bad key.
 * An object with no id has no id; say so.
 */
const idOf = (value) => (
  value && typeof value === "object" ? text(value._id || value.id) : text(value)
);
const failure = (cause, fallbackMessage) => ({
  ok: false,
  statusCode: Number(cause?.response?.status || 0),
  message: cause?.response?.data?.message || fallbackMessage,
  flags: cause?.response?.data || {},
  cause,
});

export function readProfileCollectionLocation(search = "", { own = false } = {}) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  const requested = text(params.get("tab")).toLowerCase();
  const savedRequested = own && ["bookmarks", "saved"].includes(requested);
  const collectionRequested = requested === "activity" || savedRequested;
  const section = savedRequested ? "bookmarks" : "activity";
  return {
    section,
    page: collectionRequested ? Math.max(1, Number.parseInt(params.get("page"), 10) || 1) : 1,
  };
}

export function writeProfileCollectionLocation(current, { section, page = 1 } = {}) {
  const params = new URLSearchParams(current);
  params.set("tab", section === "bookmarks" ? "bookmarks" : "activity");
  if (page > 1) params.set("page", String(page));
  else params.delete("page");
  return params;
}

export function normalizeProfileCollectionResponse(data = {}) {
  const pagination = data.pagination || {};
  const serverSection = text(pagination.section).toLowerCase();
  const savedSource = text(data.savedSource).toLowerCase() === PROFILE_SAVED_SOURCE.WATCHLIST
    ? PROFILE_SAVED_SOURCE.WATCHLIST
    : PROFILE_SAVED_SOURCE.FAVORITES;
  return {
    profileId: text(data.profileId),
    own: Boolean(data.own),
    savedSource,
    counts: {
      activity: Math.max(0, Number(data.counts?.activity) || 0),
      bookmarks: data.counts?.saved == null ? null : Math.max(0, Number(data.counts.saved) || 0),
    },
    items: (Array.isArray(data.items) ? data.items : []).filter((item) => item && (item._id || item.id)),
    pagination: {
      section: serverSection === "saved" ? "bookmarks" : "activity",
      page: Math.max(1, Number(pagination.page) || 1),
      limit: Math.max(1, Number(pagination.limit) || 12),
      total: Math.max(0, Number(pagination.total) || 0),
      totalPages: Math.max(1, Number(pagination.totalPages) || 1),
      hasPrevious: Boolean(pagination.hasPrevious),
      hasNext: Boolean(pagination.hasNext),
      privateCollection: Boolean(pagination.privateCollection),
    },
  };
}

export function removeSavedProjectFromViewer(viewer, projectId, source = PROFILE_SAVED_SOURCE.FAVORITES) {
  if (!viewer) return viewer;
  const id = idOf(projectId);
  const withoutProject = (items) => (Array.isArray(items) ? items : [])
    .filter((entry) => idOf(entry) !== id);
  if (source === PROFILE_SAVED_SOURCE.WATCHLIST) {
    return {
      ...viewer,
      industryProfile: {
        ...(viewer.industryProfile || {}),
        savedScripts: withoutProject(viewer.industryProfile?.savedScripts),
      },
    };
  }
  return { ...viewer, favoriteScripts: withoutProject(viewer.favoriteScripts) };
}

export async function loadProfileCollection({ profileId, section = "activity", page = 1, query = "", sort = "recent", signal } = {}) {
  const id = text(profileId);
  if (!id) return failure(null, "This profile cannot load activity.");
  try {
    const { data } = await api.get(`/users/${encodeURIComponent(id)}/profile-collections`, {
      params: {
        section: section === "bookmarks" ? "saved" : "activity",
        page,
        ...(section === "bookmarks" && text(query) ? { q: text(query).slice(0, 100) } : {}),
        ...(section === "bookmarks" && sort !== "recent" ? { sort } : {}),
      },
      signal,
    });
    return { ok: true, data: normalizeProfileCollectionResponse(data) };
  } catch (cause) {
    if (signal?.aborted || cause?.code === "ERR_CANCELED") return { ok: false, cancelled: true };
    return failure(cause, "Could not load this profile section.");
  }
}

export async function removeSavedProfileProject(projectId, { source = PROFILE_SAVED_SOURCE.FAVORITES } = {}) {
  const id = text(projectId);
  if (!id) return failure(null, "This saved project is no longer available.");
  try {
    if (source === PROFILE_SAVED_SOURCE.WATCHLIST) {
      const { data } = await api.post("/users/watchlist/remove", { scriptId: id });
      if (data?.saved !== false) return failure(null, "The project is still in your watchlist. Please try again.");
      return { ok: true, data: { projectId: id, source: PROFILE_SAVED_SOURCE.WATCHLIST } };
    }
    const { data } = await api.post(`/scripts/${encodeURIComponent(id)}/favorite`);
    if (data?.favorited !== false) return failure(null, "The project is still saved. Please try again.");
    return { ok: true, data: { projectId: id, source: PROFILE_SAVED_SOURCE.FAVORITES } };
  } catch (cause) {
    return failure(cause, "Could not remove this saved project.");
  }
}
