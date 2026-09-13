import { describe, expect, it } from "vitest";
import { resolveMobileExperience } from "./mobileRoutePolicy";

const writer = { id: "writer-1", role: "writer" };
const creator = { id: "creator-1", role: "creator" };
const producer = { id: "producer-1", role: "producer" };
const reader = { id: "reader-1", role: "reader" };
const industryProfessionals = ["investor", "producer", "director", "industry", "professional"]
  .map((role) => ({ id: `${role}-1`, role }));

describe("mobileRoutePolicy — experience selection", () => {
  it.each([writer, creator])("mounts the mobile dashboard for $role on a phone", (user) => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user,
      pathname: "/dashboard",
    })).toMatchObject({
      experience: "mobile",
      routeId: "writer-dashboard",
      screenId: "dashboard",
    });
  });

  /*
   * The checkout was one of those migration fallbacks until D30 promoted it. It is asserted
   * separately from the detail forms because its pattern sits ABOVE them in the manifest on
   * purpose: `/script/:projectHeading/:writerUsername` matches `/script/project-1/pay` too, and
   * `findMobileRoute` returns the first match.
   */
  it.each([writer, producer])("mounts the native checkout for authenticated $role users", (user) => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user,
      pathname: "/script/project-1/pay",
    })).toMatchObject({
      experience: "mobile",
      routeId: "project-payment",
      screenId: "project-checkout",
    });
  });

  it.each([writer, creator, ...industryProfessionals])("mounts native search for authenticated $role users", (user) => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user,
      pathname: "/search",
      search: "?q=night&type=projects",
    })).toMatchObject({
      experience: "mobile",
      routeId: "search",
      screenId: "search",
    });
  });

  it("keeps signed-out search on the authenticated desktop branch", () => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user: null,
      pathname: "/search",
    })).toMatchObject({ experience: "desktop", reason: "authentication-required" });
  });

  it.each([writer, creator, producer, reader])("mounts native top scripts for authenticated $role users", (user) => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user,
      pathname: "/top-script",
      search: "?sort=featured&genre=Drama",
    })).toMatchObject({
      experience: "mobile",
      routeId: "top-script",
      screenId: "top-scripts",
    });
  });

  it("keeps signed-out top scripts on the authenticated desktop branch", () => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user: null,
      pathname: "/top-script",
    })).toMatchObject({ experience: "desktop", reason: "authentication-required" });
  });

  it.each([writer, creator, reader, ...industryProfessionals])("mounts native featured for authenticated $role users", (user) => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user,
      pathname: "/featured",
      search: "?sort=views&genre=Drama&budget=medium",
    })).toMatchObject({
      experience: "mobile",
      routeId: "featured",
      screenId: "featured",
    });
  });

  it("keeps signed-out featured on the authenticated desktop branch", () => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user: null,
      pathname: "/featured",
    })).toMatchObject({ experience: "desktop", reason: "authentication-required" });
  });

  it("mounts the role-specific native dashboard for an industry audience", () => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user: producer,
      pathname: "/dashboard",
    })).toMatchObject({
      experience: "mobile",
      routeId: "writer-dashboard",
      screenId: "dashboard",
    });
  });

  it("mounts the native writer roster for industry audiences only", () => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user: producer,
      pathname: "/writers",
    })).toMatchObject({ experience: "mobile", routeId: "writers", screenId: "writers" });

    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user: writer,
      pathname: "/writers",
    })).toMatchObject({ experience: "desktop", reason: "audience-not-implemented" });
  });

  it("mounts mandates only for exact film-professional roles", () => {
    expect(resolveMobileExperience({
      isMobile: true, authLoading: false, user: producer, pathname: "/mandates",
    })).toMatchObject({ experience: "mobile", routeId: "mandates", screenId: "mandates" });
    expect(resolveMobileExperience({
      isMobile: true, authLoading: false, user: { id: "actor-1", role: "actor" }, pathname: "/mandates",
    })).toMatchObject({ experience: "desktop", reason: "role-not-implemented" });
    expect(resolveMobileExperience({
      isMobile: true, authLoading: false, user: writer, pathname: "/mandates",
    })).toMatchObject({ experience: "desktop", reason: "audience-not-implemented" });
  });

  it("mounts native industry home only for the industry audience", () => {
    expect(resolveMobileExperience({
      isMobile: true, authLoading: false, user: producer, pathname: "/home",
    })).toMatchObject({ experience: "mobile", routeId: "industry-home", screenId: "industry-home" });
    expect(resolveMobileExperience({
      isMobile: true, authLoading: false, user: writer, pathname: "/home",
    })).toMatchObject({ experience: "desktop", reason: "audience-not-implemented" });
  });

  it("mounts reader home and discover only for the exact reader role", () => {
    expect(resolveMobileExperience({ isMobile: true, authLoading: false, user: reader, pathname: "/reader" }))
      .toMatchObject({ experience: "mobile", routeId: "reader-home", screenId: "reader-home" });
    expect(resolveMobileExperience({ isMobile: true, authLoading: false, user: reader, pathname: "/reader/search", search: "?q=night" }))
      .toMatchObject({ experience: "mobile", routeId: "reader-search", screenId: "reader-discover" });
    for (const user of [writer, producer, { id: "unknown-1", role: "unknown" }]) {
      expect(resolveMobileExperience({ isMobile: true, authLoading: false, user, pathname: "/reader" }))
        .toMatchObject({ experience: "desktop" });
    }
    expect(resolveMobileExperience({ isMobile: true, authLoading: false, user: reader, pathname: "/dashboard" }))
      .toMatchObject({ experience: "desktop", reason: "audience-not-implemented" });
  });

  it("mounts the canonical native landing for signed-out visitors and authenticated members", () => {
    for (const user of [null, writer, producer, reader]) {
      expect(resolveMobileExperience({
        isMobile: true,
        authLoading: false,
        user,
        pathname: "/",
      })).toMatchObject({
        experience: "mobile",
        routeId: "landing",
        screenId: "landing",
        disposition: "shared-public-screen",
      });
    }
  });

  it.each([
    "/features",
    "/features/ai-script-analysis",
    "/for/producers",
    "/industries/films",
    "/resources/blog/ai-script-analysis-for-screenwriters",
    "/tools/screenplay-analyzer",
    "/faq",
    "/genre/thriller",
    "/how-to-sell-a-script",
  ])("mounts the shared native SEO content screen at %s for every viewer", (pathname) => {
    for (const user of [null, writer, producer, reader]) {
      expect(resolveMobileExperience({
        isMobile: true,
        authLoading: false,
        user,
        pathname,
      })).toMatchObject({
        experience: "mobile",
        screenId: "seo-content",
        disposition: "shared-public-screen",
      });
    }
  });

  it("does not switch experience while authentication is restoring", () => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: true,
      user: writer,
      pathname: "/dashboard",
    })).toMatchObject({ experience: "desktop", reason: "auth-loading" });
  });

  it("does not mount the mobile branch above the phone breakpoint", () => {
    expect(resolveMobileExperience({
      isMobile: false,
      authLoading: false,
      user: writer,
      pathname: "/dashboard",
    })).toMatchObject({ experience: "desktop", reason: "viewport" });
  });

  it("fails open to the existing route tree for an unregistered URL", () => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user: writer,
      pathname: "/future/route/not-registered",
    })).toMatchObject({ experience: "desktop", reason: "unregistered-route" });
  });

  /*
   * Phase 2 bullet 5. Two routes, two different reasons, and the audience gate
   * is the load-bearing part of both — so it is asserted from both sides rather
   * than only from the side that works.
   */
  describe("/ai-tools — the dashboard under another name", () => {
    it.each([writer, creator])("mounts the mobile dashboard for $role", (user) => {
      /*
       * App.jsx mounts /dashboard and /ai-tools with the IDENTICAL
       * <DashboardRoute /> element and pages/Dashboard.jsx never reads the
       * pathname. Left as a migration fallback, a mobile writer got the desktop
       * dashboard at one alias and the mobile one at the other.
       */
      expect(resolveMobileExperience({
        isMobile: true,
        authLoading: false,
        user,
        pathname: "/ai-tools",
      })).toMatchObject({
        experience: "mobile",
        routeId: "ai-tools",
        screenId: "dashboard",
      });
    });

    it("does not hand it to an industry audience, whose dashboard is different", () => {
      expect(resolveMobileExperience({
        isMobile: true,
        authLoading: false,
        user: producer,
        pathname: "/ai-tools",
      })).toMatchObject({
        experience: "desktop",
        disposition: "desktop-migration-fallback",
        reason: "audience-not-implemented",
      });
    });
  });

  describe("/offer-holds — an industry screen in the writer phase", () => {
    it.each([producer, { id: "investor-1", role: "investor" }, { id: "director-1", role: "director" }])(
      "mounts the holds screen for $role",
      (user) => {
        expect(resolveMobileExperience({
          isMobile: true,
          authLoading: false,
          user,
          pathname: "/offer-holds",
        })).toMatchObject({
          experience: "mobile",
          routeId: "offer-holds",
          screenId: "holds",
        });
      },
    );

    it.each([writer, creator])("leaves $role on the desktop route", (user) => {
      /*
       * Not a preference. holdScript() 403s any role that is not
       * investor/producer/director (scriptController.js:4770) and getMyHolds()
       * queries { holder: req.user._id } — so this route's only endpoint
       * returns [] for a writer unconditionally, forever. Mounting an
       * empty-forever screen would be worse than the desktop fallback.
       */
        expect(resolveMobileExperience({
          isMobile: true,
          authLoading: false,
          user,
          pathname: "/offer-holds",
        })).toMatchObject({
          experience: "desktop",
          disposition: "desktop-migration-fallback",
          reason: "audience-not-implemented",
        });
    });

    it("does not mount either screen for a signed-out visitor", () => {
      ["/offer-holds", "/ai-tools"].forEach((pathname) => {
        expect(resolveMobileExperience({
          isMobile: true,
          authLoading: false,
          user: null,
          pathname,
        })).toMatchObject({
          experience: "desktop",
          reason: "authentication-required",
        });
      });
    });
  });

  describe("the creation flow", () => {
    it.each(["/create-project", "/create-project/abc123"])("mounts the mobile flow at %s", (pathname) => {
      expect(resolveMobileExperience({
        isMobile: true,
        authLoading: false,
        user: creator,
        pathname,
      })).toMatchObject({
        experience: "mobile",
        screenId: "create-project",
      });
    });

    it.each(["/create-project", "/create-project/abc123"])(
      "mounts the native competition editor at %s",
      (pathname) => {
        expect(resolveMobileExperience({
          isMobile: true,
          authLoading: false,
          user: creator,
          pathname,
          search: "?ctx=competition",
        })).toMatchObject({
          experience: "mobile",
          screenId: "create-project",
          reason: "implemented-screen",
        });
      },
    );

    it("keeps the mobile flow for every other query, including the fresh-start flag", () => {
      // `?fresh=1` is an entry mode the mobile screen fully covers; only the
      // declared exclusion may send a route back to desktop.
      ["?fresh=1", "?ctx=marketplace", "", "?ctx=competitionish"].forEach((search) => {
        expect(resolveMobileExperience({
          isMobile: true,
          authLoading: false,
          user: creator,
          pathname: "/create-project",
          search,
        })).toMatchObject({ experience: "mobile" });
      });
    });

    it("does not mount the flow for an industry audience or a signed-out visitor", () => {
      expect(resolveMobileExperience({
        isMobile: true, authLoading: false, user: producer, pathname: "/create-project",
      })).toMatchObject({ experience: "desktop", reason: "audience-not-implemented" });

      expect(resolveMobileExperience({
        isMobile: true, authLoading: false, user: null, pathname: "/create-project",
      })).toMatchObject({ experience: "desktop", reason: "authentication-required" });
    });
  });

  describe("project detail — three route forms, one screen (D28)", () => {
    it.each([
      ["/script/project-1", "project-detail-id"],
      ["/script/the-monsoon-archive/mira", "project-detail-canonical"],
      ["/the-monsoon-archive/mira", "canonical-project-catchall"],
    ])("mounts the native project screen at %s", (pathname, routeId) => {
      expect(resolveMobileExperience({
        isMobile: true, authLoading: false, user: producer, pathname,
      })).toMatchObject({ experience: "mobile", routeId, screenId: "project-detail" });
    });

    /*
     * The load-bearing one. `/:projectHeading/:writerUsername` matches ANY two segments, so
     * promoting it could have swallowed every unported two-segment route in the product. It does
     * not, because the manifest is ordered and `findMobileRoute` returns the first match — the
     * same guarantee App.jsx relies on by declaring its catch-alls last.
     */
    it.each([
      "/script/project-1/pay",
      "/admin/scripts/project-1",
      "/reader/script/project-1",
      "/create-project/draft-1",
    ])("does not let the two-segment catch-all swallow %s", (pathname) => {
      const decision = resolveMobileExperience({
        isMobile: true, authLoading: false, user: producer, pathname,
      });
      expect(decision.routeId).not.toBe("canonical-project-catchall");
      expect(decision.screenId).not.toBe("project-detail");
    });

    it("keeps a signed-out visitor and an unported audience on the desktop page", () => {
      expect(resolveMobileExperience({
        isMobile: true, authLoading: false, user: null, pathname: "/script/project-1",
      })).toMatchObject({ experience: "desktop", reason: "authentication-required" });

      expect(resolveMobileExperience({
        isMobile: true, authLoading: false, user: { id: "r1", role: "reader" }, pathname: "/script/project-1",
      })).toMatchObject({ experience: "desktop", reason: "audience-not-implemented" });
    });
  });

  it("mounts the native challenge hub for public and authenticated phone viewers", () => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user: null,
      pathname: "/challenge",
      search: "?tab=hall-of-fame",
    })).toMatchObject({
      experience: "mobile",
      routeId: "challenge-hub",
      screenId: "challenge-hub-public",
    });

    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user: writer,
      pathname: "/challenge",
      search: "?tab=mine",
    })).toMatchObject({
      experience: "mobile",
      routeId: "challenge-hub",
      screenId: "challenge-hub",
    });
  });

  it("mounts canonical challenge detail for public and authenticated phone viewers", () => {
    for (const user of [null, writer, { id: "p1", role: "producer" }]) {
      expect(resolveMobileExperience({
        isMobile: true,
        authLoading: false,
        user,
        pathname: "/challenge/c/forty-eight-hours",
      })).toMatchObject({
        experience: "mobile",
        routeId: "challenge-detail",
        screenId: "challenge-detail",
      });
    }
  });

  it("mounts native challenge registration for every authenticated role and keeps signed-out visitors behind auth", () => {
    for (const user of [writer, { id: "p1", role: "producer" }]) {
      expect(resolveMobileExperience({
        isMobile: true,
        authLoading: false,
        user,
        pathname: "/challenge/register",
        search: "?c=forty-eight-hours",
      })).toMatchObject({
        experience: "mobile",
        routeId: "challenge-register",
        screenId: "challenge-register",
      });
    }
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user: null,
      pathname: "/challenge/register",
      search: "?c=forty-eight-hours",
    })).toMatchObject({ experience: "desktop", reason: "authentication-required" });
  });

  it("mounts the public project screen without an account (D31)", () => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user: null,
      pathname: "/share/project/project-1",
    })).toMatchObject({
      experience: "mobile",
      routeId: "shared-project",
      screenId: "public-project",
      disposition: "shared-public-screen",
    });
  });

  it("selects the public, authenticated visitor, or own profile variant (D34-D37)", () => {
    expect(resolveMobileExperience({
      isMobile: true, authLoading: false, user: null, pathname: "/share/profile/mira",
    })).toMatchObject({ experience: "mobile", routeId: "shared-profile", screenId: "public-profile" });

    expect(resolveMobileExperience({
      isMobile: true, authLoading: false, user: writer, pathname: "/share/profile/mira",
    })).toMatchObject({ experience: "mobile", routeId: "shared-profile", screenId: "profile-visitor" });

    expect(resolveMobileExperience({
      isMobile: true, authLoading: false, user: writer, pathname: "/share/profile/writer-1",
    })).toMatchObject({ experience: "mobile", routeId: "shared-profile", screenId: "profile-owner" });
  });

  it("mounts visitor and own id/canonical profile forms", () => {
    expect(resolveMobileExperience({
      isMobile: true, authLoading: false, user: writer, pathname: "/profile/other-writer",
    })).toMatchObject({ experience: "mobile", routeId: "profile", screenId: "profile-visitor" });
    expect(resolveMobileExperience({
      isMobile: true, authLoading: false, user: writer, pathname: "/mira",
    })).toMatchObject({ experience: "mobile", routeId: "profile-or-referral-catchall", screenId: "profile-visitor" });
    expect(resolveMobileExperience({
      isMobile: true, authLoading: false, user: writer, pathname: "/profile",
    })).toMatchObject({ experience: "mobile", routeId: "profile", screenId: "profile-owner" });
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user: { ...writer, writerProfile: { username: "mira_writer" } },
      pathname: "/mira_writer",
    })).toMatchObject({ experience: "mobile", routeId: "profile-or-referral-catchall", screenId: "profile-owner" });
  });

  it("mounts account-security settings through the native owner route", () => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user: writer,
      pathname: "/profile",
      search: "?tab=settings",
    })).toMatchObject({ experience: "mobile", routeId: "profile", screenId: "profile-owner" });
  });

  it("mounts incoming follow requests through the native network route", () => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user: writer,
      pathname: "/follow-requests",
    })).toMatchObject({ experience: "mobile", routeId: "follow-requests", screenId: "follow-requests" });
  });

  it.each([writer, creator])("mounts collaboration requests through the native $role queue", (user) => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user,
      pathname: "/collaborations",
    })).toMatchObject({ experience: "mobile", routeId: "collaborations", screenId: "collaborations" });
  });

  it("does not expose the writer collaboration queue as a native producer screen", () => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user: producer,
      pathname: "/collaborations",
    })).toMatchObject({ experience: "desktop", reason: "audience-not-implemented" });
  });

  it.each([writer, reader, ...industryProfessionals])("mounts the canonical messages route through the native $role inbox", (user) => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user,
      pathname: "/messages",
    })).toMatchObject({ experience: "mobile", routeId: "messages", screenId: "messages" });
  });

  it.each(industryProfessionals)("keeps the native owner profile and saved query for $role", (user) => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user,
      pathname: "/profile",
      search: "?tab=bookmarks",
    })).toMatchObject({ experience: "mobile", routeId: "profile", screenId: "profile-owner" });
  });

  it("mounts the shared native project surface for a reader without rewriting its route (D32)", () => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user: { id: "reader-1", role: "reader" },
      pathname: "/reader/script/project-1",
    })).toMatchObject({
      experience: "mobile",
      routeId: "reader-script",
      screenId: "reader-project",
    });
  });

  it("promotes both own and visitor reader-profile deep links only for the reader audience (D42)", () => {
    const reader = { id: "reader-1", role: "reader" };
    for (const pathname of ["/reader/profile", "/reader/profile/reader-2"]) {
      expect(resolveMobileExperience({
        isMobile: true,
        authLoading: false,
        user: reader,
        pathname,
      })).toMatchObject({ experience: "mobile", routeId: "reader-profile", screenId: "reader-profile" });
    }
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user: writer,
      pathname: "/reader/profile/reader-2",
    })).toMatchObject({ experience: "desktop", reason: "audience-not-implemented" });
  });

  it("leaves the preview route to its deterministic App.jsx fixture", () => {
    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user: writer,
      pathname: "/__mobile-preview",
      isDev: true,
    })).toMatchObject({ experience: "desktop", reason: "dev-route-owned" });

    expect(resolveMobileExperience({
      isMobile: true,
      authLoading: false,
      user: writer,
      pathname: "/__mobile-preview",
      isDev: false,
    })).toMatchObject({ experience: "desktop", reason: "dev-only" });
  });
});

