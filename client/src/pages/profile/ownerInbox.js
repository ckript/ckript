import api from "../../services/api";

/*
 * The owner's inbox — everything that is waiting on an answer from you.
 *
 * Two things ask an account owner for a decision, and until now they lived in
 * two unrelated places: a meeting request (Profile.jsx's Meetings tab, desktop
 * only) and a follow request (its own mobile route). They are the same
 * *shape* — somebody asked, you accept or decline, the answer is final — so
 * they are one queue here, ordered by what is still waiting.
 *
 * This module is deliberately platform-neutral and lives beside the other
 * shared profile logic rather than inside the mobile screen, because the
 * desktop Meetings tab is the second caller waiting to happen.
 */

export const OWNER_ASK = Object.freeze({ MEETING: "meeting", FOLLOW: "follow" });

export const OWNER_ASK_STATE = Object.freeze({
  PENDING: "pending",
  ACCEPTED: "accepted",
  DECLINED: "declined",
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
  cause,
});

/*
 * `startAt` is the canonical instant, so it is rendered in the VIEWER's zone
 * with the zone label — there is never any "whose 4 PM?" ambiguity. The
 * `scheduledDate`/`scheduledTime` pair is the older shape and is used verbatim,
 * because it carries no zone and inventing one would be a guess.
 */
export function formatMeetingWhen(meeting = {}) {
  const startAt = meeting.startAt ? new Date(meeting.startAt) : null;
  if (startAt && !Number.isNaN(startAt.getTime())) {
    return [
      new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }).format(startAt),
      new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(startAt),
    ].join(" · ");
  }
  const legacy = meeting.scheduledDate ? new Date(meeting.scheduledDate) : null;
  const day = legacy && !Number.isNaN(legacy.getTime())
    ? new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }).format(legacy)
    : "";
  return [day, text(meeting.scheduledTime)].filter(Boolean).join(" · ");
}

export function relativeDayLabel(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
}

const roleLabel = (value) => text(value)
  .replace(/_/g, " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

/*
 * The inbound follow-request payload, normalized.
 *
 * It lives here rather than in the mobile screen that used to own it because
 * `pages/profile` is the shared layer and must not import from `mobile/`;
 * followRequestsModel.js now re-exports this so its own callers and tests are
 * untouched and there is still exactly one implementation.
 */
export function buildIncomingFollowRequestList(requests = []) {
  return (Array.isArray(requests) ? requests : [])
    .map((request) => {
      const member = request?.from || {};
      const fromUserId = text(member._id);
      const username = text(member.writerProfile?.username);
      return {
        id: text(request?._id) || fromUserId,
        fromUserId,
        name: text(member.name) || "Ckript member",
        role: roleLabel(member.role) || "Member",
        bio: text(member.bio),
        image: text(member.profileImage),
        profilePath: fromUserId ? `/profile/${encodeURIComponent(username || fromUserId)}` : "",
        createdAt: request?.createdAt || null,
      };
    })
    .filter(({ id, fromUserId }) => id && fromUserId);
}

const meetingState = (status) => {
  const value = text(status).toLowerCase();
  if (value === "accepted" || value === "confirmed") return OWNER_ASK_STATE.ACCEPTED;
  if (value === "rejected" || value === "declined" || value === "cancelled") return OWNER_ASK_STATE.DECLINED;
  return OWNER_ASK_STATE.PENDING;
};

/*
 * One card shape for both kinds of ask.
 *
 * `canDecide` is the important field and it is not "am I the owner?": a
 * producer who *sent* a meeting request owns this profile too, and offering
 * them an Accept button for their own ask would be nonsense. The server decides
 * the same way — only the recipient may change the status — so the UI simply
 * agrees with it rather than discovering it through a 403.
 */
export function buildOwnerInbox({ meetings = [], followRequests = [], viewerId = "" } = {}) {
  const viewer = text(viewerId);

  const meetingItems = (Array.isArray(meetings) ? meetings : []).map((meeting) => {
    const id = idOf(meeting);
    if (!id) return null;
    const requested = Boolean(viewer) && idOf(meeting.producer) === viewer;
    const state = meetingState(meeting.status);
    return {
      key: `${OWNER_ASK.MEETING}:${id}`,
      kind: OWNER_ASK.MEETING,
      id,
      actorId: requested ? idOf(meeting.writer) : idOf(meeting.producer),
      name: text(requested ? meeting.writer_name : meeting.producer_name) || "Ckript member",
      image: "",
      detail: text(meeting.title) || "Ckript meeting",
      subject: text(meeting.script_name) ? `About ${text(meeting.script_name)}` : "",
      when: [formatMeetingWhen(meeting), meeting.duration ? `${meeting.duration} min` : ""]
        .filter(Boolean).join(" · "),
      message: text(meeting.message),
      state,
      canDecide: !requested && state === OWNER_ASK_STATE.PENDING,
      requested,
      joinUrl: state === OWNER_ASK_STATE.ACCEPTED ? text(meeting.meetingLink) : "",
      profilePath: "",
    };
  }).filter(Boolean);

  const followItems = (Array.isArray(followRequests) ? followRequests : []).map((request) => {
    if (!request?.fromUserId) return null;
    return {
      key: `${OWNER_ASK.FOLLOW}:${request.fromUserId}`,
      kind: OWNER_ASK.FOLLOW,
      id: request.fromUserId,
      actorId: request.fromUserId,
      name: request.name,
      image: request.image,
      detail: request.role,
      subject: "Wants to follow you",
      when: relativeDayLabel(request.createdAt),
      message: "",
      state: OWNER_ASK_STATE.PENDING,
      canDecide: true,
      requested: false,
      joinUrl: "",
      profilePath: request.profilePath,
    };
  }).filter(Boolean);

  /* Anything still waiting on you comes first; settled asks stay visible
     underneath so "did I already answer that?" has an answer on the screen. */
  const items = [...followItems, ...meetingItems].sort((left, right) => {
    const leftWaiting = left.canDecide ? 0 : 1;
    const rightWaiting = right.canDecide ? 0 : 1;
    return leftWaiting - rightWaiting;
  });

  return { items, pending: items.filter((item) => item.canDecide).length };
}

export async function loadOwnerMeetings({ signal } = {}) {
  try {
    const { data } = await api.get("/meetings", { signal });
    return { ok: true, data: Array.isArray(data) ? data : [] };
  } catch (cause) {
    if (signal?.aborted || cause?.code === "ERR_CANCELED") return { ok: false, cancelled: true, message: "" };
    return failure(cause, "Could not load your meeting requests.");
  }
}

export async function decideOwnerMeeting({ meetingId, accept } = {}) {
  const id = text(meetingId);
  if (!id) return failure(null, "This meeting is no longer available.");
  const status = accept ? "accepted" : "rejected";
  try {
    await api.patch(`/meetings/${encodeURIComponent(id)}/status`, { status });
    return { ok: true, data: { meetingId: id, status } };
  } catch (cause) {
    return failure(cause, accept ? "Could not accept this meeting." : "Could not decline this meeting.");
  }
}

/*
 * A soft delete. The server keeps the record and returns it under
 * `deletedScripts` on the next profile fetch, which is why the caller removes
 * the row optimistically but does not pretend the project is gone for good —
 * Account & security still lists it.
 */
export async function deleteOwnProject(projectId) {
  const id = text(projectId);
  if (!id) return failure(null, "This project is no longer available.");
  try {
    await api.delete(`/scripts/${encodeURIComponent(id)}`);
    return { ok: true, data: { projectId: id } };
  } catch (cause) {
    return failure(cause, "Could not delete this project.");
  }
}
