import { describe, expect, it } from "vitest";
import {
  buildIncomingFollowRequestList,
  buildOwnerInbox,
  OWNER_ASK,
  OWNER_ASK_STATE,
  relativeDayLabel,
} from "./ownerInbox";

const meeting = (over = {}) => ({
  _id: "m1",
  title: "Ckript meeting: Salt of the Deccan",
  producer: "producer-1",
  writer: "writer-1",
  producer_name: "Devan Iyer",
  writer_name: "Maya Iyer",
  script_name: "Salt of the Deccan",
  startAt: "2026-09-10T10:30:00.000Z",
  duration: 30,
  message: "Loved the third act.",
  status: "pending",
  meetingLink: "https://meet.example/abc",
  ...over,
});

const followRequest = (over = {}) => ({
  _id: "fr1",
  createdAt: new Date().toISOString(),
  from: { _id: "user-9", name: "Anaya Bose", role: "film_industry_professional", profileImage: "/a.jpg" },
  ...over,
});

describe("buildOwnerInbox", () => {
  it("offers accept and decline only to the person who was asked", () => {
    const [asked] = buildOwnerInbox({ meetings: [meeting()], viewerId: "writer-1" }).items;
    expect(asked).toMatchObject({ kind: OWNER_ASK.MEETING, canDecide: true, name: "Devan Iyer" });

    const [asker] = buildOwnerInbox({ meetings: [meeting()], viewerId: "producer-1" }).items;
    expect(asker).toMatchObject({ canDecide: false, requested: true, name: "Maya Iyer" });
  });

  it("never offers a decision on something already decided", () => {
    for (const status of ["accepted", "rejected", "cancelled"]) {
      const [item] = buildOwnerInbox({ meetings: [meeting({ status })], viewerId: "writer-1" }).items;
      expect(item.canDecide).toBe(false);
    }
  });

  it("surfaces the join link only once a meeting is on", () => {
    const accepted = buildOwnerInbox({ meetings: [meeting({ status: "accepted" })], viewerId: "writer-1" }).items[0];
    expect(accepted).toMatchObject({ state: OWNER_ASK_STATE.ACCEPTED, joinUrl: "https://meet.example/abc" });

    const pending = buildOwnerInbox({ meetings: [meeting()], viewerId: "writer-1" }).items[0];
    expect(pending.joinUrl).toBe("");
  });

  it("treats a follow request as the same kind of ask", () => {
    const followRequests = buildIncomingFollowRequestList([followRequest()]);
    const [item] = buildOwnerInbox({ followRequests, viewerId: "writer-1" }).items;
    expect(item).toMatchObject({
      kind: OWNER_ASK.FOLLOW,
      id: "user-9",
      name: "Anaya Bose",
      detail: "Film Industry Professional",
      subject: "Wants to follow you",
      canDecide: true,
      profilePath: "/profile/user-9",
    });
  });

  it("puts what is still waiting above what is settled, and counts only the waiting", () => {
    const inbox = buildOwnerInbox({
      meetings: [meeting({ _id: "m1", status: "accepted" }), meeting({ _id: "m2" })],
      followRequests: buildIncomingFollowRequestList([followRequest()]),
      viewerId: "writer-1",
    });
    expect(inbox.items.map((item) => item.canDecide)).toEqual([true, true, false]);
    expect(inbox.pending).toBe(2);
  });

  it("drops a record with no id rather than rendering a card that cannot be answered", () => {
    expect(buildOwnerInbox({ meetings: [{ title: "Ghost" }], viewerId: "writer-1" }).items).toEqual([]);
    expect(buildOwnerInbox({ followRequests: [{ name: "Ghost" }] }).items).toEqual([]);
  });

  it("names the counterpart even when the payload is missing their name", () => {
    const [item] = buildOwnerInbox({
      meetings: [meeting({ producer_name: "" })], viewerId: "writer-1",
    }).items;
    expect(item.name).toBe("Ckript member");
  });

  it("survives a viewer id it was never given", () => {
    const [item] = buildOwnerInbox({ meetings: [meeting()] }).items;
    expect(item).toMatchObject({ requested: false, canDecide: true });
  });
});

describe("relativeDayLabel", () => {
  it("says today, yesterday, then a count, then a date", () => {
    const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
    expect(relativeDayLabel(daysAgo(0))).toBe("Today");
    expect(relativeDayLabel(daysAgo(1))).toBe("Yesterday");
    expect(relativeDayLabel(daysAgo(3))).toBe("3 days ago");
    expect(relativeDayLabel(daysAgo(40))).not.toMatch(/ago/);
  });

  it("says nothing at all rather than Invalid Date", () => {
    expect(relativeDayLabel(null)).toBe("");
    expect(relativeDayLabel("not a date")).toBe("");
  });
});
