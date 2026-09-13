import { describe, expect, it } from "vitest";
import { buildNav } from "../layouts/app-shell/navigation/buildNav";
import { buildMobileNav } from "../mobile/navigation/mobileNav";
import { getDefaultAuthenticatedPath } from "./audienceTransitions";

const profilePath = "/profile/member-1";
const paths = (items = []) => items.filter((item) => item?.path).map((item) => item.path);

/* The bar plus its More sheet is the whole of navigation on a phone. */
const reachableOnPhone = (mobile) => paths([...mobile.tabs, ...mobile.overflow]);

function navigationFor(role) {
  const user = { _id: `${role}-1`, role };
  return {
    desktop: buildNav({ user, profilePath }),
    mobile: buildMobileNav({ user, profilePath }),
  };
}

describe("audience navigation transitions", () => {
  it.each(["writer", "creator"])("keeps %s chrome writer-owned", (role) => {
    const { desktop, mobile } = navigationFor(role);
    expect(desktop.homePath).toBe("/dashboard");
    expect(paths(desktop.drawer)).toContain("/create-project");
    expect(paths(desktop.drawer)).not.toContain("/home");
    expect(paths(desktop.drawer).some((path) => path.startsWith("/reader"))).toBe(false);
    // Unchanged: Profile is named by the preset now rather than appended by
    // buildNav, and this preset still names it fourth.
    expect(paths(mobile.tabs)).toEqual(["/dashboard", "/dashboard?tab=projects", "/messages", profilePath]);
  });

  it.each(["producer", "director", "investor", "industry", "professional"])(
    "keeps %s chrome industry-owned",
    (role) => {
      const { desktop, mobile } = navigationFor(role);
      expect(desktop.homePath).toBe("/home");
      expect(paths(desktop.drawer)).toContain("/mandates");
      expect(paths(desktop.drawer)).not.toContain("/create-project");
      expect(paths(desktop.drawer).some((path) => path.startsWith("/reader"))).toBe(false);

      /*
       * 2026-09-03: the bar carries /dashboard and /writers, which no industry
       * mobile screen linked to and which the old four slots had no room for —
       * so they could not be opened on a phone at all. Featured and Profile
       * moved to More, which is a demotion rather than the removal this was.
       */
      expect(paths(mobile.tabs)).toEqual(["/home", "/dashboard", "/writers", "/messages"]);
      expect(reachableOnPhone(mobile)).toEqual(
        expect.arrayContaining(["/featured", "/mandates", profilePath]),
      );
    },
  );

  it("keeps actor discovery chrome industry-owned without professional actions", () => {
    const { desktop, mobile } = navigationFor("actor");
    expect(desktop.homePath).toBe("/home");
    expect(paths(desktop.drawer)).not.toContain("/mandates");
    expect(paths(desktop.drawer)).not.toContain("/offer-holds");
    expect(paths(desktop.drawer)).not.toContain("/create-project");
    expect(paths(mobile.tabs)).toEqual(["/home", "/dashboard", "/writers", "/messages"]);

    // An actor shares the discovery chrome but receives no professional
    // destinations — not in the bar, and not smuggled in through More either.
    expect(reachableOnPhone(mobile)).not.toContain("/mandates");
    expect(reachableOnPhone(mobile)).toContain(profilePath);
  });

  it("keeps reader chrome reader-owned", () => {
    const { desktop, mobile } = navigationFor("reader");
    expect(desktop.homePath).toBe("/reader");
    expect(paths(desktop.drawer)).toContain("/reader/search");
    expect(paths(desktop.drawer)).not.toContain("/dashboard");
    expect(paths(desktop.drawer)).not.toContain("/home");
    expect(paths(desktop.drawer)).not.toContain("/create-project");
    expect(paths(mobile.tabs)).toEqual(["/reader", "/reader/search", "/messages", profilePath]);
  });

  it("rebuilds both navigation models from a changed session role without retaining the old audience", () => {
    const writer = navigationFor("writer");
    const industry = navigationFor("producer");
    const reader = navigationFor("reader");

    expect([writer.desktop.audience, industry.desktop.audience, reader.desktop.audience])
      .toEqual(["writer", "industry", "reader"]);
    expect([writer.mobile.homePath, industry.mobile.homePath, reader.mobile.homePath])
      .toEqual(["/dashboard", "/home", "/reader"]);
    expect(["writer", "producer", "reader"].map(getDefaultAuthenticatedPath))
      .toEqual(["/dashboard", "/home", "/reader"]);
  });
});
