/*
 * The inbound follow-request list.
 *
 * The implementation moved to `pages/profile/ownerInbox.js` on 2026-09-03, when
 * the owner profile grew an inbox that mixes follow requests with meeting
 * requests: a shared module must not import from `mobile/`, and two copies of
 * one normalizer is how the two queues would drift apart again. This file stays
 * so its callers and its tests keep their address.
 */
export { buildIncomingFollowRequestList } from "../../../../pages/profile/ownerInbox";
