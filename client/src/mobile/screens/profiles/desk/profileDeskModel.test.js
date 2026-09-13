import { describe, expect, it } from "vitest";
import {
  DESK_ASK,
  DESK_TAB,
  DESK_VIEWER,
  deskAbout,
  deskAsk,
  deskCount,
  deskOwnerStats,
  deskProjects,
  deskQuota,
  deskStats,
  deskStatus,
  deskTabs,
  readDeskTab,
  writeDeskTab,
} from "./profileDeskModel";

const writerView = (over = {}) => ({
  name: "Mira Sen", writer: true, followers: 12, following: 3,
  projects: [{ id: "p1" }, { id: "p2" }], ...over,
});
const industryView = (over = {}) => ({
  name: "Dev Rao", writer: false, professional: true, followers: 40, following: 8, projects: [], ...over,
});

describe("deskCount", () => {
  it("keeps four digits exact and abbreviates above ten thousand", () => {
    expect(deskCount(0)).toBe("0");
    expect(deskCount(1204)).toBe("1,204");
    expect(deskCount(9999)).toBe("9,999");
    expect(deskCount(12400)).toBe("12.4k");
    expect(deskCount(240000)).toBe("240k");
  });

  it("treats nonsense as zero rather than rendering NaN", () => {
    expect(deskCount(undefined)).toBe("0");
    expect(deskCount("many")).toBe("0");
    expect(deskCount(-4)).toBe("0");
  });
});

describe("deskStatus", () => {
  it("reads a writer's availability from the contact switch that actually gates it", () => {
    expect(deskStatus({
      view: writerView(),
      profile: { allowIndustryContact: true, writerProfile: { username: "mira" } },
    })).toEqual({ on: true, label: "Open to contact", meta: "@mira" });

    expect(deskStatus({
      view: writerView(),
      profile: { allowIndustryContact: false, writerProfile: { username: "mira" } },
    })).toMatchObject({ on: false, label: "Not taking contact" });
  });

  it("reports professional access for an industry profile", () => {
    expect(deskStatus({ view: industryView(), profile: {} }))
      .toMatchObject({ on: true, label: "Verified access" });
    expect(deskStatus({ view: industryView({ professional: false }), profile: {} }))
      .toMatchObject({ on: false, label: "Industry member" });
  });

  it("keeps the member-since caption to one short line", () => {
    expect(deskStatus({ view: industryView({ memberSince: "June 2019" }), profile: {} }).meta)
      .toBe("SINCE 2019");
    expect(deskStatus({ view: industryView(), profile: { username: "devan" } }).meta)
      .toBe("@devan");
  });
});

describe("deskStats / deskOwnerStats", () => {
  it("gives a writer a project cell and an industry profile two cells", () => {
    expect(deskStats(writerView()).map((cell) => cell.key)).toEqual(["projects", "followers", "following"]);
    expect(deskStats(industryView()).map((cell) => cell.key)).toEqual(["followers", "following"]);
  });

  it("makes only the cells with a destination tappable", () => {
    const [projects, followers] = deskStats(writerView());
    expect(projects.tab).toBe(DESK_TAB.WORK);
    expect(followers.tab).toBeUndefined();
  });

  it("leads the owner's strip with views when the server sends them", () => {
    const view = writerView({ stats: [{ key: "projects", value: 2 }, { key: "views", value: 1204 }] });
    expect(deskOwnerStats(view)[0]).toMatchObject({ key: "views", value: "1,204" });
  });

  it("falls back to published projects when there are no view counts", () => {
    const view = writerView({ stats: [{ key: "projects", value: 2 }] });
    expect(deskOwnerStats(view)[0]).toMatchObject({ key: "projects", value: "2" });
  });
});

