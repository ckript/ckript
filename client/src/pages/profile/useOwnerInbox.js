import { useCallback, useEffect, useMemo, useState } from "react";
import { decideIncomingFollowRequest, loadIncomingFollowRequests } from "./authenticatedProfile";
import {
  buildIncomingFollowRequestList,
  buildOwnerInbox,
  decideOwnerMeeting,
  loadOwnerMeetings,
  OWNER_ASK,
} from "./ownerInbox";

export const OWNER_INBOX_STATUS = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  READY: "ready",
  FAILED: "failed",
});

/*
 * One hook for "what is waiting on me".
 *
 * Two endpoints, one queue, one `decide(item, accept)`. The alternative — the
 * screen holding two hooks, two loading flags, two error strings and a switch
 * on which kind of ask it is looking at — is how the two queues drifted apart
 * in the first place: meetings ended up desktop-only and follow requests
 * mobile-only, and neither surface knew the other existed.
 *
 * A partial failure is not a failure. If meetings load and follow requests do
 * not, the queue shows the meetings and says what is missing; hiding a real
 * request because an unrelated endpoint was down is the worse answer.
 */
export function useOwnerInbox({ viewerId, enabled = true } = {}) {
  const [meetings, setMeetings] = useState([]);
  const [followRequests, setFollowRequests] = useState([]);
  const [status, setStatus] = useState(OWNER_INBOX_STATUS.IDLE);
  const [error, setError] = useState("");
  const [actingKey, setActingKey] = useState("");
  const [revision, setRevision] = useState(0);

  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) {
      setStatus(OWNER_INBOX_STATUS.IDLE);
      return undefined;
    }
    const controller = new AbortController();
    setStatus(OWNER_INBOX_STATUS.LOADING);
    setError("");

    Promise.all([
      loadOwnerMeetings({ signal: controller.signal }),
      loadIncomingFollowRequests({ signal: controller.signal }),
    ]).then(([meetingResult, followResult]) => {
      if (controller.signal.aborted) return;
      if (meetingResult.cancelled || followResult.cancelled) return;

      setMeetings(meetingResult.ok ? meetingResult.data : []);
      setFollowRequests(followResult.ok ? buildIncomingFollowRequestList(followResult.data) : []);

      if (!meetingResult.ok && !followResult.ok) {
        setStatus(OWNER_INBOX_STATUS.FAILED);
        setError(meetingResult.message || followResult.message);
        return;
      }
      setStatus(OWNER_INBOX_STATUS.READY);
      setError(meetingResult.ok ? (followResult.ok ? "" : followResult.message) : meetingResult.message);
    });

    return () => controller.abort();
  }, [enabled, revision]);

  const inbox = useMemo(
    () => buildOwnerInbox({ meetings, followRequests, viewerId }),
    [followRequests, meetings, viewerId],
  );

  const decide = useCallback(async (item, accept) => {
    if (!item?.canDecide || actingKey) {
      return { ok: false, message: "Another request is still being answered." };
    }
    setActingKey(item.key);
    setError("");
    try {
      const result = item.kind === OWNER_ASK.MEETING
        ? await decideOwnerMeeting({ meetingId: item.id, accept })
        : await decideIncomingFollowRequest({ fromUserId: item.id, decision: accept ? "accept" : "reject" });

      if (!result.ok) {
        setError(result.message);
        return result;
      }

      /* A decided meeting keeps its row and changes state — the writer still
         needs the join link. A decided follow request has nothing left to show,
         so it leaves. That asymmetry is the data's, not a UI preference. */
      if (item.kind === OWNER_ASK.MEETING) {
        setMeetings((current) => current.map((meeting) => (
          String(meeting?._id || meeting?.id || "") === item.id
            ? { ...meeting, status: accept ? "accepted" : "rejected" }
            : meeting
        )));
      } else {
        setFollowRequests((current) => current.filter((request) => request.fromUserId !== item.id));
      }
      return result;
    } finally {
      setActingKey("");
    }
  }, [actingKey]);

  return { ...inbox, status, error, actingKey, reload, decide };
}

export default useOwnerInbox;
