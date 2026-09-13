/*
 * Ckript Mobile — CSS prefix registry (canonical plan §7.1–7.2).
 *
 * Two rules the mobile app cannot be allowed to drift on:
 *   1. every mobile selector is scoped under `.ckm`, so no mobile style can
 *      reach an unscoped element in the desktop document;
 *   2. every `ckm-*` class belongs to exactly one registered owner, so two
 *      page families can never quietly share a prefix.
 *
 * `mobileCssContract.test.js` reads this file and fails the build when a new
 * stylesheet breaks either rule. Register a prefix here *before* writing the
 * page's CSS, and mirror it into §7.2 of NATIVE_APP_IMPLEMENTATION.md.
 */

export const MOBILE_CSS_PREFIX_KIND = Object.freeze({
  ROOT: "root",
  SHELL: "shell",
  UTILITY: "utility",
  SHARED_COMPONENT: "shared-component",
  PAGE_FAMILY: "page-family",
  PAGE_COMPONENT: "page-component",
});

const { ROOT, SHELL, UTILITY, SHARED_COMPONENT, PAGE_FAMILY, PAGE_COMPONENT } = MOBILE_CSS_PREFIX_KIND;

export const MOBILE_CSS_PREFIXES = Object.freeze({
  // --- Root and shell ---------------------------------------------------
  "ckm-root": { kind: ROOT, owner: "MobileApp.css", note: "Phone-shaped frame inside the .ckm surface." },
  "ckm-html-lock": {
    kind: ROOT,
    owner: "MobileApp.css",
    note: "Document-level scroll lock applied to <html>; the one intentionally unscoped class (§7.1).",
  },
  "ckm-shell": {
    kind: SHELL,
    owner: "shell/MobileShell.css, shell/MobileRouteBoundary.css",
    note: "App shell layout plus the route pending and route failure surfaces.",
  },

  // --- Utilities --------------------------------------------------------
  "ckm-scroll": { kind: UTILITY, owner: "theme/base.css", note: "Momentum scroll surface; applied by MobileShell." },
  "ckm-sr-only": {
    kind: UTILITY,
    owner: "theme/base.css",
    note: "Announced but not shown; the one implementation of visually-hidden text.",
  },

  // --- Shared components ------------------------------------------------
  // ckm-topbar / ckm-bottomnav were retired on 2026-08-07 (Phase 2). Their last
  // caller went away when Dashboard moved to ckm-appbar / ckm-navbar, and both
  // component files are now deleted rather than left registered-but-dead.
  "ckm-tabs": { kind: SHARED_COMPONENT, owner: "components/SectionTabs.css" },
  // ckm-sheet was retired on 2026-08-07 (Phase 2) with components/BottomSheet.*,
  // once AiDetailSheet and AllProjectsSheet — its only two callers — moved onto
  // ckm-bottom-sheet and gained the focus trap it never had.
  "ckm-empty": { kind: SHARED_COMPONENT, owner: "components/EmptyState.css" },
  "ckm-skel": {
    kind: SHARED_COMPONENT,
    owner: "components/Skeleton.css, components/feedback/Skeletons.css",
    note: "Two owners by design: Skeleton.css holds the dashboard's fixed boot drawing, Skeletons.css the composable shapes. Neither uses the other's element names.",
  },
  // ckm-island was retired on 2026-08-07 (Phase 2) with
  // components/DynamicIsland.*. Its one production caller was
  // notify.desktopOnly(), which §2.8 requires gone; ckm-toast succeeds it.
  "ckm-statusbar": { kind: SHARED_COMPONENT, owner: "components/StatusBar.css" },
  // ckm-btn was retired on 2026-08-07 (Phase 2): a 40px control under the touch
  // floor with no link form, fully superseded by ckm-button.
  "ckm-chip": {
    kind: SHARED_COMPONENT,
    owner: "theme/primitives.css, components/chips/Chip.css",
    note: "One chip family: primitives.css owns the base pill, Chip.css adds the interactive and removable forms.",
  },
  // ckm-viewmore was retired on 2026-08-07 (Phase 2), superseded by
  // ckm-load-more, which names the cost and announces the new count.

  // --- Phase 1 native-style system --------------------------------------
  "ckm-button": {
    kind: SHARED_COMPONENT,
    owner: "components/buttons/Button.css",
    note: "Primary/secondary/tertiary/destructive action button.",
  },
  "ckm-icon-button": { kind: SHARED_COMPONENT, owner: "components/buttons/IconButton.css" },
  "ckm-back": { kind: SHARED_COMPONENT, owner: "components/navigation/BackButton.css" },
  "ckm-page-header": { kind: SHARED_COMPONENT, owner: "components/app-bars/PageHeader.css" },

  // --- Phase 1 role-aware chrome ----------------------------------------
  "ckm-appbar": {
    kind: SHARED_COMPONENT,
    owner: "components/app-bars/AppBar.css",
    note: "Role-aware top app bar for `standard` screens. Supersedes ckm-topbar, whose logo navigated nowhere and whose search placeholder was the writer's for every audience.",
  },
  "ckm-navbar": {
    kind: SHARED_COMPONENT,
    owner: "components/navigation/NavBar.css",
    note: "Role-aware bottom tab bar; destinations come from the desktop audience presets and the active tab from the URL. Supersedes ckm-bottomnav, whose two items were hard-coded and whose active tab was a constant prop.",
  },
  "ckm-more": {
    kind: SHARED_COMPONENT,
    owner: "components/navigation/NavMoreSheet.css",
    note: "The bottom bar's overflow sheet. The bar holds four destinations and the mobile app has no drawer, so whatever does not fit was not demoted but unreachable — which is how the industry audience lost /dashboard and /writers entirely. Rows come from the same audience preset the bar does.",
  },

  // --- Phase 1 form family ----------------------------------------------
  "ckm-field": {
    kind: SHARED_COMPONENT,
    owner: "components/forms/Field.css",
    note: "Label / hint / error column shared by every labelled control, including the choice controls.",
  },
  "ckm-control": {
    kind: SHARED_COMPONENT,
    owner: "components/forms/Control.css",
    note: "The one text-control box: input, textarea and select share it so a screen cannot invent a second shape.",
  },
  "ckm-checkbox": { kind: SHARED_COMPONENT, owner: "components/forms/Checkbox.css" },
  "ckm-radio": { kind: SHARED_COMPONENT, owner: "components/forms/RadioGroup.css" },
  "ckm-switch": { kind: SHARED_COMPONENT, owner: "components/forms/Switch.css" },
  "ckm-file-picker": { kind: SHARED_COMPONENT, owner: "components/forms/FilePicker.css" },

  // --- Phase 1 collection and display family ----------------------------
  "ckm-list": {
    kind: SHARED_COMPONENT,
    owner: "components/lists/List.css",
    note: "The <ul> stack, its heading and the separator geometry.",
  },
  "ckm-row": {
    kind: SHARED_COMPONENT,
    owner: "components/lists/ListRow.css",
    note: "One list row; the ::after overlay is what lets a row navigate and still carry its own control.",
  },
  "ckm-load-more": { kind: SHARED_COMPONENT, owner: "components/lists/LoadMore.css" },
  "ckm-card": {
    kind: SHARED_COMPONENT,
    owner: "components/cards/Card.css",
    note: "Card surface and parts; the title link's overlay makes the whole card tappable.",
  },
  "ckm-badge": { kind: SHARED_COMPONENT, owner: "components/badges/Badge.css" },
  "ckm-chip-row": {
    kind: SHARED_COMPONENT,
    owner: "components/chips/Chip.css",
    note: "The horizontal filter rail chips sit in.",
  },
  "ckm-segmented": { kind: SHARED_COMPONENT, owner: "components/tabs/SegmentedControl.css" },
  "ckm-tabbar": {
    kind: SHARED_COMPONENT,
    owner: "components/tabs/Tabs.css",
    note: "APG tablist + panel. Distinct from the dashboard's legacy ckm-tabs, which Phase 2 retires.",
  },
  // --- Phase 1 overlay set ----------------------------------------------
  "ckm-overlay": {
    kind: SHARED_COMPONENT,
    owner: "components/overlays/Overlay.css",
    note: "Layer, scrim and the bottom/center/full placements shared by every modal surface.",
  },
  "ckm-bottom-sheet": {
    kind: SHARED_COMPONENT,
    owner: "components/overlays/Sheet.css",
    note: "The one bottom sheet. Superseded and replaced the dashboard-era ckm-sheet on 2026-08-07 (Phase 2).",
  },
  "ckm-dialog": {
    kind: SHARED_COMPONENT,
    owner: "components/overlays/Dialog.css",
    note: "Full-screen modal task: app bar, one scroll surface, optional action bar.",
  },
  "ckm-confirm": {
    kind: SHARED_COMPONENT,
    owner: "components/overlays/ConfirmDialog.css",
    note: "role=alertdialog; the action stack is column-reverse so DOM order can put Cancel first.",
  },
  "ckm-action-sheet": {
    kind: SHARED_COMPONENT,
    owner: "components/overlays/ActionSheet.css",
    note: "The mobile form of the plan's 'context menu' — a dialog of actions, deliberately not role=menu.",
  },

  // --- Phase 1 state set ------------------------------------------------
  "ckm-toast": {
    kind: SHARED_COMPONENT,
    owner: "components/feedback/Toast.css",
    note: "Transient message plus its host layer. Supersedes the dashboard-era ckm-island, which Phase 2 retires with notify.desktopOnly().",
  },
  "ckm-message": {
    kind: SHARED_COMPONENT,
    owner: "components/feedback/InlineMessage.css",
    note: "The durable counterpart of the toast: inline strip and full-panel failure form, both with an optional retry.",
  },
  "ckm-offline": {
    kind: SHARED_COMPONENT,
    owner: "components/feedback/OfflineBanner.css",
    note: "Connectivity condition, rendered by MobileShell so no screen mounts a second one.",
  },

  // --- Media attachment family (Phase 3, decision D12) ------------------
  // One attachable asset, the cover cropper and the buyer preview, shared by
  // /create-project and /upload. Lifted out of screens/create/Wizard.css on
  // 2026-08-09 rather than copied: both routes ask a writer for the same three
  // files against the same three ceilings, and two copies of that control is
  // how one of them ends up advertising a limit the other does not enforce.
  "ckm-media": {
    kind: SHARED_COMPONENT,
    owner: "components/media/Media.css",
    note: "MediaSlot (slot, drop target, preview, per-file upload progress), CoverCropDialog's stage and sliders, PreviewDialog's page list.",
  },
  "ckm-meeting": {
    kind: SHARED_COMPONENT,
    owner: "components/meetings/MeetingSheet.css",
    note: "Shared native meeting and Calendar-connect task used by project detail and message context (D41).",
  },

  "ckm-gallery": {
    kind: PAGE_FAMILY,
    owner: "dev/PrimitiveGallery.css",
    family: "dev",
    note: "Development-only primitive/state harness at /__mobile-primitives; never mounted in production.",
  },

  // --- Dashboard page family -------------------------------------------
  // One page family, several files. Each child owns a distinct prefix so a
  // section's styles can never bleed into a sibling section.
  "ckm-dashboard": { kind: PAGE_FAMILY, owner: "screens/Dashboard.css", family: "dashboard" },
  "ckm-ov": { kind: PAGE_COMPONENT, owner: "screens/sections/OverviewSection.css", family: "dashboard" },
  "ckm-perf": { kind: PAGE_COMPONENT, owner: "screens/sections/PerformanceSection.css", family: "dashboard" },
  "ckm-rev": { kind: PAGE_COMPONENT, owner: "screens/sections/ReviewsSection.css", family: "dashboard" },
  "ckm-proj": { kind: PAGE_COMPONENT, owner: "screens/sections/ProjectsSection.css", family: "dashboard" },
  "ckm-pc": {
    kind: PAGE_COMPONENT,
    owner: "screens/sections/ProjectsSection.css",
    family: "dashboard",
    note: "Project card sub-component of the projects section.",
  },
  "ckm-aid": { kind: PAGE_COMPONENT, owner: "screens/overlays/AiDetailSheet.css", family: "dashboard" },
  "ckm-allp": { kind: PAGE_COMPONENT, owner: "screens/overlays/AllProjectsSheet.css", family: "dashboard" },
  "ckm-noti": { kind: PAGE_COMPONENT, owner: "screens/overlays/NotificationsPanel.css", family: "dashboard" },
  // ckm-acct was retired on 2026-08-07 (Phase 2): AccountMenu is now composed
  // from ckm-action-sheet + ckm-confirm and has no CSS of its own.

  // --- Offers and holds (Phase 2 bullet 5) ------------------------------
  // The industry audience's holds screen at /offer-holds. A family of one: the
  // screen is a single list with no sections and no overlays of its own, so a
  // second prefix would be a file with nothing in it.
  "ckm-holds": { kind: PAGE_FAMILY, owner: "screens/Holds.css", family: "holds" },

  // --- Discovery (Phase 4) ----------------------------------------------
  "ckm-search": {
    kind: PAGE_FAMILY,
    owner: "screens/discovery/SearchMobile.css",
    family: "discovery",
    note: "Authenticated mixed people/project search, URL-backed facets and paged results at /search.",
  },
  "ckm-discovery-project": {
    kind: SHARED_COMPONENT,
    owner: "screens/discovery/components/DiscoveryProjectCard.css",
    note: "Shared project summary, ranking metric, bookmark and public-share actions for Search, Top and Featured.",
  },
  "ckm-discovery-filter": {
    kind: SHARED_COMPONENT,
    owner: "screens/discovery/components/DiscoveryFiltersDialog.css",
    note: "Shared full-screen five-select project facet task for discovery collections.",
  },
  "ckm-top-scripts": {
    kind: PAGE_FAMILY,
    owner: "screens/discovery/TopScriptsMobile.css",
    family: "discovery",
    note: "Five-mode ranked project collection with URL-backed facets and bounded paging at /top-script.",
  },
  "ckm-featured": {
    kind: PAGE_FAMILY,
    owner: "screens/discovery/FeaturedProjectsMobile.css",
    family: "discovery",
    note: "Paid-placement collection at /featured: lead, spotlight, ranked and mandate-match sections over two bounded sources.",
  },
  "ckm-featured-lead": {
    kind: SHARED_COMPONENT,
    owner: "screens/discovery/components/FeaturedLeadCard.css",
    note: "The editorial lead and the sentence explaining why it leads. Its own prefix because it is a different composition from the shared discovery card, not a variant of it.",
  },

  // --- Industry workspace (Phase 7, D52) -------------------------------
  "ckm-industry-home": {
    kind: PAGE_FAMILY,
    owner: "screens/industry/IndustryHomeMobile.css",
    family: "industry",
    note: "Personalised, URL-filtered project discovery desk at /home.",
  },
  "ckm-industry-dashboard": {
    kind: PAGE_FAMILY,
    owner: "screens/industry/IndustryDashboardMobile.css",
    family: "industry",
    note: "Role-aware overview, deals, matches, finance, and market workspace at /dashboard.",
  },
  "ckm-writers": {
    kind: PAGE_FAMILY,
    owner: "screens/industry/WriterRosterMobile.css",
    family: "industry",
    note: "URL-filtered writer roster and compact comparison cards at /writers.",
  },
  "ckm-mandates": {
    kind: PAGE_FAMILY,
    owner: "screens/industry/MandatesMobile.css",
    family: "industry",
    note: "Professional-only format, genre, exclusion, and story-signal brief editor at /mandates.",
  },
  "ckm-trailer": {
    kind: SHARED_COMPONENT,
    owner: "components/media/TrailerDialog.css",
    note: "Full-screen trailer playback with source fallback and the narrated-summary alternative. Promoted out of screens/discovery/components in D28, when project detail became its second caller — §6 reserves a family's components/ folder for components exclusive to that family.",
  },

  // --- Public marketing (Phase 8, D57) ---------------------------------
  "ckm-landing": {
    kind: PAGE_FAMILY,
    owner: "marketing/shelf/ShelfLanding.css",
    family: "marketing",
    note: "The native public homepage at `/`: one scroll surface containing every canonical landing beat plus its menu, trailer, and partner dialogs.",
  },
  "ckm-seo-page": {
    kind: PAGE_FAMILY,
    owner: "marketing/SeoContentMobile.css",
    family: "marketing",
    note: "The shared native renderer for registered feature, audience, industry, resource, blog, tool, FAQ, genre, and long-form guide routes (D58).",
  },

  // --- Authenticated project detail (Phase 4, D28) ----------------------
  "ckm-project": {
    kind: PAGE_FAMILY,
    owner: "screens/projects/project-detail/ProjectDetailMobile.css",
    family: "projects",
    note: "The authenticated project page behind all three route forms: hero, recommended action, and the five stacked sections that replace the desktop workbench's eight-tab rail.",
  },
  "ckm-reader": {
    kind: PAGE_FAMILY,
    owner: "screens/projects/project-detail/components/ProjectReaderDialog.css",
    family: "projects",
    note: "The full-screen screenplay reader. Its own prefix rather than part of ckm-project: it is a typeset fixed-pitch surface with its own horizontal scroll rules, and folding those into the page family would make neither file readable on its own.",
  },

  // --- The buyer's checkout (Phase 4, D30) ------------------------------
  "ckm-checkout": {
    kind: PAGE_FAMILY,
    owner: "screens/projects/checkout/ProjectCheckoutMobile.css",
    family: "projects",
    note: "The payment route at /script/:id/pay. Its own prefix rather than part of ckm-project: it is a single-purpose transactional surface — an amount, a set of acceptances and one docked action — and it is the only mobile screen whose primary control hands the viewer to a third-party overlay outside our DOM.",
  },

  // --- Public project preview (Phase 4, D31) ----------------------------
  "ckm-public-project": {
    kind: PAGE_FAMILY,
    owner: "screens/projects/public-project/ProjectPublicMobile.css",
    family: "projects",
    note: "The unauthenticated project share at /share/project/:id. It consumes only the server's public projection and never derives signed-in marketplace capabilities.",
  },

  // --- The profile desk (Phase 5, D34-D37) ------------------------------
  // ckm-public-profile / ckm-visitor-profile / ckm-owner-profile were retired
  // on 2026-09-03 and replaced by ONE prefix. The three screens had drifted into
  // three stylesheets describing the same page — the same hero, the same fact
  // list, the same chip row, three times — and the iOS prototype settles the
  // argument: 2a, 2b, 2c and 2d are one screen with four fillings.
  "ckm-desk": {
    kind: PAGE_FAMILY,
    owner: "screens/profiles/desk/ProfileDesk.css",
    family: "profiles",
    note: "Every profile surface: the signed-out share at /share/profile/:id, the authenticated visitor profile across id/share/canonical routes, and the account owner's own profile — one glass bar, identity block, stat strip, segmented control, docked ask, plus the full profile editor dialog.",
  },

  "ckm-profile-collection": {
    kind: PAGE_FAMILY,
    owner: "screens/profiles/profile-collections/ProfileCollectionsMobile.css",
    family: "profiles",
    note: "The shared native general-profile activity and owner-only saved-project collection with bounded URL-owned paging.",
  },

  "ckm-account-settings": {
    kind: PAGE_FAMILY,
    owner: "screens/profiles/owner-profile/AccountSettingsMobile.css",
    family: "profiles",
    note: "The native own-account settings tab: privacy, email, password, notifications, sessions, localization, integrations, blocks, deleted projects, and deletion.",
  },

  "ckm-follow-requests": {
    kind: PAGE_FAMILY,
    owner: "screens/profiles/follow-requests/FollowRequestsMobile.css",
    family: "profiles",
    note: "The native inbound follow-request queue with profile links and shared accept/reject mutations.",
  },

  "ckm-collaboration": {
    kind: PAGE_FAMILY,
    owner: "screens/collaboration/CollaborationRequestsMobile.css",
    family: "collaboration",
    note: "The native incoming and sent collaboration-request queue with shared paged decisions at /collaborations.",
  },

  "ckm-reader-profile": {
    kind: PAGE_FAMILY,
    owner: "screens/reader/reader-profile/ReaderProfileMobile.css",
    family: "reader",
    note: "Reader identity, private own collections, public reviews, follow relationship, and URL-backed paging at /reader/profile/:id?.",
  },

  "ckm-reader-home": {
    kind: PAGE_FAMILY,
    owner: "screens/reader/ReaderHomeMobile.css",
    family: "reader",
    note: "Reader-only private library home and URL-owned project discovery at /reader and /reader/search (D55).",
  },

  "ckm-messages": {
    kind: PAGE_FAMILY,
    owner: "screens/messages/MessagesMobile.css",
    family: "messages",
    note: "The native conversation inbox, text thread, attachment display and keyboard-aware composer.",
  },

  // --- Challenges and Hall of Fame (Phase 6) ---------------------------
  "ckm-challenge-hub": {
    kind: PAGE_FAMILY,
    owner: "screens/challenges/ChallengeHubMobile.css",
    family: "challenges",
    note: "The public/authenticated four-section challenge index at /challenge: live, previous, Hall of Fame, and the owner's entry history (D47).",
  },
  "ckm-challenge-detail": {
    kind: PAGE_FAMILY,
    owner: "screens/challenges/ChallengeDetailMobile.css",
    family: "challenges",
    note: "The public/authenticated canonical challenge record, phase, rules, prizes, judges, partners, and owner-safe registration state (D48).",
  },
  "ckm-challenge-register": {
    kind: PAGE_FAMILY,
    owner: "screens/challenges/ChallengeRegisterMobile.css",
    family: "challenges",
    note: "The authenticated free, Razorpay, recovery, external-claim, and receipt flow at /challenge/register (D49).",
  },
  "ckm-challenge-dashboard": {
    kind: PAGE_FAMILY,
    owner: "screens/challenges/ChallengeDashboardMobile.css",
    family: "challenges",
    note: "The authenticated participant status, studio, community, achievements, results, and certificate workspace at /challenge/dashboard (D50).",
  },
  "ckm-hall": {
    kind: PAGE_FAMILY,
    owner: "screens/challenges/HallOfFameMobile.css",
    family: "challenges",
    note: "The bounded public Hall of Fame archive and permanent competition record at /hall-of-fame/:slug (D51).",
  },

  // --- Account entry (Phase 8, D59) -------------------------------------
  "ckm-auth": {
    kind: PAGE_FAMILY,
    owner: "screens/auth/ios/AuthSurface.css, screens/auth/ios/AuthControls.css, screens/auth/ios/AuthSheet.css",
    family: "auth",
    note: "The account-entry surface and control kit: the sticky bar, the editorial lockup, the docked action, the grouped inset "
      + "rows, the buttons, the six-box code field and the wheel picker sheet. Shared by /login, /join, /forgot-password AND by the "
      + "stepper and the invite screen, which add only what is their own — so `ckm-signup` and `ckm-invite` mount this family's "
      + "components rather than restating them. The reserved `ckm-forgot-password` stays retired for the same reason it was "
      + "(§7.2, 2026-08-26): recovery is this surface asking for different fields. `.ckm-auth__scroll` is the shell tuning this "
      + "family asks for through MobileShell's `scrollClassName`, which is why it is declared here and not in MobileShell.css.",
  },
  "ckm-signup": {
    kind: PAGE_FAMILY,
    owner: "screens/auth/SignUpMobile.css",
    family: "auth",
    note: "The role-parameterised sign-up stepper at /signup?as=<role>. Reallocated from the three reserved but never-used prefixes "
      + "`ckm-writer-onboarding`, `ckm-producer-onboarding` and `ckm-industry-onboarding`: mobile implements all three flows as ONE "
      + "screen, so three prefixes would have been three names for one stylesheet. The role is a data attribute on the host, not a "
      + "prefix. Separate from `ckm-auth` for the reason `ckm-editor` is separate from `ckm-create-project` — a flow-shell surface "
      + "with a progress rail, per-step panels, a keyboard-aware docked footer and a finish screen adds those to the shared "
      + "`ckm-auth` surface rather than being it.",
  },
  "ckm-invite": {
    kind: PAGE_FAMILY,
    owner: "screens/auth/AcceptInviteMobile.css",
    family: "auth",
    note: "Collaboration invite acceptance at /invite/:token. Its own family: a token-resolution RESULT surface (resolving, accepted, "
      + "expired, already used, signed-out) rather than a form, and the only auth route that renders for signed-in and signed-out "
      + "viewers alike.",
  },

  // --- Project creation (Phase 3) ---------------------------------------
  // The chooser at /new-project. Its own family rather than part of
  // ckm-create-project: it is a different route with a different shell, it
  // fetches nothing, and the wizard's prefix has to stay answerable for the
  // wizard's chrome alone.
  "ckm-new-project": { kind: PAGE_FAMILY, owner: "screens/NewProject.css", family: "create" },

  // The screenplay editor's chrome — /create-project step 1, "mode A". A
  // separate prefix from ckm-create-project by design (§7.2, the 2026-08-08
  // spike): the editor is a dark immersive surface with a docked toolbar, the
  // wizard is a light stepper with a sticky footer, and one prefix answering
  // for both would mean neither file could be read on its own.
  "ckm-editor": {
    kind: PAGE_FAMILY,
    owner: "screens/create/Editor.css",
    family: "create",
    note: "Top bar, page surface and docked Elements/Format bar. The editor itself is components/screenplay/ScreenplayEditor and carries no ckm-* classes.",
  },

  // The publish wizard — /create-project steps 2–5, "mode B". The light
  // counterpart to ckm-editor's dark chrome, and the second half of what makes
  // the route promotable: one prefix could not answer for an immersive dark
  // editor and a flow-mode form at the same time.
  "ckm-create-project": {
    kind: PAGE_FAMILY,
    owner: "screens/create/Wizard.css",
    family: "create",
    note: "App bar, progress line, panel layout, sticky footer and the title-page overlay. The media slots, the cropper and the buyer preview moved to ckm-media on 2026-08-09 when /upload needed the same three surfaces.",
  },

  // The upload flow at /upload — a sibling of ckm-create-project, not a reuse
  // of it. The two routes look alike because they share the form family and the
  // shell, but they ask different questions in a different order, so one prefix
  // answering for both would mean neither stylesheet could be read on its own.
  "ckm-upload": {
    kind: PAGE_FAMILY,
    owner: "screens/upload/Upload.css",
    family: "upload",
    note: "App bar, progress line, panel layout, the script file picker's states, the sticky footer and the submitted screen.",
  },
});

/*
 * The only selectors allowed to sit outside `.ckm`: the mobile surface itself
 * and the <html> scroll lock, which by definition has no `.ckm` ancestor.
 */
export const MOBILE_CSS_UNSCOPED_ALLOWLIST = Object.freeze([
  ".ckm",
  ".ckm-html-lock",
  ".ckm-html-lock body",
]);

export function isRegisteredMobileCssPrefix(prefix) {
  return Object.prototype.hasOwnProperty.call(MOBILE_CSS_PREFIXES, prefix);
}

/** `.ckm-ov__hero-title` -> `ckm-ov`; `.ckm-chip--gold` -> `ckm-chip`. */
export function mobileCssPrefixOf(className) {
  const bare = String(className).replace(/^\./, "");
  if (!bare.startsWith("ckm-")) return null;
  return bare.match(/^(ckm-[a-z0-9]+(?:-[a-z0-9]+)*?)(?:__|--|$)/)?.[1] ?? bare;
}