describe("deskAbout", () => {
  it("brackets the professional facts with where and since", () => {
    expect(deskAbout({
      location: "Mumbai, IN",
      facts: [["Representation", "Unrepresented"]],
      memberSince: "March 2024",
    })).toEqual([
      ["Based in", "Mumbai, IN"],
      ["Representation", "Unrepresented"],
      ["On Ckript since", "March 2024"],
    ]);
  });

  it("drops what the server did not send rather than showing an empty row", () => {
    expect(deskAbout({ facts: [["Company", "North Star"]] })).toEqual([["Company", "North Star"]]);
    expect(deskAbout({})).toEqual([]);
  });
});

describe("deskTabs — the information architecture", () => {
  const keys = (options) => deskTabs(options).map((tab) => tab.key);

  it("gives the owner a different screen, not the visitor's with an Edit button", () => {
    expect(keys({ view: writerView(), viewer: DESK_VIEWER.VISITOR }))
      .toEqual([DESK_TAB.WORK, DESK_TAB.ABOUT, DESK_TAB.ACTIVITY]);
    expect(keys({ view: writerView(), viewer: DESK_VIEWER.OWNER }))
      .toEqual([DESK_TAB.WORK, DESK_TAB.INBOX, DESK_TAB.SAVED, DESK_TAB.ABOUT]);
  });

  it("leads an industry account with its queue, because it has no shelf", () => {
    expect(keys({ view: industryView(), viewer: DESK_VIEWER.OWNER }))
      .toEqual([DESK_TAB.INBOX, DESK_TAB.MANDATE, DESK_TAB.SAVED, DESK_TAB.ABOUT]);
    expect(deskTabs({ view: industryView(), viewer: DESK_VIEWER.OWNER })[0].label).toBe("Queue");
    expect(deskTabs({ view: writerView(), viewer: DESK_VIEWER.OWNER })[1].label).toBe("Requests");
  });

  it("never offers a signed-out visitor a tab they cannot fill", () => {
    expect(keys({ view: writerView(), viewer: DESK_VIEWER.PUBLIC }))
      .toEqual([DESK_TAB.WORK, DESK_TAB.ABOUT]);
    expect(keys({ view: industryView(), viewer: DESK_VIEWER.PUBLIC }))
      .toEqual([DESK_TAB.MANDATE, DESK_TAB.ABOUT]);
  });

  it("carries a count only where there is something waiting", () => {
    const [, requests] = deskTabs({
      view: writerView(), viewer: DESK_VIEWER.OWNER, counts: { [DESK_TAB.INBOX]: 3 },
    });
    expect(requests).toMatchObject({ key: DESK_TAB.INBOX, count: 3 });
    expect(deskTabs({ view: writerView(), viewer: DESK_VIEWER.OWNER })[1].count).toBe(0);
  });

  it("falls back to the visitor's shape for an unknown viewer rather than crashing", () => {
    expect(keys({ view: writerView(), viewer: "nonsense" }))
      .toEqual([DESK_TAB.WORK, DESK_TAB.ABOUT, DESK_TAB.ACTIVITY]);
  });
});

describe("readDeskTab / writeDeskTab", () => {
  const tabs = deskTabs({ view: writerView(), viewer: DESK_VIEWER.VISITOR });
  const ownerTabs = deskTabs({ view: writerView(), viewer: DESK_VIEWER.OWNER });

  it("falls back to the first tab for an unknown or missing value", () => {
    expect(readDeskTab("", tabs)).toBe(DESK_TAB.WORK);
    expect(readDeskTab("?tab=settings", tabs)).toBe(DESK_TAB.WORK);
  });

  it("treats the collection sections as the Activity tab so a paged link still opens there", () => {
    expect(readDeskTab("?tab=bookmarks&page=3", tabs)).toBe(DESK_TAB.ACTIVITY);
    expect(readDeskTab("?tab=saved", tabs)).toBe(DESK_TAB.ACTIVITY);
    expect(readDeskTab("?tab=activity", tabs)).toBe(DESK_TAB.ACTIVITY);
  });

  it("sends the owner's collections tab to the half only they have", () => {
    expect(readDeskTab("?tab=bookmarks", ownerTabs)).toBe(DESK_TAB.SAVED);
    expect(readDeskTab("?tab=activity", ownerTabs)).toBe(DESK_TAB.SAVED);
    expect(writeDeskTab("", DESK_TAB.SAVED).toString()).toBe("tab=bookmarks");
  });

  it("drops the page when the tab changes, because page 3 of one tab is not page 3 of another", () => {
    expect(writeDeskTab("?tab=activity&page=3", DESK_TAB.ABOUT).toString()).toBe("tab=about");
  });
});

