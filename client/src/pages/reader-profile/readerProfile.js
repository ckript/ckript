import api from "../../services/api";
import { classifyProfileFailure, updateProfileFollow } from "../profile/authenticatedProfile";

export const READER_PROFILE_SECTIONS = Object.freeze([
  { key: "read", label: "Scripts read" },
  { key: "favorites", label: "Favorites" },
  { key: "reviews", label: "Reviews" },
]);

export const READER_PROFILE_STATUS = Object.freeze({
  LOADING: "loading",
  READY: "ready",
  PRIVATE: "private",
  BLOCKED: "blocked",
  NOT_FOUND: "not-found",
  FAILED: "failed",
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

export function readReaderProfileLocation(search = "") {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  const section = READER_PROFILE_SECTIONS.some(({ key }) => key === params.get("tab"))
    ? params.get("tab")
    : "read";
  return {
    section,
    page: Math.max(1, Number.parseInt(params.get("page"), 10) || 1),
  };
}

export function writeReaderProfileLocation(current, { section, page = 1 }) {
  const params = new URLSearchParams(current);
  if (section === "read") params.delete("tab");
  else params.set("tab", section);
  if (page > 1) params.set("page", String(page));
  else params.delete("page");
  return params;
}

export function normalizeReaderProfileResponse(data = {}) {
  const profile = data.profile && typeof data.profile === "object" ? data.profile : null;
  if (!profile?._id) return null;
  const items = Array.isArray(data.items) ? data.items.filter(Boolean) : [];
  const pagination = data.pagination || {};
  return {
    profile,
    own: Boolean(data.own),
    collectionsVisible: Boolean(data.collectionsVisible),
    relationship: {
      isFollowing: Boolean(data.relationship?.isFollowing),
      followsMe: Boolean(data.relationship?.followsMe),
      followRequestPending: Boolean(data.relationship?.followRequestPending),
      blockedByCurrent: Boolean(data.relationship?.blockedByCurrent),
      blockedByProfile: Boolean(data.relationship?.blockedByProfile),
    },
    counts: {
      read: data.counts?.read == null ? null : Math.max(0, Number(data.counts.read) || 0),
      favorites: data.counts?.favorites == null ? null : Math.max(0, Number(data.counts.favorites) || 0),
      reviews: Math.max(0, Number(data.counts?.reviews) || 0),
    },
    items,
    pagination: {
      section: text(pagination.section) || "read",
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

export async function loadReaderProfile({ profileId, section = "read", page = 1, signal } = {}) {
  const id = idOf(profileId);
  if (!id) return { ok: false, access: { status: READER_PROFILE_STATUS.NOT_FOUND, message: "Invalid reader profile link." } };
  try {
    const { data } = await api.get(`/users/reader-profile/${encodeURIComponent(id)}`, {
      params: { section, page },
      signal,
    });
    const normalized = normalizeReaderProfileResponse(data);
    if (!normalized) return { ok: false, access: { status: READER_PROFILE_STATUS.FAILED, message: "The server returned an incomplete reader profile." } };
    return { ok: true, data: normalized };
  } catch (cause) {
    if (signal?.aborted || cause?.code === "ERR_CANCELED") return { ok: false, cancelled: true };
    const access = classifyProfileFailure(cause);
    return {
      ok: false,
      access: {
        ...access,
        status: access.status === "restricted" ? READER_PROFILE_STATUS.FAILED : access.status,
      },
    };
  }
}

export async function updateReaderProfileFollow({ profileId, relationship }) {
  return updateProfileFollow({ profileId, relationship });
}

export function readerFollowLabel(relationship = {}) {
  if (relationship.blockedByProfile) return "Blocked you";
  if (relationship.blockedByCurrent) return "Blocked";
  if (relationship.isFollowing) return "Following";
  if (relationship.followRequestPending) return "Requested";
  if (relationship.followsMe) return "Follow back";
  return "Follow";
}

export function readerProfileShare(profile = {}, origin = "") {
  const id = idOf(profile);
  const supplied = text(profile.shareMeta?.url);
  return {
    url: supplied || (id ? `${String(origin).replace(/\/$/, "")}/share/profile/${encodeURIComponent(id)}` : ""),
    title: text(profile.shareMeta?.title) || `${text(profile.name) || "Reader"} | Ckript`,
    text: text(profile.shareMeta?.text) || `View ${text(profile.name) || "this reader"}'s profile on Ckript.`,
  };
}