/*
 * Account entry (D59). These are the first entries whose disposition deliberately
 * differs by platform, so the cases below pin BOTH halves of that: a phone gets a
 * native screen, and everything else continues through the desktop route tree
 * exactly as before.
 */
describe("mobileRoutePolicy — account entry (D59)", () => {
  const AUTH_ROUTES = [
    ["/login", "sign-in", "sign-in", "public"],
    ["/join", "role-chooser", "role-chooser", "public"],
    ["/signup", "sign-up", "sign-up", "flow"],
    ["/forgot-password", "forgot-password", "forgot-password", "public"],
    ["/invite/tok-123", "accept-invite", "accept-invite", "public"],
  ];

  it.each(AUTH_ROUTES)("mounts a native screen at %s for a signed-out visitor", (pathname, routeId, screenId, shell) => {
    expect(resolveMobileExperience({
      isMobile: true, authLoading: false, user: null, pathname,
    })).toMatchObject({ experience: "mobile", routeId, screenId, shell, protection: "public" });
  });

  /*
   * The one that would have broken the product: /signup creates the real account
   * at step 3, and the writer then fills in five more steps while signed in. A
   * `signedOutOnly` entry would have bounced them out at the exact moment the
   * flow succeeded, so the screen — which can tell "just signed up" from "typed
   * the URL" — owns that decision instead of the policy.
   */
  it.each(AUTH_ROUTES)("keeps %s mounted for a signed-in viewer rather than bouncing them", (pathname, routeId, screenId) => {
    expect(resolveMobileExperience({
      isMobile: true, authLoading: false, user: creator, pathname,
    })).toMatchObject({ experience: "mobile", routeId, screenId });
  });

  it.each(AUTH_ROUTES)("leaves %s to the desktop tree on a wide viewport", (pathname, routeId) => {
    expect(resolveMobileExperience({
      isMobile: false, authLoading: false, user: null, pathname,
    })).toMatchObject({ experience: "desktop", routeId, reason: "viewport" });
  });

  /*
   * THE ONE THAT MADE THE WHOLE FAMILY UNREACHABLE.
   *
   * This assertion used to expect the opposite, on the reasoning that deciding
   * here "would flash a sign-in screen at someone who is signed in". The flash
   * it avoided was real. What it cost was the route: while the mobile branch
   * waited, RootExperience rendered the desktop tree, and App.jsx answers these
   * paths there with `<Navigate to="/" replace />`. The redirect committed on
   * the first frame and rewrote the URL, so a direct link, a bookmark, a
   * refresh or a shared invite never reached a native screen at all — while an
   * in-app tap did, because that navigation happens long after `loading` has
   * settled. That asymmetry is why nothing here caught it.
   *
   * The flash is now paid where it belongs: each screen holds its own
   * `!loading && user` redirect and sends a signed-in viewer on, honouring the
   * `?redirect=` the desktop fallback could never carry.
   */
  it.each(AUTH_ROUTES)("decides %s before the session resolves, so the URL survives", (pathname, routeId, screenId) => {
    expect(resolveMobileExperience({
      isMobile: true, authLoading: true, user: null, pathname,
    })).toMatchObject({ experience: "mobile", routeId, screenId });
  });

  it("still waits for the session on a route whose answer depends on it", () => {
    // The guard is narrowed, not removed: /dashboard is `protection:
    // "authenticated"`, so resolving it against a viewer who has not loaded yet
    // would decide on a `user` of null that is about to become someone.
    expect(resolveMobileExperience({
      isMobile: true, authLoading: true, user: null, pathname: "/dashboard",
    })).toMatchObject({ experience: "desktop", reason: "auth-loading" });
  });

  it("gives every audience the same account-entry screens", () => {
    // Auth precedes audience: there is no writer sign-in and no producer one.
    for (const user of [writer, creator, producer, reader, ...industryProfessionals]) {
      expect(resolveMobileExperience({
        isMobile: true, authLoading: false, user, pathname: "/login",
      })).toMatchObject({ experience: "mobile", screenId: "sign-in" });
    }
  });

  it.each([
    ["/writer-onboarding", "writer-onboarding", "signup-writer"],
    ["/producer-director-onboarding", "producer-onboarding", "signup-producer"],
    ["/industry-onboarding", "industry-onboarding", "signup-industry"],
  ])("resolves the %s deep link into the one native stepper", (pathname, routeId, screenId) => {
    expect(resolveMobileExperience({
      isMobile: true, authLoading: false, user: null, pathname,
    })).toMatchObject({ experience: "mobile", routeId, screenId });
  });

  it("reports the shell mode so RootExperience can skip the boot skeleton", () => {
    // A visitor tapping "Sign in" must not watch 650ms of someone else's
    // dashboard loading first.
    const decision = resolveMobileExperience({
      isMobile: true, authLoading: false, user: null, pathname: "/login",
    });
    expect(decision.protection).toBe("public");
    expect(decision.shell).toBe("public");
  });

  it("reports no shell or protection on a decision that mounts nothing", () => {
    const decision = resolveMobileExperience({
      isMobile: false, authLoading: false, user: null, pathname: "/login",
    });
    expect(decision.shell).toBeNull();
    expect(decision.screenId).toBeNull();
  });
});
