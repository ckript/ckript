import api from "../../services/api";
import { sendPitch } from "../../services/scriptPitchService";
import { getProfileCanonicalPath } from "../../utils/profilePath";

export const AUTHENTICATED_PROFILE_STATUS = Object.freeze({
  LOADING: "loading",
  READY: "ready",
  PRIVATE: "private",
  BLOCKED: "blocked",
  RESTRICTED: "restricted",
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

const failure = (cause, fallbackMessage) => ({
  ok: false,
  statusCode: Number(cause?.response?.status || 0),
  message: cause?.response?.data?.message || fallbackMessage,
  flags: cause?.response?.data || {},
  cause,
});

export function getProfileRelationship(profile = {}, viewer = {}) {
  const viewerId = idOf(viewer);
  const followers = Array.isArray(profile.followers) ? profile.followers : [];
  const following = Array.isArray(profile.following) ? profile.following : [];
  return {
    isFollowing: Boolean(viewerId && followers.some((entry) => idOf(entry) === viewerId)),
    followsMe: Boolean(viewerId && following.some((entry) => idOf(entry) === viewerId)),
    followRequestPending: Boolean(profile.followRequestPending),
    blockedByCurrent: Boolean(profile.blockedByCurrent),
    blockedByProfile: Boolean(profile.blockedByProfile),
  };
}

export function classifyProfileFailure(cause) {
  const data = cause?.response?.data || {};
  const statusCode = Number(cause?.response?.status || 0);
  const base = {
    profileId: text(data.profileId),
    message: data.message || "Unable to load profile right now.",
    relationship: {
      isFollowing: false,
      followsMe: false,
      followRequestPending: Boolean(data.followRequestPending),
      blockedByCurrent: Boolean(data.blockedByCurrent),
      blockedByProfile: Boolean(data.blockedByProfile),
    },
  };

  if (statusCode === 403 && (data.requiresBusinessEmail || data.personalEmailFipRestricted)) {
    return { ...base, status: AUTHENTICATED_PROFILE_STATUS.RESTRICTED };
  }
  if (statusCode === 403 && data.privateAccount) {
    return { ...base, status: AUTHENTICATED_PROFILE_STATUS.PRIVATE };
  }
  if (statusCode === 403 && (data.blockedByProfile || data.blocked)) {
    return { ...base, status: AUTHENTICATED_PROFILE_STATUS.BLOCKED };
  }
  if (statusCode === 400 || statusCode === 404) {
    return { ...base, status: AUTHENTICATED_PROFILE_STATUS.NOT_FOUND };
  }
  return { ...base, status: AUTHENTICATED_PROFILE_STATUS.FAILED };
}

export async function getAuthenticatedProfile({ profileKey, viewer, signal } = {}) {
  try {
    const { data } = await api.get(`/users/${encodeURIComponent(text(profileKey))}`, { signal });
    if (!data?.user) return failure(null, "The server returned an incomplete profile.");
    return {
      ok: true,
      data: {
        profile: data.user,
        scripts: (Array.isArray(data.scripts) ? data.scripts : [])
          .filter((script) => script?.status !== "draft" && !script?.isDeleted),
        deletedScripts: Array.isArray(data.deletedScripts) ? data.deletedScripts : [],
        purchasedScripts: Array.isArray(data.purchasedScripts) ? data.purchasedScripts : [],
        bookmarkedScripts: Array.isArray(data.bookmarkedScripts) ? data.bookmarkedScripts : [],
        relationship: getProfileRelationship(data.user, viewer),
        canonicalPath: getProfileCanonicalPath(data.user, {
          viewerId: viewer?._id,
          viewerRole: viewer?.role,
        }),
      },
    };
  } catch (cause) {
    if (signal?.aborted || cause?.code === "ERR_CANCELED") {
      return { ok: false, cancelled: true, message: "", flags: {}, cause };
    }
    return { ...failure(cause, "Unable to load profile right now."), access: classifyProfileFailure(cause) };
  }
}

export async function updateProfileFollow({ profileId, relationship = {} } = {}) {
  const userId = text(profileId);
  if (!userId) return failure(null, "This profile cannot receive follow requests.");
  try {
    if (relationship.isFollowing) {
      await api.post("/users/unfollow", { userId });
      return { ok: true, data: { ...relationship, isFollowing: false, followRequestPending: false } };
    }
    if (relationship.followRequestPending) {
      await api.post("/users/follow-requests/cancel", { userId });
      return { ok: true, data: { ...relationship, isFollowing: false, followRequestPending: false } };
    }
    const { data } = await api.post("/users/follow", { userId });
    const pending = data?.status === "pending";
    return {
      ok: true,
      data: { ...relationship, isFollowing: !pending, followRequestPending: pending },
    };
  } catch (cause) {
    return failure(cause, "Could not update this follow relationship.");
  }
}

export async function loadIncomingFollowRequests({ signal } = {}) {
  try {
    const { data } = await api.get("/users/follow-requests", { signal });
    return { ok: true, data: Array.isArray(data?.requests) ? data.requests : [] };
  } catch (cause) {
    if (signal?.aborted || cause?.code === "ERR_CANCELED") {
      return { ok: false, cancelled: true, message: "", flags: {}, cause };
    }
    return failure(cause, "Could not load follow requests.");
  }
}

export async function decideIncomingFollowRequest({ fromUserId, decision } = {}) {
  const requesterId = text(fromUserId);
  if (!requesterId) return failure(null, "This follow request is no longer actionable.");
  if (!["accept", "reject"].includes(decision)) {
    return failure(null, "Choose whether to accept or reject this follow request.");
  }

  try {
    const { data } = await api.post(`/users/follow-requests/${decision}`, { fromUserId: requesterId });
    return { ok: true, data };
  } catch (cause) {
    return failure(cause, `Could not ${decision} this follow request.`);
  }
}

export async function toggleProfileBlock({ profileId, blocked } = {}) {
  const userId = text(profileId);
  if (!userId) return failure(null, "This profile cannot be blocked.");
  try {
    await api.post(blocked ? "/users/unblock" : "/users/block", { userId });
    return { ok: true, data: { blocked: !blocked } };
  } catch (cause) {
    return failure(cause, blocked ? "Could not unblock this member." : "Could not block this member.");
  }
}

export async function sendProfileMessage({ profileId, message } = {}) {
  const receiverId = text(profileId);
  const body = text(message);
  if (!receiverId) return failure(null, "This member cannot receive messages.");
  if (!body) return failure(null, "Write a message before sending.");
  if (body.length > 500) return failure(null, "Keep the message to 500 characters or fewer.");
  try {
    const { data } = await api.post("/messages/send", { receiverId, text: body });
    return { ok: true, data };
  } catch (cause) {
    return failure(cause, "Could not send this message.");
  }
}

export async function revealProfileContact({ profileId } = {}) {
  const writerId = text(profileId);
  if (!writerId) return failure(null, "This writer cannot share contact details.");
  try {
    const { data } = await api.post(`/payment/reveal-contact/${encodeURIComponent(writerId)}`);
    return { ok: true, data };
  } catch (cause) {
    return failure(cause, "Could not reveal this writer's contact details.");
  }
}

export async function getPitchableScripts() {
  try {
    const { data } = await api.get("/scripts/mine");
    return { ok: true, data: Array.isArray(data) ? data : [] };
  } catch (cause) {
    return failure(cause, "Could not load your projects for pitching.");
  }
}

export async function sendProfilePitch({ profileId, scriptId, note = "" } = {}) {
  const investorId = text(profileId);
  const selectedScriptId = text(scriptId);
  if (!investorId || !selectedScriptId) return failure(null, "Choose a project before sending your pitch.");
  try {
    const data = await sendPitch({ investorId, scriptId: selectedScriptId, note: text(note) });
    return { ok: true, data };
  } catch (cause) {
    return failure(cause, "Could not send this pitch.");
  }
}