describe("deskAsk", () => {
  it("asks a signed-out visitor to sign in", () => {
    expect(deskAsk({ view: writerView(), signedIn: false })).toMatchObject({ kind: DESK_ASK.SIGN_IN });
  });

  it("offers the metered reveal, then reports it as spent", () => {
    expect(deskAsk({ view: writerView({ canReveal: true }) })).toMatchObject({ kind: DESK_ASK.REVEAL });
    expect(deskAsk({ view: writerView({ canReveal: true, contactAlreadyRevealed: true }) }))
      .toMatchObject({ kind: DESK_ASK.REVEALED });
    expect(deskAsk({ view: writerView({ canReveal: true, contactLimitReached: true }) }))
      .toMatchObject({ kind: DESK_ASK.REVEAL_BLOCKED });
  });

  it("prefers a pitch on an investor profile and a message when nothing is metered", () => {
    expect(deskAsk({ view: industryView({ canPitch: true }) })).toMatchObject({ kind: DESK_ASK.PITCH });
    expect(deskAsk({ view: industryView({ canMessage: true }) })).toMatchObject({ kind: DESK_ASK.MESSAGE });
  });

  it("docks nothing at all in either direction of a block", () => {
    expect(deskAsk({ view: writerView({ canReveal: true, blockedByCurrent: true }) }))
      .toEqual({ kind: DESK_ASK.NONE });
    expect(deskAsk({ view: writerView({ canReveal: true, blockedByProfile: true }) }))
      .toEqual({ kind: DESK_ASK.NONE });
  });

  it("docks nothing when the viewer can do nothing that costs anything", () => {
    expect(deskAsk({ view: writerView() })).toEqual({ kind: DESK_ASK.NONE });
  });
});

describe("deskQuota", () => {
  it("reads the meter from the numbers the server settled", () => {
    expect(deskQuota({ contactUsed: 6, contactLimit: 25, contactRemaining: 19 }))
      .toMatchObject({ label: "6 / 25", percent: 24, full: false, remaining: 19 });
  });

  it("never reports more spent than the plan allows", () => {
    expect(deskQuota({ contactUsed: 12, contactLimit: 10 }))
      .toMatchObject({ used: 10, percent: 100, full: true });
  });

  it("stays quiet when there is no limit to draw", () => {
    expect(deskQuota({})).toMatchObject({ limit: 0, percent: 0, full: false });
  });
});

describe("deskProjects", () => {
  it("builds a card from the raw script and drops the fields the server did not send", () => {
    const [card] = deskProjects([{
      _id: "s1", title: "The Archive", primaryGenre: "Drama", contentType: "feature",
      pageCount: 112, coverImage: "/covers/a.jpg", platformScore: { overall: 8.94 },
    }]);
    expect(card).toMatchObject({
      id: "s1", title: "The Archive", genre: "Drama", cover: "/covers/a.jpg", badge: "8.9",
      meta: "FEATURE · DRAMA · 112 PP · SCORE 8.9",
    });

    const [sparse] = deskProjects([{ _id: "s2" }]);
    expect(sparse).toMatchObject({ title: "Untitled project", genre: "Project", cover: "", badge: "", meta: "PROJECT" });
  });

  it("refuses a script with no id, because nothing on the card could be tapped", () => {
    expect(deskProjects([{ title: "Ghost" }, null, "nonsense"])).toEqual([]);
  });
});
