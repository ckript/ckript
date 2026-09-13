# Ckript Native-Style Mobile Web Implementation

> **Canonical execution plan and continuation ledger**  
> **Project:** Ckript client (`client/`)  
> **Artifact type:** Mobile web application styled and structured like a high-quality React Native application  
> **Created:** 2026-08-05  
> **Current state:** Planning complete; implementation has not started under this plan  
> **Plan owner:** The AI agent currently implementing the mobile experience

---

## 1. Purpose of this document

This file is the single source of truth for building Ckript's complete mobile frontend. The result remains part of the existing React/Vite web client and uses the existing server, APIs, authentication, URLs, and business rules. It is **not** a React Native binary, a second server, a WebView wrapper, or a separate product.

The mobile experience must nevertheless feel like a carefully designed native application:

- phone-first information architecture rather than compressed desktop layouts;
- separate mobile React page components instead of one JSX tree hidden and rearranged with media queries;
- native-style app bars, tab bars, lists, cards, sheets, dialogs, gestures, pressed states, loading states, and transitions;
- safe-area-aware, keyboard-aware, single-axis layouts with no overlap or accidental horizontal scrolling;
- professional type, spacing, touch targets, accessibility, and performance;
- full functional parity with the appropriate desktop page, including permissions and edge states;
- continued use of the same canonical URLs so deep links, refresh, browser history, sharing, and analytics remain correct.

This document is intentionally resumable. When the user says **"continue in Native app implementation"**, the next agent must follow the continuation protocol in section 20 and proceed from the first uncompleted item in the live ledger. It must not start the project again, create a competing plan, or declare completion based only on visual similarity.

---

## 2. Non-negotiable product requirements

1. **One product and one backend.** All work stays inside `client/` unless an already-existing server defect blocks a mobile feature. Mobile code calls the same services and APIs as desktop code.
2. **Two presentation components per page.** A route with a desktop page gets a distinct mobile page component. Desktop markup must not become the mobile page through CSS hiding or wholesale responsive reflow.
3. **Shared behavior, separate presentation.** API services, validation, permissions, formatters, data models, and suitable hooks should be shared. Page markup and page-level CSS should not be shared merely to save files.
4. **All user-facing routes are tracked.** Marketing, authentication, onboarding, writer, discovery, project, challenge, messaging, profile, industry, reader, admin, finance, public-share, legal, redirect, and dynamic routes must appear in the route ledger. Nothing may be silently omitted.
5. **Every mobile page owns a stylesheet.** The stylesheet is co-located with its page. Shared primitives may have their own co-located styles or live in `mobile/theme/` only when they are truly application-wide.
6. **Every page has a unique CSS prefix.** All mobile classes also remain below `.ckm`. A page must never borrow another page's prefix.
7. **No overlap at supported sizes.** Fixed chrome, bottom actions, sheets, the virtual keyboard, safe areas, long labels, translated text, zoomed text, loading states, and validation messages must be tested.
8. **No placeholder dead ends in the completed product.** The current `desktopOnly()` Dynamic Island fallback is a migration aid, not an acceptable final state.
9. **Functional parity before decorative polish.** Every action, permission, error, loading state, empty state, and destructive confirmation is accounted for before a page is marked complete.
10. **No redesign by assumption.** Existing brand language and business intent remain recognizable. Large product changes or removal of desktop capabilities require explicit user approval.
11. **The document is updated during implementation.** Research notes, decisions, completed work, verification, blockers, and the exact next action are recorded before an agent ends a work session.

---

## 3. Repository audit: current baseline

### 3.1 Technology and routing

The client currently uses React 19, Vite 7, React Router, CSS/Tailwind globals, Vitest, and `happy-dom`. `client/src/App.jsx` owns the primary route tree and lazy-loads desktop pages. The app already has role-aware desktop shells under `client/src/layouts/` and navigation presets for writer, industry, reader, and admin audiences.

### 3.2 Existing mobile foundation

`client/src/mobile/` is already present and is the correct starting point. It includes:

```text
client/src/mobile/
  MobileApp.jsx
  MobileApp.css
  assets/
  components/
    BottomNav.*
    BottomSheet.*
    DynamicIsland.*
    EmptyState.*
    Icon.jsx
    SectionTabs.*
    Skeleton.*
    StatusBar.*
    TopBar.*
  context/
  data/
  hooks/
    useClock.js
    useDashboardData.js
    useIsMobile.js
  screens/
    Dashboard.*
    overlays/
    sections/
  theme/
    base.css
    primitives.css
    tokens.css
```

The existing mobile dashboard establishes valuable conventions:

- `.ckm` scoped styling;
- a full-height mobile root using `100dvh` with a `100vh` fallback;
- safe-area tokens;
- a separate dashboard component and stylesheet;
- co-located CSS for reusable mobile components;
- top navigation, bottom navigation, bottom sheets, empty states, skeletons, and a transient Dynamic Island message;
- a mobile breakpoint hook at 768 CSS pixels;
- lazy loading from `App.jsx`.

### 3.3 Known architectural gap to fix first

`RootExperience` in `client/src/App.jsx` currently replaces the entire desktop route tree with `<MobileApp />` for a signed-in writer/creator on a phone, except for `/challenge` paths. `MobileApp` then renders only the dashboard. Consequently, a writer who visits `/search`, `/messages`, `/profile/...`, `/script/...`, or most other routes on a phone sees the dashboard instead of the URL's intended page.

This is the first foundation issue. Adding screens before establishing route-aware mobile composition would create navigation drift, broken deep links, and back-button problems.

### 3.4 Existing implementation is a baseline, not a completed milestone

The dashboard is visually implemented, but it still contains desktop-only fallbacks for search, create, upload, project details, sharing, collaborations, filters, account menu items, and other actions. Its notifications begin from local data. It must pass the same research, parity, accessibility, real-data, route, and QA gates as every other page before being marked complete.

The older `client/src/mobile/README.md` remains a useful implementation snapshot. This file is the authoritative roadmap and progress ledger whenever the two differ.

---

## 4. Research and design gate: mandatory before every page

An implementing agent must not open a page file and immediately translate desktop JSX into smaller boxes. Complete the following gate for each page or tightly related route family.

### 4.1 Inspect and understand the existing product

Record in the page's work note:

- desktop component(s), stylesheet(s), child components, hooks, services, and route parameters;
- all visible sections and controls;
- API calls and the shape of success, loading, empty, partial, stale, and error states;
- user roles, permissions, ownership rules, quotas, subscription gates, and destructive actions;
- URL query parameters, navigation state, redirects, canonical links, and share behavior;
- modals, menus, drawers, tooltips, drag/drop, hover-only behavior, tables, charts, rich editors, file inputs, and third-party widgets;
- analytics and tracking hooks that must continue to fire;
- desktop behavior that does not translate directly to touch.

### 4.2 Research the native interaction model

Before designing, research how the page would normally be expressed in a real mobile application. Prefer current primary sources:

- React Native core component, accessibility, interaction, list, and performance documentation;
- Apple Human Interface Guidelines and Android/Material platform guidance where relevant;
- W3C/WCAG guidance for web accessibility and reflow;
- MDN for browser behavior such as safe areas, dynamic viewports, touch, focus, and scrolling;
- official documentation for any third-party widget used on that page.

Then inspect two or three current, reputable mobile products with a comparable workflow when useful. Capture interaction patterns and information hierarchy, not their brand styling. Do not copy copyrighted screens or invent claims about a product that was not inspected.

Minimum research questions:

1. In a real native app, is this a screen, nested screen, tab, detail stack, sheet, dialog, full-screen editor, or multi-step flow?
2. What belongs in the top app bar, scroll body, floating action, sticky action area, bottom tabs, and overflow menu?
3. Which desktop sections become progressive disclosure, accordion rows, detail screens, horizontally scrolling rails, or bottom sheets?
4. How does the workflow handle back navigation, cancellation, unsaved changes, keyboard display, and interrupted uploads?
5. Which lists require pagination or virtualization?
6. Which actions need pressed, pending, success, failure, offline/retry, disabled, and destructive states?
7. What should a screen reader announce, and in what focus order?

Add the research links and a short decision summary to section 19 before coding the page.

### 4.3 Produce a written wireframe before JSX

For each page, write a concise text wireframe that includes:

```text
Route and page name
Audience and permissions
Top app bar
Primary scroll hierarchy
Primary action and secondary actions
Bottom navigation visibility
Overlays / nested detail screens
Loading / empty / error / success states
Keyboard and safe-area behavior
Back-navigation behavior
Long-text and localization behavior
Desktop-to-mobile transformation decisions
```

For complex pages, also create a low-fidelity visual wireframe and obtain user approval before high-fidelity styling. A coding agent must not confuse a beautiful static mockup with a functioning page.

### 4.4 Pass the design checkpoint

A page may move to implementation only when:

- its functional inventory is complete;
- mobile hierarchy is decided;
- route and back behavior are decided;
- data ownership and reusable logic are decided;
- every state has a rendering plan;
- prefix and file paths are registered;
- high-risk items and the verification approach are recorded.

---

## 5. Architectural target

### 5.1 Experience selection

Keep one top-level `BrowserRouter`. Do **not** nest another browser router inside `MobileApp`.

Refactor the current binary dashboard gate into an explicit experience policy:

```text
BrowserRouter
  providers and cross-app services
  ExperienceResolver
    desktop route branch -> existing desktop pages and shells
    mobile route branch  -> MobileApp -> MobileRoutes -> route-specific screen
```

The resolver considers:

- viewport category;
- current pathname and query string;
- authentication loading state;
- user audience/role;
- whether the route is public, protected, redirect-only, or external-accountant/admin restricted;
- migration availability while the project is incomplete.

During migration, a route without a mobile implementation must deliberately render its existing responsive desktop page or a clearly registered temporary fallback. It must never silently render the dashboard. At final completion, all applicable routes resolve to a mobile component or an intentional redirect.

### 5.2 URL contract

Desktop and mobile use the same canonical URL. Do not create `/m`, `/mobile`, duplicated SEO URLs, or a second navigation history.

Mobile routing must preserve:

- path parameters;
- query strings and tab selection;
- hash fragments where used;
- `location.state` such as `startFresh`;
- browser back/forward behavior;
- direct refresh and copied deep links;
- authentication redirects and post-login return URLs;
- notification targets;
- canonical project and profile URLs.

Use route matching through React Router rather than manual `pathname.includes()` chains. Lazy-load every substantial screen.

### 5.3 Route manifest and drift protection

Create a typed-by-convention mobile route manifest even if the project remains JavaScript:

```js
{
  id: "writer-search",
  patterns: ["/search"],
  audience: ["writer", "industry", "admin"],
  protection: "authenticated",
  chrome: "standard",
  bottomTab: "discover",
  loader: () => import("../screens/discovery/SearchMobile.jsx"),
}
```

Recommended files:

```text
client/src/mobile/routes/
  MobileRoutes.jsx
  mobileRouteManifest.js
  mobileRoutePolicy.js
  mobileRoutePolicy.test.js
  mobileRouteCoverage.test.js
```

`mobileRouteCoverage.test.js` must maintain an explicit list of the route patterns declared in `App.jsx` and fail when a new user-facing desktop route has no mobile disposition. A disposition is one of `screen`, `shared-public-screen`, `redirect`, `desktop-migration-fallback`, `dev-only`, or `not-user-facing`, with a reason. Remove all `desktop-migration-fallback` entries before project completion.

### 5.4 Shared logic boundary

Preferred sharing:

- `services/` for transport and API contracts;
- route-independent hooks for data loading and mutation;
- validation and permission utilities;
- formatters, constants, data adapters, and analytics calls;
- small headless state machines for complicated editors and wizards.

Do not share by default:

- page layout JSX;
- desktop tables or sidebars;
- desktop modal markup;
- CSS class names;
- hover-driven interactions;
- fixed desktop dimensions.

When desktop behavior is trapped inside a large page component, extract only the behavior needed by both variants, add tests, and leave the desktop rendering stable. Avoid a broad rewrite of a working desktop page as a side effect of mobile work.

### 5.5 Native-to-web component mapping

Use React Native as the interaction and composition model while retaining semantic web output:

| Native concept | Mobile web implementation |
|---|---|
| `View` | Semantic `main`, `section`, `article`, `nav`, or `div` with flex/grid |
| `Text` | Correct heading, paragraph, label, or inline text element |
| `Pressable` | `button`, `Link`, or `NavLink` with visible pressed, focus, pending, and disabled states |
| `TextInput` | Associated `label` plus native `input`/`textarea` using correct `type`, `inputMode`, and autocomplete |
| `ScrollView` | One deliberate primary scroll container; contained sheet/list scrolling only when necessary |
| `FlatList` / `SectionList` | Paginated or virtualized semantic list after measurement; stable keys and lightweight rows |
| `SafeAreaView` | Shell padding using `env(safe-area-inset-*)` with fallbacks |
| `Modal` | Accessible dialog or full-screen route; bottom sheet only for short, contextual tasks |
| Native stack | Canonical nested routes and browser history |
| Tab bar | `nav` with labeled destinations and `aria-current` |
| Activity indicator | Accessible pending state that does not cause layout shift |
| Toast / banner | Non-blocking `status` region; `alert` only for urgent errors |

Native-feeling does not mean hiding browser semantics, disabling zoom, simulating an operating-system status bar unnecessarily, or making the web app inaccessible to keyboard users.

### 5.6 Analytics contract

Decided 2026-08-05. Read this before adding any tracking call to a mobile screen.

`AnalyticsBootstrap` is mounted **above** the experience resolver in `App.jsx`, and mobile keeps the desktop URL. Everything URL-driven or document-delegated therefore already works on mobile with no mobile-specific code:

| Event | Source | Mobile status |
|---|---|---|
| `session_start`, `user_returned`, `session_end` | `usePageTracking` | already correct |
| `page_enter`, `page_exit` (with time on page) | `usePageTracking` | already correct — mobile screens change the URL |
| `click` | `useClickTracking` (delegated on `document`, capture phase) | already correct |
| `scroll_depth` | `usePageTracking` listening on `window` | **broken on mobile**; see below |

Rules:

1. **Never re-fire a global event from mobile code.** A mobile screen that emits its own `page_enter` would double-count sessions and corrupt funnels. Mobile code adds only what the global implementation cannot observe.
2. **Scroll depth is the one exception, and the shell owns it.** The mobile app locks the document (`.ckm-html-lock`) and scrolls inside the shell's own surface, so `window` scroll never fires and `document.documentElement` never grows. `mobile/analytics/useMobileScrollDepth.js` measures the element that actually scrolls, emits the identical `scroll_depth` payload (same 5% step, same 100% rule, reset per URL) tagged `metadata: { surface: "mobile-shell", screenId }`, and is called by `MobileShell` — so every future screen inherits it by adopting the shell.
3. **Consent is observed, never sampled.** Use `tracking/useAnalyticsConsent.js`; consent can change mid-session from the banner or another tab.
4. **Give the shell a `screenId`.** It becomes `data-track-section` on the scroll surface, which is the first thing the click tracker reads, so a tap outside any `<section>` still reports a real screen name instead of a CSS class.
5. Shared payload helpers (`tracking/userContext.js`) are used by desktop and mobile alike; do not fork the identity block.

---

## 6. Professional target folder structure

Use domain folders so the mobile app can grow without becoming one flat directory:

```text
client/src/mobile/
  MobileApp.jsx
  MobileApp.css
  README.md
  assets/
  components/
    app-bars/
    buttons/
    cards/
    feedback/
    forms/
    lists/
    navigation/
    overlays/
  context/
  hooks/
  routes/
  shell/                # app-shell contract: MobileShell, shell modes, route boundary
  screens/
    admin/
    auth/
    challenges/
    discovery/
    finance/
    industry/
    legal/
    marketing/
    messages/
    onboarding/
    profiles/
    projects/
    reader/
    writer/
  theme/
    tokens.css
    base.css
    primitives.css
    utilities.css       # only if repeated utilities are proven necessary
  utils/
```

Each page follows this shape:

```text
screens/projects/project-detail/
  ProjectDetailMobile.jsx
  ProjectDetailMobile.css
  ProjectDetailMobile.test.jsx
  projectDetailMobile.model.js       # only if mobile-specific view modeling is needed
  components/                         # only components exclusive to this page family
```

Rules:

- use `.jsx` because the current client is JSX; do not introduce isolated TSX without a project-wide TypeScript decision;
- one default-exported screen component per route-level file;
- keep route screens orchestration-focused; extract repeated or independently testable sections;
- co-locate component CSS with the component;
- do not create `common/`, `helpers/`, or `misc/` dumping grounds;
- assets used only by mobile live under `mobile/assets/`; shared brand assets may remain in their established location;
- barrel files are optional and must not create circular dependencies or destroy code-splitting.

---

## 7. CSS isolation, prefixes, and design tokens

### 7.1 Scoping contract

Every mobile selector must be scoped by the `.ckm` root either directly or by ancestry. No mobile style may change an unscoped `body`, `button`, `input`, heading, or generic utility class. Temporary document-level locks must use an explicit `ckm-*` class and restore previous state on unmount.

Format:

```css
.ckm .ckm-search { ... }
.ckm .ckm-search__filter-trigger { ... }
.ckm .ckm-search__filter-trigger.is-active { ... }
```

Use BEM-like element and state naming. Do not style through brittle DOM depth, generated classes, `:nth-child`, or unrelated desktop selectors.

**Enforced since 2026-08-05.** Both rules are machine-checked by `client/src/mobile/theme/mobileCssContract.test.js`, which scans every mobile stylesheet and fails when a selector is unscoped or uses a prefix that is not declared in `client/src/mobile/theme/cssPrefixRegistry.js`. The registry file is the code-side mirror of §7.2; update both together.

Scoping is not cosmetic. Before normalization, 315 mobile selectors were single-class (specificity 0,1,0) and the desktop global sheet was silently winning four of them — mobile buttons rendered the desktop's Inter instead of `--ckm-body`, the avatar's initials were painted near-black on a near-black circle, an inactive section tab lost its muted colour, and the hero copy lost its top margin. Scoping is what makes an authored mobile style actually apply.

One caveat learned from that rewrite: adding `.ckm ` also lifts a selector above rules it used to lose to *inside* the mobile app. `.ckm-topbar__search span` (0,1,1) had correctly lost to `.ckm .material-symbols-outlined` (0,2,0); as `.ckm .ckm-topbar__search span` (0,2,1) it won and broke the icon font. Style a named element class, never a bare descendant element type.

### 7.2 Unique page prefix registry

Register the prefix before implementing a page — in this table **and** in `client/src/mobile/theme/cssPrefixRegistry.js`, which the contract test reads. Initial allocations:

| Page family | Required prefix |
|---|---|
| Mobile root and shell | `ckm-shell` (implemented: `client/src/mobile/shell/`, covers the app shell, route pending state, and route failure surface) |
| Dashboard | `ckm-dashboard` (migrated from `ckm-dash` on 2026-08-05) |
| Dashboard sections and overlays (one family, one prefix per file) | `ckm-ov`, `ckm-perf`, `ckm-rev`, `ckm-proj`, `ckm-pc`, `ckm-aid`, `ckm-allp`, `ckm-noti`. *(`ckm-acct` was **retired and deleted** on 2026-08-07, Phase 2: AccountMenu is now composed from `ckm-action-sheet` + `ckm-confirm` and has no CSS of its own.)* |
| Shared mobile components | `ckm-tabs` (legacy dashboard segmented strip, still in use; superseded by `ckm-tabbar`/`ckm-segmented` and awaiting the §19.3 tab-set decision), `ckm-empty`, `ckm-skel`, `ckm-statusbar`, `ckm-chip` (two owners by design: `theme/primitives.css` holds the base pill, `components/chips/Chip.css` the interactive forms). **Retired and deleted on 2026-08-07 (Phase 2), each with its component file:** `ckm-topbar` and `ckm-bottomnav` (superseded by `ckm-appbar`/`ckm-navbar`), `ckm-sheet` (`BottomSheet`, no focus trap — superseded by `ckm-bottom-sheet`), `ckm-island` (`DynamicIsland`, whose one production caller was `notify.desktopOnly()` — superseded by `ckm-toast`), `ckm-btn` (a 40px control under the touch floor with no link form — superseded by `ckm-button`), `ckm-viewmore` (superseded by `ckm-load-more`, which names the cost and announces the new count) |
| Phase 1 action primitives | `ckm-button` (`components/buttons/Button.css`), `ckm-icon-button` (`components/buttons/IconButton.css`), `ckm-back` (`components/navigation/BackButton.css`), `ckm-page-header` (`components/app-bars/PageHeader.css`) |
| Phase 1 role-aware chrome | `ckm-appbar` (`components/app-bars/AppBar.css` — the `standard`-shell app bar; supersedes `ckm-topbar`), `ckm-navbar` (`components/navigation/NavBar.css` — the role-aware bottom tab bar; supersedes `ckm-bottomnav`) |
| Phase 1 form family | `ckm-field` (`components/forms/Field.css`), `ckm-control` (`components/forms/Control.css` — one box shared by input/textarea/select), `ckm-checkbox`, `ckm-radio`, `ckm-switch`, `ckm-file-picker` |
| Phase 1 collection and display family | `ckm-list` (`components/lists/List.css`), `ckm-row` (`components/lists/ListRow.css`), `ckm-load-more` (`components/lists/LoadMore.css`), `ckm-card` (`components/cards/Card.css`), `ckm-badge` (`components/badges/Badge.css`), `ckm-chip-row` (`components/chips/Chip.css`), `ckm-segmented` (`components/tabs/SegmentedControl.css`), `ckm-tabbar` (`components/tabs/Tabs.css` — the APG tablist, distinct from the dashboard's legacy `ckm-tabs`) |
| Phase 1 overlay set | `ckm-overlay` (`components/overlays/Overlay.css` — layer, scrim and the bottom/center/full placements every modal surface shares), `ckm-bottom-sheet` (`components/overlays/Sheet.css`), `ckm-dialog` (`components/overlays/Dialog.css`), `ckm-confirm` (`components/overlays/ConfirmDialog.css`), `ckm-action-sheet` (`components/overlays/ActionSheet.css`) |
| Media attachment family (Phase 3) | `ckm-media` (`components/media/Media.css`) — **allocated and registered 2026-08-09**, decision D12. One attachable asset (`MediaSlot`, including its per-file upload progress), the cover cropper's stage and sliders (`CoverCropDialog`) and the buyer preview's page list (`PreviewDialog`), shared by `/create-project` and `/upload`. Lifted out of `screens/create/Wizard.css` rather than copied: both routes ask a writer for the same three files against the same three ceilings, and two copies of that control is how one of them ends up advertising a limit the other does not enforce |
| Phase 1 state set | `ckm-toast` (`components/feedback/Toast.css` — the transient message and its app-level host layer; supersedes `ckm-island`), `ckm-message` (`components/feedback/InlineMessage.css` — the durable inline strip and full-panel failure form), `ckm-offline` (`components/feedback/OfflineBanner.css`), plus `ckm-skel` gaining a **second owner** in `components/feedback/Skeletons.css` for the composable shapes (`__shape`, `__lines`, `__rows`, `__group`) while `components/Skeleton.css` keeps the dashboard's fixed boot drawing — neither file uses the other's element names, the same arrangement `ckm-chip` already has. `ckm-empty` is unchanged and reused |
| Development harness | `ckm-gallery` (`dev/PrimitiveGallery.css`, `/__mobile-primitives`, never mounted in production) |
| Root surface and utilities | `ckm-root`, `ckm-html-lock`, `ckm-scroll`, `ckm-sr-only` |
| Search | `ckm-search` (`screens/discovery/SearchMobile.css`, `/search`) — **allocated and registered 2026-08-13**, D25. Standard-shell discovery with a URL-owned query/scope/facet contract, semantic people rows, shared project cards and explicit server-backed Load more. |
| Top scripts | `ckm-top-scripts` (`screens/discovery/TopScriptsMobile.css`, `/top-script`) — **allocated and registered 2026-08-13**, D26. Five ranking modes, URL-owned facets, bounded server paging and shared discovery project cards. The D25 restriction premise was corrected against commit `edf3743`: personal-email access restrictions were deliberately removed product-wide. |
| Discovery project cards / facet task | `ckm-discovery-project`, `ckm-discovery-filter` (`screens/discovery/components/`) — **allocated and registered 2026-08-13**, D26. Shared by Search and Top; intended for Featured. |
| Featured projects | `ckm-featured` |
| Project detail/public project | `ckm-project-detail` / `ckm-public-project` |
| New project chooser | `ckm-new-project` (`screens/NewProject.css`, `/new-project` — added 2026-08-09, Phase 3 bullet 2. Its own family rather than part of `ckm-create-project`: a different route, a different shell, no data, and the wizard's prefix must stay answerable for the wizard's chrome alone) |
| Create project | `ckm-create-project` (`screens/create/Wizard.css`, `/create-project` steps 2–5) — **registered in code 2026-08-09** with its first stylesheet. The wizard chrome: host, app bar, progress line, panel layout, sticky footer and the title-page overlay. **The media slots, the cover cropper and the buyer preview moved out to `ckm-media` on 2026-08-09** when `/upload` needed the same three surfaces (D12) |
| Full-screen screenplay editor | `ckm-editor` (`screens/create/Editor.css`) — allocated 2026-08-08 (Phase 3 bullet 1), **registered in code 2026-08-09** with its first stylesheet. A separate family from `ckm-create-project` on purpose: the editor is a different shell mode (`immersive`, by per-slot override) with its own app bar, its own docked element/format bar and its own sheet set, and it will also be mounted from routes the create wizard is not. Sharing one prefix would make "which surface owns this rule" unanswerable. The editor engine itself (`components/screenplay/ScreenplayEditor`) carries no `ckm-*` classes — it is shared with desktop and styles itself through `cm-*` |
| Upload project | `ckm-upload` (`screens/upload/Upload.css`, `/upload` and its `?draft=` / `?edit=` forms) — **allocated and registered 2026-08-09**, Phase 3 bullet 3. Reallocated from the reserved `ckm-upload-project`, which no file ever used: the route is `/upload`, and a prefix that does not match its route is the first thing a later reader has to double-check. A sibling of `ckm-create-project` rather than part of it — the two flows share the shell and the form family but ask different questions in a different order, so one prefix answering for both would leave neither stylesheet readable on its own. Covers the host, app bar, progress line, panel layout, the script picker's three states, the invoice, the agreement box, the sticky footer and the three full-screen states (refused, resolving, submitted) |
| Project payment | `ckm-checkout` (`screens/projects/checkout/ProjectCheckoutMobile.css`, `/script/:id/pay`) — **allocated and registered 2026-08-20**, D30. Reallocated from the reserved `ckm-project-payment`, for the same reason `ckm-project` replaced `ckm-project-detail` in D28: the shorter name is the one the class list has to carry on every row of a dense transactional surface. Its own family rather than part of `ckm-project`: it is a single-purpose surface — an amount, a set of acceptances and one docked action — and it is the only mobile screen whose primary control hands the viewer to a third-party overlay outside our DOM. |
| Messages | `ckm-messages` |
| Profile/public profile | `ckm-profile` / `ckm-public-profile` |
| Follow requests | `ckm-follow-requests` |
| Challenge hub/detail/register/dashboard | `ckm-challenge-hub`, `ckm-challenge-detail`, `ckm-challenge-register`, `ckm-challenge-dashboard` |
| Hall of fame/detail | `ckm-hall`, `ckm-hall-detail` |
| Industry discovery/dashboard/mandates/writers | `ckm-industry-home`, `ckm-industry-dashboard`, `ckm-mandates`, `ckm-writers` |
| Reader home/script/profile | `ckm-reader-home`, `ckm-reader-script`, `ckm-reader-profile` |
| Landing/about/contact/pricing | `ckm-landing`, `ckm-about`, `ckm-contact`, `ckm-pricing` |
| SEO content page | `ckm-seo-page` plus route modifier/data attribute, not a new unregistered prefix per slug |
| Legal policy/terms/upload terms | `ckm-policy`, `ckm-terms`, `ckm-upload-terms` |
| Account entry (sign in, role chooser, password recovery) | `ckm-auth` (`screens/auth/ios/AuthSurface.css` + `AuthControls.css` + `AuthSheet.css`, `/login` + `/join` + `/forgot-password`, and the surface and control kit the stepper and the invite screen mount too) — **allocated and registered 2026-08-26**, D59. One family for all three, and the reserved `ckm-forgot-password` is **retired unused**: recovery is the same bar, the same editorial lockup and the same grouped inset rows as sign-in, differing only in which fields it asks for. Two prefixes would have meant two stylesheets sharing every rule, which is the arrangement §7.2 exists to prevent. Restyled to the iOS prototype on 2026-09-02: the family moved off the desktop modal's dark chrome and its injected Baskervville/PT Serif pair onto the app's own Spectral + IBM Plex Sans on iOS's cool grey, and the kit it now owns (surface, bar, rows, buttons, code field, wheel sheet) is mounted by `ckm-signup` and `ckm-invite` as well |
| Sign-up stepper | `ckm-signup` (`screens/auth/SignUpMobile.css`, `/signup?as=<role>`) — **allocated and registered 2026-08-26**, D59. **Reallocated from the three reserved prefixes `ckm-writer-onboarding`, `ckm-producer-onboarding` and `ckm-industry-onboarding`, none of which any file ever used**, for the reason `ckm-checkout` replaced `ckm-project-payment` and `ckm-upload` replaced `ckm-upload-project`: the native flow is *one* stepper screen parameterised by role, so three prefixes would have been three names for one stylesheet and no rule would have had an answerable owner. The role is a data attribute on the host, not a prefix. Its own family rather than part of `ckm-auth` — same split as `ckm-editor` vs `ckm-create-project`: a `flow`-shell multi-panel surface with a step rail, a docked keyboard-aware footer and per-step panels shares nothing but tokens with a single-screen sign-in form |
| Invite acceptance | `ckm-invite` (`screens/auth/AcceptInviteMobile.css`, `/invite/:token`) — **allocated and registered 2026-08-26**, D59. Its own family: a token-resolution *result* surface (resolving, accepted, expired, already-used, signed-out) rather than a form, and the only one of the five that renders for signed-in and signed-out viewers alike |
| Admin console/editor/script/agreements | `ckm-admin`, `ckm-admin-competition`, `ckm-admin-script`, `ckm-admin-agreements` |
| Offers and holds | `ckm-holds` (`screens/Holds.css`, `/offer-holds` — added 2026-08-08, Phase 2 bullet 5. A family of one: the screen is a single list with no sections and no overlays of its own.) |
| Finance | `ckm-finance` |

If two page files would use the same prefix, record why they are one page family. Otherwise allocate a new prefix and add it here.

### 7.3 Token system

Extend `mobile/theme/tokens.css`; do not scatter magic values. The token set must cover:

- brand and semantic colors;
- text and surface ramps for supported themes;
- spacing;
- type sizes, line heights, weights, and families;
- radii;
- hairlines/borders;
- elevation;
- motion duration and easing;
- touch target minimums;
- top/bottom chrome heights;
- safe areas;
- z-index layers.

Recommended spacing scale (4 px base): `4, 8, 12, 16, 20, 24, 32, 40, 48`.

Recommended starting type ramp, to be verified on real devices:

| Role | Size / line height |
|---|---|
| Micro metadata | `11 / 14` px; never for essential actions or long copy |
| Caption | `12 / 16` px |
| Supporting text | `14 / 20` px |
| Primary body | `16 / 24` px |
| Card/subsection title | `17 / 22` or `18 / 24` px |
| Section title | `20 / 26` or `22 / 28` px |
| Page title | `28 / 34` px, adjusted when space requires |

Inputs should use at least 16 px rendered text to preserve comfortable entry and avoid unwanted mobile-browser zoom behavior. Text truncation must be a product decision: use wrapping by default and explicit line clamping only when the full value is reachable elsewhere.

### 7.4 Touch, focus, and motion

- Ckript standard: interactive hit area at least **44 x 44 CSS px**; WCAG 2.2's 24 x 24 minimum is a floor, not the product target.
- Provide a pressed state immediately; do not rely on hover.
- Retain visible `:focus-visible` styling and logical focus order.
- Never place destructive and primary actions close enough for accidental activation.
- Honor `prefers-reduced-motion`.
- Animate opacity and transform where possible; avoid layout-heavy animation.
- Transitions should clarify hierarchy, not delay work. Target short feedback around 100–200 ms and screen/sheet motion around 200–350 ms, then validate by feel and performance.

### 7.5 Viewport, safe-area, and keyboard rules

- support `320px` width without loss of information or functionality;
- use `100dvh` where the visible viewport must track browser UI, with an appropriate fallback;
- include all four `env(safe-area-inset-*)` values where edge content requires them;
- do not place fixed actions beneath the bottom navigation or home indicator;
- use one primary vertical scroll surface per screen whenever possible;
- prevent accidental scroll chaining in sheets while preserving platform navigation behavior where possible;
- hide/reconfigure bottom navigation during focused multi-step editing if it competes with the keyboard;
- ensure focused inputs and their validation messages remain visible when the virtual keyboard opens;
- test portrait and landscape; do not lock orientation.

---

## 8. Mobile shell and navigation design

### 8.1 Shell variants

Implement explicit shell modes rather than conditionals scattered through screens:

| Shell mode | Intended use |
|---|---|
| `standard` | Top app bar + scroll body + role-aware bottom tabs |
| `detail` | Back button + title/actions; bottom tabs normally hidden |
| `immersive` | Reader/editor/media experiences with controlled chrome |
| `flow` | Onboarding, create, upload, payment, and registration steppers |
| `public` | Marketing, public share, legal, and logged-out routes |
| `admin` | Dense but touch-safe admin navigation and content |

Each route manifest entry declares a shell mode. Screens must not render a second competing app shell.

### 8.2 Bottom navigation

Bottom navigation is role-aware and contains only high-frequency top-level destinations. More destinations belong in an account/menu sheet, not an overcrowded tab bar. Labels remain visible; icon-only primary navigation is not acceptable.

**Decided 2026-08-07 by the user. This supersedes the five-tab proposals below.**

The tab sets are **not declared in mobile code**. `client/src/layouts/app-shell/navigation/` already owns the app's destinations — one preset per audience, each naming the three keys its compact bar shows, with Profile taking a fourth slot (`buildNav.js`, `MOBILE_SLOTS = 4`). The desktop shell has been building a four-slot mobile bar from that model since before this plan existed; §8.2's original proposal was written without knowledge of it.

The user chose the presets over a second list, for the reason `buildNav.test.js` records in its own header: the app previously had two independent navigation systems, and a feature added to one was unreachable from the other — every writer had a live competition they could not reach from anywhere in the UI. One model means a destination cannot exist in one bar and not the other.

| Audience | Tabs (from the preset's `mobileKeys` + Profile) |
|---|---|
| Writer | Dashboard · Create · Messages · Profile |
| Industry | Discover · Featured · Messages · Profile |
| Reader | Home · Discover · Messages · Profile |
| Admin | Console · Search · Messages · Profile |

Consequences accepted with the decision:

- the writer's bar carries **no Discover and no Challenge tab**; both remain reachable from the dashboard and the account sheet, and Challenge additionally from the dashboard's segmented strip;
- four tabs rather than five gives wider targets at 320 px (measured 80 px per column there);
- adding a destination to a bar is a one-line edit in the preset that owns it, and it changes desktop and mobile together.

`client/src/mobile/navigation/mobileNav.js` adapts rather than declares: it resolves the preset's icon keys to Material Symbols ligatures, derives the active tab from the URL, and guarantees order.

**Ordering is part of the contract.** WCAG SC 3.2.3 requires a navigation mechanism repeated across pages to keep the same relative order. Per-audience sets do not violate it — a viewer's audience does not change from page to page — but reordering by recency, badge count or usage would. The bar therefore never sorts, and a badge changes an item's contents, never its index. Asserted by `mobileNav.test.js`.

A URL determines the active tab; local component state does not. At most one tab is ever `aria-current="page"`, and **none** is the correct answer on a screen that belongs to no tab.

<details>
<summary>Superseded 2026-08-05 proposal, kept as the record of what was considered</summary>

- **Writer:** Dashboard, Discover, Create, Messages, Profile; Challenge remains prominent through dashboard/menu or may replace Discover after product approval.
- **Industry:** Discover, Dashboard, Writers, Messages, Profile.
- **Reader:** Home, Discover, Featured, Messages, Profile.
- **Admin:** Console, Search, Messages, Profile, More.

</details>

### 8.3 Back navigation

- A nested screen uses browser history when a valid in-app previous entry exists.
- A direct deep link uses a deterministic parent-route fallback.
- Closing a sheet restores focus to its trigger.
- Cancelling an edited/dirty flow prompts once and offers Stay/Discard.
- Android browser back and iOS edge/back behavior must not be blocked without a documented reason.

---

## 9. Complete route coverage ledger

Status vocabulary:

- `BASELINE`: some mobile code exists but has not passed this plan's completion gate;
- `NOT STARTED`: no approved native-style mobile page exists;
- `REDIRECT`: no new page is required, but redirect behavior must be tested on mobile;
- `DEV ONLY`: excluded from production completion but kept functional for development;
- `COMPLETE`: allowed only after section 18 is satisfied and verification evidence is recorded.

### 9.1 Public marketing, SEO, and account-entry routes

| Route(s) | Desktop source | Mobile target/prefix | Status |
|---|---|---|---|
| `/` | `pages/landing/Landing.jsx` | `marketing/LandingMobile.jsx` / `ckm-landing` | COMPLETE |
| `/about` | `pages/About.jsx` | `marketing/AboutMobile.jsx` / `ckm-about` | NOT STARTED |
| `/contact` | `pages/ContactPage.jsx` | `marketing/ContactMobile.jsx` / `ckm-contact` | NOT STARTED |
| `/pricing` | `pages/PricingRoute.jsx` | `marketing/PricingMobile.jsx` / `ckm-pricing` | NOT STARTED |
| `/features`, `/features/:slug` | `pages/SeoPage.jsx` | `marketing/SeoContentMobile.jsx` / `ckm-seo-page` | COMPLETE |
| `/for`, `/for/:slug` | `pages/SeoPage.jsx` | same mobile SEO renderer | COMPLETE |
| `/industries`, `/industries/:slug` | `pages/SeoPage.jsx` | same mobile SEO renderer | COMPLETE |
| `/resources`, `/resources/:slug` | `pages/SeoPage.jsx` | same mobile SEO renderer | COMPLETE |
| `/resources/blog`, `/resources/blog/:slug` | `pages/SeoPage.jsx` | same mobile SEO renderer | COMPLETE |
| `/tools`, `/tools/:slug` | `pages/SeoPage.jsx` | same mobile SEO renderer | COMPLETE |
| `/faq`, `/genre/:slug` | `pages/SeoPage.jsx` | same mobile SEO renderer | COMPLETE |
| `/how-to-sell-a-script` | `pages/SeoPage.jsx` | same mobile SEO renderer | COMPLETE |
| `/how-to-find-producers` | `pages/SeoPage.jsx` | same mobile SEO renderer | COMPLETE |
| `/how-to-pitch-screenplay` | `pages/SeoPage.jsx` | same mobile SEO renderer | COMPLETE |
| `/how-to-find-film-investors` | `pages/SeoPage.jsx` | same mobile SEO renderer | COMPLETE |
| `/film-investment-india` | `pages/SeoPage.jsx` | same mobile SEO renderer | COMPLETE |
| `/bollywood-script-submission` | `pages/SeoPage.jsx` | same mobile SEO renderer | COMPLETE |
| `/web-series-screenplay-guide` | `pages/SeoPage.jsx` | same mobile SEO renderer | COMPLETE |
| `/challenges` | `pages/landing/ChallengesPage.jsx` | `marketing/ChallengesMobile.jsx` / `ckm-challenges-marketing` | NOT STARTED |
| `/forgot-password` | `pages/ForgotPasswordRoute.jsx` | `screens/auth/ForgotPasswordMobile.jsx` / `ckm-auth` | IMPLEMENTED (D59) — device check pending |
| `/invite/:token` | `pages/AcceptInvite.jsx` | `screens/auth/AcceptInviteMobile.jsx` / `ckm-invite` | IMPLEMENTED (D59) — device check pending |
| `/login` | redirect to `/` (desktop opens `AuthModal`) | `screens/auth/SignInMobile.jsx` / `ckm-auth` | IMPLEMENTED (D59) — device check pending |
| `/join` | redirect to `/` (desktop opens `AuthModal` role cards) | `screens/auth/RoleChooserMobile.jsx` / `ckm-auth` | IMPLEMENTED (D59) — device check pending |
| `/signup?as=<role>&step=<n>&ref=<code>` | redirect to `/` (desktop opens the role modal) | `screens/auth/SignUpMobile.jsx` / `ckm-signup` | IMPLEMENTED (D59) — device check pending |
| `/share/profile/:id` | `pages/PublicProfile.jsx` or authenticated profile | `profiles/PublicProfileMobile.jsx` or `ProfileMobile.jsx` | NOT STARTED |
| `/share/project/:id` | `pages/PublicScript.jsx` | `projects/PublicProjectMobile.jsx` / `ckm-public-project` | NOT STARTED |
| `/:id` | profile/referral resolver | preserve resolver, then matching mobile destination | NOT STARTED |

### 9.2 Legal routes and aliases

| Route(s) | Mobile target | Status |
|---|---|---|
| `/privacy-policy` | `legal/PolicyMobile.jsx` / `ckm-policy` | NOT STARTED |
| `/privacy`, `/registration-privacy-policy` | redirect to `/privacy-policy` | REDIRECT |
| `/terms-of-service` | `legal/TermsOfServiceMobile.jsx` / `ckm-terms` | NOT STARTED |
| `/terms`, `/t-and-c` | redirect to `/terms-of-service` | REDIRECT |
| `/terms-conditions` | `legal/RoleTermsMobile.jsx` / `ckm-terms` | NOT STARTED |
| `/writer-terms`, `/investor-terms` | redirect with correct `tab` query | REDIRECT |
| `/script-upload-terms` | `legal/UploadTermsMobile.jsx` / `ckm-upload-terms` | NOT STARTED |

### 9.3 Onboarding routes

| Route(s) | Desktop source | Mobile target | Status |
|---|---|---|---|
| `/writer-onboarding` | `pages/WriterOnboardingRoute.jsx` | `SCREEN` that resolves to `/signup?as=writer`, keeping `?ref=` and `?redirect=` (D59) | IMPLEMENTED (D59) — device check pending |
| `/producer-director-onboarding` | `pages/ProducerOnboardingRoute.jsx` | `SCREEN` that resolves to `/signup?as=producer`, keeping `?ref=` and `?redirect=` (D59) | IMPLEMENTED (D59) — device check pending |
| `/investor-onboarding` | redirect to producer/director onboarding | preserve intent/referral if applicable | REDIRECT |
| `/industry-onboarding` | `pages/IndustryOnboarding.jsx` | `SCREEN` that resolves to `/signup?as=industry`, keeping `?ref=` and `?redirect=` (D59) | IMPLEMENTED (D59) — device check pending |

**D59 note — one stepper, not three onboarding screens, and why these routes redirect.** The three desktop onboarding surfaces are three files (1391 + 1196 + 982 lines) that ask for the same first three steps, create the account at the same point, run the same OTP leg and then diverge only in which profile fields follow. Native mobile implements that as **one** `flow`-shell stepper parameterised by role at `/signup?as=<role>`, so the shared 60% has one implementation and the divergence is data. The three deep-link routes therefore redirect into it rather than each mounting a screen of their own; they keep working for SEO, the sidebar "Become a Writer" entry, the Terms page and the landing CTAs exactly as before.

**D59 note — why `/login`, `/join` and `/signup` are mobile screens while desktop keeps a redirect.** These three are the first entries whose disposition deliberately differs by platform, which is what the manifest is for. Desktop presents auth as a modal over the page the visitor was reading and `App.jsx` keeps `<Navigate to="/">`; a phone cannot, because a modal has no URL — refresh loses a half-filled form, Android back closes the surface instead of stepping back, and the OTP step routinely outlives a trip to the mail app. The mobile entries are `SCREEN` + `protection: "public"`, and **deliberately not `signedOutOnly`** — that was the first design and it was wrong. `/signup` creates the real account at step 3 and the writer then fills in five more steps while signed in, so a policy that bounced an authenticated viewer off the route would have destroyed the flow at the exact moment it succeeded. The policy cannot tell "signed in because they finished step 3 four seconds ago" from "signed in and typed /signup"; each screen can, and each screen decides. **No new `App.jsx` route is added** — all five patterns already exist there and in `mobileRouteCoverage.test.js`. This also closes the requirement this table has carried since Phase 0 ("preserve query/referral and open correct auth entry"): `?ref=`, `?redirect=` and `?reason=` now survive end to end, including through OTP.

### 9.4 Writer, discovery, project, communication, and profile routes

| Route(s) | Desktop source | Mobile target | Status |
|---|---|---|---|
| `/dashboard` | `pages/Dashboard.jsx` | existing `mobile/screens/Dashboard.jsx`, to reorganize/harden | BASELINE |
| `/ai-tools` | dashboard variant | `writer/AiToolsMobile.jsx` or an explicit dashboard nested screen | NOT STARTED |
| `/offer-holds` | dashboard variant | `writer/OfferHoldsMobile.jsx` or explicit dashboard nested screen | NOT STARTED |
| `/follow-requests` | `pages/FollowRequests.jsx` | `profiles/FollowRequestsMobile.jsx` | NOT STARTED |
| `/top-script` | `pages/TopList.jsx` | `discovery/TopScriptsMobile.jsx` | **DONE 2026-08-13 (D26).** Five URL-owned ranking modes, four facets, bounded server paging, stable ranked cards with metric text, bookmark/public-share actions, and complete loading/empty/error/append states. Existing array API consumers remain backward-compatible. The stale desktop personal-email modal was not ported because commit `edf3743` deliberately removed that restriction from the shared policy. |
| `/trending` | redirect to `/top-script` | preserve redirect | REDIRECT |
| `/featured` | `features/featured-broadsheet` | `discovery/FeaturedProjectsMobile.jsx` | **COMPLETE (2026-08-14, D27)** — SCREEN for writer/industry; lead + spotlight + ranked + mandate sections, URL-owned sort and four facets, both sources bounded and paged, trailer contract shared with desktop. |
| `/search` | `pages/Search.jsx` | `discovery/SearchMobile.jsx` | **DONE 2026-08-13 (D25).** URL-owned query/scope/facets/sort, safe mixed-result projections, bounded server paging, bookmark/public-share actions, and complete idle/loading/empty/error/append states. |
| `/new-project` | `pages/NewProject.jsx` | `mobile/screens/NewProject.jsx` (`ckm-new-project`, `flow` shell) | **DONE** (2026-08-09, Phase 3 bullet 2). Two stacked cards, `startFresh` carried on the link and asserted by test. **Note: nothing links to this route on EITHER platform** — the Create entry in `writerNav.js` goes straight to `/create-project` with `fresh: true`, on desktop and mobile alike. It is deep-linkable and listed in `seo/seoRoutes.js`. See the open follow-up |
| `/create-project`, `/create-project/:draftId` | `pages/CreateProject` | `mobile/screens/create/CreateProjectRoute.jsx` → `CreateProjectChrome` → **mode A** `Editor.jsx` (`ckm-editor`, `immersive` + `EDITOR_SHELL_SLOTS`) when `step === 1`, **mode B** `Wizard.jsx` (`ckm-create-project`, `flow` + `WIZARD_SHELL_SLOTS`) for steps 2–5 | **DONE — PROMOTED TO `SCREEN` 2026-08-09; MEDIA RECOVERY ADDED D21–D24; NATIVE COMPETITION ADDED D23.** Both modes and the competition variation are native. Ten panels use the shared families; editor tools are complete through Reports; video media uses authenticated, checksummed, server-confirmed 6 MiB chunks with status/resume/complete/abort/expiry; and failed/cancelled recovery retains the script id without duplicate project creation. The orchestrator is shared, not forked: `<CreateProject Shell={CreateProjectChrome} nativeChrome hostClassName=… />`. There are no query exclusions. |
| `/upload` | `pages/ScriptUpload.jsx` + `components/script-upload/` | `mobile/screens/upload/UploadRoute.jsx` → `ScriptUploadChrome.jsx` → `Upload.jsx` (`ckm-upload`, `flow` + `UPLOAD_SHELL_SLOTS`) with ten panels in `panels/UploadPanels.jsx`; `UploadStates.jsx` for the three non-flow surfaces | **DONE — PROMOTED TO `SCREEN` 2026-08-09; RESUMABLE VIDEO TRANSPORT ADDED D24.** Ten panels use the shared form/media families and the orchestrator remains shared: `<ScriptUpload Workspace={ScriptUploadChrome} nativeChrome hostClassName=… />`. Validation is one platform-neutral implementation. Trailer and pitch uploads resume at the last server-confirmed chunk after network failure; explicit Cancel aborts the session and intentionally starts a later retry at zero. **NO EXCLUSIONS.** |
| `/upload?draft=<id>` | same page, `?draft` branch | same mobile screen; the orchestrator reads the param itself | **DONE 2026-08-09; loader hardened 2026-08-10 (DEF-8).** Converts a project written in the screenplay editor into an upload: the loader sets `scriptId`, so submit updates that project rather than creating a second one. Loading, not-found, forbidden, transient/offline, retry and explicit same-user local-recovery states are implemented; all server writes remain blocked until the source GET succeeds. |
| `/upload?edit=<id>` | same page, `?edit` branch | same mobile screen | **DONE 2026-08-09; loader hardened 2026-08-10 (DEF-8).** Updates a published script (`PUT /scripts/:id`). `editApprovalLocked` refuses an edit already under review; collaborators without metadata rights get the one-field content-only screen. Loading/failure/retry/local-recovery states are explicit and a shared orchestrator gate makes PUT/revision POST impossible until the current server listing has loaded. |
| `/script/:id` | `pages/ScriptDetail.jsx` | `projects/project-detail/ProjectDetailMobile.jsx` (`ckm-project`, `detail` shell) | **DONE — PROMOTED TO `SCREEN` 2026-08-14 (D28), READ HALF.** Hero and status, a role-aware recommended action that always resolves to something the screen can do, five labelled section landmarks (Story / Read / Evidence / Deal / Writer) replacing the desktop eight-tab rail, the shared trailer Dialog, a full-screen reader honouring the writer's preview window, bookmark and public share, and complete loading / blocked / not-found / failed states. **The data layer is SHARED, not forked:** `pages/script-detail/useProjectDetail.js` owns the endpoint choice, canonicalization and the failure split, and `ScriptDetail.jsx` was rewritten to consume it. The write half is D29 and every state it operates on is already rendered as text. |
| `/script/:projectHeading/:writerUsername` | same detail page | same mobile detail component | **DONE 2026-08-14 (D28).** An alias: it resolves through `GET /scripts/path/:heading/:writer`, which the server turns into `getScriptById`, and the URL is then replaced with the server's canonical path. Both segments are URL-encoded, because a project heading is writer-authored text. |
| `/:projectHeading/:writerUsername` | same detail page/catch-all | same component; collision tests mandatory | **DONE 2026-08-14 (D28).** The CANONICAL project URL — what every share link and every post-load redirect uses. **Promoted WITHOUT changing its position:** it stays last in the manifest exactly as App.jsx declares it last, and `findMobileRoute` returns the first match, so every static route above it still wins. The mandatory collision tests exist: a case walks `/script/:id/pay`, `/admin/scripts/:id`, `/reader/script/:id` and `/create-project/:draftId` and asserts none of them resolves to `project-detail`. |
| `/script/:id/pay` | `pages/ScriptPaymentPage.jsx` | `projects/checkout/ProjectCheckoutMobile.jsx` | **DONE 2026-08-20 (D30).** The buyer's checkout is a native SCREEN (`flow` shell, docked action slot) over a contract BOTH platforms now call: `script-detail/checkout.js` (pricing, the nine-way standing, the acceptances, the gateway loader, the three requests, the two PDFs and the pending-charge record) and `script-detail/useProjectCheckout.js` (the state around them). `ScriptPaymentPage.jsx` lost 659 lines to them and is now presentation only. New on both platforms: the 72-hour payment window is stated rather than enforced silently, the buyer's currency is sent instead of inferred (DEF-31), and a charge taken but never verified is recovered rather than referred to support (DEF-32). |
| `/messages` | `features/messages-operator` | `messages/MessagesMobile.jsx` | **DONE — PROMOTED TO `SCREEN` 2026-08-21 (D39–D41).** URL-owned inbox/detail, pending-recipient deep links, authoritative unread state, text and attachment-only sends, upload progress/retry, reactions, confirmed deletion, authenticated sockets, shared project/file/trailer context, and an authorized meeting/calendar flow. Desktop and mobile share `messageContract.js`; project detail and messages share one native `MeetingSheet` plus `projectActions.js`. |
| `/collaborations` | `pages/Collaborations.jsx` + `components/collab/` | `collaboration/CollaborationRequestsMobile.jsx` | **DONE — PROMOTED TO writer `SCREEN` 2026-08-21 (D43), FAMILY COMPLETE 2026-08-22 (D44).** URL-backed Incoming/Sent/Invites/Activity tabs; bounded request, recipient-invite, and accessible-project activity responses; owner decisions and invite refresh/cancel; recipient-safe in-app acceptance; durable loading/error/empty/success states. People, comments and presence remain in the already-native editor. |
| `/profile/:id?` | `pages/Profile.jsx` | `profiles/ProfileMobile.jsx` | NOT STARTED |

### 9.5 Challenge and awards routes

| Route(s) | Desktop source | Mobile target | Status |
|---|---|---|---|
| `/challenge` | `pages/challenge/ChallengeHub.jsx` | `challenges/ChallengeHubMobile.jsx` | NOT STARTED |
| `/challenge/c/:slug` | `CompetitionLanding.jsx` | `challenges/ChallengeDetailMobile.jsx` | NOT STARTED |
| `/challenge/register` | `CompetitionRegister.jsx` | `challenges/ChallengeRegisterMobile.jsx` | BASELINE (responsive branch exists; must conform) |
| `/challenge/dashboard` | `CompetitionDashboard.jsx` | `challenges/ChallengeDashboardMobile.jsx` | BASELINE (responsive branch exists; must conform) |
| `/my-competitions` | redirect to `/challenge?tab=mine` | preserve tab and history behavior | REDIRECT |
| `/hall-of-fame` | `hall-of-fame/HallOfFame.jsx` | `challenges/HallOfFameMobile.jsx` | NOT STARTED |
| `/hall-of-fame/:slug` | `HallOfFameDetail.jsx` | `challenges/HallOfFameDetailMobile.jsx` | NOT STARTED |

### 9.6 Industry routes

| Route(s) | Desktop source | Mobile target | Status |
|---|---|---|---|
| `/home` | `features/investor-desk` | `industry/IndustryHomeMobile.jsx` | **DONE — PROMOTED TO `SCREEN` 2026-08-22 (D52).** URL-owned shelf/sort, personalized/fallback feed, standing brief, bounded safe project summaries, and canonical project/bookmark actions over the shared desktop/native contract. |
| `/dashboard` for industry roles | producer workspace dashboard | `industry/IndustryDashboardMobile.jsx` | **DONE — PROMOTED TO `SCREEN` 2026-08-22 (D52).** Role-aware Overview/Deals/Matches/Finance/Market sections with partial-failure isolation; actors receive a discovery-only workspace and never writer dashboard content. |
| `/mandates` | `producer-workspace/MandatesPage.jsx` | `industry/MandatesMobile.jsx` | **DONE — PROMOTED TO `SCREEN` 2026-08-22 (D53B).** Shared desktop/native state, allow-listed values, professional-only authorization, and recoverable load/save failures. |
| `/writers` | `producer-workspace/WriterRosterPage.jsx` | `industry/WriterRosterMobile.jsx` | **DONE — PROMOTED TO `SCREEN` 2026-08-22 (D53A).** Shared abort-safe desktop/native loader, canonical search/sort/facets, mandate degradation, compact comparison cards, and a positive server projection with literal regex search. |
| shared `/featured`, `/search`, `/top-script`, `/messages`, `/profile/:id?` | audience-aware desktop pages | audience-aware mobile variants above | NOT STARTED |

### 9.7 Reader routes

| Route(s) | Desktop source | Mobile target | Status |
|---|---|---|---|
| `/reader` | `pages/ReaderHome.jsx` | `reader/ReaderHomeMobile.jsx` | **DONE — PROMOTED TO `SCREEN` 2026-08-23 (D55).** Private Read Again/Favorites and public Fresh shelves settle independently, preserve useful partial data, and route every project through the reader detail URL. |
| `/reader/search` | `pages/ReaderHome.jsx` Discover variant | `reader/ReaderDiscoverMobile.jsx` | **DONE — PROMOTED TO `SCREEN` 2026-08-23 (D55).** Exact-reader, projected discovery with canonical `q`, `category`, `genre`, and `page`, bounded paging, stale-request cancellation, and complete result/empty/failure states. |
| `/reader/script/:id` | reader detail route | `projects/project-detail/ProjectDetailMobile.jsx` with reader route policy | **DONE — PROMOTED TO `SCREEN` 2026-08-21 (D32), OWNERSHIP RECONFIRMED D55.** Uses the shared native detail/reader contract while preserving the reader URL and reader back destination. |
| `/reader/profile/:id?` | `pages/ReaderProfile.jsx` | `reader/reader-profile/ReaderProfileMobile.jsx` | **DONE — PROMOTED TO `SCREEN` 2026-08-21 (D42).** Own and visitor identity, authoritative follow/request state, explicit private reader collections, public reviews, shared profile editing, stable own canonicalization, and URL-backed section/page state over one paged desktop/native contract. |
| `/reader/featured` | redirect to `/featured` | preserve redirect | REDIRECT |
| shared `/featured`, `/top-script`, `/messages`, profile paths | audience-aware desktop pages | existing audience-aware mobile screens | **DONE FOR READER 2026-08-23 (D55).** Reader ownership is explicit in route policy; Featured/Top project opens retain `/reader/script/:id`, reader copy omits industry mandates/new-thread promises, and no presentation fork was added. |

### 9.8 Admin and finance routes

| Route(s) | Desktop source | Mobile target | Status |
|---|---|---|---|
| `/admin` | `pages/AdminDashboard.jsx` | `admin/AdminMobile.jsx` | NOT STARTED |
| `/admin/competitions/:id` | admin competition editor | `admin/AdminCompetitionMobile.jsx` | NOT STARTED |
| `/admin/scripts/:id` | `pages/AdminScriptView.jsx` | `admin/AdminScriptMobile.jsx` | NOT STARTED |
| `/admin/agreements` | `pages/AdminAgreements.jsx` | `admin/AdminAgreementsMobile.jsx` | NOT STARTED |
| `/finance` | `pages/FinancePanel.jsx` | `finance/FinanceMobile.jsx` | NOT STARTED |

Admin/finance mobile completion means the functionality works safely on a phone. Dense data tables should become summaries, cards, filters, and detail routes/sheets; they must not become tiny horizontally scaled tables. If a high-risk operation should remain unavailable on phones, that is a product-policy exception requiring explicit user approval and a documented alternative—not an implementation omission.

### 9.9 Development route

| Route | Disposition | Status |
|---|---|---|
| `/__mobile-preview` | maintain as a safe mobile preview entry in development; expand to accept a route/audience fixture if useful | DEV ONLY |
| `/__mobile-primitives` | primitive/state harness (`mobile/dev/PrimitiveGallery.jsx`); every new shared primitive adds its states here before a screen depends on it | DEV ONLY |
| `/__mobile-editor` | screenplay-editor harness (`mobile/dev/EditorHarness.jsx`, added 2026-08-09). Mounts the real `Editor` chrome, the real stylesheets and the real CodeMirror over a fixture `CreateProjectContext`, with `?state=recovery\|error\|exit\|readonly\|prose`. It exists because `/create-project` is still a migration fallback and the editor's real risks — touch targets, contrast on dark chrome, whether the docked bar covers the caret line — are only measurable in a browser. **Retire it when the route is promoted** | DEV ONLY |

---

## 10. Cross-page component and overlay coverage

Routes alone are insufficient. Track these families because they can otherwise remain desktop-only inside an otherwise completed mobile page.

| Family | Examples in current client | Required mobile treatment | Status |
|---|---|---|---|
| Authentication | auth modal, Google sign-in, OTP, password, forgot password | full-screen/sheet flow with keyboard and error handling | NOT STARTED |
| Pricing and checkout | pricing modal/plans, plan checkout, Razorpay | full-screen flow; return/cancel/payment recovery | NOT STARTED |
| Onboarding | writer/producer modal content, role selection | dedicated flow screens; resumable progress | NOT STARTED |
| Account/settings | user menu, preferences, privacy settings, currency, language, dark mode | account screen and focused sheets | BASELINE (account menu only) |
| Notifications | bell, list/panel, toasts, targets | real service data, deep links, read state | BASELINE |
| Profiles | edit profile, completion, badges, activity, follow requests | route or full-height sheet; image/file controls | NOT STARTED |
| Projects | cards, share, bookmark, review, ratings, payment | shared touch-safe primitives and route details | NOT STARTED |
| Creation/editor | editor toolbar, title page, AI tools, collaboration, presence, version history, reports, corkboard | mobile editor research spike; progressive/immersive UI | **PARTIAL — ALL CODE-BACKED PHASE 3 BULLETS COMPLETE THROUGH D24.** Built: docked Elements/Format toolbar, overflow/export/exit flows, title page, cover cropper, buyer preview, comments, live people/access administration, version history/diff/restore, Navigator, corkboard with non-drag reorder, scene/character Reports with shared PDF/CSV export, AI quota states, native competition pitch/final-submit/lock, deterministic large-file preflight, explicit batch cancellation, and real server-backed video resume. The family remains PARTIAL only for the recorded real-device keyboard/screen-reader verification debts. |
| Upload | validation, phases, success view, terms | keyboard/file-picker-safe step flow | NOT STARTED |
| Messaging/meetings | threads, composer, attachments, meeting modal, calendar card | list-detail stack and keyboard-safe composer | NOT STARTED |
| Collaboration | requests, invite, presence, comments, activity | mobile panels/sheets with real-time states | NOT STARTED |
| Challenges | cards, countdowns, timeline, participants, referrals, submit entry | domain mobile primitives and route flows | BASELINE (some responsive components) |
| Public marketing | header/nav, trailer, partner modal, footer, CTA/auth entry | native-feeling public shell without harming SEO | NOT STARTED |
| Legal/consent | cookie banner, terms tabs, policy documents | readable, searchable, accessible; consent never obscures actions | NOT STARTED |
| Global dialogs | confirm, event poster, about, success/error feedback | accessible dialog/sheet patterns with focus restoration | NOT STARTED |
| Loading and failure | route fallback, skeletons, error boundary, empty states | consistent shell-level and page-level states | BASELINE |

When implementing a page, add every child overlay it invokes to its parity checklist. A route is not complete while a button still opens desktop markup or calls `desktopOnly()`.

---

## 11. Phased implementation roadmap

Phases are ordered to minimize architectural rework. Implement vertical slices: research, design, data, page, states, tests, and verification together.

### Phase 0 — Foundation and route safety

- [x] Snapshot current mobile dashboard at supported widths for regression reference.
- [x] Create `mobile/routes/` and the route manifest/policy.
- [x] Replace the dashboard-swallowing behavior with route-aware mobile resolution.
- [x] Add route coverage and policy tests, including role and auth combinations.
- [x] Define shell variants and route-level error/suspense boundaries.
- [x] Expand tokens for spacing, typography, touch, chrome, elevation, motion, and z-index.
- [x] Normalize CSS scoping and prefix rules without visually regressing the dashboard.
- [x] Define mobile analytics/page-tracking behavior.
- [x] Decide migration fallback behavior and expose it clearly in development.
- [x] Update `client/src/mobile/README.md` to point to this canonical plan.

**Exit gate:** direct mobile navigation to `/dashboard`, `/search`, `/messages`, `/profile/...`, public routes, role-specific routes, and an unknown route is deterministic; no URL silently becomes the dashboard.

### Phase 1 — Shared native-style system and chrome

- [x] Standard/detail/immersive/flow/public/admin shells. *(shell-mode contract landed in Phase 0; `detail` is now exercised by a real screen.)*
- [x] Role-aware top app bars and bottom navigation. *(2026-08-07: `ckm-appbar` + `ckm-navbar` + `navigation/mobileNav.js` + `hooks/useMobileNav.js`. The tab sets are **not declared in mobile code** — they are the desktop audience presets (`layouts/app-shell/navigation/`), the user's decision recorded in §8.2, so a destination cannot exist in one bar and not the other. Tabs are links, not buttons calling `onSelect`; the selected tab is derived from the URL by `resolveActiveTabKey`, never passed in — the old bar's active tab was the literal constant `"dashboard"`. At most one tab is `aria-current="page"` and **none** on a screen that belongs to no tab. `TopBar`/`BottomNav` are superseded and now unused; both prefixes stay registered until the files are deleted.)*
- [x] Page header, back button, icon button, primary/secondary/destructive buttons. *(2026-08-05: `ckm-button` (primary/secondary/tertiary/destructive × md/lg, pending, disabled, link forms), `ckm-icon-button` (44px hit region at every size, badge folded into the accessible name), `ckm-back` + `hooks/useMobileBack.js` (§8.3 history-vs-parent rule), `ckm-page-header`.)*
- [x] Form field, textarea, select, checkbox, radio, switch, file picker. *(2026-08-05: `ckm-field` + `ckm-control` + `ckm-checkbox` / `ckm-radio` / `ckm-switch` / `ckm-file-picker`. **Combobox is deliberately not built** — a searchable combobox is only worth its cost where a list must be filtered, so it is deferred to the first screen that needs one, most likely Search filters in Phase 4.)*
- [x] List row, card, chip, badge, segmented control, tabs, pagination/load-more. *(2026-08-05: `ckm-list`/`ckm-row` (real `<ul>`/`<li>`; a row may navigate **and** carry its own control, via a `::after` overlay on the row's link so the second control is never nested inside it), `ckm-card` + parts (the whole card is tappable while the link's accessible name stays the title alone), `ckm-badge` (status only, with the new `*-ink` text tokens), `ckm-chip` extended in place with the interactive/removable forms plus `ckm-chip-row`, `ckm-segmented` (a real radio group, because it filters rather than switching panels), `ckm-tabbar` (APG tablist: one Tab stop, arrow/Home/End, `aria-controls`, focusable panel), `ckm-load-more` (count as an SC 4.1.3 status message, cost named in the button, focus rescued when the button unmounts).)*
- [x] Bottom sheet, full-screen dialog, confirm dialog, context menu. *(2026-08-05: `ckm-overlay` base + `ckm-bottom-sheet` (drag-to-dismiss bound to the grip only, so a drag on the body scrolls it), `ckm-dialog` (full-screen task; closes with a close icon, never a back chevron, and refuses scrim dismissal), `ckm-confirm` (`role="alertdialog"`; a destructive confirmation focuses **Cancel**, and Escape/scrim both mean cancel), `ckm-action-sheet`. **The context menu is an action sheet and is deliberately not `role="menu"`** — the APG menu contract (roving tabindex, arrows, Tab leaves the menu) is a desktop application-menu convention, and a phone list of actions and links is better served by plain buttons and links in a dialog; the trigger carries `aria-haspopup="dialog"`. The dashboard-era `components/BottomSheet.jsx` was **superseded, not upgraded**, matching the `ckm-btn`→`ckm-button` and `ckm-tabs`→`ckm-tabbar` calls; Phase 2 migrates the four dashboard overlays onto `Sheet` and retires it.)*
- [x] Toast/status, inline error, retry, skeleton, empty state, offline state. *(2026-08-05: `ckm-toast` — a queue above the router with two always-mounted live regions, which **enforces** rather than documents the rule that a toast carrying an action or an error never auto-dismisses; `ckm-message` — the durable counterpart, inline strip and panel failure form, both carrying the retry; `ckm-offline` + `hooks/useOnlineStatus.js`, rendered by `MobileShell` so every screen inherits it; `ckm-skel` extended in place with composable shapes; `ckm-empty` reused and given `titleAs`. **The DynamicIsland was superseded, not upgraded**, matching `ckm-btn`→`ckm-button`, `ckm-tabs`→`ckm-tabbar` and `ckm-sheet`→`ckm-bottom-sheet`: it makes the whole message a `<button>`, so it can never carry an "Undo", and its one production caller is `notify.desktopOnly()`, which §2.8 deletes by completion. `useInertBackground` gained one narrow, opt-in exemption — `inert` removes a subtree from the accessibility tree, so a toast layer caught by the overlay walk would be announced to nobody.)*
- [x] Scroll lock, focus trap/restoration, reduced motion, safe-area and keyboard helpers. *(2026-08-05: `hooks/` — `useScrollLock` (locks the shell's `<main>`, because `ckm-html-lock` already locked the document and a `body` scroll lock is a no-op in this app; reference-counted, restores position), `useFocusTrap` + `tabbable.js` (initial focus, Tab/Shift+Tab wrap, and the restoration policy §18 requires — opener, else a still-focusable fallback, else the scroll surface), `useInertBackground` (the browser's own `inert`, computed from one module-level stack so stacked overlays cannot mark each other inert), `useReducedMotion` (JS motion cannot be reached by the CSS media query), `useKeyboardInset` (visualViewport; iOS does not shrink the layout viewport, so a sheet footer sits under the keyboard without it), and `useOverlay` composing all four.)*
- [x] Story/demo route or test harness for states and theme variants. *(2026-08-05: `/__mobile-primitives` → `mobile/dev/PrimitiveGallery.jsx`; every new primitive adds its states here.)*

**Exit gate:** primitives are accessible, themeable, touch-safe, documented, and verified at 320–768 px without requiring page-specific overrides.

### Phase 2 — Writer navigation and dashboard completion

- [x] Dashboard research/parity audit against desktop. *(2026-08-07 — §19.3. Payload shapes read out of `server/controllers/dashboardController.js` rather than inferred from client code, which is what caught the review-mapping defect.)*
- [x] Remove local/static production placeholders and wire real services. *(2026-08-07 — `data/dashboardModel.js` + a rewritten `hooks/useDashboardData.js`. The AI and platform review lists were reading `score`/`summary` off payloads that send `rating`/`overall`/`feedback`, so every card showed 0/100 with identical empty bars and a hardcoded sentence about a real script. Also: the literal "Placeholder" badge, the three invented notifications behind the bell, `score: null` on every project card, and Performance's two "—" rows. The bell now consumes the desktop shell's own `useShellNotifications`.)*
- [x] Complete search, notification, account, profile, project, share, and collaboration destinations used by dashboard. *(2026-08-07 — all nine `desktopOnly()` call sites replaced by real destinations or real in-place behaviour, and `DynamicIsland` deleted with them. Share is the Web Share API with a clipboard fallback; Filter is a real `ckm-segmented` status filter. Search is the app bar's, which Phase 1 already made role-aware.)*
- [x] Replace provisional bottom navigation with approved writer tabs. *(2026-08-08 — **approved by the user as-is**: Dashboard · Projects · Messages · Profile. No code change; the bars have been preset-driven and URL-driven since Phase 1 §8.2, and the Phase 1 CDP sweep already measured this exact bar clean at all five widths. What this session added is enforcement: `mobileNav.test.js` now asserts the approved **labels and order**, and asserts that Create is absent from the compact bar but present in the rail and drawer — the condition the approval depended on.)*
- [x] Implement `/ai-tools` and `/offer-holds` as real route-aware screens/sections. *(2026-08-08 — **the plan's premise was wrong and the §4 gate says so**: both routes are the identical `<DashboardRoute />` element as `/dashboard` in `App.jsx:582-583`, `pages/Dashboard.jsx` never reads the pathname, they have been that way since `93055d0` (2026-02-25), and nothing in the product links to either. Resolved with the user: `/offer-holds` built for real, `/ai-tools` recorded as a dashboard alias. See §19.3.)*
- [x] Complete account/settings and global auth/session behaviors. *(2026-08-08 — **there is no settings page to port on either platform.** No `/settings` route, no settings page; desktop's entire account surface is `UserMenu.jsx`'s four entries plus Log out, which mobile's `AccountMenu` already mirrors — with a logout confirmation desktop does not have. Global auth/session already lives outside React in `services/api.js` + `AuthContext.jsx` and mobile inherits all of it (§5.4). Delivered: the `/terms` and `/privacy` alias links fixed to canonical, first-ever test coverage for the account surface, and the logout/cache contract pinned. See §19.3.)*

**Exit gate: MET (2026-08-08).** Verified by grep: zero live `desktopOnly()` call sites remain anywhere in `client/src/mobile`; `DynamicIsland`, `BottomSheet`, `TopBar` and `BottomNav` are deleted and their prefixes retired.

### Phase 3 — Project creation, upload, and screenplay tools

- [x] Research spike for mobile screenplay/editor workflows before final design. *(2026-08-08. §4 gate run across all five routes at once. Headline: `ScreenplayEditor` is a controlled CodeMirror 6 host with an imperative `apiRef` and no desktop layout — mobile reuses it and rebuilds only the chrome, so the phase's biggest risk is a toolbar problem, not an editor problem. Nine decisions (D1–D9) and five defects/risks (DEF-1…DEF-5) recorded in §19.3.)*
- [x] Create project new/draft routes with save/resume and unsaved-change protection. *(**COMPLETE 2026-08-09 (third session), competition variation completed 2026-08-13 (D23):** mode B — the publish wizard — landed and `/create-project` + `/create-project/:draftId` were promoted to `SCREEN` in the same change. `Wizard.jsx` + `wizardChrome.js` + `Wizard.css` (`ckm-create-project`), ten panels in `panels/` on the shared form family, six overlays in `overlays/`, and the seam: `pages/CreateProject/index.jsx` gained `Shell` / `nativeChrome` / `hostClassName`, all defaulted so desktop is unchanged. Resume lands on the exact step **and** Details sub-panel (D7, via `lib/workingDraft.js`). The unsaved-change prompt is now one shared `ExitFlow` serving both modes. D23 removed the former `?ctx=competition` exclusion only after the native editor gained its deadline, pitch, flush-before-submit confirmations, success return and submitted lock. `/__mobile-create` now fixtures editor, competition and wizard surfaces. Prior, same day: the save/resume core.*
  *Earlier detail, kept: **save/resume core and `/new-project`.** Delivered: `lib/workingDraft.js` (per-draft snapshot keys, so a resumed draft finally gets a local fallback — DEF-2; `step` **and** the Details sub-panel recorded, so resume lands where the writer left; a pure `chooseDraftRecovery` that refuses to clobber a co-writer), `lib/keepaliveSave.js` (measures the exit-save body against MDN's 64 KiB cap and **refuses to send** one that will not fit, instead of advancing the "saved" signature on a request the browser discards — DEF-1), both wired into `pages/CreateProject/` for **both platforms**, and the mobile `/new-project` chooser. Still open in this bullet: the mobile `/create-project` and `/create-project/:draftId` screens themselves, which the now-approved wireframe unblocks. **Update 2026-08-09 (later): mode A — the editor — is built and verified; mode B (the publish wizard, steps 2–5) is not, and the route therefore stays a `DESKTOP_MIGRATION_FALLBACK`. Promoting it with an unported wizard would put desktop form markup on the phone the moment a writer taps "Continue to details", which §2.2 forbids. The editor is reachable at the development route `/__mobile-editor`; the route promotion and mode B land together.**)*
- [x] Upload workflow, validation, legal acceptance, progress, failure/retry, and success. *(**COMPLETE 2026-08-09 (fourth session): `/upload` is a `SCREEN` route, with both of its query forms.** Ten panels (`panels/UploadPanels.jsx`) on the shared form and `ckm-media` families, a pure chrome model (`uploadChrome.js`), the flow (`Upload.jsx`, `ckm-upload`, `flow` + a one-slot footer override) and the three surfaces desktop expresses as early returns (`UploadStates.jsx`: refused, `?edit=` resolving, submitted). The seam is three defaulted props on `pages/ScriptUpload.jsx` — `Workspace` / `nativeChrome` / `hostClassName` — so App.jsx's bare `<ScriptUpload />` renders exactly what it rendered before. **Validation, legal acceptance and failure/retry are shared code, not ported:** `utils/scriptUploadValidation.js` was already platform-neutral, and its per-field `fieldId` is honoured on mobile through a wrapping anchor plus the control's own `error` prop (D11). **Progress is now honest on BOTH platforms (D14):** `uploadMediaForScript` reports real bytes through axios's `onUploadProgress`, and step 1's extraction — which reports no progress at all — is an indeterminate busy state here rather than desktop's invented 10%-per-200ms bar (DEF-9). Save draft moved to the overflow so the footer keeps two controls rather than four in a 320px row (D13, and DEF-4 measured what the fourth costs). `?ctx=` has no exclusion: every query form is ported.)*
- [x] Screenplay editor touch toolbar, element selection, keyboard behavior, comments/presence, version history, reports, and title page. *(**BULLET COMPLETE 2026-08-12.** Reports, the last named surface, is a full-screen `ckm-dialog` (D20) with APG Scene/Character tabs, a labelled native sort, direct PDF/CSV actions, explicit empty states and close-before-jump behavior. Parsing remains in shared `screenplayReports.js`; the desktop rail and mobile dialog now share `screenplayReportExport.js`. The 60-scene harness proves one scroll surface. Prior completions: Version history (D19), People (D18), Comments (D17), Navigator/title-page reachability (D16/DEF-13), Scene cards (D15/DEF-3), and the docked Elements/Format toolbar (D1–D5). The bullet is closed; real-device keyboard and screen-reader debts remain openly tracked and still prevent the entire editor route from satisfying §18.)*
- [x] AI creation/review tools and quota states. *(**COMPLETE 2026-08-10 (fifth session): this bullet is an entitlement/state slice, not a new route.** One client/server rule now grants every paid plan (`pro`, `enterprise`, `silver`, `gold`, `diamond`) the same AI actions and locks `free`/`none`; server enforcement now covers metadata and cover generation as well as the existing prose, grammar, evaluation and trailer endpoints. AI covers have a real allowance of 15 per plan period, reserved atomically on `User.subscription.aiImagesGeneratedTotal` before generation, released on upstream failure, and reset by every existing purchase/grant path. Both `/create-project` and `/upload` render the authoritative remaining count, distinguish a free-plan upgrade from a paid writer's exhausted quota, expose a disabled pre-tap quota state, and suppress same-frame double taps. The duplicated dead cover route was removed; `AiWritingAssistant.jsx`, the orphaned `scriptController.generateAiCover`, and the uncalled trailer UI/endpoints are documented rather than revived or deleted.)*
- [x] File/image/video picker and interrupted-upload recovery. *(**COMPLETE 2026-08-13 (D24), building on D21–D22.** The shared `ckm-media` picker remains a real labelled file input. Both creation entry points use one uploader: covers stay on the bounded 5 MiB whole-file endpoint, while trailers and pitch videos use authenticated 24-hour sessions, 6 MiB Cloudinary ranged parts, per-part SHA-256, authoritative accepted ranges/status, idempotent part retries, completion that attaches the final asset through the same rule as legacy upload, explicit abort, and scheduled/lazy expiry cleanup. A network failure rolls UI progress back to the last confirmed range and **Continue** resumes there. Explicit Cancel is deliberately different: it aborts the session, cleans a finalized-but-unattached asset, and a later retry starts at zero. The saved script id remains retained throughout, so recovery never recreates the project.)*

**Exit gate:** a writer can create or upload, leave, resume, validate, collaborate where allowed, and finish a project entirely on a supported phone.

> `/script/:id/pay` **moved to Phase 4 on 2026-08-09** by user decision. It is a buyer surface and this gate is written entirely about a writer; its money-adjacent states cannot be honestly verified without the buyer screens it is reached from.

### Phase 4 — Discovery and project consumption

- [x] Search, filters, sort, pagination, saved state, and result cards. *(D25 native Search established the URL/paging/action contract; D26 extracted its project card and facet Dialog for Top and Featured reuse.)*
- [x] Top scripts and featured projects. *(D26 `/top-script`, D27 `/featured`, both on the shared discovery card and facet Dialog.)*
- [x] Project detail for every canonical route form. *(D28 read half, D29 write half; all three authenticated URLs are one screen.)*
- [x] Public shared project. *(D31 promotes `/share/project/:id` as the first `SHARED_PUBLIC_SCREEN`: a dedicated public loader and model consume the controller's projected teaser payload without deriving authenticated buyer capabilities.)*
- [x] Share, bookmark, rating/review, purchase/payment, trailer/media, permissions, and restricted states. *(D29 landed everything but payment; D30 landed `/script/:id/pay` — the checkout, its nine standings, the Razorpay handover and the charge-recovery path — on one contract shared with the desktop page.)* *(D29 landed everything here EXCEPT payment: request/approve/decline, reader reviews, producer ratings, contact reveal, message, meeting, owner edit/delete, and every refusal stated as text. `/script/:id/pay` — the Razorpay checkout — remains.)* *(Includes `/script/:id/pay`, **moved here from Phase 3 on 2026-08-09** by user decision: it is the buyer's checkout, its neighbours are all in this phase, and its states — already purchased, not approved for payment, free, gateway blocked, verification failed after charge — can only be verified against them. Razorpay Checkout is a third-party overlay outside our DOM; back during checkout must not orphan a charged payment.)*
- [x] Reader/preview modes and long-content performance. *(D32 promotes `/reader/script/:id` by reusing the native project surface with reader navigation. Preview-only viewers render projected page text in the shared CodeMirror reader; only full-access relationships can fetch the stored PDF.)*

**Exit gate:** all project discovery-to-detail actions and deep links work for each relevant audience.

### Phase 5 — Profiles, network, messages, and collaboration

- [x] Own and visitor profile variants, tabs, editing, completion, badges, posts/activity, saved projects. *(D35 completes the authenticated visitor variant across all three route forms. D36 completes the own identity/professional overview, editor, completion, badges, and published-project summary. D37 completes the live account/settings tab. D42 completes the reader-specific own/visitor identity and collections. D45 completes masked/reviewed payout credentials and private WGA/SWA proof submission/access. D46 completes bounded public activity and owner-only saved projects over one desktop/native contract, makes section/page URL-owned, and removes all collection documents and raw collection ids from the base profile response.)*
- [x] Public profile/share resolver and canonical username paths. *(D34 completes signed-out `/share/profile/:id`; D35 adds the authenticated share, `/profile/:id`, and canonical `/:id` visitor forms while preserving the richer own-profile workspace.)*
- [x] Follow requests and follow/unfollow states. *(D35 completes outgoing visitor follow/request/cancel/unfollow states. D38 promotes `/follow-requests`, shares list/accept/reject state across desktop, both notification shells, and mobile, and links the owner workspace to the pending queue.)*
- [x] Thread list, message detail, composer, attachments, unread state, notification targeting. *(D39 lands the URL-backed inbox/text thread and authoritative unread/message socket contract. D40 adds recipient-authorized, grant-bound attachment selection/progress/retry, touch reactions, confirmed own-message deletion, and server-authoritative mutation events.)*
- [x] Meeting/calendar flows. *(D41 adds the native message-origin context/meeting path, shares the native form with project detail and the write contract with both platforms, preserves message drafts across full-page Google consent, and binds every meeting to the target writer's own project server-side.)*
- [x] Collaboration requests, invites, presence, comments, and activity. *(D43 completes incoming/sent request state, owner decisions, writer-role authorization, paging, notification targets, and the canonical `/collaborations` mobile entry. D44 adds recipient invitations matched by account or normalized email, refresh/expiry and explicit POST acceptance, cross-project activity, and fixes email-only owner administration. People/comments/presence remain in the native editor.)*

**Exit gate:** identity, networking, and communication workflows are complete without desktop fallbacks.

### Phase 6 — Challenges and hall of fame

- [x] Challenge marketing list and authenticated hub. *(D47: one native public/authenticated hub with URL-owned Live, Previous, Hall of Fame, and Mine states.)*
- [x] Challenge detail, dynamic phase state, rules/resources/judges/sponsors. *(D48: canonical native detail over the shared phase/detail contract and bounded owner entry summary.)*
- [x] Registration, payment if applicable, validation, and confirmation. *(D49: free, persisted/reused Razorpay order, captured-payment recovery, third-party verification, legal validation, receipt, invoice, and exact-dashboard return.)*
- [x] Participant dashboard, entry submission, referrals, achievements, winners. *(D50: native status/timeline workspace, shared editor opening, bounded community/referrals, results/rewards/certificate, and URL-owned sections; final submission remains in the native editor's D23 confirmation gate.)*
- [x] My Competitions query-tab deep link. *(D47: `/my-competitions` preserves the canonical `/challenge?tab=mine` destination.)*
- [x] Hall of Fame list/detail and public SEO behavior. *(D51: native public/member archive plus permanent detail records over bounded shared list/detail contracts, canonical URL filters/paging, dynamic SEO, published featured scripts, and explicit privacy boundaries.)*

**Exit gate:** public and authenticated challenge journeys work end-to-end on mobile and all dynamic slugs are preserved.

### Phase 7 — Industry and reader audiences

- [x] Industry discover/home and role-specific dashboard. *(D52: native `/home` and the industry branch of `/dashboard` over shared bounded contracts, canonical URL state, partial-failure isolation, and role-safe composition.)*
- [x] Writer roster, filters, restrictions, details, ratings, mandates, ledger/offer workflows. *(D53A–D53C: bounded native roster and mandates, existing native project/profile detail actions, one shared holder-owned offer contract, confirmed native/desktop release, provider-authoritative hold payment, projected finance rows, and explicit partial-ledger failures.)*
- [x] Industry variants of search, featured, saved, messages, profile. *(D54: shared native discovery, messaging, and profile presentations retained; saved-project ownership now resolves to the five-role professional watchlist with bounded role-gated server contracts, while actor-only discovery omits professional mandates, finance, and watchlist controls.)*
- [x] Reader home/discover, featured, script reader, reader profile, messages. *(D55: native `/reader` and `/reader/search` over one desktop/native reader contract; private shelves degrade independently; reader search is exact-role, bounded, projection-safe, and GET-pure; existing Featured, Top Scripts, Messages, script detail/reader, and reader-profile screens now explicitly own reader presentation without forks.)*
- [x] Audience-switch/onboarding transitions and permission tests. *(D56: one app-level audience boundary and pure transition policy now own canonical homes, authorized post-auth returns, exact reader/professional routes, stale-role auth restoration, onboarding session refresh, denied direct URLs, and replace-safe Back/Forward behavior; exhaustive writer/industry/actor/reader desktop and compact-navigation tests prevent chrome leakage.)*

**Exit gate:** every non-writer audience receives the correct mobile navigation and route content, never a writer dashboard.

### Phase 8 — Marketing, authentication, onboarding, legal, and public sharing

- [x] Landing and all sections, marketing navigation, footer, trailer, and partner dialogs. *(D57: `/` is a shared public native screen for signed-out and authenticated viewers; it owns the complete canonical landing sequence, account-aware CTAs, menu, accessible feature accordion, format rail, current challenge deadline, trailer and partner dialogs, statutory footer, and frame-aware consent banner. The legacy hard-coded event poster is suppressed on native mobile, and desktop/native share the valid tracked trailer source.)*
- [x] SEO content renderer for every registered content route and slug. *(D58: 21 route patterns and 41 registered paths now share one native public-shell renderer and one desktop/native content resolver; features, audiences, industries, resources/blog, tools, FAQ, genres, and seven long-form guides preserve canonical SEO/prerender ownership. Unknown dynamic slugs render an explicit recovery state and are `noindex`; FAQ content is no longer duplicated as generic cards.)*
- [ ] About, contact, pricing, challenge marketing page. *(Deferred to D60; D59 claimed the authentication bullets ahead of it at the user's direction.)*
- [ ] Authentication, OTP, forgot password, invite, referral, and return-to-route behavior. **IMPLEMENTED — D59, Claude, 2026-08-26. Deliberately NOT ticked:** §18 requires "manual browser/device verification evidence is recorded", and this environment still has no agent-browser CLI or Chrome/Edge. Everything else in §18 is satisfied and evidenced in §19.3. One device pass closes this box.
- [ ] Writer, producer/director, investor redirect, and industry onboarding. **IMPLEMENTED — D59, Claude, 2026-08-26**, same §18 caveat. Native mobile implements all three as one role-parameterised stepper at `/signup?as=<role>`; the three onboarding routes resolve into it (§9.3). Reader and actor sign-up remain deliberately out of scope — see the §19.1 follow-up.
- [ ] Privacy, terms, role terms/tabs, upload terms, redirects, consent banner.
- [ ] Public profile and project pages for logged-out users.

**Exit gate:** logged-out users get deliberate native-style mobile pages with SEO content, auth conversion, legal access, and deep-link integrity.

### Phase 9 — Admin and finance

- [ ] Admin mobile information architecture for all console sections.
- [ ] Responsive data summaries, filters, drill-downs, bulk-action safeguards, and audit visibility.
- [ ] Competition editor modules.
- [ ] Admin script view and agreements.
- [ ] Finance dashboard, transactions, invoices, ledger/reconciliation actions, and external-accountant restrictions.
- [ ] Destructive, financial, impersonation, and permission tests.

**Exit gate:** every registered admin/finance route is usable and safe on a phone, or has a user-approved documented policy exception.

### Phase 10 — Whole-application hardening and release

- [ ] Eliminate every mobile `desktopOnly()` and `desktop-migration-fallback` entry.
- [ ] Exhaustive route deep-link and browser-history pass.
- [ ] Exhaustive role/permission/subscription matrix.
- [ ] Visual regression matrix on target devices and widths.
- [ ] Accessibility audit: keyboard, screen reader, zoom, contrast, target size, focus visibility/order, reduced motion.
- [ ] Slow-network, offline/retry, API failure, empty, large-data, long-text, and localization tests.
- [ ] Performance profiling in production builds; list and editor stress tests.
- [ ] Cross-browser pass on current iOS Safari, Android Chrome, and supported desktop browsers at phone widths.
- [ ] Build, lint, unit/integration tests, route coverage tests, and prerender/SEO verification.
- [ ] Documentation reconciliation and final product sign-off.

**Exit gate:** section 18 is satisfied for every route and component family; the completion ledger contains evidence and no known blocker is hidden.

---

## 12. Per-page implementation sequence

Use this exact sequence for each route family:

1. Claim the next item in section 19 and set it to `RESEARCHING`.
2. Audit the desktop page, children, data, permissions, routes, tracking, and states.
3. Perform the current mobile/native research in section 4; record sources and decisions.
4. Write the text wireframe and, for complex pages, a visual wireframe.
5. Register the route, component path, CSS prefix, shell mode, and bottom-tab behavior.
6. Identify shared logic to extract; protect existing desktop behavior with tests first.
7. Implement a route-level mobile skeleton and error boundary.
8. Implement the functional happy path with real data/services.
9. Implement loading, empty, partial, permission, quota, error, retry, offline, and destructive states.
10. Implement all invoked overlays and child flows.
11. Add semantic structure, labels, focus management, pressed states, and reduced-motion handling.
12. Verify layout and interaction at all required widths, with long data and text zoom.
13. Run relevant unit/integration tests, lint on touched files, production build as risk warrants, and browser verification.
14. Compare every item in the desktop parity inventory.
15. Record evidence, decisions, follow-ups, and the exact next action in section 19.
16. Mark `COMPLETE` only if the definition in section 18 passes.

Do not mark a page complete because it renders, matches one screenshot, or works only with mock data.

---

## 13. Required screen states and interaction quality

Every data-backed screen must deliberately handle applicable states:

- initial loading with stable layout;
- background refresh without blanking content;
- empty first-use state with a useful action;
- empty filtered/search state with filter recovery;
- partial data or missing optional media;
- permission denied/not owner;
- plan/quota restricted;
- signed-out/session-expired;
- recoverable API error with retry;
- irreversible or destructive action confirmation;
- optimistic update, rollback, and pending prevention where relevant;
- slow upload/download and cancellation;
- offline or connectivity loss where detectable;
- very large lists;
- long titles, names, genres, currencies, and translated strings;
- deleted/unavailable deep-link target;
- success acknowledgement without blocking navigation.

Avoid stacking multiple transient surfaces. Define a z-index/layer contract for shell chrome, menus, sheets, dialogs, toasts, and critical alerts. Opening one blocking overlay closes or suspends conflicting overlays.

---

## 14. Accessibility requirements

WCAG 2.2 AA is the baseline; native-style polish never overrides accessibility.

- semantic headings and landmarks;
- accessible names for icon buttons;
- labels visually associated with form controls;
- errors connected to fields and announced;
- visible focus and predictable focus order;
- focus trapped only inside truly modal surfaces and restored on close;
- no action available only by swipe, drag, hover, color, or icon recognition;
- alternative to drag/reorder gestures;
- meaningful images have alt text; decorative images have empty alt text;
- captions/transcripts where media requires them;
- color and non-text contrast verified in every supported theme;
- content reflows without loss at 320 CSS px and browser zoom/text scaling;
- minimum 44 x 44 CSS px product touch target;
- current page/tab announced using correct semantics;
- live regions used sparingly and at the correct urgency;
- reduced motion honored;
- screen-reader verification on representative complex flows.

Do not disable pinch zoom with the viewport meta tag.

---

## 15. Performance and data rules

- mobile pages are lazy-loaded by route;
- do not import the full desktop page into a mobile screen merely to reuse one helper;
- reuse service calls and normalized data, not desktop DOM;
- cancel or ignore stale requests on route/parameter changes;
- avoid duplicate fetches when auth resolves or shell changes;
- paginate server-backed collections where supported;
- measure before adding virtualization, then use it for genuinely large lists;
- keep list rows shallow, keyed, and free of heavy calculation;
- size images correctly, provide aspect ratio, lazy-load offscreen media, and avoid layout shift;
- defer noncritical panels and expensive charts;
- avoid expensive rerenders during input, scroll, and animation;
- profile production builds, not only development mode;
- preserve a responsive press reaction even when the resulting work is expensive;
- maintain existing SEO prerender behavior for public routes.

Do not add a new state library, UI framework, router, CSS-in-JS system, or component kit without a documented need and user approval. Existing React state, hooks, services, and CSS are sufficient for the foundation.

---

## 16. Verification matrix

### 16.1 Required viewport widths

Test at minimum:

| Width | Purpose |
|---:|---|
| 320 px | WCAG reflow floor and smallest supported phone |
| 360 px | common small Android |
| 375 px | compact iPhone class |
| 390 px | modern iPhone class |
| 412 px | common large Android |
| 430 px | large iPhone class |
| 480 px | upper phone range |
| 768 px | current gate boundary / compact tablet transition |

Also test at least one short-height landscape viewport and one device with nonzero safe-area insets. Validate behavior just below and above the 768 px experience boundary during foundation work.

### 16.2 Content stress fixtures

Every reusable layout should be tested with:

- 1-character and very long names/titles;
- no avatar/poster and broken media;
- zero, one, and many list items;
- large unread/badge counts;
- long translated navigation labels;
- multiline validation errors;
- large currency values and dates;
- slow loading and request failure;
- 200% text zoom where practical;
- virtual keyboard open.

### 16.3 Automated checks

Minimum commands from `client/`:

```powershell
npm test
npm run lint
npm run build
```

During implementation, run focused tests first and the full suite at phase exits. Add:

- route policy and coverage tests;
- screen render tests for each route family;
- permission and audience tests;
- navigation/deep-link/back tests;
- data-adapter tests;
- critical form and destructive-flow integration tests;
- accessibility assertions for semantics and focus behavior.

Evaluate Playwright and axe integration during Phase 0. Add them only through a deliberate dependency change, then use real mobile browser emulation for visual, interaction, route, and accessibility regression coverage.

### 16.4 Manual/device checks

- current iOS Safari;
- current Android Chrome;
- installed/PWA mode if the manifest supports it;
- keyboard opening, switching, and dismissal;
- file picker, camera/gallery options where applicable;
- browser back/forward, refresh, copied deep link, auth expiry;
- screen reader on representative flows;
- reduced motion and dark/light mode where supported;
- poor network and intermittent connectivity.

Record the device/browser/version and result rather than writing only "tested on mobile."

---

## 17. Source guidance adopted by this plan

These are starting references, not a substitute for per-page research:

1. [React Native: Core Components and APIs](https://reactnative.dev/docs/components-and-apis) — native mental models for views, text, pressables, scroll containers, and performant lists.
2. [React Native: Pressable](https://reactnative.dev/docs/Pressable) — immediate press lifecycle and forgiving hit regions.
3. [React Native: Accessibility](https://reactnative.dev/docs/accessibility) — accessibility roles, labels, state, and platform assistive technology.
4. [React Native: Performance Overview](https://reactnative.dev/docs/performance.html) and [Optimizing FlatList Configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration) — frame responsiveness, production profiling, and list tradeoffs.
5. [React Router: Declarative Routing](https://reactrouter.com/start/declarative/routing) — URL-to-UI mapping, nested layouts, dynamic segments, and links.
6. [WCAG 2.2](https://www.w3.org/TR/WCAG22/) — reflow, focus, semantics, contrast, input, and target-size requirements.
7. [W3C: Understanding Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) — 24 x 24 CSS px AA minimum and exceptions; Ckript intentionally targets 44 x 44.
8. [Apple HIG: Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) — 44 x 44 pt hit-region guidance and visible press states.
9. [MDN: CSS `env()`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env) — safe-area and user-agent environment variables.
10. [MDN: CSS length/viewport units](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length) — `svh`, `lvh`, and `dvh` behavior under dynamic browser chrome.
11. [MDN: `overscroll-behavior`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overscroll-behavior) — scroll chaining and boundary behavior, including compatibility cautions.
12. [W3C: Understanding Focus Not Obscured (Minimum), SC 2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) — adopted 2026-08-05. Sticky/fixed chrome must not entirely hide a focused element; `scroll-padding` is the named sufficient technique and is now applied by `MobileShell`.
13. [W3C ARIA APG: Tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) — adopted 2026-08-05. Roles/states, roving tabindex (one Tab stop for the whole bar), Left/Right with wrap plus Home/End, activation-follows-focus where panels render without latency, and `tabindex="0"` on a panel with no focusable content. Implemented by `components/tabs/Tabs.jsx`.
14. [W3C: Understanding Status Messages, SC 4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) — adopted 2026-08-05. A result count ("Showing 20 of 64") is a status message and must be announced through role/properties **without** taking focus; the list items themselves are not. Implemented by `components/lists/LoadMore.jsx`.
15. [Inclusive Components: Cards](https://inclusive-components.design/cards/) — adopted 2026-08-05. Why a whole-card block link is wrong (the link's accessible name becomes the entire card, and no second control may live inside it), and the pseudo-content overlay on a heading link that replaces it, with nested controls raised by `position: relative`. Implemented by `Card`/`CardTitle` and reused by `ListRow`.

16. [W3C ARIA APG: Modal Dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) — adopted 2026-08-05. `role="dialog"` + `aria-modal="true"` + an accessible name; initial focus placed deliberately (**the least destructive option** for a destructive confirmation); Tab and Shift+Tab wrap inside; Escape closes; focus returns to the invoking element unless it no longer exists. Also its warning that `aria-modal="true"` must not be claimed unless interaction outside really is prevented. Implemented by `components/overlays/Overlay.jsx` + `hooks/useFocusTrap.js`.
17. [MDN: the `inert` global attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inert) — adopted 2026-08-05. An inert subtree fires no clicks, takes no focus, cannot be selected, is skipped by find-in-page, and is **removed from the accessibility tree**. This is how the mobile app hides an overlay's background: the hard half of "modal" stays the platform's job. Widely available since April 2023. Implemented by `hooks/useInertBackground.js`.
18. [MDN: `<dialog>` and `showModal()`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog) — read and **deliberately not adopted**, 2026-08-05. `showModal()` renders in the top layer, which is viewport-scoped and escapes `.ckm-root`'s `max-width: 520px` phone frame; at the 768px verification width the app is a 520px column and the dialog would be 768px wide. Reasoning recorded at the top of `Overlay.jsx` so the decision is not silently re-litigated.
19. [W3C ARIA APG: Menu and Menu Button patterns](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) and [Inclusive Components: Menus & Menu Buttons](https://inclusive-components.design/menus-menu-buttons/) — adopted 2026-08-05 **as the reason not to use `role="menu"`**. A true menu brings roving tabindex, arrow-key navigation and Tab-exits-the-menu; that is a desktop application-menu contract, and Inclusive Components' argument is that a list of actions and links should stay plain buttons and links. The mobile "context menu" is therefore `ActionSheet`: a dialog of controls, with `aria-haspopup="dialog"` on the trigger.

20. [W3C ARIA APG: Alert pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alert/) — adopted 2026-08-05. `role="alert"` is assertive and interrupts whatever a screen reader is currently saying, so it is for urgent information only; an alert must never take focus (use Alert Dialog if the workflow really must stop); an alert already in the DOM at page load is *not* announced, only a dynamically rendered one; and — the sentence this slice is built around — **"avoid designing alerts that disappear automatically"**, because doing so works against SC 2.2.3, while over-using the role works against SC 2.2.4. Implemented by `components/feedback/toastContext.js` (`toastIsAssertive`, `toastPersists`) and `InlineMessage.jsx`.
21. [W3C: Understanding Timing Adjustable, SC 2.2.1](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html) — adopted 2026-08-05. A time limit set by content must be turn-off-able, adjustable or extendable, with narrow exceptions (real-time, essential, over 20 hours). Its own worked example is what makes auto-dismissal defensible at all: a new-mail notice may vanish **because the inbox still holds the mail** — "users are able to identify the arrival of email through other means … so the disappearance of the message does not set a time limit on their ability". The converse is the rule this app enforces: where the vanishing surface is the *only* copy, or carries the only affordance to act, it may not vanish.
22. [MDN: `navigator.onLine`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine) — adopted 2026-08-05. The property is "inherently unreliable": each browser and OS decides it by a different heuristic, a machine on a LAN with no upstream link still reports `true`, and a firewall or VPN can make a connected machine report `false`. `false` is the more trustworthy direction. MDN's guidance is to "only provide hints when the user may seem offline" and never to disable functionality on it — which is why `useOnlineStatus` is deliberately asymmetric and the recovery affordance is a retry the user chooses rather than a refetch fired on their behalf.

23. [W3C: Understanding Consistent Navigation, SC 3.2.3](https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation.html) — adopted 2026-08-07. "Navigational mechanisms that are repeated on multiple web pages within a set of web pages occur in the same relative order each time they are repeated, unless a change is initiated by the user," where *same relative order* means "same position relative to other items" and items stay in the same relative order "even if other items are inserted or removed". This is what decides two things about the tab bar: audience-specific tab sets are **fine** (a viewer's audience does not change from page to page, so their bar is the same bar everywhere), while reordering by recency, badge count or usage would **not** be — none of those is a change the user initiated. `mobileNav.js` therefore never sorts, and `mobileNav.test.js` asserts that raising a badge leaves the order untouched.
24. [MDN: `aria-current`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-current) — adopted 2026-08-07. `page` is the value for the current page within a set of pages; the cardinal rule is to "only mark one element in a set of elements as current". `resolveActiveTabKey` returns one key **or null**, so the bar can put `aria-current="page"` on at most one tab, and puts it on none when the URL belongs to no tab — which is most of the app's detail screens. The old bar took the current tab as a prop and every caller passed the constant `"dashboard"`, so it claimed the dashboard was current everywhere it appeared.
25. [Android Developers: Navigation bar (Compose)](https://developer.android.com/develop/ui/compose/components/navigation-bar) — consulted 2026-08-07. A navigation bar is for "three to five destinations of equal importance", at compact window sizes, with destinations consistent across screens. The chosen four-tab sets sit inside that range, and "consistent across app screens" is the same property SC 3.2.3 requires. Labels are optional in Material's API; this app requires them (§8.2), because an unlabelled glyph is a guess.
26. [Cloudinary: Programmatically Uploading Images, Videos, and Other Files](https://cloudinary.com/documentation/upload_images#chunked_asset_upload) — adopted 2026-08-13 for D24. Manual large uploads keep one `X-Unique-Upload-Id`, send exact `Content-Range` byte bounds, require every non-final part to exceed 5 MB, return `done: false` for intermediate parts, and return the full asset with `done: true` only after the final part. This is why Ckript uses 6 MiB parts, accepts them sequentially, and never attaches an intermediate response.
27. [Cloudinary: Client-side uploading](https://cloudinary.com/documentation/client_side_uploading#chunked_asset_upload_from_the_client_side) and its [official React chunked-upload example](https://github.com/cloudinary-devs/react-chunked-upload/blob/main/src/Chunked.tsx) — adopted 2026-08-13 for D24. Browser-side slicing and ranged requests are supported, while signed upload secrets must stay on the server. Ckript therefore computes checksums/slices in the client but proxies bounded parts through its authenticated API, where script ownership, plan access and authoritative accepted ranges remain enforceable.
28. [Android Developers: Search bar (Jetpack Compose)](https://developer.android.com/develop/ui/compose/components/search-bar) and [Apple: Search](https://developer.apple.com/documentation/swiftui/search) — adopted 2026-08-13 for D25. Search is the primary task on its own destination, so the field remains persistently visible, scopes narrow the same result collection, and results update under the field. Ckript keeps the app bar as navigation and gives `/search` its own labelled search field rather than turning the fixed app-bar link into an input.
29. [React Native: FlatList](https://reactnative.dev/docs/flatlist.html) and [React Native: Accessibility](https://reactnative.dev/docs/accessibility) — re-checked 2026-08-13 for D25. Long result collections need stable item keys, incremental rendering/paging, and a polite announcement when counts change. The web implementation uses semantic lists plus the existing `LoadMore` status contract; it does not imitate native infinite scroll when an explicit request is more predictable and accessible.
30. [Android Developers: Filter chips](https://developer.android.com/develop/ui/compose/quick-guides/content/create-chip) — adopted 2026-08-13 for D25. A filter chip refines an existing collection and visibly carries selected state. Ckript uses chips for active removable facets, but moves the complete multi-facet task into a full-screen Dialog so nineteen genres and the virtual keyboard do not compete inside a short sheet.
31. [React Router: Ranked Route Matching](https://reactrouter.com/docs/en/v6/start/overview#ranked-route-matching) — adopted 2026-08-13 for D25. Static segments outrank dynamic segments. Ckript still declares the two-segment project catch-all last and pins collisions in tests: `/share/project/:id` remains public, `/script/:id` and `/script/:heading/:writer` remain authenticated aliases, and both aliases normalize to the canonical `/:heading/:writer` URL returned by the server.
32. [MDN: Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API) — adopted 2026-08-13 for D25. Native sharing requires a direct user activation and is not universally available, so mobile uses `navigator.share()` from the pressed control, distinguishes user dismissal from failure, and retains a clipboard fallback. Project shares target the public `/share/project/:id` route, never an authenticated canonical detail URL.
33. [Razorpay: Standard Checkout integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/) and [Razorpay: payment-signature verification](https://razorpay.com/docs/payments/payment-gateway/quick-integration/integration-steps/#14-verify-payment-signature) — adopted 2026-08-13 for the Phase 4 payment boundary. Checkout is an external overlay; fulfilment occurs only after server-side signature/order verification. A later mobile payment port must reconcile authoritative order/purchase state after foreground/reload because the browser handler may never run if the buyer closes the tab after paying.

For every future implementation session, verify that the consulted guidance is still current and record newly adopted sources in the decision log.

> **Honest note on two sources that could not be fetched (2026-08-07):** Material 3's `m3.material.io/components/navigation-bar/guidelines` and Apple's `developer.apple.com/design/human-interface-guidelines/tab-bars` both render their text through client-side script and returned an empty document. They are **not** cited above, because citing a page whose content was never actually read is how a plan acquires confident claims nobody verified. The Android Compose page (source 25) is the server-rendered equivalent that was genuinely read. A future session with a real browser should read the two originals and add them.

---

## 18. Definition of complete

A mobile page is `COMPLETE` only when all applicable statements are true:

- [ ] A distinct mobile JSX component and co-located page CSS file exist.
- [ ] Its route, dynamic parameters, query strings, auth rules, role rules, and direct refresh work.
- [ ] Its unique page prefix is registered and all styles remain scoped below `.ckm`.
- [ ] Desktop functional parity inventory is fully checked or an approved product difference is documented.
- [ ] Real shared services/data replace production mock data.
- [ ] Loading, empty, error, retry, permission, plan/quota, long-content, and destructive states are handled.
- [ ] All child overlays and destination actions have mobile implementations.
- [ ] Browser back/forward, in-app back, focus restoration, and unsaved-change behavior work.
- [ ] No horizontal page scroll or overlap occurs at any required width.
- [ ] Safe areas and the virtual keyboard do not obscure content or actions.
- [ ] Touch targets, pressed states, focus states, semantics, labels, contrast, text zoom, and reduced motion pass.
- [ ] Relevant automated tests pass.
- [ ] Manual browser/device verification evidence is recorded.
- [ ] Production build impact and performance are acceptable.
- [ ] No `desktopOnly()` or migration fallback remains in that page family.
- [ ] Section 19 contains the completion date, files, tests, decisions, remaining follow-ups, and next action.

The entire project is complete only when every ledger row has a final disposition, every non-approved fallback is removed, all route/component coverage tests pass, and Phase 10 is signed off.

---

## 19. Live implementation ledger and decision log

This is the section future agents update continuously. Keep newest session entries at the top. Do not delete history; correct an error with a later note.

### 19.1 Current checkpoint

```yaml
plan_status: IN_PROGRESS
checkpoint_update_2026_08_23_industry_variants: "COMPLETE (D54; PHASE 7 BULLET 3 COMPLETE). Search, Featured, Messages, and Profile already had audience-complete native presentations, so D54 expanded policy coverage rather than forking them. The shared save control and owner Saved collection now identify their authoritative source: writer/reader/actor accounts use favorite scripts, while all five film-professional roles use the industry watchlist; discovery, project, profile, desktop, and native actions read/write/update that same source. Professional profile purchase history uses the shared five-role predicate. Watchlist reads/writes are role-gated before database work, validate ids, apply positive projections and caps, reject unavailable projects, compare ObjectIds correctly, and return authoritative idempotent saved state. Actor discovery chrome no longer exposes mandates/watchlist, the actor dashboard no longer starts finance/deal/watchlist requests or uses mandate language, and non-writer profiles no longer expose Collaboration requests. Evidence: 216/216 final focused client tests, 511/511 server tests in 95 suites, clean touched-file client/server ESLint, full client 2,149/2,154 with exactly the five recorded unrelated failures (four stale AppShell expectations and DataTable CSV header), and a 4,200-module production build with 53/53 routes prerendered/verified. No fresh browser, physical-device, or screen-reader result is claimed because this environment still lacks the prescribed agent-browser CLI and Chrome/Edge."
checkpoint_update_2026_08_23_industry_offers_ledger: "COMPLETE (D53C; PHASE 7 BULLET 2 COMPLETE). The already-native `/offer-holds` screen now owns confirmed holder release with durable pending/failure state over `offerHolds.js`, the same mutation used by the desktop producer ledger. The legacy unaudited `POST /scripts/hold` payment bypass is removed. Hold checkout now admits the shared five-role industry vocabulary and verifies a timing-safe callback signature plus the fetched order/payment's exact owner, project, purpose, INR price, amount, currency, paid state, and captured state before any option, wallet, transaction, ledger, invoice, or notification mutation; provider ids are unique and callback replay is idempotent. Holder reads are role-gated, projected, and capped; release is keyed to the holder's active unexpired option and clears only that holder's project lock. The desktop ledger now reuses the D29 contact boundary without duplicating revealed contacts. Producer-rating list/delete validate ids and cap pages. Owner transaction responses are a positive display projection that withholds bank/provider/admin/metadata internals and preserves the actual charged currency; desktop/mobile Finance states no longer call a failed wallet zero or a failed transaction list empty. Evidence: 70/70 focused client tests, 505/505 server tests in 94 suites, clean touched-file ESLint, full client 2,118/2,123 with exactly the five recorded unrelated failures (four stale AppShell expectations and DataTable CSV header), and a 4,200-module production build with 53/53 routes prerendered/verified. Existing five-width evidence covers the holds list, shared confirmation primitive, project actions, and D52/D53 workspace screens. A fresh combined browser pass was attempted, but this environment has neither the prescribed agent-browser CLI nor a Chrome/Edge binary, so no new browser, physical-device, screen-reader, or real Razorpay result is claimed."
checkpoint_update_2026_08_22_hall_of_fame: "COMPLETE (D51; PHASE 6 COMPLETE). `/hall-of-fame` and `/hall-of-fame/:slug` are native public SCREEN routes over one shared desktop/native archive contract. The list owns year, competition, and page in the canonical URL; the server applies typed filters, stable paging, projections, and archive facets rather than returning an unbounded collection. Permanent records distinguish missing from retryable service failure, expose result/stats/story context, safe laureate profiles, published featured scripts with bounded continuation, judges and partners, share/copy, privacy copy, and dynamic title/description metadata. The challenge hub now requests a six-record preview and links Hall entries to their permanent record instead of the generic challenge detail. DEF-86 through DEF-89 are fixed. Evidence: 41/41 focused client tests, all 483 server tests in 88 suites, touched-file ESLint, a 4,183-module production build with 53/53 routes prerendered, and a 45-measurement Chromium sweep across nine public/member/loading/empty/error/detail/not-found states and five widths with zero overflow, undersized-target, unnamed-control, small-text, heading, shell, marker, or frame-width findings. Full client is 2,086/2,092 with the exact six recorded deterministic baseline failures. No real-device, screen-reader, or OS share-sheet pass was performed, so none is claimed."
checkpoint_update_2026_08_22_industry_workspace: "COMPLETE (D52). Industry `/home` and the industry audience at `/dashboard` are native SCREEN routes over shared desktop/native loaders. Home owns shelf/sort in the URL, keeps profile failure degradable, falls back to a bounded latest-project shelf, and opens canonical projects/bookmarks. Dashboard owns Overview/Deals/Matches/Finance/Market in the URL and isolates five bounded data legs so useful sections survive partial failure; actors receive a discovery-only Casting desk without Deals or Finance, and industry roles never receive the writer dashboard. Recommendation, watchlist, and purchase-request reads now apply explicit projections and bounds. Evidence: 106/106 focused client tests, all 484 server tests in 88 suites, touched-file ESLint, a 4,192-module production build with 53/53 routes prerendered, the exact six-failure full-client baseline at 2,100/2,106, and a 50/50 Chromium sweep across ten states and five widths with zero findings. No real-device or screen-reader pass was performed, so neither is claimed."
checkpoint_update_2026_08_22_writer_roster: "COMPLETE (D53A; D53 CONTINUES). `/writers` is a native industry SCREEN over one abort-safe desktop/native roster loader. Search, sort, genre and mandate facets remain canonical URL state; a failed optional mandate degrades without hiding the roster; compact cards expose only allowlisted identity/profile signals and canonical profile links. The server roster pipeline now starts and ends with positive projections and escapes search text before Mongo regex use, fixing the private account/session over-fetch and malformed-pattern 500. The retired personal-email restriction and its stale desktop test are removed rather than revived. Evidence: 167/167 focused client tests, all 486 server tests in 88 suites, touched-file ESLint, and a 4,195-module build with 53/53 prerendered routes. Browser five-width, real-device, and screen-reader passes remain open for the combined D53 family."
checkpoint_update_2026_08_22_challenge_dashboard: "COMPLETE (D50). `/challenge/dashboard?c=:slug` is now a native authenticated SCREEN with URL-owned Home, Event, Prizes, Community, Resources, and Studio tabs over one shared desktop/native `challengeDashboard.js` plus `useChallengeDashboard.js` state machine. It covers prestart, writing, submitted, judging, and results standings; opens the existing native competition editor rather than duplicating its irreversible submission flow; and renders Event ID, countdown/timeline/theme, AI materials/evaluation, results, winner/rewards/achievements/certificate, rules/resources, paged participants, follow actions, and paged referral history/progress. `GET /:id/me?view=dashboard` now projects and shapes only operational participant fields, while participant/referral endpoints are bounded and relationship lookups apply only to the requested page. DEF-81 through DEF-85 are fixed. Evidence: 37/37 final focused client tests after the last state-scope patch, all 478 server tests in 87 suites, touched-file ESLint, a 4,179-module production build with 53/53 routes prerendered, and a 70-measurement Chromium sweep across 14 states and five widths with zero overflow, undersized-target, unnamed-control, small-text, heading, shell, marker, or frame-width findings. The serial full client run is 2,075/2,081 after the isolated ProfileOwnerMobile timeout passed 2/2, leaving the exact six recorded deterministic baseline failures. No live editor submission, real certificate/PDF download, physical-device, or screen-reader pass was performed, so none is claimed."
checkpoint_update_2026_08_22_challenge_registration: "COMPLETE (D49). `/challenge/register?c=:slug` is now a native authenticated FLOW screen, and desktop/native share `challengeRegistration.js` plus `useChallengeRegistration.js` for form/legal validation, free admission, Razorpay checkout, persisted callback recovery, server reconciliation, invoice download, and third-party claim state. The server now treats paid as the backwards-compatible default and allows direct registration only for explicitly free challenges; admins can select free/paid and configure INR/USD prices. One server-side intent per competition/writer persists the legal answers and authoritative order, reuses it across checkout attempts, validates exact paid order/currency/amount/notes plus captured payment, and reconciles a lost callback without another charge. Third-party claims now require writer access and cannot race an active Ckript order. DEF-76 through DEF-80 are fixed. Evidence: 118/118 focused client tests, all 472 server tests in 85 suites, touched client/server ESLint, a 4,173-module production build with 53/53 routes prerendered, and a 65-measurement Chromium sweep across 13 states and five widths with zero overflow, undersized-target, unnamed-control, small-text, heading, shell, marker, or frame-width findings. Full client is 2,061/2,067 with the exact six recorded deterministic baseline failures. No real Razorpay charge, webhook delivery, real-device, or screen-reader pass was performed, so none is claimed."
checkpoint_update_2026_08_22_challenge_detail: "COMPLETE (D48). `/challenge/c/:slug` is now a native public/authenticated DETAIL screen over `challengeDetail.js` plus `useChallengeDetail.js`, the same cancellable public/owner-summary boundary now used by desktop. It renders phase/countdown, authoritative participation, entry-aware action, theme, results, overview, eligibility, timeline, prizes, judges, partners, rules, FAQ, resources, retry/not-found, and direct-link hidden/private records without pulling registration or dashboard mutations into the slice. `/:id/me?view=summary` selects and shapes only the owner card fields and omits referral work; full dashboard callers retain the existing complete contract. DEF-73 through DEF-75 are fixed: detail no longer downloads the full entry merely to show Event ID, private completed links no longer hand off to an endpoint that excludes them, and active detail derives participant counts instead of rendering a nonexistent schema field as zero. Evidence: 120/120 focused client tests in 9 files, all 453 server tests in 82 suites, touched-file ESLint, a 4,167-module production build with 53/53 routes prerendered, and a 45-measurement Chromium sweep across nine states and five widths with zero overflow, undersized-target, unnamed-control, small-text, heading, shell, marker, or frame-width findings. Full client is 2,040/2,046 with the exact six recorded deterministic baseline failures. No real-device or screen-reader pass was performed, so neither is claimed."
checkpoint_update_2026_08_22_challenge_hub: "COMPLETE (D47). `/challenge` is now one native public/authenticated SCREEN with URL-owned Live, Previous, Hall of Fame, and My Challenges tabs, public-versus-member chrome, and independently retryable public/private loading. Desktop and native share `challengeHub.js` plus `useChallengeHub.js`; Mine list responses now use an explicit owner-only summary projection instead of sending screenplay bodies, registration answers, payment references, AI evaluation, or script ids. Evidence: 113/113 focused client tests in 9 files, all 451 server tests in 82 suites, touched-file ESLint, a 4,162-module production build with 53/53 routes prerendered, and a 45-measurement Chromium sweep across nine states and five widths with zero overflow, undersized-target, unnamed-control, small-text, heading, tab-panel, shell, state-marker, or frame-width findings. The full client run was 2,018/2,025: the exact six recorded deterministic baseline failures plus one checkout timeout that passed 11/11 alone. No real-device or screen-reader pass was performed, so neither is claimed."
checkpoint_update_2026_08_22_account_credentials: "COMPLETE (D45). `/profile?tab=settings` now includes writer-only payout and guild-credential sections. `pages/profile/accountCredentials.js` is the desktop/native boundary for payout validation/load/submit and WGA/SWA proof validation/upload/access; `BankDetails`, `EditProfileModal`, and writer onboarding use it instead of retaining private endpoint copies. Payout UI distinguishes the active masked account from a pending/rejected replacement, renders lock and admin-note states, and always requires the complete account number for a change. Writer bank data is refused by the general profile mutation and server validation prevents unsupported values from becoming Mongoose 500s. Proof storage identifiers are redacted from owner/onboarding/current-user responses; new proofs use Cloudinary authenticated delivery and writer/admin access endpoints return no-store, expiring URLs for images and PDFs. DEF-65 through DEF-69 are fixed. Evidence: 140/140 expanded profile/settings contract, route, policy, and render tests in 18 files, all 438 server tests in 78 suites, clean lint on touched files except the exact unchanged AdminDashboard/adminController baseline, production build (4,154 modules), and all 53 prerendered routes. Full client is 1,988/1,994 with the exact recorded six failures: four stale AppShell expectations, WriterRoster's old gate expectation, and the DataTable CSV header expectation. No deterministic five-width, real-device, screen-reader, or real Cloudinary-asset pass was added, so none is claimed. General-profile activity/saved lists remain separate."
checkpoint_update_2026_08_22_profile_collections: "COMPLETE (D46; PHASE 5 COMPLETE). `GET /users/:id/profile-collections` is the one bounded general-profile collection boundary: 12-item public Activity pages and owner-only Saved pages, with shared block/private/deactivated/business-email access, allowlisted project fields, numeric post reaction counts, and no raw liker/commenter/saver or saved-project ids. `profileCollections.js` plus `useProfileCollections.js` are shared by desktop and native; section/page are canonical query state, requests cancel on identity/page changes, and saved removal updates the authoritative server collection. The base profile endpoint no longer queries or returns posts, saved Script documents, or raw general/reader/deal-watchlist ids. Native owner/visitor and desktop render loading, retryable error, empty, media, removal, and page states. Evidence: 172/172 focused profile/mobile tests in 27 files; all 449 server tests in 81 suites; touched client/server ESLint; production build with 4,158 modules and all 53 prerender routes. Full client is 2,001/2,007 with the exact recorded six failures: four stale AppShell expectations, WriterRoster's old gate expectation, and DataTable's CSV header expectation. No deterministic five-width, real-device, or screen-reader pass was added, so none is claimed."
checkpoint_update_2026_08_22_collaboration_invites_activity: "COMPLETE (D44). `/collaborations` now owns four URL states: Incoming, Sent, Invites, and Activity. Recipient invitations are matched to a writer by exact user id or normalized account email, retain expired rows with a plain refresh instruction, expose their single-use token only through the recipient-authorized inbox, and accept through an explicit POST. Account-backed and email-only owner actions now share the embedded collaborator-row identity, so pending email invitations can be changed, cancelled, and refreshed; refresh converts a newly registered email recipient to its writer account, replaces stale notifications, and issues a fresh 72-hour token. Cross-project activity is paged over only owned or accepted projects and retains D43's metadata allowlist. In-app invite notifications open the native Invites queue; emailed links keep the direct acceptance route. The shared invite modal no longer hides success behind a 700 ms auto-close. Evidence: 204 focused client tests in 7 files; all 431 server tests in 76 suites; touched client/server ESLint; production build (4,152 modules); all 53 prerendered routes. Full client is 1,977/1,983 with the exact recorded six failures: four stale AppShell expectations, WriterRoster's old gate expectation, and the DataTable CSV header expectation. No deterministic five-width, real-device, screen-reader, real socket-pair, or physical-keyboard pass was added, so none is claimed."
checkpoint_update_2026_08_21_collaboration_requests: "COMPLETE (D43). `/collaborations` is now a writer-only native SCREEN with URL-owned Incoming/Sent tabs, bounded paging, loading/retry/empty states, current role assignment, owner accept/decline actions, socket refresh, and an owner-profile entry. Desktop and mobile share `components/collab/collaborationRequests.js`; the desktop inbox, public request widget, and activity component were migrated onto it, deleting localStorage guesses and the widget's four-second full-project poll. The server now supplies a dedicated exact-user status endpoint plus paged incoming/outgoing/script/activity responses, projects requester identity without email, sanitizes activity metadata, and admits only writer/creator requesters. Current request roles include Commenter and exclude the retired Merger workflow; historic Merger requests default to least-privilege Commenter unless the owner explicitly chooses another current role. Owner request notifications target `/collaborations`; in-app invites now carry their recipient-only token to `/invite/:token`, refreshed invites issue a fresh action, and accepted invite notifications are consumed. MainLayout now shares the same notification target function as AppShell instead of retaining its drifted copy. Evidence: 103 focused client tests; all 426 server tests in 75 suites; touched client/server ESLint; production build (4,152 modules); all 53 prerendered routes. Full client is 1,971/1,978 with the exact recorded seven failures: four stale AppShell expectations, WriterRoster's old gate expectation, DataTable CSV header expectation, and finance session timeout. No deterministic five-width, real-device, screen-reader, socket-pair, or physical-keyboard pass was added, so none is claimed. Banking/guild-proof remains separate."
checkpoint_update_2026_08_21_reader_profile: "COMPLETE (D42). `/reader/profile/:id?` is now a reader-only native SCREEN for both the optional own route and direct visitor ids. Desktop and mobile share `pages/reader-profile/readerProfile.js` plus `useReaderProfile.js`: one cancellable load, authoritative own/visitor identity, follow/request/cancel/unfollow, URL-owned `tab` and `page`, normalized counts, and durable access failures. `GET /users/reader-profile/:id` is the privacy and paging boundary: it accepts only reader targets, checks deactivation/block/private access before activity queries, never sends raw `scriptsRead`/`favoriteScripts` arrays, exposes paged published read/favorite projects only to the owner, and exposes reviews only after profile access succeeds. The native page reuses `OwnerProfileEditor`, routes project activity through `/reader/script/:id`, and renders private collections as private rather than falsely empty. DEF-54 is fixed: the desktop page no longer repeats `/users/:id` and makes up to 20 per-project requests with silent partial failures; one bounded server page serves both presentations. DEF-55 is fixed: `/reader/profile/:ownId` no longer becomes a visitor merely because an id is present; the server is authoritative about ownership. Evidence: 70 focused client tests, all 421 server tests in 73 suites, touched-file ESLint, production build (4,147 modules), and all 53 prerendered routes passed. No deterministic five-width, real-device, screen-reader, or physical-keyboard run was added, so none is claimed. Banking and guild-proof review remain separate."
checkpoint_update_2026_08_21_message_meetings: "COMPLETE (D41). Native message threads now expose one conversation-details sheet with profile, every linked project, admin-trailer state, and shared files; active FIP members talking to a writer can request a meeting about the most recently referenced project. Project detail and messages use the same native `MeetingSheet`, and both call the existing `projectActions.js` meeting/calendar contract; no `MeetingModal` copy was introduced. Message-origin Google consent returns to the same URL and restores the draft from session storage when available. Desktop and mobile derive deal context through `messageContract.js`, and desktop's meeting launcher now recognizes every active FIP role rather than only legacy investors. DEF-52 is fixed: `/meetings` now proves the target has a writer role, owns the named script, and that the project is public or already unlocked/purchased by the requester before creating a Google event. DEF-53 is fixed: unsupported duration, past/invalid instant, and overlong title/note requests fail before side effects. Evidence: 34 focused client tests, all 413 server tests in 71 suites, touched-file ESLint, production build (4,143 modules), and all 53 prerendered routes passed. Repository-wide client lint remains its pre-existing 176-error baseline. No deterministic five-width, real-device, real OAuth, real Calendar event, or physical-keyboard run was added, so none is claimed."
checkpoint_update_2026_08_21_message_mutations: "COMPLETE (D40). Native `/messages` now sends attachment-only or mixed messages with selection, exact byte progress, failed-upload retry/removal, and retained ready state after a failed send; every persisted message offers touch-sized reactions and own messages require the shared destructive confirmation before deletion. `messageContract.js` is the one desktop/mobile upload/reaction/delete boundary. DEF-49 is fixed: `/messages/upload` now authorizes the intended recipient before multipart parsing and non-admin callers cannot use it as generic storage. DEF-50 is fixed: an uploaded URL is bound to its authenticated owner and recipient by a one-hour server grant, so `/messages/send` no longer trusts arbitrary client attachment URLs or file types. DEF-51 is fixed: reaction and deletion socket events originate after the server save, replacing the dead client deletion relay; deletion also clears attachment metadata and reactions. SVG/unsupported files and unsupported reaction values are refused on both boundaries. Evidence: 16 focused client tests, all 407 server tests in 70 suites, messaging/server ESLint, production build (4,140 modules), and all 53 prerendered routes passed. Full client: 1,953/1,959 with exactly the six deterministic recorded failures (four stale AppShell expectations, WriterRoster's old gate expectation, and the unrelated DataTable CSV expectation); the prior finance concurrency timeout did not recur in the sequential run. `AdminDashboard.jsx`, touched only to carry receiver/grant fields, retains its recorded four unrelated lint errors and five warnings. No deterministic five-width, real-device, real Cloudinary upload, real two-client socket, or physical-keyboard run was added, so none is claimed."
checkpoint_update_2026_08_21_follow_requests: "COMPLETE (D38). `/follow-requests` is now a native authenticated SCREEN and the owner workspace links to it with the authoritative pending count. `authenticatedProfile.js` plus `useIncomingFollowRequests` are the one list/accept/reject boundary used by the desktop page and native route; both notification shells use the same decision operation instead of retaining private endpoint copies. The native queue has loading, retryable failure, empty, profile-target, pending-action, accept, and reject states. DEF-43 is fixed: malformed requester ids now answer 400 before a Mongo lookup/mutation instead of reaching CastError/500 paths. DEF-44 is fixed: acceptance now consumes the original request notification server-side, matching rejection and preventing a stale bell action. DEF-45 is fixed: the shared notification hook no longer resets persisted seen-toast ids to an empty Set immediately before its first poll, so a refresh does not replay acknowledged notifications. Evidence: 153 focused client tests, all 399 server tests in 69 suites, touched-file ESLint, production build (4,135 modules), and all 53 prerendered routes passed. No deterministic five-width, real-device, socket, or physical-keyboard run was added, so those checks remain explicitly unclaimed."
checkpoint_update_2026_08_21_messages: "COMPLETE (D39). `/messages` is now a native authenticated SCREEN with a URL-backed inbox/detail state machine, pending-recipient deep links, search, real unread badges, text sending, attachment display, loading/retry/empty/error states, a keyboard-aware composer, authenticated sockets and visible-tab polling fallback. `features/messages-operator/messageContract.js` is the shared desktop/mobile list/load/read/send boundary. DEF-46 is fixed: inbox grouping now occurs before its 50-thread limit and returns actual per-chat unread totals instead of hard-coded zero. DEF-47 is fixed: reactions require the caller to be a message participant and malformed ids answer 400. DEF-48 is fixed: live `receive-message` events now originate from the persisted server document, not an arbitrary participant-supplied socket payload. Evidence: 131 focused client tests, all 402 server tests in 70 suites, touched-file ESLint, production build (4,140 modules), and all 53 prerendered routes passed. The full client run is 1,947/1,954: four recorded stale AppShell expectations, the recorded WriterRoster gate expectation, one unrelated DataTable CSV expectation that fails alone, and one finance concurrency timeout that passes alone (10/10). No deterministic five-width, real-device, real socket pair, attachment upload, or physical-keyboard run was added, so none is claimed."
checkpoint_update_2026_08_21_account_security: "COMPLETE (D37). `/profile?tab=settings` is now a native owner-only account surface, and the manifest's last query exclusion is gone. `pages/profile/accountSecurity.js` is the shared desktop/mobile boundary for preferences, verification and email change, password change, active-session management, unblock, Google Calendar, and account deletion; the native screen adds complete loading/error/empty states plus confirmations for remote-session, all-other-session, and account deletion actions. The port also fixed DEF-40 (the own-profile response exposed credentials, sessions, OAuth/payment references, and deletion archives), DEF-41 (password changes left every other authenticated session alive), and DEF-42 (the remote-session endpoint could delete the current session instead of reserving that action for logout). Evidence: 121 focused client tests, all 396 server tests, touched-file ESLint, production build (4,131 modules), and all 53 prerendered routes passed. No deterministic five-width, real-device, OAuth round-trip, or physical-keyboard run was added, so those checks remain explicitly unclaimed. Banking and guild-proof review remain a separate credential/finance slice rather than being hidden in settings."
checkpoint_update_2026_08_21_profile_owner: "COMPLETE (D36). The account owner now receives one native workspace/editor at `/profile`, own id/username paths, and signed-in share links. `profileEditor.js` is the shared identity/professional form, validation, username, image-upload and save boundary used by the native editor and the desktop modal; the native route presents authoritative completion, badges, projects and own collection totals without duplicating server mutations. `/profile?tab=settings` remains an explicit desktop boundary for email, password, sessions, deletion, banking and guild proof. Two live defects are fixed on both presentations: DEF-38 (an empty photo value could never clear the stored image) and DEF-39 (professional editing was limited to the exact legacy `investor` role). Evidence: 107 focused client tests, all 393 server tests, touched-file ESLint, production build (4,127 modules), and all 53 prerendered routes passed. No deterministic five-width/keyboard harness was added, so visual and physical-keyboard QA remain explicitly unclaimed."
checkpoint_update_2026_08_21_profile_visitor: "COMPLETE (D35). Authenticated visitors now receive one native profile across `/profile/:id`, signed-in `/share/profile/:id`, and canonical `/:id`; route policy keeps every own-id/username form on the desktop workspace until editing/settings are ported. Desktop and mobile share `authenticatedProfile.js` plus `useAuthenticatedProfile` for cancellable loading, canonicalization, follow/request/cancel/unfollow, message, block, contact reveal and pitch. The server now projects visitor users and projects through explicit allowlists: account/session/payment/reset/OAuth/contact fields and screenplay/PDF bodies cannot leave `GET /users/:id`. Four adjacent live defects are fixed: private username follow used a non-ObjectId, desktop posted to a nonexistent message endpoint, the message controller recognized only the legacy investor role, and the message-slot endpoint lacked target-role/entitlement checks. Evidence: 92 focused client tests, all 389 server tests, touched-file ESLint, controller import checks, production build (4,122 modules), and 53 prerendered routes passed. Full-client lint remains a pre-existing 175-error baseline; no deterministic five-width visual harness was added, so viewport/keyboard QA is explicitly unclaimed."
checkpoint_update_2026_08_21_reader_security: "COMPLETE (D32). `/reader/script/:id` is a native SCREEN for reader accounts without a second presentation fork: it mounts `ProjectDetailMobile` with reader-specific back navigation and canonicalization disabled, so the reader URL remains stable while using the same detail/actions/reader contract. DEF-27 is FIXED. `utils/scriptReadAccess.js` is now the one full-screenplay predicate used by both the detail payload and stored-PDF proxy; marketplace visibility, business email, plan and preview flags cannot grant it. Preview mode resolves through pure `projectReaderSource.js` and can produce only projected page text/excerpt, never a PDF URL; full-access mode may use the authenticated PDF proxy. This intentionally trades uploaded-PDF typesetting for authorization correctness in unpaid previews. Evidence: 92 focused client tests, all 377 server tests, touched-file ESLint, production build (4,113 modules), and 53 prerendered routes passed. No CSS changed; the promoted route mounts the exact D28/D29 component already swept at five widths and the source decision is pinned as pure data tests."
checkpoint_update_2026_08_21_public_profile: "COMPLETE (D33/D34). The Phase 5 profile gate audited all four route families before selecting the signed-out share route. `/share/profile/:id` is now a native SHARED_PUBLIC_SCREEN only when no account is signed in; authenticated viewers deliberately retain `Profile` until its follow/message/edit workspace is ported. Desktop and mobile share `usePublicProfile`; mobile adds a defensive view model for identity, counts, professional facts, safe public links, and published-project summaries, all over `GET /users/public/:id`'s sanitized projection. The loader cancels obsolete requests, never exposes the previous profile during an id change, distinguishes private/not-found/failure, and supports retry. Evidence: 69 focused route/model/render/loader/CSS tests, touched-file ESLint, production build, and all 53 prerendered routes passed. No deterministic five-width harness was added; visual viewport QA remains explicitly unclaimed."
checkpoint_update_2026_08_20_public_project: "COMPLETE (D31). `/share/project/:id` is the first native SHARED_PUBLIC_SCREEN in the project family. The server contract was audited before JSX: `getPublicScriptById` projects teaser metadata and does not expose screenplay bodies, private PDF URLs, or creator email/phone. Mobile therefore uses a dedicated `usePublicProject` loader and `publicProjectModel` rather than calling the authenticated `getViewerCapabilities` defaults. The phone presents cover, story facts, classification, evaluation, roles, synopsis, trailer, writer profile link, and an explicit sign-in continuation, with loading, unavailable and retry surfaces. Evidence: focused route/model/coverage/CSS suite 62/62, touched-file ESLint clean, production build plus 53-route prerender verification passed. A deterministic five-width visual harness was not added in this slice; the live public route remains the visual QA target."
checkpoint_update_2026_08_20_checkout: "COMPLETE (D30). `/script/:id/pay` is a native SCREEN, and the contract behind it is SHARED: `pages/script-detail/checkout.js` (pricing in the server's own order, the nine-way standing, the acceptances, the gateway loader, three requests, two PDFs and the pending-charge record) and `pages/script-detail/useProjectCheckout.js` (the state around them) are called by the native screen AND by `ScriptPaymentPage.jsx`, which went from 659 lines to 384 and is now presentation only. The phone shows what it will cost before it asks for anything, states the 72-hour payment window the server has always enforced and never mentioned, keeps every control live (pressing pay with an unticked box is how a buyer learns which box), and gives each of the nine standings a sentence and a way forward. Two defects the port found, both FIXED: DEF-31 (the page never sent `currency`, so the server resolved one from the account and a USD buyer was promised rupees and charged dollars) and DEF-32 (a payment the gateway took but whose verification never landed was unrecoverable — the signature exists only in the client callback — so it is now written to storage BEFORE the verify and retried automatically on the next visit). Two desktop behaviours deliberately removed: the `window.confirm` invoice prompt and the silent auto-download of the acceptance PDF. Evidence: 76 new tests in 5 files (mobile + script-detail + payment suites 1067 in 70 files, from 990 in 65), and a five-width CDP sweep over ten fixture standings at 0 findings — after two instrument failures (a cold Vite chunk measured as an empty screen, an unloaded icon font measured as a 45px overflow) that this ledger had already predicted."
checkpoint_update_2026_08_20_project_actions: "COMPLETE (D29). The project-detail WRITE half is native and, more importantly, is SHARED: `pages/script-detail/projectActions.js` (nine endpoints, one refusal envelope) and `pages/script-detail/useProjectActions.js` (the state around them) are called by the native screen AND by `ScriptDetail.jsx`, which lost 262 lines of private handlers to them. The phone now requests a purchase, approves or declines one, writes a reader review, leaves or replaces a producer rating, reveals a writer contact, opens a conversation, asks for a meeting (including the Google Calendar connect leg), and lets an owner edit or delete. D28's rule survived the arrival of buttons by inverting: every action NOT offered states its reason in words — no plan, quota spent this month, an account type that cannot buy, an editor locked by an admin, a competition entry that cannot be deleted — and there is not one disabled control on the screen. Two server defects the port found: DEF-29 (`POST /payment/reveal-contact/:writerId` would disclose ANY user's email and phone, not just a writer's, because nothing checked the target's role — FIXED, with seven tests) and DEF-30 (the sibling message-slot endpoint answered 500 for a malformed id — FIXED). One behaviour change both platforms get: the writer's purchase-request poll no longer runs in a hidden tab, which was 240 authenticated requests an hour from a page nobody was looking at. Evidence: mobile+detail suite 990 in 65 files (from 905/58), server 375/375, an 80-measurement CDP sweep across eight fixture states, eight overlays and five widths at 0 findings, and a 60-stop keyboard leg through the rating sheet with 0 escapes and 0 unringed stops."
  checkpoint_update_2026_08_14_project_detail: "COMPLETE (D28). All THREE authenticated project-detail route forms (`/script/:id`, `/script/:heading/:writer` and the root-level `/:heading/:writer`) are now one native SCREEN for authenticated writer and industry audiences: hero and status, a role-aware recommended action that is never a dead button, five labelled section landmarks replacing the desktop eight-tab rail, the trailer, a full-screen reader that honours the writer's preview window, bookmark, public share, and complete loading / blocked / not-found / failed states. The two-segment catch-all was promoted WITHOUT moving, so it still cannot swallow a static route. Four defects the port found: DEF-25 (the detail response gated `fullContent`/`textContent` and shipped `fountainContent` and the private `fileUrl` right past that gate — FIXED), DEF-26 (`creator` was populated with `email` and `phone`, so the paid contact-reveal quota was bypassable by reading the JSON — FIXED), DEF-27 (`GET /scripts/:id/pdf` serves the complete screenplay to any authenticated viewer who clears the marketplace gate, with no purchase check at all — RECORDED, NOT FIXED, and BLOCKED ON A PRODUCT DECISION, because the desktop preview panel reads the same URL), DEF-28 (four private copies of a closed rights enum, one of them missing `ckript_not_involved`, so a writer's chosen term rendered to buyers as 'Not specified' — FIXED with one shared vocabulary). The five-width sweep found a live 3.56:1 contrast failure in the shared `PageHeader` eyebrow that four earlier sweeps missed because no fixture had ever passed that prop."
checkpoint_update_2026_08_14_featured: "COMPLETE (D27). `/featured` is now a native SCREEN for authenticated writer and industry audiences: an editorial lead that states WHY it leads, spotlight, ranked and mandate-match sections, URL-owned sort and four URL-owned facets, bounded server paging across BOTH sources, a shared trailer contract, and complete loading/empty/single-source-degraded/total-error/append-error states. Three live defects found by the port and fixed: DEF-20 (the `mid` budget facet matched nothing on desktop Top and in D26's model — the enum is `medium`), DEF-21 (`GET /scripts` and `GET /scripts/featured` returned whole screenplays and private asset URLs in a list response), DEF-22 (`GET /scripts` accepted `limit` from every caller and ignored it, returning the entire published catalogue). DEF-23 is FIXED: `DesktopExperienceNotice` no longer covers a native screen with a full-screen modal telling the user to switch to a laptop — it is gated on the same policy the router uses, so it retires itself route by route as the migration proceeds. DEF-24 was found while fixing it and is RECORDED, NOT FIXED: an unlayered `button { color: inherit }` in `index.css` silently defeats every Tailwind v4 text-colour utility on a button."
checkpoint_update_2026_08_13_top_scripts: "COMPLETE (D26). `/top-script` is now a native SCREEN for authenticated writer and industry audiences, with five URL-owned rankings, four URL-owned facets, bounded server paging, stable ranked metrics, shared discovery cards/filter Dialog, bookmark/public-share actions, and complete loading/empty/initial-error/append-error states. D25's restriction premise was stale: commit edf3743 deliberately removed personal-email access restrictions product-wide, so native does not revive the unreachable desktop modal."
checkpoint_update_2026_08_13_search: "COMPLETE (D25). `/search` is now a native SCREEN for authenticated writer and industry audiences, with URL-owned query/scope/facets/sort, safe projected server results, stable bounded paging, semantic people/project collections, bookmark/public-share actions, explicit Load more, and complete idle/loading/empty/initial-error/append-error states."
checkpoint_update_2026_08_13_resumable_media: "COMPLETE (D24). Both creation routes now use authenticated 24-hour video sessions, checksummed 6 MiB Cloudinary parts, authoritative accepted-range status, resume-after-network-failure, idempotent completion, explicit abort and expiry cleanup. Legacy whole-file video routes remain only for older clients; the current shared uploader no longer calls them."
checkpoint_update_2026_08_13_competition_nav: "COMPLETE (D23). `?ctx=competition` is a native SCREEN path with authoritative deadline/counts, optional pitch, flush-before-final-submit, both acknowledgements, server errors, success return and submitted locking. Projects is restored only to the writer compact bar; Create remains in the desktop rail/drawer."
checkpoint_update_2026_08_13_media_cancel: "COMPLETE (D22). Both native creation routes now share fresh-per-attempt AbortController cancellation, cancelled-versus-failed results, exact-file 25 MiB trailer/pitch preflight before the base write, honest from-0 retry, and native confirm/active/cancelled/retry states. Server-backed multipart resume remains a separate contract and is not claimed."
checkpoint_update_2026_08_12_media_progress: "CREATE-PROJECT MEDIA PROGRESS COMPLETE (D21). Both creation entry points now share one byte-progress uploader; /create-project visibly returns to Visual assets after the project record is saved, identifies partial failures, and retries only failed files without creating a duplicate project. Phase 3 bullet 6 remains partial for cancel/preflight warning and server-backed resume."
checkpoint_update_2026_08_12: "REPORTS COMPLETE (D20); Phase 3 bullet 4 is closed. Mobile now has scene and character reports in a full-screen Dialog, shared parsing/export logic with desktop, touch-safe sort/download controls, empty states, scene jump, and a 60-scene stress fixture."
checkpoint_update_2026_08_22_mandates: "COMPLETE (D53B; D53 CONTINUES). `/mandates` is a native professional-only SCREEN over shared desktop/native read-write state. Four allow-listed arrays are normalized on client and server; non-professional roles are refused before account lookup; malformed/unknown values are dropped; load/save failure retains a recoverable draft; include/exclude genres resolve conflicts at interaction time. Focused client tests pass 107/107, all server tests pass 490/490 in 90 suites, touched lint and diff checks are clean, and the 4,199-module production build prerenders/verifies 53/53 routes. The combined industry workspace sweep passes 100/100 state-width measurements with zero findings."
checkpoint_update_2026_08_23_reader_workspace: "COMPLETE (D55). `/reader` and `/reader/search` are distinct native Reader Home and Discover screens over one shared desktop/native contract; the former combines independently recoverable private read/favorite shelves with fresh projects, while the latter owns bounded URL-backed query/format/genre/page state. The reader-search server boundary is exact-role, positively projected, regex-safe, page-clamped, limited to 24, and no longer mutates missing SIDs during GET. Existing Featured, Top Scripts, Messages, `/reader/script/:id`, and `/reader/profile/:id?` presentations explicitly admit the reader audience and keep project opens on reader URLs; reader-only routes deny every other role. Evidence: 145/145 final focused client tests, all 513 server tests in 96 suites, touched client/server ESLint, clean diff check, a 4,207-module production build with 53/53 routes prerendered, and deterministic Home/Discover browser checks at 320/360/390/430/768px plus loading/partial/empty/failure surfaces with no horizontal overflow or page errors. Full client is 2,165/2,170 with exactly the recorded five unrelated failures (four stale AppShell expectations and DataTable's CSV-header expectation). No physical-device or screen-reader run is claimed."
checkpoint_update_2026_08_23_audience_transitions: "COMPLETE (D56; PHASE 7 COMPLETE). `routing/audienceTransitions.js` is the pure source for canonical audience homes, exact route ownership, local/authorized post-auth returns, and denied-route destinations; `AudienceTransitionBoundary` runs before desktop/mobile experience selection and replaces foreign entries without mounting their content. Cached sessions stay neutral until `/auth/me` confirms the current role; onboarding completion immediately merges the returned server user into memory and local storage; industry finish-later resolves to `/home`. Evidence: 324/324 focused transition/route/navigation tests before the final exact-reader hardening, 55/55 final routing tests, clean touched ESLint, full client 2,218/2,223 with the exact five known unrelated failures, a 4,209-module production build and 53/53 prerender verification, plus real Chrome checks for writer, producer, actor, and reader transitions. Writer denial passed at 320/360/390/430/768px with no horizontal overflow; authorized reader query/hash survived; Back returned to the allowed prior page and Forward returned to the replacement home. No physical-device or screen-reader run is claimed."
checkpoint_update_2026_08_23_native_landing: "COMPLETE (D57). `/` is a `SHARED_PUBLIC_SCREEN` in the public shell for anonymous and authenticated phone viewers, with immediate content rather than the authenticated-app boot. `LandingMobile` renders every canonical marketing beat over shared landing data and auth/challenge controllers; native Dialogs own menu, trailer, and partner detail, while the feature rail becomes an APG accordion. Cookie consent now renders inside the 520px native frame with safe placement and 44px decisions; the hard-coded desktop event poster no longer obscures native content; desktop/native trailer presentations share the real tracked `ckript-video.mp4` asset instead of the missing `/nexara-trailer.MP4`. Evidence: 137/137 focused tests, clean touched ESLint, full client 2,241/2,246 with the exact five known unrelated failures, a 4,213-module build plus 53/53 prerender verification, and 25/25 Chrome state-width measurements at 320/360/390/430/768px with zero findings plus real Tab/Escape focus containment and return. No physical-device or screen-reader result is claimed."
checkpoint_update_2026_08_23_native_seo_content: "COMPLETE (D58). All 21 SEO content route patterns (41 registered paths) are `SHARED_PUBLIC_SCREEN` entries backed by `SeoContentMobile` and the registered `ckm-seo-page` family. `seoPageContent.js` is the single desktop/native resolver for marketing, blog, genre, guide, related-link, and not-found state; canonical metadata, schemas, sitemap, and prerender remain owned by `seoRoutes.js` and `SeoManager`. Invalid dynamic slugs now show recovery links and receive `noindex, nofollow`; FAQ uses disclosure controls without duplicated capability cards. Evidence: 195/195 focused tests, clean touched ESLint, full client 2,313/2,318 with exactly the five known unrelated failures, a 4,216-module production build plus 53/53 prerender verification, and real browser checks at 320/360/390/430/768px with one main, one h1, correct 320→520px framing, no horizontal overflow, undersized/unnamed controls, overlays, or page errors. The browser sweep found and fixed three short links whose width was below the 44px product target. FAQ disclosure, invalid-slug noindex, and related-link navigation were exercised at 390px. No physical-device or screen-reader result is claimed."
deployment_correction_2026_08_23_cloudflare_pages: "PR #576 deployment fix. Cloudflare Pages caps each static asset at 25 MiB; D57's 76.0 MB tracked trailer caused the Pages build to fail even though the local Vite build passed. The same source path is now a two-pass, fast-start H.264/AAC web encode at 1280×548 and 21.4 MiB. The complete 207.55-second file passed ffprobe, full decode, and source/output frame comparison before replacement. Desktop and native still share one trailer asset and retain click-to-load behavior."
latest_completed_work_item: "Shared native SEO content renderer (2026-08-23, D58)."
current_phase: 8
current_work_item: "IMPLEMENTED, DEVICE CHECK PENDING — D59 Phase 8, Claude, 2026-08-26. Native account entry: sign in, role chooser, one role-parameterised sign-up stepper, OTP, password recovery, invite acceptance, referral and return-to-route. Claims Phase 8 bullets 4 and 5. Marketing pages (About/Contact/Pricing/Challenge) are renumbered to D60 at the user's direction."
d59_scope_decisions: "Three decisions taken with the user before implementation. (1) REAL ROUTES, not an overlay: /login, /join, /signup?as=<role>&step=<n> become mobile SCREEN entries because a modal has no URL — refresh loses a half-filled form, Android back closes the surface instead of stepping back, and the OTP step routinely outlives a trip to the mail app. Desktop keeps its modal; this is the first deliberately platform-divergent disposition (§9.3 note). (2) WRITER/PRODUCER/INDUSTRY ONLY: reader and actor sign-up is deferred even though both audiences have complete native screens and the server accepts both roles — recorded as a follow-up, not silently skipped. (3) MOBILE-LOCAL FLOW CODE: the native screens own their own model, hooks and draft store rather than extracting the three desktop onboarding modals into a shared layer. The trade-off was stated and accepted: a fourth copy of the sign-up sequence that must be kept in step by hand. Existing SHARED primitives are still reused rather than re-implemented — AuthContext.login/join/googleSignIn, resolvePostAuthPath/sanitizeLocalReturnPath (the open-redirect guard), useForgotPasswordFlow (already headless), acceptCollabInvite, and the whole ckm form/button/shell family."
previous_work_item_d29: "COMPLETE — Claude — 2026-08-20. D29 gave the native project screen its writes and gave BOTH platforms one definition of each. New: `pages/script-detail/projectActions.js` (the nine requests, their validation and one `{ ok, message, flags }` refusal envelope), `pages/script-detail/useProjectActions.js` (pending flags, the writer's request list and its visibility-aware poll, the reviews list, the producer rating, the reveal quota, the meeting stats), and five native components — `StarRating` (a real radio group, not five buttons), `FeedbackSheet` (one form behind both a reader review and a producer rating), `PurchaseRequestSheet`, `PurchaseRequestList` and `MeetingSheet` (with its Google Calendar connect leg). `ScriptDetail.jsx` deleted its private copies rather than gaining a mobile sibling: -262 lines, +75. Three sections joined the screen — `feedback`, `purchase` and an owner-only `manage` — and the section registry is addressed by id now, because inserting one in the middle of a positional array would have retitled its neighbours. STILL OPEN IN THIS FAMILY: `/script/:id/pay` (the Razorpay checkout, moved into Phase 4 on 2026-08-09) and the public shared project."
previous_work_item_d27: "COMPLETE — Claude — 2026-08-14. D27 native `/featured` is promoted, with both of its sources bounded and paged, its facets single-valued to match the rest of the discovery family, its trailer contract shared with desktop, and the removed personal-email gate not revived."
previous_work_item: "Native authenticated project detail, the read half (2026-08-14, fourth Phase 4 session, D28)."
last_completed_work_item: "Version history (2026-08-11, thirteenth session). NEW: `components/screenplay/useVersionHistory.js` (shared: three endpoints, `lineDiff`, `summariseDiff`, `timeAgo`), `mobile/screens/create/versionsModel.js`, `overlays/VersionsDialog.jsx`. CHANGED: `VersionHistoryModal.jsx` (now reads the shared hook — 90 lines lighter), `editorChrome.js`, `Editor.jsx`, `Editor.css`. 12 model tests and 10 screen tests. PRIOR ENTRY: People + DEF-14/15/16 (twelfth session). NEW: `components/collab/useCollaborators.js` (the shared data layer, used by BOTH platforms), `mobile/screens/create/peopleModel.js` and `overlays/PeopleDialog.jsx`. CHANGED: `CollaboratorsPanel.jsx` (now reads the shared hook, and asks before removing), `editorChrome.js` (the `people` item), `Editor.jsx`, `Editor.css`, `CreateHarness.jsx` (presence fixtures), and `components/EmptyState.css` (a shared contrast fix). 13 model tests and 9 screen tests. PRIOR ENTRY: Comments (eleventh session). NEW: `commentsModel.js` (threads, filters, open count, and `describeComposer` — D17 as a pure function) and `overlays/CommentsSheet.jsx`. CHANGED: `editorChrome.js` (the `comments` item, whose hint carries the live open count), `Editor.jsx` (the sheet and seven context reads), `Editor.css` (the thread card, the quoted anchor, and a measured `--ckm-editor-warn-text`), `CreateHarness.jsx` (four comment fixtures and a dev-only `window.__ckmEditorApi` so a sweep can drive a REAL selection). 11 model tests and 11 screen tests."
next_action: "D59 IS IMPLEMENTED AND EVIDENCED IN CODE; TWO THINGS REMAIN BEFORE IT MAY BE CALLED COMPLETE. (1) THE DEVICE PASS §18 REQUIRES, which is the only unchecked box: open /login, /join, /signup?as=writer, /forgot-password and /invite/:token at 320/360/390/430/768 on a real iOS Safari and Android Chrome and confirm the five things a jsdom suite cannot answer — that the docked `.ckm-signup__foot` clears a raised virtual keyboard (useKeyboardInset is the mechanism Sheet has used since Phase 1 and has still never been measured against a real keyboard), that the six OTP boxes accept an SMS/mail autofill and a clipboard paste, that the Google iframe stays inside the 320px column, that the computed contrast of the neutral ramp declared on `.ckm-auth` in `ios/AuthSurface.css` holds against its own surfaces, and that no auth screen scrolls horizontally. (2) RUN ONE REAL SIGN-UP PER ROLE against a live server: the three flows are unit-tested against a mocked boundary, but no writer/producer/industry account has actually been created end to end through the native stepper, and the writer path in particular now depends on the demographics fix. AFTER THAT, D60 is the deferred marketing set: audit `pages/About.jsx`, `pages/ContactPage.jsx`, `pages/PricingRoute.jsx` and `pages/landing/ChallengesPage.jsx` — their overlay entry points, forms/API writes, plan data, challenge CTA ownership, public SEO/prerender records, logged-out/authenticated actions, and invalid/failure states — then record a route/state matrix and decide which content/data seams can be shared before implementing the four native public-shell presentations."
open_follow_ups:
  - "DEF-33 (FIXED IN D59, AND IT HAD MADE SIGN-IN IMPOSSIBLE ON BOTH PLATFORMS). Commit f7c7f6b changed `client/src/components/AuthModal.jsx` line 2 from `import { AnimatePresence, motion }` to `import { AnimatePresence }` and left three `<motion.div>` usages behind. `motion` was undefined, so the only sign-in surface in the product threw a ReferenceError the moment it opened. It shipped on 2026-08-23 and was found on 2026-08-26 by reading the file, not by a test — there is no test that mounts AuthModal at all, on either platform, which is the actual finding. The one-line import is restored and D59 adds native coverage, but the desktop modal is still unmounted by any suite."
  - "DEF-34 (FIXED IN D59 FOR BOTH PLATFORMS). Every account created through the primary sign-up path had no client-side auto-logout timer and no attribution. `components/OTPVerification.jsx` wrote `localStorage.setItem('user', ...)` itself and handed the payload to `onSuccess`; its callers (`AuthModal.jsx`, `pages/IndustryOnboarding.jsx`) then called `setUser`. None of the three called `scheduleAutoLogout`, `linkAnonymousSessionToUser` or `trackAuthEvent`, all of which `AuthContext.login`/`join` do — so an OTP-verified session never expired in the browser and the visitor's pre-sign-up anonymous session was never linked to the account it became. Password logins kept their attribution; every sign-up silently lost it. Fixed by giving `AuthContext` one `adoptSession(userData, { reason })` that does the whole thing, and pointing all four callers at it. The shape is the lesson: three surfaces each doing four-fifths of a job that one function should own."
  - "READER AND ACTOR HAVE NO SIGN-UP PATH ANYWHERE, AND D59 DELIBERATELY DID NOT ADD ONE. Both audiences have complete native screens — `/reader`, `/reader/search`, the reader profile, and the industry chrome an actor gets — the server's role enum accepts both, and `shellPolicy` maps both to an audience. There is simply no surface, on either platform, that creates such an account: the role chooser offers Writer and Producer only, and `POST /auth/google` is sign-in-only. So those screens are reachable exclusively by accounts an admin made. Scoped out of D59 at the user's direction to keep the work item to the three flows that already exist; the native stepper is role-parameterised, so adding either is a data entry in the role catalogue plus its step list, not a new screen."
  - "ADMIN SIGN-IN IS IMPOSSIBLE THROUGH ANY MODAL ON EITHER PLATFORM, AND D59 DID NOT FIX IT. `login` in `server/controllers/authController.js` requires `adminAccessCode` when `user.role === 'admin'` and refuses with a bare 403 `Invalid admin access code` and no flag; `AuthContext.login(email, password)` has no third argument and never sends one. Admins therefore get in only through the impersonation path or a direct API call. Left alone rather than worked around: `/admin` is `desktopOnly` on mobile, so an admin on a phone is a desktop-fallback user on every route and a native admin sign-in would be a surface with nowhere to go. Fixing it properly means a flagged refusal from the server (so a client can reveal the field instead of string-matching a message) plus a third argument on `login` — a desktop change that wants a desktop session."
  - "`POST /auth/google` IGNORES THE `role` IT IS SENT, AND `GoogleSignInButton` HAS ALWAYS SENT ONE. The client passes `{ credential, referralCode, role }`; the controller destructures only `credential`/`idToken` and, for an unknown email, returns 404 `accountNotFound` regardless — Google is sign-in-only by design, because a new user must pick a role and, for investors, supply contact and approval data Google cannot provide. The `role` prop is therefore dead on both platforms. D59 stops the dead end being a dead end on mobile (the 404 now routes to `/join` with the Google email carried across and explained) but leaves the prop in place. Either wire it or delete it; a parameter that is sent, accepted and discarded is the kind of thing the next reader trusts."
  - "D49 RECOVERS CAPTURED REGISTRATION PAYMENTS SERVER-TO-SERVER WHEN THE WRITER RETURNS, BUT IT DOES NOT YET CONSUME A RAZORPAY WEBHOOK. The persisted intent and `reconcile-registration-payment` close callback loss on the same or another browser after an authenticated return, and every checkout retry reuses one order. A writer who pays and never returns still waits for an explicit reconciliation request. Before production claims unattended settlement, add an authenticated `payment.captured` webhook with Razorpay signature verification, resolve the intent by authoritative order id, call the same idempotent finalizer, and run one real sandbox capture plus duplicate webhook delivery. No real charge or webhook was used in D49."
  - "D45 MAKES EVERY NEW WGA/SWA PROOF AN AUTHENTICATED CLOUDINARY ASSET, BUT EXISTING ASSETS ARE NOT RETROACTIVELY MIGRATED. Their storage URLs are no longer returned by owner, onboarding, current-user, or pending-review payloads, and current UI asks the authorized access endpoint; however, an old `upload`-type URL that was previously copied remains publicly deliverable. Before production claims all historical proofs are private, migrate the existing membership-proof folder to authenticated delivery, update stored asset identifiers if Cloudinary changes them, and verify one PDF plus one image through both writer and admin access routes. This session used the real signing helper but did not mutate a paid Cloudinary asset."
  - "TWO DESKTOP BEHAVIOURS WERE REMOVED WITH D30 AND NOBODY ASKED FOR EITHER REMOVAL. (1) The payment page no longer raises `window.confirm('Payment successful. Do you want to download your invoice now?')` 120ms after the success banner; the two buttons that were already on screen are the answer, and a blocking browser dialog is the wrong instrument on a phone, which is why the shared hook cannot raise one. (2) It no longer auto-downloads the accepted-terms PDF on success — that file now arrives when the buyer presses the button for it. Both are improvements and both are pinned by tests, but a buyer who was used to the automatic download will notice, and the invoice/terms pair is the one part of this flow with a paper trail. Worth a product eye before merge."
  - "THE PENDING-CHARGE RECORD IS PER-BROWSER, WHICH IS ALL A CLIENT CAN DO AND LESS THAN THE PROBLEM DESERVES. DEF-32 is fixed for the buyer who comes back to the same browser: the payment is in `localStorage` and the next visit retries it. A buyer who pays on their phone and then opens their laptop, or who clears site data, still has no way to finish the unlock, because the Razorpay signature only ever existed in that one callback. The real fix is server-side and small: Razorpay's `payment.captured` webhook carries the order id, and the order's `notes` already carry `userId`, `scriptId` and `purchaseRequestId` (set in `createScriptPurchaseOrder`), so the server could settle a captured payment without any client at all. Recorded, not built: it is a payments-infrastructure change, not a mobile port."
  - "DEF-29 IS FIXED, AND ITS SHAPE IS WORTH REMEMBERING: `POST /payment/reveal-contact/:writerId` took an id from the URL and never asked what KIND of account it pointed at, so any caller with FIP access could read any user's email and phone — another producer's, an admin's, a reader's — one quota slot at a time. Every real caller passes a writer, and the opt-out check directly below it was already writer-shaped, which is what made the gap visible: a non-writer could not opt out of a disclosure the product says is about writers. Now gated on `isWriterRole` (404 otherwise) with the opt-out honoured for every role, pinned by `server/controllers/revealWriterContact.test.js`. THE CLASS: an endpoint named for one kind of subject, taking that subject's id from the URL, and checking only the CALLER. Worth grepping the other `:writerId` / `:userId` routes for the same shape before Phase 9."
  - "THE WRITER ROLE PAIR NOW HAS A NAMED HOME (`WRITER_ROLE_LIST` / `isWriterRole` in `server/utils/industryAccess.js`), BUT TWO PRIVATE COPIES REMAIN: `utils/profileCompletion.js` and `utils/scriptLimits.js` each declare their own writer/creator Set, plus a long tail of inline pairs in the controllers. All of them agree today; DEF-28 is the record of what four copies of a closed vocabulary cost when one of them stops agreeing. Not consolidated in this session because each copy answers a slightly different question (who is limited, who has a writer profile) and it is a server session's work, not a mobile one's."
  - "THE OWNER'S PURCHASE-REQUEST POLL IS NOW VISIBILITY-AWARE ON BOTH PLATFORMS, AND THAT IS A DESKTOP BEHAVIOUR CHANGE NOBODY ASKED FOR. `useProjectActions` re-reads the writer's request list every 15s only while the document is not hidden, and reads once immediately when the tab comes back. The old desktop loop ran forever in a background tab. This is strictly less traffic for the same freshness, it is pinned by three tests, and it is still a change to a page a writer may leave open all day — worth a desktop eye on a long-lived tab before merge."
  - "MEETINGS ARE THE ONE D29 ACTION WHOSE HAPPY PATH WAS NEVER RUN END TO END. `scheduleMeeting` posts to `/meetings`, which creates a real Google Calendar event on the producer's own calendar and emails both attendees; the native sheet handles the 428/`needsCalendar` connect leg, the quota refusal and the field validation, and all three are covered by tests against a mocked boundary. What is NOT covered is a real OAuth consent round trip from a phone browser — `requestCalendarConnectUrl` hands the page to Google and the return lands wherever `returnTo` says. Worth one staging run before release."
  - "DEF-24 IS RECORDED AND NOT FIXED, AND IT IS BIGGER THAN THE ONE BUTTON THAT REVEALED IT. `client/src/index.css:136` declares an UNLAYERED `button, input, select, textarea { color: inherit }`. Tailwind v4 emits its utilities inside `@layer utilities`, and unlayered author CSS beats ANY cascade layer regardless of specificity — so `text-white`, `text-gray-400` and every other text-colour utility applied to a `<button>` in this codebase is DEAD, and those buttons silently render the inherited body colour instead. Measured, not inferred: `DesktopExperienceNotice`'s primary button carried `text-white` on `bg-[#8B1E1E]` and computed `rgb(11, 10, 6)` at **2.17:1**; setting the colour inline (the only fix local to that component) moved it to **9.12:1**. The general fix is to delete `color: inherit` from that rule or move the rule into `@layer base`, but either changes the resolved colour of every button in the product at once, so it needs a desktop visual pass rather than a mobile session's edit. Worth doing before Phase 10 — and worth grepping for buttons whose only colour is a utility, since each one is currently a silent contrast risk."
  - "`GET /scripts` NOW HONOURS `limit` (DEF-22), AND TWO EXISTING CALLERS SILENTLY CHANGE BEHAVIOUR FOR THE BETTER. `components/FeaturedSection.jsx` asks for `limit=8` and `pages/FunctionalTestChecklist.jsx` for 1/5/10/20/50; all of them previously received the entire published collection and sliced it in the browser. They now receive what they asked for. This is the correct behaviour and it is covered by the paging unit tests, but no desktop page was re-rendered to confirm none of them depended on over-fetching — worth a desktop eye on FeaturedSection before merge."
  - "D24 CLOSES THE SERVER-BACKED RESUME GAP IN CODE, BUT NO PAID EXTERNAL ASSET WAS MUTATED DURING VERIFICATION. Controller tests drive every session state with a deterministic Cloudinary boundary and the current client integration is covered end-to-end through mocked HTTP. Before production rollout, run one staging 30+ MiB video through real Cloudinary, interrupt after at least one accepted 6 MiB part, reload/reselect the same file, confirm Continue begins at the server percentage, then verify Cancel and 24-hour expiry leave no unattached asset. This is an operational integration check, not missing application behavior."
  - "THE DESKTOP `/upload` PAGE STILL CARRIES DEF-4'S FOUR FLOOR BREACHES. Promoting the route means a phone no longer meets them - but a desktop browser narrowed to 520px still does: `.su-save-state` is `display:none` at <=720px, `.su-detail-tabs button` is `font-size:0` at <=520px, `.su-action-bar button` is 42px wide, and `.su-mobile-phases` is 10.5px text with a 19x19px indicator. Those phone breakpoints are now dead weight for phones and actively wrong for a narrow window. Deleting the three phone media queries outright is a smaller change than fixing them; worth doing before Phase 10."
  - "`MediaSlot`'S UNNAMED-INPUT DEFECT SHIPPED IN THE THIRD SESSION AND WAS ONLY FOUND IN THE FOURTH, WHICH IS THE LESSON RATHER THAN THE BUG. With a file attached the slot drops the `<label for>` that named its input, so the input was a silent focus stop on `/create-project` too. The third session's sweep DID cover the media panel and DID pass - because its fixture had `thumbnailFile: null`, `trailerFile: null`, `pitchVideoFile: null`. A sweep measures the state it rendered, and a fixture that never fills a control never tests the filled control; the same lesson `--ckm-muted` taught. Worth auditing the other Phase 1 fixtures for states they never enter, before Phase 10."
  - "D23 FIXED THE COMPETITION EXCLUSION (2026-08-13). Both `/create-project` forms now keep `?ctx=competition` on the native editor, and the desktop/mobile presentations share one flush-before-submit operation and submitted-status model. Remaining verification debt is the editor family's already-recorded real-device keyboard/screen-reader pass, not a competition fallback."
  - "THE DESKTOP DRAFTS DELETE IS NOT PORTED. `DraftsSheet` offers switch and start-fresh; the desktop `DraftCard` also deletes. A list row on a phone is a much easier mis-tap and the deletion is irreversible, so it wants a confirmation that My projects should own rather than this sheet. Decide where project deletion lives before Phase 4 touches the projects list."
  - "A REFUSED SUBMIT IS NOT KEYBOARD-REACHABLE. `Button` renders a real `disabled` attribute, so the wizard's refused primary is removed from the tab order and its `aria-describedby` is never read. The reason is therefore rendered as VISIBLE text immediately above the footer, in DOM order — which is what actually fixes the desktop defect (a `title` attribute that never appears on touch). If `Button` ever grows an `aria-disabled` mode for refused-but-explained actions, this footer is its first caller."
  - "THE `accessDenied` AND `invitePending` EARLY RETURNS IN `pages/CreateProject/index.jsx` ARE SHARED DESKTOP MARKUP. They return before the context provider, so no injected chrome can reach them; both are a centred `min-h-screen` card (max-w-md, one button) that fits the 520px frame and reads acceptably, but they are Tailwind desktop markup on a mobile route and they do not scroll if they ever overflow. Port them when Phase 5 or the collaboration work next touches this file."
  - "REAL-DEVICE VERIFICATION IS NOW THE EDITOR'S LARGEST UNMEASURED RISK, and it has two parts. (1) The docked bar rides the keyboard through useKeyboardInset; headless Chrome has no virtual keyboard, so 'the dock clears the keyboard' has NOT been measured — only the mechanism (the one Sheet has used since Phase 1) is shared. (2) DEF-5, now sharper: D4's format buttons deliberately blur the editor, and a brand-new script is a placeholder-only CodeMirror document. Whether the Android keyboard survives either is the same class of question. Neither a jsdom suite nor a CDP sweep can answer them."
  - "DEF-6 IS FIXED, and the fix is shared desktop code with no unit test: components/screenplay/screenplayMode.js now binds Escape to blur the editor's contentDOM, releasing the Tab trap that Tab-cycling creates (WCAG 2.1.2). Verified with real dispatched keys through CDP — before, ten Tabs never left .cm-content and each mutated the document; after, Escape then six Tabs walked Elements → Format → Scene → Action → Character → Paren. with a white 2px ring on each. A unit test needs a real EditorView, which no existing screenplay test builds; worth adding when one does."
  - "DEF-3 IS FIXED (2026-08-11), and the fix is shared code that changes DESKTOP behaviour, so it needs a desktop eye before merge. `Corkboard.jsx` cards now end in a Move up / Move down / Move to… row (44x44 targets, always visible — hover-revealing them would re-create the defect on touch), and every card grew ~56px of height. That is correct for the phone the row exists for and it is a visible change to a desktop view nobody asked to redesign; if the density matters, the row is one `flex` container to restyle and the behaviour is independent of it. The three controls, the drop handler and the lock guard all now run through one `requestMove`, so drag and buttons cannot drift apart. NOT yet measured: the corkboard has never been rendered at 320px on either platform — that lands with the editor sheet."
  - "A TOKEN TUNED FOR A FILL OR A GRAPHIC IS NOT A TEXT COLOUR — THREE CAUGHT IN ONE DAY, AND THAT IS NOW THE RULE. 2026-08-11: `--ckm-gold` (#b7871f) on the orphaned-comment notice at 3.23:1; `--ckm-muted`/`--ckm-muted-2` on `EmptyState`'s body at 3.56:1 and ~2.9:1; `--ckm-green` (#2f8a52) on the diff's added lines at 4.12:1. All three are CORRECT as what they are — a 3:1 graphical floor — and all three were wrong the moment they were applied to running text. Each now has a measured text sibling declared beside the surface that needed it (`--ckm-editor-warn-text` 5.90:1, `--ckm-editor-add-text` 5.55:1) or was moved to `--ckm-text-3` (5.44:1). THE SWEEP FOUND ALL THREE AND CODE REVIEW FOUND NONE, which is the argument for the grep-and-measure pass this list keeps asking for: every semantic token in `tokens.css` should be labelled text-safe or graphic-only, and the remaining callers audited against that. DEF-18's sibling lesson applies here too — the failures were invisible until a surface stated something in words that could be checked."
  - "`--ckm-muted` IS NOW CONFIRMED IN A SHARED PHASE 1 COMPONENT, AND FIXING IT CHANGED EVERY EMPTY STATE IN THE APP. Measured 2026-08-11 by the People sweep: `.ckm-empty__body` was `--ckm-muted` at 3.56:1 and `.ckm-empty.is-compact .ckm-empty__body` was `--ckm-muted-2` at ~2.9:1 — smaller text in a weaker colour, the wrong direction on both axes. Both are now `--ckm-text-3` at 5.44:1. This is the THIRD confirmed caller (after `ckm-field__flag--soft` and `ckm-field__meta`) and the first inside a component every screen mounts, which raises the priority of the grep-and-measure pass this list has been asking for: the remaining unaudited callers are no longer a theoretical risk. SEPARATELY AND NOT FIXED: `EmptyState`'s icon measures 1.59:1 against its own tile. It is `aria-hidden`, so WCAG 1.4.11 exempts it and this is not a violation — but a glyph that faint on every empty state in the app is a design-intent question, and changing a shared component's visual weight is not a mobile session's call to make alone."
  - "A PROBE'S OWN RED RESULT HAS NOW BEEN WRONG FIVE TIMES, AND THE PATTERN IS WORTH THE RULE. The list: a cold font cache measured as overflow; `<label for>` unresolved, reported as 14 unnamed inputs; `outline` read where this app rings with `box-shadow`, reported as 23 unringed stops; a CDP Enter without `text`, reported as 'the reorder does not work'; and — 2026-08-11, the People keyboard leg — a fulfilled cross-origin response WITHOUT `Access-Control-Allow-Origin`, so the browser blocked it, axios saw a network error, and the dialog rendered with only its close button. In every case the surface was fine and the instrument was not. THE RULE: an audit's first red result is a claim about the audit until it has been run down, and a probe that disagrees with another probe measuring the same thing is the one to doubt first. TWO MORE ON 2026-08-11, both in the version-history session: a sweep whose CDP intercept pattern (`*versions*`) also matched Vite's request for `versionsModel.js`, so the module graph was served a JSON array and the app never booted — 20 runs of 'no overflow button' that had nothing to do with the surface; and a focus probe reading `aria-label` on a button whose name is its TEXT, reporting 'focus: null' where focus was in fact exactly where it belonged. Narrow an intercept pattern to the API path, and resolve a name the way the platform does. The People leg is now RUN and passing (see below)."
  - "THE KEYBOARD-OVER-A-SHEET-BODY RISK IS NOW MITIGATED IN CODE, BUT STILL UNCONFIRMED ON A DEVICE. `Sheet` pads its FOOTER by `useKeyboardInset`; the comments composer, its Comment button and every reply box live in the sheet BODY, which gets no such padding — and on iOS the layout viewport does not shrink, so the button under a focused field would sit beneath the keyboard. `CommentsSheet` now ends its body with a spacer exactly as tall as the keyboard is covering, which is what lets the browser scroll a focused field above it; the spacer is zero-height (and unrendered) when no keyboard is open, so a desktop browser pays nothing. THAT IS THE MECHANISM, NOT THE PROOF: headless Chrome has no virtual keyboard, so the two unit tests pin the spacer's height and its `aria-hidden`, and a real device is still the only thing that can confirm the result. Any future sheet with a field in its body wants the same spacer — or `Sheet` should grow the behaviour itself, which is the better fix once a device has confirmed this one works."
  - "DEF-13 IS FIXED, AND IT WAS A HOLE RATHER THAN A DEFECT: THERE WAS NO WAY TO CREATE A TITLE PAGE ON MOBILE. `TitlePageDialog` shipped in the third session and `Editor.jsx` opens it from `TitlePageSheet`'s `onEdit` — but that sheet renders only when `titlePageActive`, i.e. only when a title page already exists. So the configurator was reachable exactly when it was least needed, and a writer starting a new script on a phone could not add one at all. Live on `/create-project` since 2026-08-09. The Navigator's Pages tab now carries the button, which is where desktop puts it. THE CLASS OF BUG IS WORTH THE NOTE: every check we run asks 'is what is on screen correct?' — a sweep, a contrast probe, a key walk. None of them asks 'is anything MISSING?', and porting a desktop surface pane by pane is what surfaced this one. Worth an explicit inventory pass against the desktop rails before Phase 10, rather than trusting that six more sheets will each happen to notice their own gap."
  - "A FIXTURE THAT DOES NOT ENTER THE STATE CANNOT TEST THE STATE — a third instance, and this time it was the sweep's own request that was wrong. The Navigator's first sweep asked the harness for `?state=titlepage` expecting a title-page ROW in the Pages list; that flag opens the CONFIGURATOR over a script with no title page, so the sweep measured a list identical to the default one and reported a pass on a state it had never entered. Caught only because the `titleAction` column of the rendered report read 'Add a title page' where 'Edit' was expected. `?state=titled` (a configured `FIXTURE_TITLE_PAGE`) now exists and the two states measurably differ: 7 controls vs 6, 2 rows vs 1. RECORDING THE RENDERED FACTS ALONGSIDE EVERY MEASUREMENT IS WHAT CAUGHT IT — a sweep that reports only zeros cannot tell a pass from a state it failed to reach."
  - "THE CORKBOARD HAD NEVER BEEN MEASURED, AND MOUNTING IT ON A PHONE FOUND FOUR LIVE DEFECTS IN IT — ALL FIXED 2026-08-11, ALL ALSO LIVE ON DESKTOP. (1) The scene heading — the control that OPENS the scene, and the most-tapped thing on a card — was a 22px-tall line of text, under the 44px product floor and under WCAG 2.5.8's 24px. (2) The synopsis textarea had no accessible name; its placeholder was doing the work, and on a locked or read-only card the placeholder is empty, so it was a silent focus stop with nothing to announce (WCAG 4.1.2). (3) The scene-number badge and the lock label were 10px, under the 11px floor. (4) The lock label was painted in the HOLDER'S ASSIGNED COLLABORATOR COLOUR and measured 3.83:1 against a 4.5:1 floor — a text colour is not somewhere arbitrary data gets to decide contrast; the colour moved to the icon, which as a graphical object needs only 3:1 and is where the identity cue belongs. All four are now pinned by unit tests so the next regression does not need a browser. THE LESSON IS THE OLD ONE, SHARPER: this component shipped long before the mobile plan and was reachable on desktop the whole time. A surface is unmeasured until something renders it in a sweep, and 'it is existing desktop code' is not evidence that it passes."
  - "THE CORKBOARD'S ANNOUNCEMENT IS THE ONLY FEEDBACK A REORDER GIVES, ON EITHER PLATFORM AND BY EITHER PATH. `aria-live=\"polite\"` names the scene and its new position; there is no visual confirmation at all — the card simply appears somewhere else, and on a grid of near-identical index cards a sighted writer can genuinely lose which one moved. A brief highlight on the moved card at its new index would cost little and is the natural companion to the live region; deliberately not added in this session because it wants a `prefers-reduced-motion` decision and the editor sheet will re-style these cards anyway."
  - "`--ckm-muted` IS NOT SAFE FOR TEXT, AND ONLY TWO CALLERS WERE FIXED. Measured 2026-08-09: #8d877e on --ckm-bg is 3.56:1, under WCAG 1.4.3's 4.5:1 for anything that is not large text. `ckm-field__flag--soft` (the 'Optional' flag) and `ckm-field__meta` (the character counter) were moved to --ckm-text-3 (5.62:1). The token itself is still correct for graphical objects, which need only 3:1 — but every OTHER text caller of --ckm-muted across the mobile app is unaudited, because a sweep only measures what the state it rendered happened to contain. Worth one grep-and-measure pass before Phase 10."
  - "NOTHING LINKS TO /new-project ON EITHER PLATFORM. The mobile screen shipped 2026-08-09 and is correct, but the Create entry in layouts/app-shell/navigation/presets/writerNav.js points at /create-project with fresh:true — on desktop AND mobile — so the chooser is only reachable by typing the URL. Same shape as the /offer-holds finding: the preset feeds both platforms, so pointing Create at /new-project changes desktop too, and 'does Create mean open the editor or choose how to start' is a product decision. Ask before changing it."
  - "Desktop copy defect, not fixed: pages/NewProject.jsx claims 'Auto-save every 30 seconds'. The editor debounces a save at 1s and runs an interval save every 3s. The mobile screen says what the code does; the desktop string was left alone rather than edited in a mobile session."
  - "The exit save now REFUSES to send a body over 64 KiB rather than pretending it sent one. That is honest, but it means a long script's last ~3s of edits rely on the local snapshot alone on an OS kill. A real fix needs a server-side compact exit-save endpoint (the payload carries the script text three times because textContent, fountainContent and baseContent are the same Fountain string, and the server writes each independently). Worth doing before Phase 10."
  - "DEF-4: the desktop /upload page's own phone breakpoints breach four of this plan's floors — .su-save-state is display:none at <=720px (the save indicator vanishes on phones), .su-detail-tabs button is font-size:0 at <=520px (sub-step tabs become bare numerals), .su-action-bar button min-width is 42px (under the 44px target), .su-mobile-phases button is 10.5px text with a 19x19px indicator. This is the evidence for decision D8: build a real mobile screen, reuse the vm prop shape, not the CSS."
  - "DEF-5 (RISK, unverified — needs a real Android device): CodeMirror's placeholder extension has a reported Chrome-Android bug where tapping placeholder text does not raise the virtual keyboard. Our editor configures cmPlaceholder(\"INT. LOCATION - DAY\") and a brand-new script is a placeholder-only document, so this would be the first tap of the first session. A jsdom suite and a desktop CDP sweep can both pass while this is broken."
  - "components/PrivacySettings.jsx and PrivacySettingsWrapper.jsx have ZERO callers on either platform. Dead code, or an unbuilt feature — decide which before Phase 5 touches profiles."
  - "Desktop defect, not mirrored: pages/Dashboard.jsx filters myScripts to status === 'published' then computes pending/rejected from it, so both status notices are unreachable on desktop. Mobile's behaviour is correct."
  - "Free-writer analytics lock (isAnalyticsLocked, null profileViews) is rendered by NEITHER platform — both coerce null to 0 and show a free writer '0 profile views' where the truth is 'upgrade to see this'. Shared follow-up, §13."
  - "The client test suite is flaky under full-suite concurrency — unrelated files fail on different runs. Re-run before investigating a red result. Confirmed again 2026-08-11: `pages/admin/adminCompetitionsEditor.test.jsx`'s two focus tests fail in the full run and pass when their file is run alone, with the working tree byte-identical."
  - "D23 FIXED THE NATIVE BOTTOM-BAR REGRESSION WITHOUT REVERSING DESKTOP. `buildNav` now accepts an explicit preset `mobileItems` source; writer Projects is compact-only while Create remains in rail/drawer. `buildNav`, `mobileNav` and native `NavBar` suites are green. The legacy `AppShell.render.test.jsx` still has four unrelated/stale assertions: AppShell does not mount its old `.ck-mobile-nav`, and its current writer rail does not contain Upload. Those failures are outside the native bar and were not hidden or rewritten in D23."
active_files:
  - "client/src/mobile/screens/auth/authModel.js"
  - "client/src/mobile/screens/auth/authDraft.js"
  - "client/src/mobile/screens/auth/authChrome.js"
  - "client/src/mobile/screens/auth/useMobileSignIn.js"
  - "client/src/mobile/screens/auth/useMobileOtp.js"
  - "client/src/mobile/screens/auth/useMobileSignUp.js"
  - "client/src/mobile/screens/auth/SignInMobile.jsx"
  - "client/src/mobile/screens/auth/RoleChooserMobile.jsx"
  - "client/src/mobile/screens/auth/SignUpMobile.jsx"
  - "client/src/mobile/screens/auth/ForgotPasswordMobile.jsx"
  - "client/src/mobile/screens/auth/AcceptInviteMobile.jsx"
  - "client/src/mobile/screens/auth/ios/AuthSurface.jsx"
  - "client/src/mobile/screens/auth/ios/AuthSurface.css"
  - "client/src/mobile/screens/auth/ios/AuthControls.jsx"
  - "client/src/mobile/screens/auth/ios/AuthControls.css"
  - "client/src/mobile/screens/auth/ios/AuthButton.jsx"
  - "client/src/mobile/screens/auth/ios/AuthOtpBoxes.jsx"
  - "client/src/mobile/screens/auth/ios/AuthPickerSheet.jsx"
  - "client/src/mobile/screens/auth/ios/AuthSheet.css"
  - "client/src/mobile/screens/auth/ios/SignUpPanels.jsx"
  - "client/src/mobile/screens/auth/ios/authArt.js"
  - "client/src/mobile/screens/auth/SignUpMobile.css"
  - "client/src/mobile/routes/mobileRouteManifest.js"
  - "client/src/mobile/routes/mobileRoutePolicy.js"
  - "client/src/mobile/routes/MobileRoutes.jsx"
  - "client/src/mobile/theme/cssPrefixRegistry.js"
  - "client/src/context/AuthContext.jsx"
  - "client/src/context/AuthModalContext.jsx"
  - "client/src/components/AuthModal.jsx"
  - "client/src/App.jsx"
known_blockers: []
last_updated: "2026-08-26"
updated_by: "Claude D59 native authentication claimed and documented; implementation in progress"
```

### 19.2 Phase status

| Phase | Status | Owner | Started | Completed | Evidence |
|---|---|---|---|---|---|
| 0. Foundation and route safety | COMPLETE | Codex, Claude | 2026-08-05 | 2026-08-05 | Route manifest/policy + 87-route coverage contract, stable preview fixture, shell-mode contract, route suspense/error boundary, expanded tokens, `.ckm` scoping + prefix registry contract, mobile analytics contract. 41 mobile tests in 7 files; full suite 583/585 (2 pre-existing AppShell failures); lint clean on all touched files; build + 53-route prerender pass; five-width CDP verification with a before/after computed-style diff |
| 1. Shared system and chrome | COMPLETE | Claude | 2026-08-05 | 2026-08-07 | **Role-aware chrome (`ckm-appbar`, `ckm-navbar`, `navigation/mobileNav.js`, `hooks/useMobileNav.js`, `--ckm-accent-on-dark`):** 251 mobile tests in 22 files; full suite 792/794 (the same 2 pre-existing `AppShell.render.test.jsx` failures, re-confirmed by stashing this session's changes and watching the identical 2 fail); lint clean on touched files; build + 53-route prerender pass. CDP sweep at 320/360/390/430/768 over all four audiences' bars at every width: 0 undersized targets, 0 text under 11px, 0 unnamed controls, 0 elements past the 520px frame, 0 contrast failures, no horizontal page scroll, 16/16 labels rendered unclipped. Measured rather than assumed: the selected tab is `rgb(221,90,66)` at **5.13:1** on the `rgb(15,15,15)` bar with the glyph's `FILL` axis at **1** against the idle tab's **0** (so the state is not carried by colour alone), the idle label at 19.17:1, both badges at 4.72:1, the search label at 5.21:1; each tab measured 49px tall and 80–128px wide depending on viewport; exactly **1** `aria-current` with the class applied and **0** on a URL belonging to no tab. Real dispatched Tab keys walked 4 stops, one per destination, each showing a `rgb(255,255,255) 2px solid` ring — the shared terracotta ring is invisible on the dark bar, the same override the toast surface needed. Dashboard baseline recaptured at all five widths; the previous images are archived in `baselines/phase0-dashboard/pre-role-aware-chrome/`. State set (`ckm-toast`, `ckm-message`, `ckm-offline`, `ckm-skel` extended, `ckm-empty` reused; `useOnlineStatus`; the live-region exemption in `useInertBackground`): 206 mobile tests in 19 files; full suite 747/749 (the same 2 pre-existing AppShell failures); lint clean on touched files; build + 53-route prerender pass. CDP sweep at 320/360/390/430/768, every check at every width: 10 state surfaces with no target under 44×44, no text under 11px, no unnamed control, nothing past the 520px frame, no horizontal page scroll. The load-bearing evidence is the three things a unit suite cannot reach — (1) with a full-screen dialog open, the app bar / banner / scroll surface all measured `inert` while the toast layer measured live, and a toast raised beforehand was still tappable and still dismissible *from over the dialog*, which is the whole point of the exemption; (2) real `Network.emulateNetworkConditions` offline → `navigator.onLine === false`, the gold banner appearing with `role="status"` at 4.90:1, measured as displacing the scroll body rather than covering it, then the green recovery state with a 78×44 action that cleared on dismiss; (3) real timing in a real browser, since the unit suite stubs framer-motion — an acknowledgement still present at 3.4s and gone by 6.0s, a three-message queue advancing First → Second → error in order, and the error still on screen at t+15s. Also measured: the error toast's icon at 8.66:1 on ink, a white 2px focus ring reached by a real dispatched Tab, and the bottom-nav lift verified on the *dashboard* (standard shell) where the toast clears the tab bar by 23px. Overlay set + focus/scroll helpers (`ckm-overlay`, `ckm-bottom-sheet`, `ckm-dialog`, `ckm-confirm`, `ckm-action-sheet`; `hooks/` scroll lock, focus trap + restoration, inert background, reduced motion, keyboard inset): 179 mobile tests in 18 files; full suite 720/722 (same 2 pre-existing AppShell failures); lint clean on touched files; build + 53-route prerender pass. CDP sweep at 320/360/390/430/768 opening all four surfaces at every width — 22 controls per width, **zero** undersized targets, zero unnamed controls, zero text under 11px, zero overflow past the 520px frame, no horizontal page scroll. The load-bearing evidence is real dispatched keys: 14 forward Tabs and 6 Shift+Tabs per surface per width (400 key events in total) never once landed focus outside the surface; Escape closed the surface, cleared `inert`, released the scroll lock, restored the exact scroll position, and returned focus to the opening control; a destructive confirmation focused **Cancel** at every width; and with a confirm dialog stacked over an action sheet the lower layer measured inert, the upper live, focus inside the upper, and Escape closed only the top. Collection/display family (`ckm-list`, `ckm-row`, `ckm-load-more`, `ckm-card`, `ckm-badge`, `ckm-chip` extended, `ckm-chip-row`, `ckm-segmented`, `ckm-tabbar`): 138 mobile tests in 16 files; full suite 679/681 (same 2 pre-existing AppShell failures); lint clean on touched files; build + 53-route prerender pass; CDP sweep at 320/360/390/430/768 with 37 targets at every width, none under 44×44 (`::after` hit regions measured, not assumed), no text under 11px, no unnamed control, no nested interactive element, no orphan `<li>`, no horizontal page scroll; real-key traversal proved one Tab stop per tab bar, Arrow/Home/End with wrap, the accent focus ring on the focused tab, and the next Tab landing on the panel. Form family (`ckm-field`, `ckm-control`, `ckm-checkbox`, `ckm-radio`, `ckm-switch`, `ckm-file-picker`): 99 mobile tests in 12 files; full suite 640/642; build passes; CDP sweep at 320–768 with 18 controls, none under 16px text or 44px touch, every invalid control's error reachable via `aria-describedby`; virtual-keyboard proxy passes. Action primitives (`ckm-button`, `ckm-icon-button`, `ckm-back`, `ckm-page-header`) + `useMobileBack` + `/__mobile-primitives` harness. 68 mobile tests in 15 files; full suite 610/612 (same 2 pre-existing AppShell failures); lint clean on touched files; build + 53-route prerender pass; CDP sweep at 320/360/375/390/412/430/480/768 with all 32 controls ≥44×44 and no horizontal page scroll |
| 2. Writer navigation/dashboard | COMPLETE | Claude | 2026-08-07 | 2026-08-08 | **ALL SIX BULLETS COMPLETE; exit gate met and verified by grep — zero live `desktopOnly()` call sites remain in `client/src/mobile`.** 2026-08-08 bullet 6: the §4 gate found there is no settings page to port on either platform (no `/settings` route, no settings page; desktop's whole account surface is `UserMenu.jsx`'s four entries plus Log out, which mobile already mirrors with a logout confirmation desktop lacks), and global auth/session already lives outside React and is inherited wholesale. Delivered instead: the `/terms` and `/privacy` alias links fixed to canonical (mobile was paying a redirect hop desktop does not), first-ever test coverage for the account surface, and the logout/cache contract pinned — `AuthContext.logout()` clears `"dashboard:"` and mobile writes `"dashboard:v1:"`, two strings nothing but that test connects. 358 mobile tests in 29 files; full suite 899/901 across three consecutive runs. NOTE for future sessions: this suite is flaky under full-suite concurrency (unrelated files fail on different runs) — re-run before investigating a red result. Prior: 2026-08-08: bullet 4 approved by the user as-is (Dashboard · Projects · Messages · Profile) and now enforced by `mobileNav.test.js` on labels, order, and Create's absence-from-bar/presence-in-rail-and-drawer. Bullet 5's premise was found wrong at the §4 gate — `/ai-tools` and `/offer-holds` are the *identical* `<DashboardRoute />` element as `/dashboard` (`App.jsx:582-583`), have been since `93055d0` (2026-02-25), and are linked from nowhere — so it resolved to: `/ai-tools` a documented dashboard alias, `/offer-holds` a real screen (`ckm-holds`) over `GET /scripts/holds`, a shipped backend that had **no client at all**. It is an INDUSTRY screen: `holdScript` 403s any non-investor/producer/director and `getMyHolds` is holder-scoped, so it returns `[]` for a writer forever. 345 mobile tests in 27 files (was 288/25); full suite 886/888 (same 2 pre-existing AppShell failures, re-confirmed by stashing); lint clean across `src/mobile`; build + 53-route prerender pass. Five-width CDP sweep (320/360/390/430/768) over the real component with the real stylesheets: 0 undersized targets, 0 text under 11px, 0 unnamed controls, 0 overflow, no horizontal scroll, frame never over 520px. The sweep earned its keep twice — it caught a real 2.69:1 contrast failure in this session's own CSS (`ckm-holds__terms-sep`, fixed to 0 failures) and one reported failure that turned out to be the `file://` harness collapsing the app-bar logo, run down rather than waved away. All three payload traps verified on screen: 6 link rows + 1 inert (deleted script), a DB-"active" row 90 days past its `endDate` reading **Lapsed**, and a `convertedToSale` row reading **Bought**. Prior: bullets 1 and 2 complete. 288 mobile tests in 25 files (was 251/22); full suite 829/831 (same 2 pre-existing AppShell failures, re-confirmed by stashing); lint clean; build + 53-route prerender pass. Five-width browser sweep (320/360/390/430/768) with 0 undersized targets, 0 text under 11px, 0 unnamed controls, 0 overflow, no horizontal scroll — on the shipped dashboard and, with the tabs temporarily restored, on Performance/Reviews/Projects and all overlays. Measured rather than assumed: 4/4 probe points on a project card resolve to the title's link while Share stays independently hittable; 14 dispatched Tabs escaped the AI sheet 0 times with the scroll surface and app bar both `inert`; Escape restored focus to `ckm-rev__details` exactly; the logout confirmation is `role="alertdialog"` focused on **Cancel**. The SectionTabs blocker was answered (option B) and implemented the same session — Projects/Reviews are `/dashboard?tab=…` destinations in the writer preset, which also exposed and fixed a NavBar defect marking **two** tabs `aria-current`. Final: full suite 835/837; `?tab=projects`/`?tab=reviews`/`?tab=performance` each verified clean at all five widths. |
| 3. Creation/upload/editor | IN PROGRESS | Claude | 2026-08-11 | — | **2026-08-11 (thirteenth session) - VERSION HISTORY (D19), AND THE DIFF ITSELF WAS LYING.** A `ckm-dialog` where the desktop surface is a bare `fixed inset-0` div with no dialog role, no focus trap, no Escape and no labelled title. Two shape changes for touch: the diff is a SECOND VIEW rather than desktop's expander inside a list row (a scroller, inside a row, inside the modal's scroller), with each row carrying a one-line summary instead so "which of these six?" does not require opening all six; and Restore ASKS, by explaining the safety net rather than warning - it is recoverable because the server snapshots today's text first, a fact desktop states in an 11px line below the fold. **DEF-18, found by a failing test I first assumed was my fixture:** `diff_linesToChars_` keys a line by its text INCLUDING its newline, so a final line with no terminator is a different line from the same text with one - appending ONE line to a script reported "2 lines added, 1 removed" with two visually identical rows. Live in the desktop modal since it shipped; caught here only because the mobile row states the counts in words. Both sides are now terminated before diffing. The data layer was EXTRACTED (`useVersionHistory.js`: three endpoints, `lineDiff`, `summariseDiff`, `timeAgo`), leaving `VersionHistoryModal.jsx` 90 lines lighter and both platforms on one path. **Five-width sweep, 4 states, 20 measurements: 0/0/0/0/0** after one real fix - the diff's added lines were `--ckm-green` at 4.12:1 on the diff ground, the THIRD semantic token caught doing text duty after `--ckm-muted` and `--ckm-gold`, now a measured `--ckm-editor-add-text` at 5.55:1. **Real keys:** 30 Tabs, 0 escapes / 0 unnamed / 0 unringed; Enter pushed to the diff view (17 lines) and Enter on Restore produced the explanation with the button becoming "Yes, restore it"; Escape returned from the diff to the list AND put focus back on the exact row's "See what changed", which is a fix this leg prompted. 22 new tests (12 model, 10 screen); full suite 1494/1512 against the 13-test baseline (5 extras all confirmed as the documented concurrency flakiness by re-running the files alone). Lint clean; build + 53-route prerender pass. Prior: **2026-08-11 (twelfth session) - PEOPLE (D18), AND PORTING IT FOUND THREE LIVE DEFECTS.** A full-screen `ckm-dialog` - it replaces the writer's task, not the script, and as a Dialog the invite form is a SECTION instead of desktop's modal-over-a-panel, which as a sheet would have been two modal layers. **The data layer was EXTRACTED, not copied:** `components/collab/useCollaborators.js` now serves both platforms, so there is one definition of the four endpoints. **Three defects, all live on desktop, all found by porting rather than by using:** DEF-14, removing a collaborator was a single click that irreversibly revoked another person's access - both platforms now ask, and mobile states the consequence in words; DEF-15, an invitation to an address with no Ckript account NEVER appeared in Pending Invites, because the shared dedupe required a `userId` that `collab.controller.js` deliberately does not set for them (`invitedEmail: invitedUser ? undefined : email`) - so the owner could not see it, cancel it, or avoid duplicating it; DEF-16, the access-level `<select>` had exactly ONE option on every non-`full_admin` row, a control that could not change anything, now offered only where it has two answers. **Five-width sweep, 4 states, 20 measurements: 0 across targets, text size, unnamed, text contrast and overflow**, with the collaborators endpoint fulfilled per state through CDP `Fetch` so owner/guest/empty/confirm are real surfaces (owner 8 controls and 5 rows; guest 1 control and no invite form; confirm-remove shows the warning and one fewer Remove). **The sweep's finding was in a SHARED PHASE 1 COMPONENT and fixes the whole app:** `EmptyState`'s body text was `--ckm-muted` at 3.56:1 and its compact variant `--ckm-muted-2` at ~2.9:1 - the third confirmed caller of the recorded "--ckm-muted is not safe for text" follow-up, now `--ckm-text-3` at 5.44:1. **One verification NOT completed and named rather than implied:** the People keyboard leg. The probe fulfilled the fetch and still rendered a dialog containing only its close button, while the sweep and a direct diagnostic both rendered the full surface through the same stub; the probe is unreproduced, so the leg is unrun rather than passed. 22 new tests (13 model, 9 screen); full suite 1473/1488 against the 13-test baseline (2 known flakes). Lint clean; build + 53-route prerender pass. Prior: **2026-08-11 (eleventh session) - COMMENTS, THE FIRST MOBILE SURFACE THAT WRITES (D17).** A bottom sheet carrying the composer, the three filters, threads with their replies, resolve/reopen and delete. **D17 is the gate's finding and it is about WHEN, not layout:** the composer captures its range when the sheet OPENS and passes it explicitly, because `handleAddComment`'s fallback to `getSelection()` at submit time is correct beside a desktop rail and wrong behind a modal sheet that has blurred the editor and hidden the selection; the captured quote is shown, since otherwise the writer annotates something invisible. It also refuses BEFORE the typing (desktop lets you write a paragraph, then rejects it with a banner at the top of a surface whose composer is at the bottom behind the keyboard) and asks before deleting. Thread grouping moved into a pure model - the desktop rail calls `repliesOf(id)` inside its map, which is O(n squared) over a hundred notes on the device least able to afford it. The overflow item's hint carries the live open count, since behind a menu it is the only thing that says there is anything to look at. **Five-width sweep, 6 states, 30 measurements: 0 across targets, text size, unnamed, text contrast, graphical contrast and overflow.** The `selected` state is driven through the REAL apiRef via a new dev-only `window.__ckmEditorApi`, so the enabled composer that was measured is the genuine one rather than a mock. **The sweep found one real defect in code written this session:** the orphaned-comment notice used `--ckm-gold` at 3.23:1 - a graphical-object token doing text duty, the same class as the recorded `--ckm-muted` finding - now a named, measured `--ckm-editor-warn-text` at 5.90:1. **Real keys:** 30 Tabs with 0 escapes, 0 unnamed, 0 unringed; the composer typed and its submit was the next stop; Enter on Delete showed the confirmation rather than deleting; Escape closed the sheet and returned focus to "More editor actions". 22 new tests (11 model, 11 screen); full suite 1451/1466 against the 13-test baseline (2 extra confirmed as the documented concurrency flakiness). Lint clean; build + 53-route prerender pass. Prior: **2026-08-11 (tenth session) - THE NAVIGATOR, AND D16 TURNS D15 INTO A RULE.** The desktop left rail is now a bottom SHEET (Scenes/Pages tabs over the shared Tabs/List/ListRow family), because applying D15's test - what does the surface REPLACE? - puts it on the opposite side from the corkboard: it replaces nothing, you open it, pick, and leave. Measured, not asserted: `sheetCoversFrame` is false at all 20 measurements. Both lists are DERIVED (outlineWithSceneIds + paginate), never stored, so they cannot drift from the script they index; a lock is stated as TEXT in the row as well as a glyph; pagination runs only while the sheet is open so a navigator nobody opened costs no repaginate per keystroke. **It also closes DEF-13, which was a HOLE and not a defect: there was no way to create a title page on mobile at all** - the configurator was reachable only by tapping a title page that only renders when one exists. Live since 2026-08-09 and invisible to every check we run, because a sweep asks "is what is on screen correct?" and never "is anything missing?". **Five-width sweep, 4 states, 20 measurements: 0/0/0/0/0/0** (targets, text size, unnamed, text contrast, graphical contrast, overflow). **Two of the sweep's own results were wrong and both were run down:** it flagged a `material-symbols` lock glyph at 3.83:1 against a 4.5:1 TEXT floor - an icon font is a graphical object with a 3:1 floor, and the audit now measures glyphs separately; and it asked the harness for a state (`?state=titlepage`) that is NOT a configured title page, so it measured the default list and passed on a state it never entered - caught only because the rendered facts are recorded beside every measurement. **Real keys:** 26 Tabs with 0 escapes from the sheet, 0 unnamed, 0 unringed; the tab bar is a genuine APG tablist (tabIndexes [-1,0], arrows move and wrap, End jumps); Enter on a row closed the sheet and landed focus in the editor at that scene. 17 new tests (9 model, 8 screen); full suite 1427/1444 against the 13-test baseline (4 extra confirmed as the documented concurrency flakiness by re-running the three files alone). Lint clean; build + 53-route prerender pass. Prior: **2026-08-11 (ninth session) — SCENE CARDS IS THE FIRST OF BULLET 4'S SURFACES TO LAND, AND D5 WAS CORRECTED TO LAND IT (D15).** The corkboard is not a rail - on desktop it is the other half of a view switch - so it opens as a `ckm-dialog` over the editor, not a bottom sheet; Sheet.jsx and Dialog.jsx say which is which in their own doc comments, and the rule for the rest of bullet 4 is now "choose by what the surface REPLACES". Wired to the orchestrator's own handleReorderScene/handleSynopsisChange with no new state; the one seam is a `className` prop so the mobile sheet can correct two desktop Tailwind utilities on a class it owns rather than reach through them (§7.1). **Five-width sweep, 3 states, 15 measurements, and it found FOUR live defects in a component that had shipped on desktop long before this plan:** a 22px-tall scene-opening target, an unnamed synopsis field with no placeholder to borrow from when locked, two 10px labels, and a lock label painted in the collaborator's assigned colour at 3.83:1. All fixed, re-measured to 0/0/0/0/0, and each pinned by a unit test. **Real keys:** 33 Tabs with 0 escapes, 0 unnamed, 0 unringed; a real Enter reordered the real document, announced it, and left focus on the moved card - on Move up, because Move down is disabled at the last position, which is DEF-3'"'"'s enabled-not-merely-present fallback confirmed in a browser. **The probe was wrong twice and both were the probe** (it read `outline` where this app rings with `box-shadow`, and dispatched Enter without `text` so Chrome never synthesised the click). 14 new tests; full suite 1414/1427 against the documented 13-test baseline; lint clean; build + 53-route prerender pass. Unmeasured and named: no real device, no screen reader, and no long-script (60-card) run. Prior: **2026-08-11 (eighth session) — DEF-3: THE CORKBOARD IS NO LONGER DRAG-ONLY.** Move up / Move down / Move to position on every movable card, over the existing pure moveScene, with a polite live region, first/last disabled ends, no path at all for a scene locked by another writer or a read-only viewer, and focus that follows the scene to its new index. The drop handler and the three controls now share ONE requestMove, so the accessible path and the drag path cannot drift. 13 new tests including a direct parity assertion (button and drop produce the identical onReorder call, then the identical moveScene output); the suite caught a real bug in the fix - the focus fallback picked the first control that existed rather than the first that was enabled, parking a writer on a disabled Move up after their own successful move. Lint clean, build + 53-route prerender pass. Corkboard still unmeasured at 320px because it is not yet mounted on mobile; that lands with the editor sheet. Prior: **2026-08-09 (fourth session) — BULLET 3: `/upload` IS A `SCREEN` ROUTE, WITH BOTH QUERY FORMS.** The §4 gate ran across the four-file, 3,181-line desktop family and produced decisions D10–D14 and three new defects. **D10 was the gate's load-bearing finding, and it reversed the previous session's `next_action`:** checked field by field, ScriptUpload's state cannot honestly feed the create-project panels — five of the ten panels ask different questions (`basics` is format + a PDF-detected page count vs. writer credits + a derived estimate; `access` reads `pdfPageTexts` vs. Fountain pages; `publish` has different presets and exactly ONE required acknowledgement; `upload` has no counterpart), and a synthesised `CreateProjectContext` would answer `writers`, `targetFilm` and `estimatedPages` with fictions. **So what was shared is the component family, not the panel bodies (D12):** `MediaSlot`, `CoverCropDialog` and `PreviewDialog` were promoted into `mobile/components/media/` under a new registered `ckm-media` prefix, their rules lifted out of `Wizard.css`, and the cropper made prop-driven with a four-line create-project adapter — so both routes now render the *same* three surfaces. **Validation is shared, not ported:** `utils/scriptUploadValidation.js` was already platform-neutral, and its per-field `fieldId` is honoured through a `display:contents` anchor plus the control's own `error` prop (D11), with the scroll-and-focus routine — which lives in the desktop workspace `nativeChrome` never mounts — reimplemented in the screen. **The seam is three defaulted props** on `pages/ScriptUpload.jsx` (`Workspace` / `nativeChrome` / `hostClassName`); desktop's call site is unchanged, its three early returns are *gated*, not removed, and a DEV guard shouts if the flag arrives with the desktop workspace. **D14 made upload progress real on BOTH platforms:** `uploadMediaForScript` now reports bytes through axios's `onUploadProgress` (no new dependency — `services/api.js` already exports an axios instance), and the desktop media panel renders it too rather than carrying dead state. **110 new tests** (25 chrome model, 23 screen + chrome states, 38 panels, 5 route seam, 19 shared media); mobile suite **647 in 44 files** (was 537/39); full suite **1230/1232** — the two documented pre-existing `AppShell.render.test.jsx` failures, re-confirmed by stashing every change and watching the identical two fail *by name*. Lint clean on `src/mobile`, `src/pages/ScriptUpload.jsx` and `src/App.jsx`; `ScriptUploadWorkspace.jsx` unchanged at its 4 pre-existing problems, verified by linting the `HEAD` copy of the file. Build + **53-route prerender pass**. **Five-width CDP sweep (320/360/390/430/768) across 22 states — 110 measurements**: **0** targets under 44×44, **0** text under 11px, **0** unnamed controls, **0** contrast failures, **0** overflow, no horizontal scroll on page or surface, frame 320→520px, all ten panels drawn, shell reporting `flow|bottomNav`, the footer never overlapping the body, and the save indicator — the one desktop sets `display:none` at ≤720px (DEF-4) — present at every width. **The sweep earned its keep, and the finding was in code that shipped LAST session:** with a file attached, `MediaSlot` loses the `<label for>` that names its input, so both file inputs became silent focus stops on `/create-project` as well as here. No earlier sweep caught it because no earlier fixture rendered a slot with a file in it — the same 'a sweep only measures what it rendered' lesson the `--ckm-muted` finding taught. Named, re-measured to 0. **Real dispatched keys, not reasoning:** 70 Tabs down step 5 reached the footer at stop 32 with **0** unringed and **0** unnamed stops and the agreement region among them; 20 forward Tabs and 8 Shift+Tabs inside the exit sheet escaped it **0** times; six real PageDowns scrolled the agreement 0→810px while the surface behind it stayed at 1819px, which measures `overscroll-behavior: contain` rather than assuming it; Escape closed the overflow sheet, cleared `inert` and returned focus to "More upload actions". A second finding came out of that walk — a `<video controls>` in an attached media slot is a focus stop with no accessible name — and was named. **The key probe's own first result was wrong and running it down changed the probe:** it reported 14 unnamed inputs on step 5 while the sweep reported zero, because it read only `aria-label` and text content and never resolved `<label for>`; fixed, then 0. **Named as unmeasured rather than implied:** DEF-7 (this flow has no autosave and no unsaved-change guard, on either platform) is recorded, not fixed; `pdf.js` at 320px and the keyboard inset still need a real device. Prior: **2026-08-09 (third session) — MODE B, THE CHROME SEAM, AND THE ROUTE PROMOTION. `/create-project` and `/create-project/:draftId` are `SCREEN` routes.** The wizard (`ckm-create-project`, `flow` + a one-slot override for the sticky footer) draws one panel at a time from the orchestrator's own `detailsSubSteps`; ten panels ported onto the `ckm-field`/`ckm-control`/`ckm-chip` family; six overlays. **The seam is three defaulted props** on `pages/CreateProject/index.jsx` (`Shell`, `nativeChrome`, `hostClassName`) — desktop's call site is unchanged and its rendered DOM is identical; `nativeChrome` suppresses exactly six desktop surfaces, each replaced rather than dropped, and a DEV guard shouts if the flag is passed without a native chrome. **The wizard's one real improvement over desktop**: desktop puts the reason a Submit is refused in a `title` attribute, which never appears on a touch device — here it is visible text with `aria-describedby`, and `describeWizardFooter` is a pure function whose four refusal branches are each pinned by test. **Competition mode is an explicit manifest exclusion** (`excludeQuery`), not a gap: it replaces the whole wizard with a deadline bar and a one-way Submit, and promoting without the exclusion would leave a competition writer unable to submit at all — the policy gained a `search` input to honour it. **`/__mobile-editor` retired** for `/__mobile-create`, which mounts BOTH modes over a fixture: the live route authenticates, fetches drafts and autosaves, so it cannot be measured twice and get the same answer. **115 new tests** (23 chrome model, 31 wizard render, 25 panels, 12 chrome/toast, 4 route seam, 14 ChipSelect, 6 route policy); mobile suite **537 in 39 files** (was 422/33); full suite **1120/1122** — the two documented pre-existing `AppShell.render.test.jsx` failures, re-confirmed by stashing every change and watching the identical two fail by name. Lint clean on `src/mobile`; `src/pages/CreateProject` unchanged at its 12 pre-existing problems, verified by the same stash. Build + **53-route prerender pass**. **Five-width CDP sweep (320/360/390/430/768) across 17 states — 85 measurements**, against the live dev server so the real CodeMirror mounted at every editor width: **0** targets under 44×44, **0** text under 11px, **0** unnamed controls, **0** contrast failures, **0** genuine overflow (142 elements correctly attributed to their scroll container), no horizontal scroll on page or surface, frame 320→520px, shell reporting `immersive|appBar bottomNav` for the editor and `flow|bottomNav` for the wizard, and the chrome never overlapping the body. **The sweep earned its keep twice, and both were real.** (1) `ckm-field__flag--soft` and `ckm-field__meta` were `--ckm-muted` at **3.56:1** — a live WCAG 1.4.3 failure in the *Phase 1* form family that no earlier sweep caught because no earlier state rendered an "Optional" flag or a character counter; moved to `--ckm-text-3` at **5.62:1** and re-measured to zero. (2) `react-easy-crop`'s crop area is `tabIndex=0` with arrow-key handlers but ships **unnamed**, so a keyboard user reached a silent focus stop; named through the library's `cropperProps`. **Two of the sweep's own findings were the audit's bugs and were run down rather than filed:** `.ckm` (the full-viewport surface that centres the 520px frame) was flagged as overflowing the frame it contains, and two inline links in sentences were flagged as undersized targets — WCAG 2.5.8's inline exception covers them explicitly, and the check now encodes it. **Real dispatched keys, not reasoning:** 60 Tabs down the longest panel (step 5) reached the sticky footer at stop 32 with **0** unringed stops and the agreement region among them; 20 forward Tabs and 8 Shift+Tabs inside the exit sheet escaped it **0** times; Escape closed the overflow sheet, cleared `inert` and returned focus to the exact control that opened it. **Named as unmeasured rather than implied:** the keyboard inset and DEF-5 still need a real Android device. Prior: **2026-08-09 (later) — the screenplay editor surface (mode A), and a keyboard trap fixed for both platforms.** `mobile/screens/create/` — `Editor.jsx`, `EditorDock.jsx`, `editorChrome.js`, `Editor.css` (`ckm-editor`, registered) — mounts the **real** `ScreenplayEditor` (D1) under one docked Elements/Format bar (D3/D4) with an overflow action sheet (D5), a native exit-as-draft flow and the recovery notice. **The route was deliberately NOT promoted**: `/create-project` carries mode B too (≈1,100 lines of desktop wizard), and a promoted route whose "Continue to details" lands on desktop form markup is what §2.2 forbids — so mode B and the promotion land together, and the editor is verified meanwhile at the dev route `/__mobile-editor`. **D2's mechanism did not exist and D2 was slightly wrong:** `MobileShell` gained a real per-slot override (`resolveShellSlots` / `changedShellSlots` / `assertShellSlotOverride`, a closed `MOBILE_SHELL_SLOTS`, and `data-shell-slots` in the DOM so an exception is visible), and the honest override is `immersive` + **both** slots forced back on, not `flow` + two no-ops. **DEF-6, found by the sweep's Tab leg and fixed in shared code:** `screenplayMode.js` bound `Tab` to element cycling with no escape — ten real dispatched Tabs never left `.cm-content` and **each mutated the document**, so a keyboard or switch user who entered the script could not leave and the dock (which follows the editor in DOM order) was unreachable. A live **WCAG 2.1.2** failure on desktop too. `Escape` now blurs `contentDOM`; verified with real keys — after the fix six Tabs walked Elements → Format → Scene → Action → Character → Paren., each with a `rgb(255,255,255) 2px` ring. **43 new tests** (15 dock, 28 editor) plus **11** on the slot contract; mobile suite **422 in 33 files**; `screenplay` + `mobile` together **519 passing**; full suite **1005/1007** (the two documented pre-existing `AppShell.render.test.jsx` failures, by name); lint clean on `src/mobile`, `screenplayMode.js` and `App.jsx`; build + **53-route prerender pass**. **Five-width CDP sweep (320/360/390/430/768) across six states** — default, recovery, error, exit-confirm, read-only, prose — 30 measurements, run against the **live dev server** rather than a static harness, so the real CodeMirror was mounted at every screenplay width (asserted). Every width, every state: **0** targets under 44×44 (`::after` hit regions measured through `getComputedStyle`, not assumed), **0** text under 11px, **0** unnamed controls, **0** contrast failures, no horizontal scroll on page or surface, frame 320→520px, `data-shell-slots="appBar bottomNav"`, and **the dock never overlapping the script** — the property the whole shell-slot decision exists to guarantee. **The sweep's first result was wrong and running it down changed the check:** 8 "overflowing" elements at every width turned out to be the element chips inside `overflow-x: auto` — content past the frame is *what makes it a scroller*. The audit now attributes overflow to the nearest scroll container and asserts the *track* stays in frame; genuine overflow then measured 0 everywhere. **Named as unmeasured rather than implied:** the keyboard inset (headless Chrome has no virtual keyboard) and DEF-5 both need a real device. Prior: **2026-08-09 — bullet 2, first half: the save/resume core (both platforms) and the mobile `/new-project` screen.** Two defects the spike measured are now fixed rather than recorded. **DEF-1:** `lib/keepaliveSave.js` measures the exit-save body against MDN's 64 KiB keepalive cap and refuses to send one that will not fit, instead of advancing `lastDraftSignatureRef` on a request the browser silently discards. The crossing point is now computed by the suite from a 1,219-byte realistic page rather than quoted: **page 13 untrimmed, page 17 after dropping the derived page texts**, and a 100-page feature encodes to **510,233 bytes — 7.8× the cap**. **DEF-2:** `lib/workingDraft.js` gives every draft its own snapshot key, so `/create-project/:draftId` finally has a local fallback; the snapshot also records `step` **and** the Details sub-panel, and carries the server `updatedAt` this session loaded from so `chooseDraftRecovery` can tell "my edits never reached the server" (restore) from "a co-writer saved while I was gone" (ask, never clobber). Found and fixed in my own wiring before it shipped: with the snapshot effect no longer skipping `:draftId`, it ran on the *empty initial state* and cleared the snapshot microseconds before recovery could read it — the guard, and the effect-ordering it depends on, are both commented in place. Also delivered: an offline/failed `loadDraft` now offers the local snapshot instead of showing an empty editor over a draft that has content. Mobile `/new-project` (`ckm-new-project`, `flow` shell) promoted out of `DESKTOP_MIGRATION_FALLBACK`. **410 tests in 31 mobile+lib files** (was 358/29): 42 new unit tests across the two lib modules, 10 on the screen. Full suite **951/953** — the same 2 pre-existing `AppShell.render.test.jsx` failures, re-confirmed by stashing every change and watching the identical 2 fail. Lint clean on all touched files (`index.jsx`'s 4 pre-existing problems verified unchanged by the same stash). Build + 53-route prerender pass. Five-width CDP sweep (320/360/390/430/768) over the real component with the real stylesheets, driven through the DevTools Protocol directly (the Chrome extension was unavailable; Node 22's global `WebSocket` was the client): 0 undersized targets, 0 text under 11px, 0 unnamed controls, 0 overflow past the frame, no horizontal scroll on page or surface, frame 320→520px. **The sweep earned its keep twice.** It caught a real 2.69:1 contrast failure in this session's own CSS — the card chevron on `--ckm-muted-2` — fixed to `--ckm-muted` at **3.56:1**, clearing WCAG 1.4.11's 3:1 floor for a graphical object, and re-measured to 0 failures at every width. And it reported one overflow at 320px that was run down rather than waved away: the harness was measuring the *un-ligatured icon text* (`chevron_right`, ~206px wide) on a cold font cache. Proven, not assumed — awaiting `document.fonts.ready` cleared it, and re-running the widths in reverse order with no font wait moved the artifact off 320px entirely. Prior: bullet 1 (research spike) COMPLETE. §4 gate run across all five routes at once — ~11,300 lines of desktop source plus the server controllers. Deliverables in §19.3: full §4.1 inventory per route, §4.2 research with six primary/product sources, seven §4.2 answers, five §4.3 text wireframes, nine decisions, five defects/risks. Load-bearing finding: `components/screenplay/` is 4,579 lines of which only 2 files are desktop UI, and `ScreenplayEditor.jsx` is a controlled CodeMirror 6 host with a props interface and a 10-method imperative `apiRef` — mobile mounts the same component and rebuilds only chrome. DEF-1 measured rather than asserted: the `fetch(keepalive)` exit-save carries the script text three times against MDN's 64 KiB cap, so it silently drops beyond ~9–16 pages at realistic page density (bounded to ≤3 s of edits by the interval autosave, which is uncapped). DEF-3 is a live desktop WCAG 2.1.1 failure — corkboard reorder is HTML5-drag-only with no keyboard or button path. Two items await the user: the `/script/:id/pay` phase move and approval of a low-fidelity editor wireframe |
| 4. Discovery/project consumption | COMPLETE | Codex | 2026-08-14 | 2026-08-21 | **D32 COMPLETE (2026-08-21):** `/reader/script/:id` reuses the native detail/reader surface; DEF-27 is fixed by one server full-access predicate and structured-text-only previews. 92 focused client tests and all 377 server tests passed. **Prior:** **D30 COMPLETE (2026-08-20):** the buyer's checkout at `/script/:id/pay` is native and both platforms now run on one shared contract (`script-detail/checkout.js` + `useProjectCheckout.js`); `ScriptPaymentPage.jsx` went 659 -> 384 lines and is presentation only. Nine standings, each with a sentence and a way forward; the 72-hour payment window stated for the first time; no disabled control on the screen. DEF-31 (the buyer's currency was never sent, so a USD account was promised rupees and charged dollars) and DEF-32 (a charge the gateway took but whose verification never landed was unrecoverable) both FIXED. Five-width CDP sweep over ten fixture standings at 0 findings. **D29 COMPLETE (2026-08-20):** the detail screen's writes, shared with desktop. **D25–D28 COMPLETE:** the family-wide research gate plus native `/search`, `/top-script`, `/featured`, and all three authenticated project-detail route forms. Search established the URL/paging/action contract; Top extracted the shared discovery card and filter Dialog; Featured reused both, bounded and paged its two sources, and shared its trailer contract with desktop; D28 made the three detail URLs ONE screen and made the DESKTOP page read the same data layer — deleting `ScriptDetail.jsx`'s private copies of the load and of the bookmark rather than adding mobile copies beside them. Eight defects across the four sessions: DEF-20 (a `mid` facet that matched nothing, because the enum is `medium`), DEF-21 (script bodies and private asset URLs in list responses), DEF-22 (`limit` accepted and ignored), DEF-23 (a global desktop-only modal covering every native screen, now gated on the router's own policy so it retires route by route), DEF-24 (an unlayered `button { color: inherit }` silently killing every Tailwind text-colour utility on a button — recorded, needs a desktop visual pass), DEF-25 (the detail response gated two body fields and shipped two more past that gate, including the private `fileUrl`), DEF-26 (`creator.email`/`creator.phone` populated for every viewer, bypassing the paid contact-reveal quota), DEF-28 (four copies of a closed rights enum, one of them missing a value, so a writer's chosen term rendered to buyers as "Not specified"). **DEF-27 is LIVE, UNFIXED and blocked on a product decision:** `GET /scripts/:id/pdf` serves the complete screenplay to any authenticated viewer who clears the marketplace gate, with no purchase check — the fix is entangled with what the desktop preview panel should receive instead. D28 evidence: mobile suite **905 in 58 files** (from 856/56), server **368/368**, a **30-measurement six-state five-width** CDP sweep at **0** findings after three real fixes, a five-width reader-dialog leg with 12 real Tabs and 0 escapes, and 53 public routes prerendered with separate `ProjectDetailMobile`, shared `useProjectDetail` and shared `TrailerDialog` chunks. The D29 write half, public share detail and payment remain. **D29 COMPLETE (2026-08-20): the WRITE half, shared rather than duplicated.** `pages/script-detail/projectActions.js` and `useProjectActions.js` now own nine endpoints (purchase request create/approve/decline, reader reviews, producer ratings, contact reveal, message-slot, meeting + calendar connect, delete) for BOTH platforms; `ScriptDetail.jsx` lost 262 lines to them and gained 75. The native screen grew `feedback`, `purchase` and an owner-only `manage` section, five new components (`StarRating`, `FeedbackSheet`, `PurchaseRequestSheet`, `PurchaseRequestList`, `MeetingSheet`) and NOT ONE disabled control — every withheld action states its reason as text. Two server defects: DEF-29 (the contact-reveal endpoint disclosed any user's email and phone, not only a writer's — FIXED with seven tests) and DEF-30 (a malformed id answered 500 on the message-slot endpoint — FIXED). The writer's request poll also stopped running in hidden tabs. Evidence: mobile+detail 990 in 65 files (from 905/58), server 375/375, an 80-measurement five-width sweep over eight fixture states AND eight opened overlays at 0 findings, and 60 real Tab/Arrow stops through the rating sheet with 0 escapes. `/script/:id/pay` and the public share detail remain. |
| 5. Profiles/network/messages | COMPLETE | Codex | 2026-08-21 | 2026-08-22 | **D33–D46 COMPLETE:** signed-out public, authenticated visitor, own-profile overview/editor/settings/credentials, bounded public Activity and private Saved lists, inbound follow requests, full message inbox/thread including attachments/mutations/context/meetings, own/visitor reader profile, and the collaboration family are native. Shared contracts own profile/actions/security/collections, payout and guild credentials, follow decisions, message requests/mutations/context, meetings, reader activity, collaboration requests, recipient invitations, and sanitized cross-project activity. D46 closes the exit gate by replacing the unbounded base-profile post/saved payload with one paged, access-checked desktop/native collection boundary. |
| 6. Challenges/hall of fame | COMPLETE | Codex | 2026-08-22 | 2026-08-22 | **D47–D51 COMPLETE:** canonical hub, detail, registration, participant dashboard, Hall of Fame archive, and permanent Hall records are native over shared desktop/native contracts. Operational/community and public archive/script collections are projected, bounded, and paged; challenge and record URLs preserve canonical slugs/query state; public/member chrome, lifecycle/payment/recovery, editor handoff, results/rewards/certificates, dynamic SEO, and privacy boundaries are covered. The closing D51 gate passed 41 focused client tests, all 483 server tests, production build/prerender, the exact six-failure client baseline, and 45/45 browser measurements. |
| 7. Industry/reader | COMPLETE | Codex | 2026-08-22 | 2026-08-23 | **D52–D56 COMPLETE:** industry home/dashboard, roster, mandates, offer/ledger/saved variants, reader Home/Discover plus shared discovery/messages/detail/profile ownership, and the cross-audience transition/permission matrix are native and role-safe. One app-level boundary prevents foreign route content or chrome before desktop/mobile selection; canonical homes, auth restoration, authorized returns, onboarding session refresh, and Back/Forward denial behavior are covered. |
| 8. Public/auth/onboarding/legal | IN PROGRESS | Codex | 2026-08-23 | — | **D57–D58 COMPLETE:** canonical `/` is a native shared-public landing; all 21 SEO content patterns / 41 registered paths now use one native renderer over a shared desktop/native content resolver with canonical prerender ownership and explicit noindex recovery for invalid slugs. About, Contact, Pricing, and Challenge marketing are next. |
| 9. Admin/finance | NOT STARTED | — | — | — | — |
| 10. Hardening/release | NOT STARTED | — | — | — | — |

**Latest Phase 3 evidence (2026-08-13, eighteenth session):** D24 replaces current-client whole-file trailer/pitch transfer with an authenticated, expiring, server-authoritative Cloudinary range contract. Eight controller tests cover owner/plan/size gates, SHA-256/range validation, sequential and idempotent part writes, completion, abort, expiry, and deferred upstream cleanup after cancellation; the full server suite passes 343/343. The shared client uploader has 13 focused tests including a real resume from part 1, and the broader create/upload regression passes 16 files / 265 tests. Existing competition/navigation work remains green at 8 files / 266 tests. Touched source lint is clean; production build transforms 4,063 modules and prerenders/verifies all 53 public routes. Full client baseline is 1,570/1,575: four already-recorded stale `AppShell.render` expectations and one unrelated WriterRoster gate expectation (also fails alone); every touched suite is green. No real Cloudinary asset or physical device was used. All code-backed Phase 3 bullets are complete; the existing real-device editor debts remain explicit.

**Prior Phase 3 evidence (2026-08-13, seventeenth session):** D23 removes the competition query exclusion only after shipping native deadline/count chrome, shared pitch fields, a shared desktop/mobile flush-before-submit operation, both irreversible acknowledgements, server-error handling, success return and submitted locking. Writer Projects is restored through a compact-only nav item while Create stays in the desktop rail/drawer. The broad focused matrix passed 20 files / 464 tests; after the browser-found overlay stacking correction, the affected matrix passed 8 files / 293 tests. Touched files lint clean apart from `CreateProject/index.jsx`'s exact four pre-existing findings. The 4,063-module production build passes with its pre-existing admin circular-chunk and chunk-size warnings. Chromium at 320/360/390/430/768 across base/pitch/submit states found zero targets under 44px, unnamed controls, text below 11px, or horizontal document/root/dialog overflow; at 768 the frame remained centred at 520px. The sweep found and fixed one real issue: dialogs first lived inside the app-bar stacking context, letting the editor dock paint above their footer; they now live in `MobileShell`'s overlay slot and cover the complete frame. Phase 3 remained open for D21's server-backed resumable contract and the recorded real-device editor verification debts.

**Prior Phase 3 evidence (2026-08-13, sixteenth session):** Both creation routes now share deterministic 25 MiB large-video preflight, one fresh AbortController per concurrent media attempt, cancelled-versus-failed recovery, disabled file mutation during transfer, and honest from-0 retry against the retained script id. Focused helper/model/render coverage passes (8 files / 221 tests); the create/upload orchestrator regression passes (3 files / 13 tests, with the updated success-flow file clean at 2/2); touched lint is clean apart from `CreateProject/index.jsx`'s exact four pre-existing findings; the 4,061-module production build and all 53 prerendered routes pass; and the six-state × five-width Chromium matrix passes 30/30 with no new-action sizing/name, copy, or horizontal-overflow failure. Phase 3 remains open for the D21 server-backed resumable contract and the recorded competition/bottom-nav product decisions; see the newest §19.3 entry.

### 19.3 Session log template

#### 2026-08-26 — Claude — D59: native account entry — sign in, sign up, OTP, recovery, invite (IMPLEMENTED; DEVICE VERIFICATION PENDING)

**Route/state audit.** The native app has shipped eight phases of screens and has no auth of its own. A phone visitor who taps "Sign in" gets the *desktop* `AuthModal`: a 1000px two-column card with an Unsplash photo column, `.ckam-*` classes unscoped by `.ckm`, and desktop `useScrollLock` contending with `ckm-html-lock`. "Join as Writer" gets `WriterOnboardingModal` — 1391 lines, nine steps, a per-step editorial still, desktop metrics. `/login`, `/join` and `/signup` are `<Navigate to="/">` on both platforms, which drops the query and opens nothing, so every marketing link to `/signup` is a dead end and `ReferralCodeRedirect`'s `/signup?ref=CODE` survives only because it wrote to `localStorage` first. `/forgot-password` and `/invite/:token` are desktop pages inside the phone frame. A signed-out deep link to `/dashboard` and a mid-session expiry both land on `/?reason=…`, which pops the same desktop modal over the mobile landing. `pages/AcceptInvite.jsx` already carries the diagnosis in a comment: *"`/signup` and `/login` are both `<Navigate to="/">`, and nothing reads the `next` param — sending an invitee there dropped them on the homepage and lost the invite entirely."*

**Two defects found by reading, before any code was written — DEF-33 and DEF-34, both recorded in §19.1.** The first is that sign-in has been *impossible product-wide* since 2026-08-23: `AuthModal.jsx` lost its `motion` import and kept three `<motion.div>` usages. Nothing caught it because no suite mounts that component on either platform. The second is that every account created through the primary sign-up path has had no client-side auto-logout timer and no attribution, because `OTPVerification` persists the session itself and its three callers each re-do four fifths of what `AuthContext` already does properly.

**State matrix:**

| Route | Signed out | Signed in | Refusals rendered in place |
|---|---|---|---|
| `/login` | native sign-in: email/password, Google, recovery link, "create an account" | falls through `signedOutOnly` to desktop's `<Navigate to="/">` | invalid credentials, deleted, frozen (+reason), pending email change, network, server |
| `/login` + `requiresVerification` | advances **to the OTP step**, not a toast | — | expired code, wrong code, resend cooldown |
| `/join` | role chooser: Writer, Producer/Director, Industry professional | as above | — |
| `/signup?as=&step=&ref=` | role stepper, step in the URL, draft resume offered | as above | weak password (five server rules mirrored client-side), duplicate email, referral already used, invalid referral, username taken |
| `/forgot-password` | native recovery over the existing headless `useForgotPasswordFlow` | as above | unknown email answered non-committally, expired code clears the boxes |
| `/invite/:token` | explains the invite, then signs in and accepts | resolves and accepts | missing token, expired, already used |
| any of the five with `?redirect=` | preserved through OTP and onboarding, then resolved by `resolvePostAuthPath` | — | a return path that the account's audience may not enter falls back to its default workspace |

**Entry-screen wireframe (320–430px, dark chrome, one column):**

```text
[×]                                   /login
                                            ← PUBLIC shell, no bottom nav
  WELCOME
  TO CKRIPT                                 ← Baskervville, brand voice kept
  Where stories become films.

  Email        [____________________]
  Password     [____________] [show]        ← 44px targets, ckm-control
                              Forgot?
  [        Sign in         ]                ← docked, rides the keyboard

  ──────────── OR ────────────
  [   Continue with Google   ]              ← width-constrained iframe wrapper

  New to Ckript?  Create an account →       ← /join
```

**Why the photo column did not come across.** The desktop surfaces are editorial — a full-height still beside the form, crossfading on role hover. On a 390px screen with a keyboard raised, the form has roughly 400px of usable height, and an image would take a third of it to say something the words already say. The brand voice survives in the type (Baskervville display, PT Serif body, loaded through the *same* `ckript-authmodal-fonts` link id so no second font link is injected); a full-bleed still behind a scrim appears on `/join` only, which is the one screen that is a choice rather than a form.

**Two blockers the audit did not predict, both found by reading the server rather than by a failing test.**

1. **`PUT /onboarding/writer-profile` refuses without gender and nationality** — a flat 400, "Gender and Nationality are required", checked before anything else is written. The native writer flow had been designed without them (they are GDPR Art. 9 special-category data, and `authDraft` refuses to persist them), which would have meant a writer completing eight steps and failing on the ninth with a message about a question they were never asked. They are now collected on the About step with "Prefer not to say" in both lists, sent once, and still never written to storage — the draft's exclusion rule is now load-bearing rather than merely cautious. Pinned by four tests so the shape cannot come back.
2. **`POST /auth/join` was being handed a `subRole` that could not exist yet.** The account is created on step 3 and the industry flow does not ask which kind of professional until step 5, so the field was always an empty string dressed as a value. Removed; the `identity` save point writes it through `/users/update` at the moment it is actually known.

**A third defect, found by ESLint and worth more than the two lines it took.** `src/context/ToastContext.jsx` imported `motion` and used `<motion.div>` — working code that this project's ESLint reports as an unused import, because no rule here counts a JSX member expression as a use. That is precisely the report someone "fixed" on 2026-08-23 by deleting the import from `AuthModal.jsx`, taking sign-in down on both platforms (DEF-33). The toast host is the app-wide transient-message layer and would have failed the same way. Both files now alias to `Motion`, the convention six other files in this codebase already use for this exact reason, so the error cannot come back and invite the same fix.

**Evidence.**

- **New tests: 97 in 5 files** (`authModel.test.js` 30, `authDraft.test.js` 14, `SignInMobile.render.test.jsx` 13, `SignUpMobile.render.test.jsx` 27, `AuthScreens.render.test.jsx` 13), plus **26 new cases** in `mobileRoutePolicy.test.js`, measured by stashing the file and re-running: **93 before, 119 after**.
- The `authModel` suite pins every client rule against the server branch it mirrors — the five password conditions individually, the email bounds, and the username pattern *including that a typed capital is accepted*, because `join` lowercases before matching and refusing it would be stricter than the server for no reason. Every refusal code is covered, including the two that arrive in two different shapes (`requiresVerification` is a 403 body from `/auth/login` and a 200 body from `/auth/join`).
- The `authDraft` suite asserts the exclusions against the **raw stored string**, not the parsed object: a leak a getter could hide is still a leak on disk.
- **Full client suite: 2426/2441 passing, 15 failures, and all 15 are accounted for.** Five are the exact pre-existing set §19.1 already records — the four stale `AppShell.render.test.jsx` nav assertions and the `DataTable` CSV export. The other ten are 5000ms timeouts under full-suite concurrency (`financeSession` ×3, `ProjectDetailMobile` ×2, `ChallengeRegisterMobile` ×2, `FeaturedProjectsMobile`, `Upload`, `WriterRosterPage`), on a run whose per-file durations reached 72s. **Every one of them was re-run and passes** — the five mobile files and `WriterRosterPage` green together in one 122-test run, `financeSession` green 10/10 alone. Not one failure is an assertion. This is the flakiness §19.1 has recorded since 2026-08-11, and it was confirmed rather than assumed.
- **Production build passes**: 3m39s, **53/53 routes prerendered and verified**. All five auth screens code-split into their own chunks (`SignInMobile`, `RoleChooserMobile`, `SignUpMobile`, `ForgotPasswordMobile`, `AcceptInviteMobile` + the `ios/` surface, control and sheet stylesheets / `SignUpMobile.css` / `AcceptInviteMobile.css`), so none of this reaches a signed-in member's first load. No new chunk crosses the 500 kB warning line.
- **ESLint clean** on every touched file. The four `react-refresh/only-export-components` errors remaining in `src/context/` are pre-existing and shared by `CurrencyContext`, `DarkModeContext`, `StreakContext` and `ToastContext`.
- **`client/public/sitemap.xml` is modified with 53 `lastmod` date bumps.** That is `npm run seo:sitemap` running as the first step of the build, not a D59 change; no URL was added or removed.

**What is NOT verified, stated plainly.** No fresh browser, physical-device or screen-reader result is claimed — this environment still lacks the prescribed agent-browser CLI and Chrome/Edge, the same gap D54 and D58 recorded. Specifically: every contrast figure for this family is **computed** from the WCAG 2.x relative-luminance formula against `#0f0f0f`, in the same manner as `theme/tokens.css`, and none is measured in a browser. The keyboard-aware docked footer uses the mechanism `Sheet` has had since Phase 1 and has still never met a real virtual keyboard. The six OTP boxes have never been offered a real SMS or mail autofill. And **no account has actually been created end to end** through the native stepper against a live server — all three flows are tested against a mocked boundary. Those four are what §18's unchecked box means, and they are the `next_action`.

#### 2026-08-23 — Codex — D58: shared native SEO content renderer (COMPLETE)

**Route/content audit:** `App.jsx` exposes 21 SEO content patterns covering 41 registered paths: 27 exact marketing/resource/tool/FAQ pages, 3 blog posts, 4 genres, and 7 long-form guides. `seoRoutes.js` remains the canonical source for title, description, canonical URL, schemas, sitemap, and the 53-route prerender pass; it does not execute either React renderer. The desktop `SeoPage` previously owned a private content resolver and silently rendered generic Ckript copy for every unknown dynamic slug. D58 extracts that resolver into `seo/seoPageContent.js` so desktop and native consume the same content, related links, and explicit found/not-found state. Unknown slugs within a registered SEO family now render recovery navigation and `SeoManager` marks them `noindex, nofollow`; unrelated dynamic application routes are not caught by that rule.

**State matrix:**

| State | Content | Navigation/conversion | SEO behavior |
|---|---|---|---|
| Registered marketing/tool/resource path | eyebrow, one h1, canonical description, 2–3 content chapters | breadcrumb, up to 8 deduplicated related links, account-aware CTA | existing registered canonical metadata and schemas |
| Registered blog/genre/long guide | programmatic title and canonical description over shared supplemental chapters | same public-shell navigation and CTA | existing article/genre/guide canonical ownership |
| FAQ | one h1 plus four native disclosure controls | related links and account-aware CTA | existing FAQ schema; duplicate generic chapter cards removed on both platforms |
| Unknown slug inside a registered family | explicit not-found heading and four recovery links | no dead end; signed-out/authenticated header remains available | fallback metadata plus `noindex, nofollow`; never added to sitemap/prerender |
| Signed-in viewer | same public content | header/final CTA returns to canonical audience workspace | no authenticated app chrome or boot delay |

**Reusable public-shell wireframe:**

```text
[Ckript]                                      [Sign in / workspace]
[Home / family / current breadcrumb]
[EYEBROW]
[One editorial H1]
[Canonical description]
[01 content chapter]
[02 content chapter]
[03 content chapter, when present]
[FAQ disclosures, FAQ route only]
[Related Ckript pages →]
[Account-aware final CTA]
[Privacy] [Terms] [Contact] [legal entity]
```

**Implementation:** Added `mobile/marketing/SeoContentMobile.jsx` and its registered `ckm-seo-page` CSS family, promoted all 21 patterns to `SHARED_PUBLIC_SCREEN`, and routed them to the reusable public presentation for anonymous and authenticated viewers. Added `seo/seoPageContent.js`; desktop `SeoPage` now consumes it too instead of retaining a parallel resolver. The native presentation uses one public `MobileShell` scroll surface, horizontally scrollable breadcrumb semantics, editorial chapter cards, native FAQ disclosures, bounded related navigation, 44px actions, and account-aware sign-in/workspace conversion. No API/data contract was duplicated.

**Verification:** Focused content, render, route-policy/coverage, and CSS-contract suites pass **195/195**; touched ESLint is clean. The full client passes **2,313/2,318** across 197 files with exactly the five recorded unrelated failures: four stale `AppShell.render.test.jsx` compact-nav/upload expectations and `DataTable.test.jsx`'s CSV-header expectation. Production transformed **4,216 modules**, emitted `SeoContentMobile` as a separate ~3.59kB JS / ~5.39kB CSS slice, and prerendered/verified **53/53** public routes. A real-browser five-width sweep at 320/360/390/430/768px measured one main, one h1, the public shell, correct 320→520px framing, zero document overflow, zero undersized or unnamed controls, and no framework/page errors. It found three short breadcrumb/footer links below the 44px width target; their hit regions were fixed and all widths re-measured clean. At 390px, FAQ disclosure opened, an invalid tool slug rendered recovery with `noindex, nofollow`, and a related link navigated back to registered indexed content. The full-page feature rendering was visually inspected.

**Limitations:** No physical-device, operating-system screen-reader, installed/PWA, or virtual-keyboard run is claimed. These pages contain no text input or fixed action dock, so the remaining D58 risk is principally assistive-technology reading order rather than keyboard avoidance.

**Exact next action:** Begin D59 at About, Contact, Pricing, and Challenge marketing: inventory content, overlays, forms/API writes, pricing/plan data, challenge CTA ownership, SEO/prerender behavior, account-aware actions, and failure states; define shared seams and four public-shell wireframes before promotion.

#### 2026-08-23 — Codex — D57: native landing/marketing public shell (COMPLETE)

**Requested continuation and route audit:** Continue from completed D56 and begin Phase 8 at the canonical homepage. `/` is still `desktop-migration-fallback`; `App.jsx` owns the one canonical route and lazy desktop `Landing`, while `SeoManager` reads the static `/` record from `seo/seoRoutes.js` and `scripts/prerender-seo.mjs` writes/verifies `dist/index.html` without executing either React presentation. The native branch can therefore replace presentation at the same URL without forking metadata, canonical links, JSON-LD, sitemap, or crawler output. The desktop landing orchestrator has eleven content beats plus two overlays: Hero and `LandingNav`; conditional public competition deadline strip over `/competitions/list` and `/competitions/completed`; How-it-works bridge; three-step discover/watch/own story; marquee; seven-feature switcher; five-format gallery; sample-trailer dialog; two-sided writer/industry problem; two partner cards and a partner-detail dialog; final CTA; and the statutory footer. Its actions open sign-in, writer onboarding, producer onboarding, About, Pricing, internal Challenge/Contact/Privacy/Terms routes, two external sites, or the sample trailer. The landing data arrays and `useChallenge` are presentation-independent and will be imported, not copied.

**Current primary-source review and decisions:** [WCAG 2.2 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow) sets the 320 CSS-pixel single-column floor; [Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) is the standards floor while Ckript retains its stricter 44px product target. The [APG accordion pattern](https://www.w3.org/WAI/ARIA/apg/patterns/accordion/) requires native header buttons with `aria-expanded`/`aria-controls`, so the seven-feature desktop rail becomes a one-panel-at-a-time mobile accordion rather than a horizontally compressed tab rail. The [APG modal-dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) requires inert background, contained focus, Escape, visible close, and focus return; trailer and partner details therefore use the existing native `Dialog`/`Overlay` stack rather than the desktop fixed overlays. Current [web.dev image guidance](https://web.dev/articles/browser-level-image-lazy-loading) keeps the first-viewport visual eager and defers offscreen format/feature/partner imagery with declared dimensions/aspect boxes to avoid layout shift. The public shell owns one vertical scroll surface; no bottom app navigation appears on a marketing page.

**Logged-out versus signed-in public-shell matrix:**

| Entry/action | Logged out | Signed in | History/overlay rule |
|---|---|---|---|
| Open `/` on a phone | native public landing, no account chrome | same public landing; membership is acknowledged rather than forcing an app redirect | canonical `/` remains in history and retains homepage SEO |
| Header account action | open sign-in overlay with safe return ownership | link to `getDefaultAuthenticatedPath(user)` | deliberate app navigation pushes; modal returns focus to its trigger |
| Browse/discover CTA | open producer onboarding | reader uses `/reader/search`; other known members use `/featured`; unknown role uses canonical home | route navigation remains link semantics |
| Writer/start CTA | open writer onboarding | writer uses `/new-project`; non-writer uses its canonical home | no onboarding is opened over an already authenticated account |
| Challenge deadline | logged-out registration opens auth with captured canonical target; live theme opens directly | opens canonical challenge registration/detail | existing public data hook and URL contract are shared |
| About/Pricing | existing global overlay until their own Phase 8 items land | same account-aware overlay | never stack native trailer/partner dialogs with global overlays |
| Trailer/partner detail | native full-screen dialog | same | background inert; Escape/close; focus restored; video paused/reset on close |

**Text wireframe (one primary scroll surface):**

```text
Public app bar: Ckript logo · Menu
  Menu dialog: Scripts · Challenge · For producers · Pricing · Contact · Sign in/Open app

Hero: editorial promise · short value statement · Browse/Open Ckript · Meet the platform
Conditional challenge deadline strip
How it works: 01 discover · 02 watch · 03 own · contextual discovery action
Editorial marquee
Tools: seven accessible accordion headers; one detailed image/copy/bullet panel at a time
Formats: five lazy image cards in a horizontal snap rail · contextual writer action
Trailer: cinema still · Watch sample -> full-screen video dialog · start/discover action
Problem: writer card · industry card · account-aware actions
Partners: two touch cards -> one full-screen detail dialog with a two-option selector and external site link
Final CTA: account-aware writer and discovery actions
Footer: Platform · Company · Legal links · corporate disclosure · email
```

**Implementation boundaries decided before code:** `mobile/marketing/LandingMobile.jsx` owns the mobile composition and native overlays; it imports the canonical landing content/data and global auth controller but not desktop section JSX or CSS. `/` becomes `SHARED_PUBLIC_SCREEN` with `public` shell and remains available to both anonymous and authenticated viewers. The native page receives no duplicate `SeoManager` or route-specific head effect. The public route skips the authenticated app's deliberate boot drawing so the homepage has immediate content; below-fold media is lazy, the decorative hero uses one light local asset, and reduced motion removes marquee travel. The implementation will add tests for route disposition, anonymous/member CTA routing, complete section inventory, accordion semantics, dialogs, video cleanup, and footer/legal content before browser measurement.

**Changes and integration defects fixed:** Added `mobile/marketing/LandingMobile.jsx`, `LandingMobile.css`, `landingModel.js`, and their tests; registered `ckm-landing`; promoted `/` to `SHARED_PUBLIC_SCREEN`; wired the lazy route and public boot bypass; and added explicit `MobileRoutes`/`MobileApp` coverage. The screen contains Hero, challenge deadline, journey, marquee, seven-feature accordion, five-format snap rail, trailer, two-sided problem, partner cards/detail, final CTA, complete footer/legal disclosure, account-aware menu, and native dialogs. Browser inspection found three integration defects that unit markup could not expose: the global cookie banner lived behind the `z-index:1000` native app and was unusable, the hard-coded `EventPosterModal` painted above every native screen/dialog, and both desktop/native trailer presentations pointed at the nonexistent `/nexara-trailer.MP4`. Consent now mounts inside the native frame with safe-bottom placement and 44px decisions, the legacy poster stays desktop-only because native carries the current challenge inline, and both landing presentations use one exported `TRAILER_VIDEO_SRC` backed by the tracked `ckript-video.mp4`. Standalone footer targets also retain the product's 44px minimum.

**Verification:** Focused route, model, render, integration, and policy coverage passed **137/137**; touched-file ESLint is clean. Full client passed **2,241/2,246** across 195 files with exactly the five recorded unrelated failures: four stale `AppShell.render.test.jsx` mobile-nav/upload expectations and the `DataTable.test.jsx` CSV header expectation. Production build transformed **4,213 modules**, emitted `LandingMobile` as a separate ~14.34kB JS / 16.11kB CSS slice, and prerendered/verified **53/53** public routes; the existing large-chunk and admin circular-chunk warnings remain. The tracked trailer is requested only after the viewer presses play. A deployment correction after D58 replaced the original 76.0 MB file with a 21.4 MiB, 1280×548 fast-start H.264/AAC encode so its emitted asset stays below Cloudflare Pages' 25 MiB ceiling; the full duration passed decode and a source/output frame comparison. Headless Chrome 151 measured base, expanded feature, menu, partner, and trailer states at **320, 360, 390, 430, and 768px**: **25/25** combinations had one `main`, one `h1`, public shell, correct 320→520px frame, and zero horizontal-scroll, genuine-overflow, undersized-target, unnamed-control, sub-11px-text, framework-overlay, or missing-media findings. Twelve real Tab cycles stayed in the menu; Escape closed it, cleared inertness, and restored focus to the exact trigger. Four 390px screenshots were visually inspected after removing the legacy poster collision.

**Limitations:** No physical-device, virtual-keyboard, operating-system screen-reader, or installed/PWA run is claimed. The current 21.4 MiB MP4 is valid, on-demand, and Pages-compatible; adaptive delivery remains a future optimization if production media budgets or connection-aware quality tiers require it.

**Exact next action:** Begin D58 at `pages/SeoPage.jsx` and `seo/seoRoutes.js`: inventory every registered path/slug, dynamic not-found state, prerender/canonical ownership, internal navigation, and long-content behavior; write one shared public-shell content wireframe, then implement and promote the reusable `mobile/marketing/SeoContentMobile.jsx` / `ckm-seo-page` route family.

#### 2026-08-23 — Codex — D56: audience transitions and permission matrix (COMPLETE; PHASE 7 COMPLETE)

**Requested continuation and audit:** Continue from completed D55 and close the remaining Phase 7 audience-transition gate. The audit covers `App.jsx`, `AuthContext`, `PrivateRoute`, `AuthModal`/`AuthModalContext`, writer and film-professional onboarding completion, `shellPolicy`, `mobileRoutePolicy`, and every desktop/mobile navigation preset. Two live defects were found before implementation: post-auth return paths are checked only for a local leading slash and can return an account directly into another audience's page; film-professional onboarding's finish-later path is `/dashboard` even though the audience navigation model declares `/home` as its canonical home. Reader-only and industry-only mobile routes currently fall back to the desktop route tree for a denied audience, where no equivalent audience guard exists, so a foreign desktop page can still render.

**Research and transition decision:** Current [React Router `useNavigate` guidance](https://reactrouter.com/api/hooks/useNavigate) confirms `replace` removes a transient route from browser history and that numeric history navigation is unsafe without a known entry. [OWASP redirect guidance](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html) requires a user-controlled return URL to be local, appropriate, and authorized for the user. D56 therefore uses one pure audience policy for default homes, audience authorization, and post-auth return resolution; denied direct URLs replace themselves with the viewer's canonical home so Back cannot reopen the foreign page. Auth loading renders no audience chrome, and a valid same-audience return preserves its path, query, and hash.

**Written transition matrix:**

| Transition | Writer / creator | Industry / actor | Reader | Required history behavior |
|---|---|---|---|---|
| Auth restore on own home | `/dashboard` | `/home` or valid `/dashboard` | `/reader` | hold neutral loading surface until restored role is known |
| Sign in without return target | `/dashboard` | `/home` | `/reader` | push from the deliberate sign-in action |
| Sign in with valid shared/owned target | preserve full local path/query/hash | preserve full local path/query/hash | preserve full local path/query/hash | preserve the requested destination |
| Sign in or direct URL to foreign audience route | `/dashboard` | `/home` | `/reader` | replace the unauthorized/transient entry |
| Onboarding complete / finish later | writer profile or safe captured writer target | review state on complete; `/home` on finish later | reader onboarding is Phase 8, unchanged | completion replaces the onboarding entry |
| Role/audience changes in session | recompute writer nav/content from current user | recompute industry/actor nav/content from current user | recompute reader nav/content from current user | old audience URL is replaced when no longer authorized |
| Back / forward after denial | never reveal foreign content or chrome | never reveal foreign content or chrome | never reveal foreign content or chrome | guard re-evaluates every location |

**Changes and defects fixed:** Added `routing/audienceTransitions.js`, `AudienceTransitionBoundary.jsx`, and 55 policy/navigation/render tests. The boundary wraps `RootExperience`, so neither a desktop migration fallback nor a native screen can mount foreign audience content. `AuthModal` and in-context writer onboarding now resolve captured returns through the same authorization policy. `AuthContext.updateSessionUser` preserves tokens while immediately persisting server-returned onboarding state, and cached auth no longer releases the loading boundary before `/auth/me` confirms the role. Producer/industry finish-later now uses `/home`; admin impersonation uses the impersonated role's canonical home. Exact reader routes require the actual `reader` role, unknown roles land on the shared profile rather than inheriting reader content, and actor accounts are refused professional mandates/holds.

**Verification:** The focused D56 matrix passed 324/324 before final hardening; the final routing family passes 55/55 and touched ESLint is clean. The full client is 2,218/2,223 across 191 files with exactly the known five unrelated failures: four stale `AppShell.render.test.jsx` expectations and DataTable's CSV-header casing expectation. Production build passes with 4,209 modules and the existing admin circular-chunk/large-chunk warnings; 53/53 public routes prerender and verify. Real Chrome with mocked `/auth/me` checked writer `/reader` denial at 320/360/390/430/768px, always landing `/dashboard` with `scrollWidth === innerWidth` and no reader heading; producer `/reader` landed `/home` with only Discover/Featured/Messages/Profile compact navigation; actor `/mandates` landed `/home` without professional actions; reader `/home` landed `/reader`, while `/reader/search?q=night#results` retained query/hash and Reader navigation. A real history sequence kept `/featured` behind the denied `/reader` entry: Back returned to Featured and Forward returned to the replacement `/dashboard`. Browser errors were empty; console contained only Vite connection and React development notices. No physical device or screen-reader run is claimed.

**Exact next action:** Begin D57 / Phase 8 at `pages/landing/Landing.jsx`: inventory every section and overlay, public SEO/prerender behavior, logged-out/authenticated shell transitions, and auth entry points; write the mobile public-shell wireframe before promoting `/` from migration fallback.

#### 2026-08-23 — Codex — D55: reader home, discover, and shared reader journeys (COMPLETE)

**Requested continuation and audit:** Continue the native implementation from completed D54. `/reader` and `/reader/search` currently render the industry Investor Desk verbatim, including standing-brief, mandate, watchlist, buyer-score, and industry-access language, and both call `/scripts/investor-home`. The existing `/scripts/reader-search` endpoint is otherwise used only by the global suggestion box; it admits every authenticated role, mutates missing script SIDs during a GET, returns broad Script documents including screenplay/private-asset fields, and allows a 100-item page. Featured, Top Scripts, Messages, `/reader/script/:id`, and `/reader/profile/:id?` already have suitable native presentations. Messages already allows every authenticated participant to read and continue an established thread but refuses unsupported new role pairs; reader accounts cannot schedule industry meetings.

**Research and interaction decision:** Current [Apple search-field guidance](https://developer.apple.com/design/human-interface-guidelines/search-fields) distinguishes an unfocused search entry that supports browsing from a focused search task, and recommends immediate refinement, clear scope, and simplified relevant results. Current [Android search-bar guidance](https://developer.android.com/develop/ui/compose/components/search-bar) treats search as the primary persistent control when finding content is the screen's purpose and places filtered results below it. [WCAG 2.2 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow), [Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html), and [Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) keep the result stack linear at 320 CSS px, preserve search → filters → status → results order, and support Ckript's stricter 44px target floor. D55 therefore makes Home a calm, unfocused reading feed and Discover a dedicated search screen; it does not reuse industry mandates or place a second search control in the app bar.

**Written wireframe:**

```text
/reader — Reader home
Audience: exact reader role; authenticated; other audiences remain on their existing route branch
Top app bar: reader-aware account/search bar
Scroll: reader greeting → Continue reading when present → Favorites when present → Fresh projects → Featured/rankings links
Primary action: open a project at /reader/script/:id; secondary save/share remains on shared cards
Bottom navigation: reader Home · Discover · Messages with drawer access to Featured, Top Scripts, Profile
States: loading; fully failed/retry; fresh-feed degraded while private shelves survive; empty private shelves omitted; all-empty explanation
Back/keyboard/safe area: shell owns safe areas; no keyboard on entry; project detail returns to /reader

/reader/search — Reader discover
Audience: exact reader role; authenticated
Top app bar: reader-aware chrome; Discover remains current
Scroll: h1 → persistent labelled search → format and genre filters → result count/live status → one-column paged project list
Primary action: open /reader/script/:id; bookmark/share remain shared card actions
States: loading; idle/latest; no result; initial failure/retry; append pending/failure/retry
URL/back: q, category, genre, and page are canonical URL state; filter/query changes replace history and reset page; project opens push history
Long text: card titles/loglines wrap; filters stack below 360px; no horizontal page scroll
Desktop transformation: desktop `/reader` and `/reader/search` consume the same contract, without inheriting industry brief/mandate copy
```

**Design checkpoint:** Functional inventory, route/back behavior, data ownership, prefix (`ckm-reader-home`), states, and permission boundaries are decided. The shared reader loader starts independent fresh/read/favorite requests together and retains useful successful shelves when one leg fails. Search stays bounded and response-projected; only the reader role may call its dedicated endpoint. Existing Featured, Top Scripts, Messages, script detail/reader, and reader profile presentations are reused by extending audience ownership and tests, not forked. Highest risks are leaking screenplay bodies through search, cross-audience access to reader-only routes, stale query responses, an all-empty home being mistaken for load failure, and reader navigation opening a canonical non-reader project URL. Verification will cover pure query/normalization, hook cancellation, native render states, route policy/render/coverage, server authorization-before-query/projection/paging, focused regressions, lint, build, and available viewport tooling.

**Implementation result:** Added the shared `pages/reader-home/readerHome.js` and `useReaderHome.js` boundary plus separate desktop and native presentations. Home starts fresh/read/favorite requests together, keeps successful shelves when another fails, distinguishes full failure from all-empty, and keeps private counts private. Discover keeps `q`, `category`, `genre`, and `page` in the URL, debounces and cancels obsolete requests, clamps impossible pages, and uses explicit paging rather than an unbounded feed. `/scripts/reader-search` now refuses non-readers before database work, uses a positive visitor-safe projection, escapes user search, caps page/limit, clamps past-the-end pages, and no longer writes SIDs from a GET. Featured, Top Scripts, Messages, reader detail, and reader profile stay the existing screens; only audience/path-aware behavior and copy changed. A deterministic `/__mobile-reader` harness was added for verification and remains development-only.

**Verification:** The final focused reader/route/Featured/Messages/CSS matrix passes 145/145; the dedicated server boundary tests pass 2/2 and the complete server suite passes 513/513 in 96 suites. Touched client and server ESLint are clean, as is `git diff --check`. The full client suite is 2,165/2,170 with exactly the five established unrelated failures: four stale `AppShell.render.test.jsx` expectations and the DataTable CSV-header expectation. The production build transforms 4,207 modules and prerenders/verifies all 53 public routes, retaining only the recorded admin circular-chunk and large-chunk warnings. Headless Chrome through agent-browser rendered Home and Discover at 320, 360, 390, 430, and 768px with `scrollWidth === innerWidth`; 320px visual captures preserve the one-column hierarchy and fixed navigation. Home loading/partial/empty/failure and Discover loading/empty/failure surfaces each rendered their expected status and recovery copy. Browser errors were empty; console output contained only normal Vite connection and React development notices. No physical device, OS keyboard, or screen reader was used, so none is claimed.

**Exact next action:** Begin D56 with a written audience-transition matrix covering role selection, onboarding completion, auth loading, direct URLs, refresh, return-to-route, and back/forward. Audit `App.jsx`, onboarding/auth routes, `shellPolicy.js`, `mobileRoutePolicy.js`, and all navigation builders; add permission tests that prove writer, industry/actor, and reader accounts never receive another audience's dashboard, home, drawer, or compact navigation. Close Phase 7 only when that matrix and the exit gate pass.

---

#### 2026-08-23 — Codex — D54: industry discovery, saved, messaging, and profile variants (COMPLETE; PHASE 7 BULLET 3 COMPLETE)

**Audit and reuse decision:** Search, Featured, Messages, and the owner/visitor Profile routes were already native shared screens for the writer and industry audiences. The route manifest already admitted the industry audience, so adding role-specific presentation copies would have created drift without adding behavior. Coverage now pins those shared routes for investor, producer, director, industry, and professional accounts. The missing contract was Saved: the industry drawer called `/users/watchlist`, but the profile Saved tab loaded `favoriteScripts`, so the two entry points could disagree. The audit also found professional purchase history still used a private three-role predicate, actors inherited mandate/watchlist navigation and professional dashboard requests despite being discovery-only, and every native owner profile advertised the writer-only collaboration inbox.

**Changes:** The shared bookmark hook and profile-collection response now name the saved source. Writers, readers, and actors continue to read/write favorites, while all five film-professional roles read/write `industryProfile.savedScripts`; Search, Featured, project detail, profile project rows, and the Saved page now update that same source on desktop and native. Watchlist list/add/remove handlers apply the shared five-role gate before database access, validate project ids, use bounded positive projections, admit only available published projects, compare ObjectIds safely, and return authoritative idempotent saved state. Profile purchase history now uses the shared five-role predicate for both option and purchase-request sources. Industry navigation derives professional capabilities once: actors retain Discover, Dashboard, Search, Featured, Top Scripts, Writers, Messages, and Profile, but receive no Mandates, Saved Projects, or Watchlist collection. Their dashboard now requests only the discovery leg and uses casting/discovery language and actions. Collaboration requests render only for writer/creator owner profiles.

**Defects fixed:** DEF-96, an industry's Saved profile tab showed favorites instead of the watchlist exposed by the drawer/dashboard. DEF-97, `industry` and `professional` accounts lost purchased/optioned projects because profile history recognized only investor/producer/director. DEF-98, actors were offered professional-only mandates and watchlist navigation. DEF-99, non-writer native profiles linked to the writer-only collaboration inbox. DEF-100, the actor dashboard started finance, transaction, purchase-request, and watchlist requests and described matches as mandate results even though actors cannot own those capabilities.

**Verification:** The final focused client matrix passes 216/216 across the shared bookmark boundary, navigation, route policy, dashboard, profile collection, hook, and render coverage. All 511 server tests pass in 95 suites, including new five-role watchlist boundary coverage. Every touched client/server file passes ESLint, and the React best-practices review found no new request waterfall, hook dependency, inline component, or render-accessibility concern. The full client run is 2,149/2,154 with exactly five pre-existing unrelated failures: four stale `AppShell.render` expectations and DataTable's CSV header expectation. Production build transforms 4,200 modules and prerenders/verifies 53/53 routes, retaining only the recorded admin circular-chunk and large-chunk warnings. No fresh browser sweep is claimed because this environment still lacks the prescribed agent-browser CLI and a Chrome/Edge executable; no physical-device or screen-reader result is claimed.

**Exact next action:** D55 audits reader home/discover, Featured, the existing native script reader, reader profile, and Messages. Reuse the existing project, message, and profile presentations; add only missing reader home/featured route ownership and role restrictions, then verify reader-only and cross-audience denial behavior without another presentation fork.

---

#### 2026-08-23 — Codex — D53C: options and ledger with payment authority (COMPLETE; PHASE 7 BULLET 2 COMPLETE)

**Audit and boundary decision:** `/offer-holds` had a strong native read model but intentionally no write, while the desktop producer ledger later added release and contact mutations as private API calls. D29 already made producer rating and writer contact native on project/profile detail, and D52 already shared the five-leg industry dashboard loader, so those presentations were reused rather than copied. The missing boundary was the option itself: one shared holder-owned read/release contract, a confirmed destructive action on phone, and truthful Finance degradation. The server audit found that the unused legacy `POST /scripts/hold` route created a paid 30-day option without any payment; the Razorpay callback checked only a signature and trusted the callback's script id without proving fetched order/payment ownership, purpose, exact price, paid/captured state, amount, or currency; hold roles drifted from the platform's five-role industry vocabulary; rating pagination was unbounded and malformed rating/script ids became CastError 500s; and the owner transaction serializer spread bank/provider/admin/metadata internals while overwriting real charged currencies with INR.

**Changes:** Added `offerHolds.js` as the desktop/native bounded load and release boundary. `useHoldsData` now cancels stale loads and owns single-flight release state; `Holds` offers a shared destructive confirmation with the explicit no-refund consequence and updates only after server success. The desktop producer ledger uses the same release request and D29 `revealWriterContact`, with duplicate cached reveals prevented. Holder reads are five-role-gated, positively projected and capped; release atomically selects the current holder's active unexpired option by option id, then clears only a project still held by that account. Removed the no-payment route and handler. Added a pure script-hold payment validator, timing-safe signature comparison, exact provider readback, replay recovery, and sparse unique payment/order ids. Producer-rating ids/paging and note input are typed and bounded. Owner transaction responses now expose only ledger display fields, preserve the real ISO currency, and withhold bank transfer, provider, balance, metadata and admin fields. Both producer presentations distinguish missing wallet/history from a genuine zero/empty account. The deterministic industry harness/audit now includes holds ready/loading/empty/error/release states for the next browser-capable run.

**Defects fixed:** DEF-90, a caller could bypass Razorpay and create the paid option directly. DEF-91, a valid callback signature could be paired with a different account/project/order standing because provider state was not authoritative. DEF-92, mobile could inspect but not release an option even after desktop established the product's confirmation and no-refund rule. DEF-93, owner transaction responses leaked internal bank/provider/admin metadata and mislabeled non-INR charges. DEF-94, producer-rating list/delete accepted malformed ids and unbounded limits. DEF-95, a failed wallet or transaction leg rendered as ₹0 or “No transactions,” turning missing data into a plausible financial statement.

**Verification:** Focused offer/holds/dashboard/project-action coverage passes 70/70. The complete server suite passes 505/505 in 94 suites. Every touched client/server file passes ESLint and `git diff --check` is clean. The full client run is 2,118/2,123 with exactly five pre-existing unrelated failures: four stale `AppShell.render` expectations and DataTable's CSV header expectation. Production build transforms 4,200 modules and prerenders/verifies 53/53 public routes; only the recorded admin circular-chunk and large-chunk warnings remain. Prior five-width evidence already covers the holds list, shared confirmation primitive, native project actions and D52/D53 workspaces. A fresh combined sweep could not run because the prescribed `agent-browser` CLI and any Chrome/Edge executable are absent from this environment; no new browser, real Razorpay, physical-device, or screen-reader result is claimed.

**Exact next action:** Begin D54 with a route/audience audit of Search, Featured, saved/watchlist, Messages, and Profile for all five industry roles. Reuse the already-native generic screens where their contracts and actions are truly audience-complete; implement only the missing saved/watchlist entry and role-specific restrictions, and do not fork discovery, messaging, or profile presentations merely to change their audience list.

---

#### 2026-08-22 — Codex — D53B: native mandates and mutation boundary (COMPLETE; D53 CONTINUES)

**Inventory and decision:** Desktop `/mandates` owned its API calls, format aliases, option lists, and form state. `PUT /onboarding/mandates` required authentication but accepted every role and persisted caller-controlled arrays without allow-listing. The native route is limited to the five film-professional roles, while the server authoritatively refuses every other role before lookup. The phone uses four disclosure sections with native checkboxes, visible counts, retained drafts, a sticky save bar, and explicit loading/load-error/save-error/saved states.

**Changes and evidence:** Added shared `mandatesData.js`/`useMandates.js`, migrated desktop reads/writes onto them, added `MandatesMobile.jsx` with isolated `ckm-mandates` CSS, promoted and registered the route, exact-role policy, and CSS ownership, and expanded the deterministic Phase 7 harness. Added server normalization plus controller boundary tests; unknown options and extra fields are discarded. Focused client regression is 107/107; all server tests pass 490/490 in 90 suites; touched ESLint and `git diff --check` pass; the production build transforms 4,199 modules and prerenders/verifies 53/53 routes. The first browser pass exposed the audit's direct-name requirement on label-wrapped checkboxes plus one cold-compilation frame miss; explicit input names were added and the warmed combined industry sweep passed 100/100 state-width measurements with zero findings. No physical-device or screen-reader pass is claimed.

**Exact next action:** Audit the already-native `/offer-holds`, project/profile rating/contact actions, and producer finance ledger as one linked workflow; share or harden only missing contracts, then close D53.

---

#### 2026-08-22 — Codex — D53A: native writer roster and response boundary (COMPLETE; D53 CONTINUES)

**Inventory and decision:** `/writers` already had a strong desktop register and tested pure facet model, but fetched privately inside the page. Its server aggregation used an exclusion projection that retained contact, subscription, address, and active-session fields, and inserted raw search input into a regex. The personal-email restriction UI was unreachable because the product predicate was retired. The phone therefore uses compact comparison cards and canonical filters rather than compressing the three-pane desk, opens the existing native profile for detail/actions, and does not revive the dead restriction.

**Changes and evidence:** Added shared `writerRosterData.js`/`useWriterRoster.js`, migrated desktop loading onto it, and added native `WriterRosterMobile` ownership for `/writers`. Search, sort, genres, and mandate overlap live in the canonical URL; optional mandate failure is explicit but non-blocking. The server now applies positive source/public projections and literal escaped search. Updated the stale desktop restriction regression. Focused client tests pass 167/167, all server tests pass 486/486 in 88 suites, touched lint is clean, and the production build transformed 4,195 modules with 53/53 prerender verification. The combined D53 browser matrix, physical-device, and screen-reader passes remain unclaimed.

**Exact next action:** Continue D53 with a shared `/mandates` read/write state machine and native form, then audit existing holds, profile rating/contact actions, and finance-ledger boundaries before the combined five-width gate.

---

#### 2026-08-22 — Codex — D52: native industry discovery and role dashboard (COMPLETE)

**Requested continuation and inventory:** Continue the native implementation on PR #576 after Phase 6. `/home` still rendered the desktop Investor Desk, while `/dashboard` routed industry roles into a large desktop producer workspace. Home privately combined recommendations and profile state; dashboard issued broad independent reads for overview, wallet, transactions, purchase requests, and watchlist. Both surfaces had local-only navigation state, and the dashboard's whole-screen loading/error model discarded usable data when one leg failed.

**Contract and interaction decision:** Home is a focused discovery feed with one lead shelf, a compact standing brief, and canonical project opens rather than a compressed desktop workspace. Dashboard is a role-aware operational summary whose URL owns Overview, Deals, Matches, Finance, and Market. Each data leg settles independently; an unavailable section states its failure while successful sections remain usable. Actors receive a discovery-only Casting desk and cannot enter Deals or Finance. Dense roster, mandate, and offer-detail workflows remain the next bounded slice instead of being folded into this dashboard.

**Changes made:** Added shared `industryHome.js`/`useIndustryHome.js` and `industryDashboard.js`/`useIndustryDashboard.js`, then migrated `InvestorDeskPage` and `ProducerDashboardPage` reads onto those contracts. Added `IndustryHomeMobile`, `IndustryDashboardMobile`, a deterministic industry harness/audit, route/render/model tests, CSS-prefix registration, and native ownership for `/home` plus the industry branch of `/dashboard`. Server recommendation results now use an allowlisted project/creator projection; watchlist reads use projected bounded summaries; purchase-request lists are capped. Preview fixtures disable live requests.

**Verification:** The focused client matrix passes 106/106; all 484 server tests pass in 88 suites; touched client/server ESLint and `git diff --check` are clean. Production build transforms 4,192 modules and prerenders/verifies all 53 public routes. The full client suite is 2,100/2,106 with exactly the six established unrelated failures: four stale AppShell expectations, WriterRoster's retired gate expectation, and DataTable's CSV-header expectation. Chromium passed 50/50 measurements across ready/loading/empty/error/degraded home plus ready/partial/actor/loading/error dashboard at 320/360/390/430/768, with zero overflow, undersized-target, unnamed-control, small-text, heading, shell, state-marker, or frame findings. No physical-device or screen-reader result is claimed.

**Exact next action:** D53 / Phase 7 bullet 2 owns `/mandates`, `/writers`, `/offer-holds`, and their writer-detail, restriction, rating, ledger, and offer actions. Audit authorization and response bounds first; then establish shared contracts and native route ownership with URL/back and five-width evidence.

---

#### 2026-08-22 — Codex — D51: native Hall of Fame and Phase 6 close (COMPLETE)

**Requested continuation and inventory:** Continue on PR #576 after D50, finish the two public Hall routes, push the work, then keep going. The existing challenge hub already exposed a Hall tab, while standalone `/hall-of-fame` and `/hall-of-fame/:slug` still fell back to desktop. The archive endpoint returned every completed record and performed per-competition result/stat work; detail selected a broad competition document and returned every featured script. Desktop filters were local-only, service failures on detail looked identical to missing records, and hub laureates linked through the generic challenge route rather than a permanent record.

**Contract and interaction decision:** Hall of Fame is public evidence, not another competition workflow. The archive is one URL-owned, server-filtered collection (`year`, exact competition, `page`) available in public chrome when signed out and the standard role shell when signed in. Each card pushes the canonical permanent slug; Back returns to the filtered archive. The record uses the detail shell, has one heading, dynamic title/description metadata, explicit not-found versus service-failure states, safe profile targets, result/story/stats, published featured-script continuation, judges/partners in native disclosure rows, a share/copy action, and copy stating that winning does not publish a private screenplay. No registration or dashboard mutation belongs on the record.

**Changes made:** Added `competitionHallOfFamePaging.js` with typed bounds, page metadata, and public projections; changed completed/detail/featured-script controller reads to use it. Added shared `pages/hall-of-fame/hallOfFame.js` and `useHallOfFame.js`, then migrated both desktop pages onto that contract. Added `HallOfFameMobile.jsx`/CSS, a deterministic harness and browser audit, route/render/model tests, manifest ownership for both routes, route lazy loading, and the registered `ckm-hall` family. The challenge hub now asks for a six-item archive preview and every Hall card links to `/hall-of-fame/:slug`.

**Defects fixed:** DEF-86 — `/competitions/completed` ignored all bounds and could grow without limit. DEF-87 — the permanent-record read selected a broad Competition plus every featured script rather than a public projection and bounded page. DEF-88 — standalone archive filters were browser-local and unshareable, while a detail service failure falsely rendered “not found.” DEF-89 — Hall entries in the challenge hub opened generic challenge detail, so a completed winner had no stable record destination from the surface that displayed them.

**Verification:** Focused Hall/route/hub client regression is 41/41; touched client ESLint and `git diff --check` are clean; all server tests pass (483 in 88 suites). The production build transformed 4,183 modules and prerendered/verified all 53 public routes, retaining only the recorded admin circular-chunk and large-chunk warnings. The isolated full client run is 2,086/2,092 with exactly the six established unrelated failures (four stale AppShell expectations, WriterRoster's gate expectation, and DataTable's CSV header expectation). The authoritative Chromium audit passed 45/45 measurements: public/member list, loading, empty, list failure, ready/empty/failing detail and not-found at 320/360/390/430/768, with zero overflow, target, naming, small-text, heading, shell, marker, or frame findings. A cold first navigation and one unsettled logo measurement failed once, both passed all five widths in isolation, and the warmed full rerun passed 45/45. No physical device, screen reader, or OS share-sheet was used.

**Exact next action:** Begin D52 / Phase 7 at the industry discover/home and role-specific dashboard family. Audit canonical routes, audience redirects and navigation, data/projection boundaries, filters/saved/recent state, and linked child destinations before choosing route ownership. The first promotion must prove industry users never receive writer dashboard content and must cover restricted-role, partial-failure, URL/back, and five-width states.

---

#### 2026-08-22 — Codex — D50: native participant dashboard (COMPLETE)

**Requested continuation and bounded inventory:** Continue on PR #576 after D49. `/challenge/dashboard?c=:slug` is the registered writer's operational workspace across prestart, live writing, submitted, judging, and results. Its read surface spans Event ID, deadline and participant timeline, theme/brief, entry state, AI materials/evaluation, prizes, achievements, winner/result, certificate, rules/resources, referrals, participant discovery and follow state. Editing and final submission already belong to the native competition editor delivered in D23, so D50 opens that exact route and does not reproduce its save/flush or two irreversible acknowledgements.

**Interaction decision and written wireframe:** The dashboard is a standard authenticated SCREEN, not a nested desktop workspace. The URL owns six APG tabs — Home, Event, Prizes, Community, Resources, Studio — so reload/back preserve the writer's place. Home answers “what happens next”; Studio owns the entry and AI state; Community lazily loads participants or referrals only when opened. The compact shape is `PageHeader → status/countdown → URL tablist → one tab panel → bottom navigation`, with loading, durable service failure, challenge-not-found, not-registered, and wrong-role standings replacing the tabbed workspace. Ready content remains visible during the minute refresh.

**Shared and server result:** `challengeDashboard.js` owns canonical tab/path parsing, the dashboard load, paged participants/referrals, editor opening, follow actions, and certificate operation. `useChallengeDashboard.js` owns abort/stale safety, retained polling, lazy community pages, requested-page retry, per-competition page scope, editor/follow/certificate pending and failure state. Desktop `CompetitionDashboard`, `CompetitionParticipants`, and `ReferralDrive` consume the same contract. `GET /competitions/:id/me?view=dashboard` applies an explicit projection and output shaper that omit screenplay bodies, registration/payment/external proof, AI errors, and internal judge notes. Participants use an entrant-only active-user facet with bounded pages, and follower/request queries run only for that page; referrals return bounded items plus an authoritative total.

**Defects fixed:** DEF-81 — the participant endpoint loaded every entry and populated complete follower/following/request arrays before returning an unpaged response. DEF-82 — the dashboard downloaded the full entry document, including private/heavy registration, payment, proof, screenplay, AI-error, and judge-note fields it never renders. DEF-83 — desktop dashboard sections lived only in component state, so reload/back/share discarded the active workspace. DEF-84 — the dashboard participant area reused a marketing grid with invented “287+” activity/rank statistics instead of entrant records. DEF-85 — referral history was unbounded and swallowed load failures into an indistinguishable empty list.

**Verification:** The final focused dashboard/model/hook/screen/route matrix passes 37/37 after the last cross-challenge community-state patch; the broader focused passes earlier in the slice were 102/102. The complete server suite passes 478/478 in 87 suites. Touched client ESLint is clean. The serial full client run produced 2,074/2,081 because `ProfileOwnerMobile` timed out under the runner; that file then passed 2/2 alone, making the effective result 2,075/2,081 with exactly the six recorded deterministic baseline failures (four stale AppShell expectations, WriterRoster's old gate expectation, and DataTable's CSV-header expectation). Production build transforms 4,179 modules and prerenders/verifies 53/53 routes, with only the recorded admin circular-chunk and large-chunk warnings. Chromium covers 14 states at 320, 360, 390, 430, and 768px — 70/70 measurements with zero page/root overflow, undersized effective targets, unnamed controls, text below 11px, heading-count, shell, state-marker, or frame-width findings. The first pass found short tab targets and text-height participant links; both were enlarged and the complete matrix reran clean. No live editor submission, real certificate/PDF download, physical device, or screen-reader result is claimed.

**Exact next action:** D51 owns `/hall-of-fame` and `/hall-of-fame/:id`. Audit the existing list/detail, API query size and SEO behavior; make the list/detail public contract bounded; then build native public screens that preserve exact ids, back/share paths, winner/story context, loading/empty/not-found states, and canonical metadata before promoting either route.

#### 2026-08-22 — Codex — D49: native challenge registration (COMPLETE)

**Requested continuation and bounded inventory:** Continue on PR #576 after D48. `/challenge/register?c=:slug` is an authenticated writer/creator flow with three admission paths: explicit free entry, Ckript-hosted Razorpay payment in INR/USD, and a claim for a registration already bought through Luma, BookMyShow, AllEvents, Townscript, Insider, Eventbrite, FilmFreeway, or another supported provider. The flow owns profile answers, two legal acknowledgements, currency, gateway loading/failure/dismissal, captured-payment verification and recovery, third-party proof/resubmission/review, already-entered and phase-closed standings, Event ID, invoice, and return to the exact challenge dashboard. Dashboard/editor/submission/referral/achievement/certificate mutations remain D50.

**Payment research and interaction decision:** Razorpay’s official [Standard Checkout integration steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/) require server-created orders and mandatory signature verification. Its official [best practices](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/best-practices/) recommend one order across retry attempts and server-side status recovery through webhooks or API queries. D49 therefore uses one persisted server intent per writer/challenge, never creates an entry for an unpaid attempt, reuses the same order on another tap/reload, and checks the stored order’s exact identity, notes, amount, currency, paid status, and captured payment before admission. The client stores a returned callback long enough to retry it and also exposes a signature-free server reconciliation request. The native screen is a FLOW shell with one scroll body and one docked submit action; the third-party path replaces checkout fields in the same form instead of opening a nested modal.

**Shared contract and server result:** `challengeRegistration.js` owns form models, validation, paths, pricing, HTTP boundaries, Razorpay loading, and pending-callback storage; `useChallengeRegistration.js` owns the shared desktop/native state machine. Desktop `CompetitionRegister` and `ExternalRegistrationPanel` are presentations over it. `Competition.entryFee` is explicit and operator-editable; paid remains the safe legacy default. `CompetitionRegistrationIntent` stores one legal/profile/order record per writer/challenge and uses an atomic short lease to serialize first-order creation. `POST /:id/register` refuses paid events, while order verification reads the server intent rather than browser form answers and reconciliation queries Razorpay directly. External submission/approval now require writer access and refuse an active Ckript order. Both admission families use one normalization and configurable-fee definition.

**Defects fixed:** DEF-76 — the legacy direct `POST /competitions/:id/register` admitted a paid challenge without payment when called outside the UI. DEF-77 — every checkout retry could create another payable Razorpay order; one persisted intent/order now owns all attempts, including concurrent first taps. DEF-78 — a captured callback lost to reload/network failure could leave a charge without an entry; local callback retry plus authenticated server reconciliation now finishes the same order without charging again. DEF-79 — third-party claims were not writer-gated and could race an open Ckript order into two admission audit paths. DEF-80 — verification accepted browser-supplied registration answers and established only the HMAC/order notes/amount, without proving the authoritative order was fully paid and its named payment captured; it now finalizes from server-stored answers only after exact provider readback.

**Verification:** Focused registration, hook, external-panel, ChipSelect, native render, route render/coverage/policy tests pass 118/118 in eight files. Full server passes 472/472 in 85 suites. Full client is 2,061/2,067 with the exact six unrelated baseline failures: four stale `AppShell.render` expectations, WriterRoster’s old gate expectation, and DataTable’s CSV-header expectation. Touched ESLint is clean. Production build transforms 4,173 modules and prerenders/verifies 53/53 routes, with only the recorded admin circular-chunk and large-chunk warnings. Chromium covered form, free, invalid, pending-payment, processing, rejected/pending/approved external, success, already-entered, closed, wrong-role, and service-error states at 320, 360, 390, 430, and 768px: 65/65 measurements, zero page/root overflow, undersized effective targets, unnamed controls, text below 11px, heading-count, shell, state-marker, or frame-width findings. The first audit incorrectly measured a radio/checkbox glyph rather than its clickable label row; the corrected effective-target audit is the reported run. No real Razorpay charge/webhook, physical device, or screen-reader result is claimed.

**Exact next action:** D50 owns `/challenge/dashboard?c=:slug`. Inventory the dashboard’s entry/status/editor/submission/referral/achievement/participant/result/certificate contracts, then land bounded slices starting with status/timeline and editor opening. Keep irreversible submission and prize/certificate writes behind their own explicit verification gate.

#### 2026-08-22 — Codex — D48: native challenge detail (COMPLETE)

**Requested continuation and bounded inventory:** Continue immediately after pushing D47 on PR #576. `/challenge/c/:slug` resolves one non-draft competition through public `GET /competitions/active?c=`, then desktop’s old `useCompetition` optionally called owner-only `GET /competitions/:id/me`. The detail surface reads the derived phase/timeline/server clock, public results, participant aggregate, theme and brief, overview/eligibility/format, prizes, judges, sponsors, rules, FAQ, resources, community links, and only two owner facts: whether an entry exists and its Event ID. Registration, checkout/external claim, editor opening, submission, referrals, participant identities, achievements, and certificate writes belong to `/challenge/register` or `/challenge/dashboard` and remain D49+.

**Interaction decision and inherited research:** D47’s route-family research remains the applicable gate: Android’s detail hierarchy keeps one top app bar with content/actions below it, Apple’s toolbar guidance keeps section navigation and content actions out of an overcrowded bar, and WCAG reflow/focus/target guidance keeps the complete record linear at 320 CSS px with 44px controls. D48 therefore uses the existing DETAIL shell for both public and authenticated viewers: one Back-to-Challenges header, optional Sign in action, one inline phase-aware primary action, then a document-like section sequence. It does not add a sticky CTA above a bottom bar or a second tab system. Judges and partners become fully readable cards instead of desktop’s click-card plus untrapped bespoke modal; FAQ uses native disclosure elements with 44px summaries. Public and owner-status failures remain independent, and a background minute/expiry refresh retains ready content rather than flashing the skeleton.

**Written wireframe:**

```text
/challenge/c/:slug — canonical challenge detail
Audience: public browse; every signed-in role may browse; only writer/creator may register
Top app bar: Back to Challenges | challenge name + phase | signed-out Sign in
Scroll: banner → one-line premise → deadline/countdown → one phase-aware action → Event ID/status message
       → participants/prize/eligibility/format → theme when returned → declared results → overview/judging criteria
       → who can enter → timeline → prize cards → judge cards → partner cards → rules → FAQ → resources → community → partner contact
Primary action: signed-out registration opens auth into exact ?c slug; writer registers; entrant opens exact dashboard;
                live/results scroll to their loaded section; non-writer receives a visible account-role explanation
Overlays: none; registration/payment/dashboard are separate canonical routes
States: loading; retryable public failure; not found; public ready; owner-summary loading/failure/ready/not-registered;
        announced/registration open/closed/live/judging/results; hidden/private result direct link
Back: always /challenge; no draft or destructive state on this screen
Long text: wrapped title, overview, theme, bios, rules, FAQ and resource labels; one column through 520px frame
Desktop transform: desktop keeps its visual record but moves public/summary loading and action decisions to the same boundary
```

**Shared contract and server result:** `challengeDetail.js` owns public/summary requests, normalization, exact registration/dashboard paths, phase deadline, and action decisions; `useChallengeDetail.js` owns abort/stale-account/slug protection, independent owner status, retry, minute refresh, and ready-content retention. Desktop `CompetitionLanding` consumes it and now exposes a public retry. `GET /competitions/:id/me?view=summary` applies `COMPETITION_ENTRY_SUMMARY_FIELDS` plus `competitionEntrySummary`, omits referral aggregation/code work, and leaves the full response unchanged for dashboard/editor callers. `GET /competitions/active` now merges `buildCompetitionStats`, because `Competition` has no `totalParticipants` field and both old desktop and new native detail otherwise stated zero for every event.

**Defects fixed:** DEF-73: the public detail performed a full owner-dashboard read to show only registration state/Event ID, transferring screenplay bodies, registration answers, payment identifiers, external audit data, AI evaluation/errors, and script id; it now requests the explicit summary. DEF-74: a concluded `private` competition handed off to the public Hall-of-Fame detail, which excludes private records, so its canonical direct link became a 404; hidden was special-cased but private was not, and both now render the already-loaded result payload. DEF-75: detail’s participant count read `competition.totalParticipants` from a schema that has no such field and always displayed zero; the active endpoint now derives the same aggregate used by archive records.

**Verification:** Focused shared model/hook, desktop boundary, native screen, route policy/render/coverage, generic competition components, and CSS-contract coverage passes 120/120 in 9 files. Full server passes 453/453 in 82 suites. Full client is 2,040/2,046 with the exact six recorded unrelated failures: four stale `AppShell.render` expectations, WriterRoster’s old gate expectation, and DataTable’s CSV-header expectation. Touched client/server ESLint is clean. Production build passed at 4,167 modules and prerendered/verified 53/53 routes; only the recorded admin circular-chunk and large-chunk warnings remain. The deterministic Chromium matrix covered registration, signed-out, registered, non-writer, live, hidden results, owner-summary failure, public failure, and not-found at 320, 360, 390, 430, and 768px. After correcting the first cold-module readiness timeout, the valid run passed 45/45 with zero page overflow, undersized targets, unnamed controls, text below 11px, incorrect h1 count, shell mismatch, missing marker, or frame-width failure. No real-device or screen-reader result is claimed.

**Exact next action:** D49 owns `/challenge/register?c=:slug`. Inventory its free, Razorpay, invoice, external-provider claim, legal acknowledgement, already-registered, phase-expired, cancellation, error, and exact-dashboard-return contracts before extracting shared state; do not fold the participant dashboard or submission into the registration slice.

---

#### 2026-08-22 — Codex — D47: native challenge hub (COMPLETE)

**Requested continuation and route-family inventory:** Continue Phase 6 on the existing PR branch. The family has eight canonical forms: public `/challenge`, `/challenge/c/:slug`, `/challenges`, `/hall-of-fame`, `/hall-of-fame/:slug`; protected `/challenge/register` and `/challenge/dashboard`; and the public `/my-competitions` redirect to `/challenge?tab=mine`. The hub loads `GET /competitions/list` and `/completed` publicly, plus owner-only `/mine` when signed in. Detail resolves a canonical slug through `/active?c=` and then optionally loads `/:id/me`; registration owns free, Razorpay, and external-provider paths; dashboard owns editor opening, irreversible submission, referrals, achievements, participants, and certificates. Published hidden/private competitions are direct-link-only; draft competitions are unreadable. The server derives phase and timeline, owns the theme/result boundary, and corrects countdowns with `serverNow`. No hub mutation is destructive. Mine can download a judged certificate; detail/register/dashboard actions remain later D48+ slices.

**Contract finding:** `/competitions/mine` is an owner-only list but currently returns each entire `CompetitionEntry`, including Fountain/text screenplay bodies, AI output/errors, registration answers, payment/order identifiers, external-registration audit data, and script id. The desktop card uses only event id, status, created/submitted dates, snapshot title/page/word counts, result, and granted reward types. D47 will make that exact summary the server contract rather than shipping a potentially feature-length screenplay into a four-card list. Public list and archive responses already use shaped competition/result/stat records; the archive is currently unpaged and should gain bounded pagination before a large historical catalogue, but that is not required to preserve today’s complete hub.

**Native interaction research:** [Android primary tabs](https://developer.android.com/develop/ui/compose/components/tabs) place one related destination set below the top app bar and preserve a visibly selected state; the existing native `Tabs` component already implements that pattern with a horizontally scrollable four-label row and APG keyboard behavior. [Apple toolbar guidance](https://developer.apple.com/design/human-interface-guidelines/toolbars) distinguishes view navigation from view actions and warns against overcrowding the bar, so challenge section selection remains below the app bar while the bar contains only identity/search or Back/Sign in. [WCAG 2.2 reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow) keeps the card stack within 320 CSS px without two-dimensional page scrolling; [focus order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html) keeps the tab set before its active result panel; and [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) supports the product’s stricter 44px control floor. Current comparable official products reinforce the hierarchy: [Kaggle Competitions](https://www.kaggle.com/competitions) leads each collection item with competition identity, status/type, participation, and remaining time; [Devpost’s hackathon browser](https://devpost.com/hackathons) separates discovery from registration, while its [registration guidance](https://help.devpost.com/article/120-whate28099s-the-difference-between-signing-up-for-devpost-and-registering-for-a-hackathon) makes clear that browsing, account membership, event registration, rules, and submission are distinct states. Ckript therefore does not put registration controls on the hub card; the card opens the canonical challenge detail where eligibility and phase are known.

**Seven interaction answers:** (1) `/challenge` is one standard member screen or public screen with four sibling URL-owned tabs, not four routes or a carousel. (2) Signed-out visitors get a compact Back/Sign in app bar and no bottom tabs; members keep the role-aware app bar and bottom navigation. The scroll body owns the masthead, tabs, status, and one vertical card list. (3) Desktop’s multi-column grids become one column; challenge metadata is progressive but remains on the card, laureates group below their competition heading, and an entrant timeline expands in place. (4) `?tab=` is canonical; tab changes replace history as desktop already does, challenge cards push detail, browser Back returns to the prior route, and there is no unsaved state. (5) Current endpoints are finite unpaged sets; no client virtualization is added. The archive pagination debt is recorded rather than hidden. (6) Public and Mine loading/error/empty states are independent; retry never blanks a ready sibling; certificate download has pending/failure feedback; sign-in returns to the Mine query. (7) Focus order is heading, tablist, active panel, then cards in server order. Cards have title-only stretched links with nested actions raised above them, live state is text plus shape, counts are announced as text, and changing a tab exposes one labelled tab panel without moving focus unexpectedly.

**Written wireframe:**

```text
/challenge — Challenges hub
Audience: public for Live/Previous/Hall of Fame; Mine requires a restored account; all account roles may browse
Top app bar: signed out = Back to Ckript | Challenges | Sign in; signed in = role-aware home/search app bar
Primary scroll: eyebrow + title + one-sentence premise → Live | Previous | Hall of Fame | My Challenges tabs → active panel status/list
Live card: banner/placeholder → phase + year → name/theme → event dates/prize → next deadline/countdown → opens /challenge/c/:slug
Previous card: phase/year → name/theme → dates → declared/awaiting result summary and aggregate counts → opens canonical challenge detail
Hall of Fame: total honour summary → competition heading/theme/entrant geography → winner/runner-up/special-award profile cards
Mine entry: challenge/year + event id → status/award → registered/submitted/pages/words → script title/rewards → dashboard link + certificate action → expandable timeline
Primary action: open the challenge detail; Mine signed-out action opens auth and returns to ?tab=mine
Bottom navigation: present only for authenticated viewers
Overlays/nested screens: authentication modal only; certificate uses browser download; detail/register/dashboard remain canonical later slices
States: public loading/error/retry/empty; independent Mine loading/error/retry/signed-out/empty; certificate pending/error; ready content retained during background retry
Keyboard/safe area: existing shell owns insets; scrollable APG tabs have roving focus; every actionable row/card target is at least 44px
Back: tab selection replaces query history; detail pushes; public app-bar Back returns to /; signed-in shell retains normal navigation
Long text/localization: two-line card titles, wrapped theme/award strings, locale dates/numbers, metadata stacks at 320px, no horizontal page scroll
Desktop transformation: keep the desktop presentation but move its requests/normalization into the same hook; mobile composes native cards and tabs from that contract
```

**Design checkpoint:** The functional inventory, hierarchy, route/back behavior, data ownership, states, prefix (`ckm-challenge-hub` in `mobile/screens/challenges/ChallengeHubMobile.css`), and verification risks are decided. This is a collection screen with no multi-step input or dense spatial editor, so the written wireframe is sufficient; a separate visual approval checkpoint is not required. Highest risks are the public/authenticated shell switch, stale Mine responses across session changes, query aliases, hidden theme/visibility behavior, nested certificate action inside a tappable entry card, and over-broad entry payloads. Verification will cover pure normalization/projection, public/auth route policy, all tab states, retry/session changes, certificate behavior, CSS-prefix ownership, focused desktop regression, server authorization/projection, lint, build/prerender, and diff hygiene.

**Implemented contract and presentation:** `challengeHub.js` owns tab/query normalization, public list/archive normalization, Mine normalization, the three loaders, and certificate download; `useChallengeHub.js` gives public and owner data independent abortable lifecycles, retry paths, and retained ready siblings. Desktop `ChallengeHub.jsx` and `EntryCard.jsx` consume that boundary instead of retaining request/download copies. The native `ChallengeHubMobile` composes Live, Previous, Hall of Fame, and My Challenges from native cards, tabs, status primitives, app bars, and role-aware navigation; signed-out Mine offers authentication with a return to the exact query. `/challenge` is promoted in the manifest and router, while the harness/audit route remains development-only.

**Server/privacy result:** `getMyCompetitions` now selects only an explicit `COMPETITION_ENTRY_SUMMARY_FIELDS` projection and returns `competitionEntrySummary(entry)`. The summary includes only the competition identity needed by the card, status and dates, snapshot title/page/word counts, declared result, granted reward types, and the computed timeline inputs. It excludes Fountain/text screenplay bodies, registration answers, payment/order references, external-provider audit data, AI evaluation/errors, and script id. This closes the payload defect found by the route gate without changing the owner authorization boundary.

**Verification and defects found:** Shared/model/hook, native screen, route coverage/policy/render, CSS-prefix, desktop competition regression, and server projection tests pass: 113/113 focused client tests in 9 files and 451/451 server tests in 82 suites. Touched client/server ESLint is clean. Production build passed at 4,162 modules and prerendered/verified all 53 routes; only the recorded admin circular-chunk and large-chunk warnings remain. Full client ran 2,018/2,025: the exact six deterministic recorded failures plus a checkout render timeout that passed 11/11 when rerun alone. The five-width Chromium matrix covered 320, 360, 390, 430, and 768px across Live, Previous, Hall of Fame, Mine, expanded timeline, empty, signed-out, public-error, and Mine-error states: 45/45 measurements had zero page overflow, undersized targets, unnamed controls, text below 11px, incorrect h1 count, tab/panel mismatch, shell mismatch, missing state marker, or frame-width failure. The first readiness probe was invalid and was corrected to wait for the real shell; the valid sweep then found one real issue in this slice, a 27px-wide Live tab despite 52px height, fixed with the local 44px minimum and re-measured clean. No real-device or screen-reader result is claimed.

**Exact next action:** D48 owns `/challenge/c/:slug`: inventory the desktop detail and `/competitions/active?c=` plus `/:id/me` contracts, decide the shared loader/phase boundary, then build and promote the native public/authenticated detail without pulling registration/payment or participant-dashboard mutations into the slice.

---

#### 2026-08-22 — Codex — D46: general-profile activity and saved projects (COMPLETE; PHASE 5 COMPLETE)

**Requested continuation:** Push the completed D45 work, update/create its pull request, then continue the native implementation. Commit `d14c699` is pushed to the already-open PR #576; the PR title/body now describe the D45 scope. Unrelated local design artifacts remain outside Git.

**Starting checkpoint and complete product inventory:** D33–D45 cover public, visitor, owner, reader, settings, credentials, network, messaging, and collaboration surfaces. The remaining Phase 5 bullet is general-profile posts/activity and saved projects. Desktop `Profile.jsx` has an owner-only Bookmarks tab over `bookmarkedScripts`, but no activity/post state or presentation. `GET /users/:id` nevertheless runs `Post.find(...).sort(...)` without a limit, runs a complete saved-Script query without a field allowlist or limit, returns both arrays in the base profile response, and exposes the owner's raw `favoriteScripts` ids through the broad owner object. The shared loader retains the saved array; the native owner only uses its length and renders no list; the visitor renders no activity. Desktop tab buttons call `setActiveTab` without updating the canonical query, even though initial load reads `?tab`. The Post schema contains content/media plus raw like/comment/save user-id arrays. The general favorite collection is `User.favoriteScripts`; reader read/favorite/review collections already have their own D42 route and contract, while `industryProfile.savedScripts` is the producer deal watchlist and remains a separate product surface.

**Native interaction research:** [React Native FlatList](https://reactnative.dev/docs/flatlist) treats flat collections as a bounded data source with explicit empty/header/footer/loading affordances and stable item keys; a server page of 12 keeps this web-native surface small enough that a second client virtualization system is unnecessary. [WAI-ARIA APG Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) recommends automatic activation only when switching panels has no noticeable latency. Activity and Saved filter one result region and each change performs a server request, so the native surface deliberately uses the existing `SegmentedControl` radio group instead of promising instant APG tab activation; the URL change triggers a separately announced loading state. [WCAG 2.2 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) explicitly keeps headings and pagination inside the narrow viewport even when nearby complex content has an exception; collection cards and Previous/Page/Next therefore reflow without page-level horizontal scrolling.

**Seven interaction answers:** (1) This is one collection section inside the existing profile screen, not a new route, sheet, or nested detail screen. Owner has Activity and Saved tabs; visitor has Activity only; reader collections stay on `/reader/profile/:id?`. (2) Identity/actions remain in the app bar and hero; collection controls and results live late in the primary scroll; bottom navigation remains visible; item details use existing project routes. (3) Desktop's full bookmark grid becomes one vertically readable saved list/page on phone; activity media stays within its card; no horizontal rail. (4) `tab` and `page` live in the canonical query so browser Back restores section/page; there is no draft or cancellation state. (5) Both lists are server-paged at 12; no unbounded base-profile collection or second client virtualization layer. (6) Initial loading, tab/page loading, empty, retryable failure, successful saved removal, removal failure, pending removal, first/last page, and direct forbidden-saved access all render explicitly. (7) Focus order is section heading, the two owner tabs, active panel content, then pagination; loading/error feedback is announced by the existing status/message primitives; each removal button names its project.

**Written wireframes:**

```text
/profile or canonical own profile — General profile collections
Audience: authenticated non-reader owner; saved is owner-only
App bar: Your profile / Workspace / Back to dashboard
Scroll: existing completion → identity/actions → stats/about/professional facts/projects → Activity|Saved segmented selector → result list → pagination
Primary action: open a project or move pages; Saved rows also offer named Remove
Bottom nav: standard role-aware bar remains visible
Overlays: existing full-screen profile editor only; collections add none
States: collection skeleton; retry panel; no activity/no saved items; 12-item page; pending/remove error; page bounds
Keyboard/safe area: radio-group selector semantics; links/buttons in DOM order; media max-width 100%; existing shell owns safe-area
Back: query changes create history; Back restores prior tab/page; canonical identity path remains unchanged
Long text/localization: post text preserves line breaks and wraps anywhere; controls stack at narrow width; fixed English dates use locale formatting
Desktop transform: desktop retains its workspace shell but reads the same page/normalizer/removal contract and stops receiving lists in the base profile payload

/profile/:id, /share/profile/:id, or canonical visitor profile — Activity
Audience: authenticated visitor after the existing block/private/deactivated/business-email gate; saved never exposed
App bar/scroll/actions/nav: unchanged visitor hierarchy, then a public Activity section and pagination before Safety
States: loading, empty, retry, paged posts; a direct saved query is a server 403 with no ids or counts
Back: page query participates in browser history; profile canonicalization preserves the query
```

**Data ownership and risks:** Add one `GET /users/:id/profile-collections?section=activity|saved&page=` boundary. It reuses the same authenticated profile-access decision as the base endpoint, rejects reader targets, projects posts to content/media/date plus numeric counts (never raw liker/commenter/saver ids), selects saved projects through the existing visitor Script allowlist, and makes saved counts/items owner-only. The base profile endpoint stops querying/returning posts and saved Script documents and removes raw collection ids from that response. Highest risks are access-rule drift between the two endpoints, desktop bookmark removal state, query changes accidentally refetching the entire base profile, and oversized/untrusted media. Verification will cover the pure query/response contract, hook stale-request behavior, owner/visitor render states, server access before collection queries, projection, paging bounds, base-response absence, route/CSS contracts, full server/client regressions, lint, build, and diff check. No real device or screen-reader result is claimed at this checkpoint.

**Implemented contract:** `profileCollections.js` and `useProfileCollections.js` now own the cancellable client request, response normalization, URL section/page state, server-backed search/sort, saved removal, stale-response rejection, and previous-page recovery when the last row is removed. Desktop `Profile.jsx`, the owner screen, and the visitor screen all consume it. Native uses the existing radio-group `SegmentedControl` because switching a server-backed result set is a filter with noticeable latency, not an instant APG tab panel. Activity cards rebuild media URLs through `safeMediaSrc`; Saved opens only existing canonical project routes and names every Remove action. Loading, retryable failure, empty, pending removal, removal error, and first/last page states are explicit.

**Server and privacy result:** `GET /users/:id/profile-collections` resolves id/sid/username through the same lookup and access decision as the base profile. Reader targets stay on their D42 contract. A visitor Saved request returns 403 before any Post or Script query and returns no ids or counts. Activity aggregation projects content/media/timestamps and `$size` counts only; saved projects use `VISITOR_PROFILE_SCRIPT_FIELDS`, deterministic sorting, and 12-item pages. The Post index now covers profile/time order. `GET /users/:id` no longer executes either collection query and no longer returns `posts`, `bookmarkedScripts`, `favoriteScripts`, `scriptsRead`, or `industryProfile.savedScripts`. DEF-70 (unbounded over-broad base collection payload), DEF-71 (post data fetched and discarded with no Activity UI), and DEF-72 (profile section/page state trapped in local state rather than browser history) are fixed.

**Verification:** Focused profile/mobile regression is 172/172 in 27 files, including authorization-before-query, privacy projection, query bounds, base-response absence, abort/stale response, owner/visitor render states, saved removal, paging, route policy, and CSS-prefix contracts. Full server is 449/449 in 81 suites. Touched client/server ESLint is clean. Full client is 2,001/2,007 with exactly the six recorded unrelated failures: four stale `AppShell.render` expectations, the WriterRoster gate expectation, and DataTable's CSV header expectation. Production build passed with 4,158 modules and 53/53 routes prerendered/verified; the known admin circular-chunk and large-chunk warnings remain. `git diff --check` is clean. No deterministic five-width, real-device, or screen-reader run was performed, so none is claimed.

**Exact next action:** Begin D47 / Phase 6 with the research gate across the challenge marketing/authenticated hub, dynamic detail/phase state, registration/payment, participant dashboard/submission/referrals/achievements, My Competitions query state, and Hall of Fame public SEO routes. Inventory the real route and server contracts before selecting a first implementation slice.

---

#### 2026-08-22 09:35 +05:30 — Codex — D45: payout and guild credentials (COMPLETE)

**Requested continuation:** Resume the native app implementation after two interrupted work sessions and finish the active work rather than restarting or broadening it.

**Starting checkpoint:** D44 was complete and D45 was partially written but unverified. The draft had started a shared account-credentials helper and two writer-only settings sections, but desktop still retained endpoint copies, current-user/profile responses still crossed the credential boundary inconsistently, membership proof delivery still depended on stored Cloudinary URLs, unsupported bank enum values could reach Mongoose as a 500, and there was no complete ledger or regression evidence.

**Research and decision:** Audited `AccountSettingsMobile`, `BankDetails`, the banking and guild sections of `EditProfileModal` and `WriterOnboardingModal`, transaction/onboarding/user/admin controllers, profile projections, Cloudinary upload configuration, membership review screens, and the current route tests. Cloudinary's [upload parameter documentation](https://cloudinary.com/documentation/upload_parameters) and [access-control documentation](https://cloudinary.com/documentation/control_access_to_media) establish the storage boundary used here: default upload delivery is public, authenticated assets require signed access, and generated private download URLs are time limited. The existing Account screen remains one standard native screen with two writer-only inline sections; payout and guild credentials are separate tasks. The payout card must distinguish an active account from a replacement under review and must never repopulate the complete account number. WGA and SWA remain independent proof cards. Stored asset identifiers stay server-side and every client presentation asks an authorized endpoint for a short-lived access URL.

**Changes made:** Added `pages/profile/accountCredentials.js` as the shared desktop/native contract for payout normalization, validation, load, submit, proof validation, upload, and authorized access. Added native payout and guild sections with loading/retry/empty/error states, masked summaries, complete-number re-entry, progress, resubmission, locked/approved/pending/rejected states, and admin notes. Migrated `BankDetails`, profile editing, and writer onboarding to the same operations and removed manually supplied multipart content-type headers. The server now owns allowed account type/country/currency validation, refuses bank fields in the general profile mutation, masks active and requested accounts, redacts proof URLs/public ids/reviewer ids from owner, onboarding, current-user, and review-list payloads, uploads new proofs as authenticated Cloudinary assets, and returns no-store expiring image/PDF access URLs to authorized writers and admins. Admin review links now use that access route instead of stored raw URLs.

**Defects fixed:** DEF-65 — payout fields had duplicate mutation and validation paths across general profile, bank settings, onboarding, and mobile. DEF-66 — owner/current-user/onboarding projections could expose full account details or membership-proof storage secrets. DEF-67 — new proof uploads used Cloudinary's public delivery type and review UI linked stored asset URLs directly. DEF-68 — clients manually set multipart `Content-Type`, risking a missing browser-generated boundary. DEF-69 — pending replacement details could be presented as the active account, while unsupported bank enum values could escape request validation and become database 500s.

**Verification:** Expanded profile/settings contract, route, policy, and render regression 140/140 in 18 files. Full server 438/438 in 78 suites. Touched client and server lint clean except the exact unchanged `AdminDashboard.jsx` and `adminController.js` baseline findings, verified against `HEAD`. Full client 1,988/1,994 with exactly six recorded baseline failures: four stale `AppShell.render` expectations, the WriterRoster gate expectation, and DataTable's CSV header expectation. Production build passed with 4,154 modules and 53/53 public routes prerendered/verified; known admin circular-chunk and large-chunk warnings remain. No deterministic five-width, real-device, screen-reader, or real Cloudinary-asset mutation pass was run, so none is claimed. Existing proofs created with public `upload` delivery need the migration recorded in §19.1 before historical-proof privacy can be claimed.

**Exact next action:** Begin D46 at `mobile/screens/profiles/owner-profile/ProfileOwnerMobile.jsx`, `pages/Profile.jsx`, `pages/profile/useAuthenticatedProfile.jsx`, and `controllers/userController.js`. Run the research gate for the owner's remaining general-profile activity and saved-item lists; define bounded URL-owned tabs/paging and privacy-safe list projections; extract one desktop/native contract; close Phase 5 only if every own/visitor state is covered. Do not fold reader collections or account credentials back into this slice.

---

#### 2026-08-22 — Codex — D44: invitations that survive email, expiry, and app boundaries (COMPLETE)

**Requested continuation:** Continue the native app implementation and improve the code rather than layering another private mobile copy over it.

**Starting checkpoint:** D43 made request decisions native, but the collaborator row had two incompatible identities. Account invitations used `userId`; pre-account email invitations had only `invitedEmail`. The server's canonical list discarded the latter, while role/remove/resend endpoints searched only the former, so an owner could neither see nor manage the exact invitation most likely to need help. Invitees had no account inbox, activity remained visible only inside a desktop component, and acceptance still mutated state through GET.

**Research and decision:** Audited `InviteModal`, `ActivityLog`, the D18 collaborator hook and People dialog, direct acceptance, notification targets, Script collaborator schema, permission middleware, invitation mail/token helpers, audit metadata, and every collaboration route. People, comments, and presence remain script-scoped inside the native editor. Direct invitations and cross-project audit events belong beside Incoming/Sent in the canonical writer queue. The embedded collaborator `_id` is the only stable owner-action identity common to account and email recipients. Invitation tokens may be returned only to the authenticated matching recipient; pending email is owner-only; audit metadata stays allowlisted.

**Changes made:** Extended the shared collaboration contract with paged invite/activity loaders, normalized models, one reusable paged hook, explicit send/refresh/accept operations, shared activity descriptions, and time formatting. Added URL-owned Invites and Activity tabs with loading/retry/empty/paging, expired-link copy, in-app POST acceptance, durable result messages, and workspace links. `AcceptInvite` now uses the same POST operation while the legacy GET server route remains for older clients. Owner People surfaces use the embedded row id and can issue a new link; the desktop invite modal keeps success visible until Done. The server stores `invitedAt`, accepts collaborator row/user/email identities, pages accessible activity, projects recipient invitations, upgrades an email invite to a newly registered writer on refresh, deletes stale invite notifications, and restricts invite creation/acceptance to writer accounts. In-app notification actions now open `?tab=invites`; email links retain `/invite/:token`.

**Defects fixed:** DEF-60 — email-only pending collaborators were discarded by canonicalization and every owner mutation was user-id-only, making cancel/update/refresh impossible. DEF-61 — a recipient could accept only if they retained an emailed token; there was no account/email-matched inbox or durable expired state. DEF-62 — an unregistered address could later become a non-writer account and accept a writer collaboration invite because acceptance checked identity but not account role. DEF-63 — invite refresh accumulated stale token notifications and did not discover a writer account created after the original email invitation. DEF-64 — the current client used GET for a state-changing acceptance; it now uses POST, with GET retained only as compatibility.

**Verification:** Focused collaboration/editor/route/notification matrix 204/204 in 7 files. Full server 431/431 in 76 suites. Touched client/server ESLint clean. Full client 1,977/1,983 with exactly six recorded baseline failures: four stale `AppShell.render` expectations, the WriterRoster gate expectation, and DataTable's CSV header expectation. Production build passed with 4,152 modules and 53/53 public routes prerendered/verified; known admin circular-chunk and large-chunk warnings remain. No deterministic five-width, real-device, screen-reader, real socket-pair, or physical-keyboard pass was run, so none is claimed.

**Exact next action:** Begin D45 with a research gate over `AccountSettingsMobile.jsx`, `BankDetails.jsx`, the remaining banking/guild sections of `EditProfileModal.jsx`, transaction bank endpoints, and membership-proof endpoints. Reconcile the duplicate bank mutation paths and define masked data, validation, lock, pending/rejected/approved review, proof upload/access, and admin-note states before placing either credential workflow into the native account surface. Keep general-profile activity/saved lists separate.

---

#### 2026-08-21 — Codex — D43: collaboration requests without client-side guesses (COMPLETE)

**Requested continuation:** Continue the native app implementation and keep improving the code quality.

**Starting checkpoint:** D42 completed reader identity. The collaboration owner inbox and activity components had no caller or route, while the public request widget polled the complete project every four seconds, mirrored request state into localStorage, and could temporarily delete an owner request before the server accepted the decision. The owner notification opened the editor, which contained no request decision surface; an invite notification also opened the locked editor because its acceptance token existed only in email/socket payloads.

**Research and decision:** Audited request/invite/presence/activity components, the D18 collaborator hook, collaboration routes/controller/models, live events, notification shells/targets, role permissions, dashboard refresh, and native routing. The smallest honest native entry is one canonical `/collaborations` queue with Incoming and Sent URL states. People, comments and presence stay in the editor because they are already native and script-scoped. Activity remains script-scoped and shares a bounded sanitized contract now, but its visible native placement and the full pending-invite lifecycle remain D44 rather than being invented inside the request queue.

**Changes made:** Added `components/collab/collaborationRequests.js` as the desktop/native request, exact-status, decision and activity boundary. Rebuilt `RequestCollabButton`, `CollabRequestsInbox`, and `ActivityLog` on it. Added the desktop route and native `CollaborationRequestsMobile` screen, writer-only manifest entry, isolated CSS family, owner-profile entry, socket refresh, and URL paging. Added paged incoming/outgoing/script/activity endpoints plus the exact-user status endpoint and explicit server response projections. MainLayout now consumes the same notification target function as AppShell. Request notifications open the decision queue; invite notifications carry a recipient-only token to the existing acceptance route, refresh with a new token, and are removed after successful use.

**Defects fixed:** DEF-56 — collaboration requests were orphan UI with no canonical destination, while the requester state was a localStorage/polling guess. DEF-57 — the server accepted collaboration requests from every authenticated role even though the product and client expose writer-to-writer collaboration; it also retained a dead Merger request vocabulary while current permissions had removed that role. DEF-58 — the read-level activity endpoint was unbounded and returned raw audit metadata, including invited email addresses; it is now paged and allowlisted. DEF-59 — collaboration request/invite notification actions did not lead to the action they named; owner requests now open decisions and invites open their single-use acceptance path.

**Verification:** Focused client contract/render/routing/notification/CSS suite 103/103. Full server 426/426 in 75 suites. Touched client/server ESLint clean. Full client 1,971/1,978 with exactly the seven recorded baseline failures (four AppShell expectations, WriterRoster gate expectation, DataTable CSV header expectation, finance session timeout). Production build passed with 4,152 modules and 53/53 public routes prerendered/verified; known admin circular-chunk and large-chunk warnings remain. No deterministic five-width, real-device, screen-reader, real socket-pair, or physical-keyboard pass was run, so none is claimed.

**Exact next action:** Begin D44 at `InviteModal.jsx`, `ActivityLog.jsx`, `useCollaborators.js`, `AcceptInvite.jsx`, and the native collaboration screen: expose bounded script activity in the native flow and complete pending-account/email invitation refresh, expiry, acceptance, and durable error/success states without copying People/comments/presence. Keep bank/guild proof separate.

---

#### 2026-08-21 — Codex — D42: reader identity without a history leak (COMPLETE)

**Requested continuation:** Continue the native app implementation.

**Starting checkpoint:** D41 completed message context/meetings. `/reader/profile/:id?` remained a desktop migration fallback whose page refetched the full user document per tab, expanded collection ids with up to 20 individual project requests, swallowed tab failures, and decided ownership from URL shape.

**Research and design decision:** Audited `ReaderProfile.jsx`, the reader routes/nav, authenticated profile projection, user/review/script controllers, follow mutations, canonical profile helpers, and the existing native owner/visitor/profile-editor surfaces. Reading history and favorites are private account collections; a visitor must see an explicit privacy state, not a fabricated zero. Reviews remain visible only after the same private/block gate that protects the profile. The canonical reader route remains `/reader/profile/:id`; project activity stays in the reader stack at `/reader/script/:id`. The phone is one identity card, one about section, and one three-way URL-backed activity switch; editing reuses the existing native owner editor.

**Changes made:** Added `server/controllers/readerProfileController.js` and `server/utils/readerProfile.js` with a bounded 12-item projection and authorization-before-query order. Added the shared client contract/hook under `pages/reader-profile/`, migrated desktop `ReaderProfile.jsx` onto it, and added `mobile/screens/reader/reader-profile/ReaderProfileMobile.jsx/.css`. Promoted the manifest/route for reader audiences, registered `ckm-reader-profile`, and also registered D41's existing `ckm-meeting` prefix after the full CSS contract exposed that omission. The native surface supports own/visitor identity, follow/request/cancel/unfollow, share, own editing, explicit private collections, public reviews, and previous/next paging.

**Defects fixed:** DEF-54 — the desktop reader profile's N+1 collection loading, fixed by one bounded server page shared by both presentations. DEF-55 — `/reader/profile/:ownId` was treated as a visitor because the page equated “id exists” with “somebody else”; ownership now comes from the authenticated server comparison. Private history/favorites are no longer rendered as empty public data, and raw collection ids never leave the dedicated response.

**Verification:** Focused client route/contract/render/CSS suite 70/70; server 421/421 in 73 suites; touched client/server ESLint clean; production build passed with 4,147 transformed modules and 53/53 SEO routes prerendered/verified. The build retains the known admin circular-chunk and large-chunk warnings. No deterministic five-width, real-device, screen-reader, or physical-keyboard pass was run, so none is claimed.

**Exact next action:** Begin D43 at `components/collab/CollabRequestsInbox.jsx`, `RequestCollabButton.jsx`, `ActivityLog.jsx`, and `server/controllers/collab.controller.js`: map outgoing/incoming request state, decisions, roles, notification/deep links and paging into one shared contract, then add the smallest canonical native entry surface without duplicating the editor's already-native People/comments flows. Keep bank/guild proof separate.

---

#### 2026-08-21 — Codex — D41: message meetings with an actual subject boundary (COMPLETE)

**Requested continuation:** Continue the native app implementation and improve the code rather than adding another private presentation fork.

**Starting checkpoint:** D39/D40 had completed the native inbox, thread, attachments and mutations. Meeting scheduling and the desktop deal-context rail remained absent on native. Project detail already had a native meeting form and shared request functions, while desktop messages still mounted the private `MeetingModal` and enabled it only for the exact legacy `investor` role.

**Audit and interaction decision:** A conversation can reference more than one project, so deal context is derived once in `messageContract.js`: distinct projects are ordered by most recent reference, files exclude deleted messages, and the most recent admin video is the trailer signal. The native header opens a conversation-details sheet rather than pinning a desktop sidebar into a 320px thread. That sheet provides the member profile, every linked project, trailer state and every shared file; only an active FIP member talking to a writer with linked project context receives the meeting action. The most recently referenced project is the meeting subject. The existing project-detail `MeetingSheet` moved into shared mobile components and both consumers call `projectActions.js`; no part of desktop `MeetingModal` was copied. A full-page Google consent return keeps the thread URL and stores/restores the draft when session storage is available.

**Server boundary and defects fixed:** The prior endpoint checked only that the caller had active FIP access. Any such caller who knew ids could pair any user with any script before Ckript created a Google Calendar event and emailed both attendees. DEF-52 is fixed by requiring the target's canonical writer/creator role, proving `script.creator === writerId`, and admitting only a public project or one already unlocked/purchased by the requester before decrypting a token or calling Google. That final availability check prevents a guessed draft/sold-project id from leaking its title into the requester's calendar. DEF-53 is fixed by one pure request normalizer: only 15/30/45/60-minute future meetings are admitted, invalid timezone/instant data is refused, and title/note lengths match the clients' 120/500-character controls. Desktop messaging now shows its launcher for every active FIP role and only when the counterpart is a writer, matching the server rather than special-casing investors.

**Verification:** Shared contract/model/render/project-action coverage passes 34/34. The complete server suite passes 413/413 in 71 suites, including five new normalization tests and three controller subject-boundary tests. Every touched client JavaScript file passes targeted ESLint; repository-wide client lint still reports its pre-existing 176-error baseline. The production build transforms 4,143 modules and all 53 public routes prerender and verify; only the existing admin chunk-cycle and large-chunk warnings remain. No deterministic five-width browser harness was added in this slice, and no real device, OAuth consent, Google event, screen reader, or physical keyboard was used, so those checks remain explicitly unclaimed.

**Exact next action:** Begin D42 at `pages/ReaderProfile.jsx` and `/reader/profile/:id?`: audit own/visitor reader identity, favorites, reviews, follows, projection/privacy, deep links and paging; extract one desktop/native contract before promoting the route. Keep banking and guild-proof review separate.

#### 2026-08-21 — Codex — D40: message mutations with server-owned authority (COMPLETE)

**Requested continuation:** Continue the native app implementation and write better code.

**Starting checkpoint:** D39 promoted `/messages` with the inbox, text thread, historical attachment display, authoritative unread aggregation, and persisted-message socket delivery. Attachment upload, reactions, and deletion still belonged to the desktop presentation; native listened for a deletion event the server never emitted.

**Audit and interaction decision:** The desktop upload sent a file to `/messages/upload` without naming a recipient, then `/messages/send` accepted any client-supplied `fileUrl` and `fileType`. The original authorization check lived after multer, which meant an invalid target was discovered only after a body as large as 250 MiB had entered memory. The desktop also emitted `message-deleted` after REST deletion, but the authenticated socket server had no corresponding listener; reactions had no mutation event at all. D40 makes selection/removal/progress/retry explicit in the composer, uses a disclosure with 44px quick-reaction targets rather than hover UI, and uses the shared destructive `ConfirmDialog` for deletion. A ready upload remains available after send failure so retry does not upload the bytes again.

**Shared and server boundary:** `features/messages-operator/messageContract.js` now owns the accepted picker types, size rule, quick-reaction vocabulary, attachment validation/upload with normalized progress, reaction toggle, and own-message deletion. Desktop operator messaging consumes those operations and the admin message sender carries the same receiver/grant fields. Before multer parses a message upload, the server validates the target id, both users, block state, established-thread/purchase/FIP/admin relationship, and quota availability. The Cloudinary result receives a one-hour signed grant bound to owner, exact URL, intended recipient, and authoritative file category; send verifies that grant and ignores the client file category. Admin-only generic image upload remains available for the existing email builder without weakening message sends.

**Changes and defects fixed:** Native `useMessagesMobile` owns stale-attempt guards, progress, retry/removal, attachment-only optimistic send, mutation pending/error state, and idempotent reaction/deletion socket handling. `MessagesMobile` renders attachment states, grouped reaction counts, quick controls, and confirmed own deletion. DEF-49: arbitrary authenticated callers could use the message uploader without proving any recipient relationship — fixed before multipart parsing. DEF-50: a message could name an arbitrary attachment URL/type — fixed with owner/recipient-bound server grants and server-derived type. DEF-51: deletion delivery depended on a dead client relay and reaction state stayed stale — fixed with events emitted only after successful saves; deletion additionally clears text, attachment metadata, and reactions. SVG, unsupported MIME types, unsupported reaction values, and malformed deletion ids now fail closed.

**Verification:** Focused shared-contract/model/render coverage passes 16/16; the complete server suite passes 407/407 in 70 suites. Touched messaging and server files pass ESLint, and `git diff --check` is clean. `AdminDashboard.jsx`, touched only at its message upload/send fields, retains its pre-existing four lint errors and five hook warnings. The production build transforms 4,140 modules and all 53 SEO routes prerender and verify; only the existing admin circular-chunk and large-chunk warnings remain. The sequential full-client run is 1,953/1,959 with exactly the six deterministic recorded failures: four stale `AppShell.render` expectations, WriterRoster's old gate expectation, and the unrelated DataTable CSV expectation. The prior finance concurrency timeout did not recur. No deterministic five-width browser sweep, real device, real Cloudinary upload, real two-client socket pair, or physical-keyboard run was performed, so none is claimed.

**Exact next action:** Begin D41 by auditing the message thread's meeting/calendar launcher and script/deal-context rail against the already shared project-detail meeting contract. Add only the native meeting/context surface that can reuse authoritative operations; do not copy `MeetingModal`. Keep reader collections and bank/guild-proof review separate.

#### 2026-08-21 — Codex — D39: native inbox and text conversation (COMPLETE)

**Requested continuation:** Continue the native app implementation and improve the code quality.

**Starting checkpoint:** D38 completed incoming follow requests and named `/messages` as the next Phase 5 research gate. The canonical route still mounted a 1,000+ line desktop operator console on phones, owned its network and socket calls inline, and had no focused feature tests. The server conversation endpoint explicitly returned `unreadCount: 0` for every thread, while the navbar separately counted real unread messages.

**Research and state-machine decision:** Audited the complete desktop page and stylesheet, message routes/controller/model, authenticated socket rooms/events, shell unread polling, project/profile message entry points, attachment/trailer/meeting actions, mobile route policy, and mobile shell keyboard/safe-area contract before moving JSX. The native route is one canonical URL with two states: inbox (`/messages`) and detail (`/messages?thread=<chatId>`); existing `recipientId`, `recipientName`, and `recipientRole` parameters create a pending detail without inventing a second route. Loading, failure/retry, empty, search, unread, pending-recipient, thread-loading, send-failure, sending, and ready states are explicit. The bounded D39 contract is conversation list/load, message load, mark-read, and send; attachment upload, reactions/delete, meeting scheduling, trailer approval, bulk selection, and deal-context tools remain desktop-only advanced actions for a later slice rather than being copied.

**Shared-boundary decision:** A small request/normalization contract will serve both desktop and native callers. The desktop console keeps its operator-specific UI and socket orchestration, but must stop spelling the four core endpoints inline. Native owns only presentation and the URL-backed list/detail state machine. Server-side inbox projection remains authoritative for unread counts.

**Additional socket finding:** The authenticated `send-message` socket event verified that the emitter belonged to the room and that the payload named that user as sender, but then broadcast the client-provided body without proving a matching Message existed. A participant could therefore inject a transient message into another participant's live UI that vanished on reload. D39 moves `receive-message` emission to the successful REST controller over the populated Mongo document and removes the client relay.

**Changes:** Added `messageContract.js` as the shared desktop/mobile list, thread-load, mark-read, send, preview, chat-id, and error boundary; the desktop operator console now consumes it. Added the native `MessagesMobile` inbox/detail screen, a pure defensive view model, and an orchestration hook with stale-request guards, optimistic text send, URL-owned selection, pending-recipient support, authenticated live updates, and visible-tab polling fallback. The thread renders historical attachments but deliberately does not copy advanced desktop mutations. Promoted `/messages` through the manifest/router, registered isolated `ckm-messages` styles, and retired the desktop-experience notice from that route. The server now groups to one latest message per conversation before limiting, computes actual unread totals, validates can-message/reaction ids, requires reaction membership, and emits only the populated document accepted by Mongo; clients no longer relay message bodies through a socket.

**Defects fixed:** DEF-46, one busy thread could consume the raw-message limit and every returned conversation lied that it had zero unread messages. DEF-47, any authenticated user who learned a message id could react to it, even without belonging to its conversation, while malformed ids became 500s. DEF-48, a participant could emit an arbitrary live message body that the other participant saw even though no matching Message existed in Mongo.

**Verification:** The shared contract, model, render, manifest/policy/router, navigation, desktop-notice, and mobile CSS matrix passes 131 client tests. The complete server suite passes 402 tests in 70 suites. Every touched client/server JavaScript file passes ESLint. The production build transforms 4,140 modules and prerenders/verifies all 53 public routes; only the existing admin circular-chunk and large-chunk warnings remain. `git diff --check` is clean. The full client run is 1,947/1,954: four already-recorded stale `AppShell.render` expectations, the already-recorded WriterRoster gate expectation, one unrelated DataTable CSV expectation that also fails alone, and a finance no-session timeout that passes alone at 10/10. No deterministic five-width, real-device, real two-client socket, attachment-upload, or physical-keyboard run was added, so none is claimed.

**Exact next action:** Begin D40 by moving attachment upload, reaction, and own-message deletion into the shared messaging contract, auditing their file/type/authorization/socket behavior, then add native progress/retry, reaction controls, and destructive delete confirmation. Keep meeting/deal context, reader collections, and bank/guild-proof review separate.

#### 2026-08-21 — Codex — D38: one incoming-network decision, everywhere (COMPLETE)

**Requested continuation:** Continue the native app implementation.

**Starting checkpoint:** D35 implemented outgoing follow/request/cancel/unfollow state on visitor profiles, but incoming management remained a desktop fallback at `/follow-requests`. The route page, legacy `MainLayout`, and shared app-shell notification hook each posted directly to accept/reject endpoints, with different local cleanup behavior. The owner screen showed the server's pending count but offered no path to the queue.

**Research and boundary decision:** Audited the standalone page, both notification shells, notification targeting, route policy, User request arrays, and all four follow controllers before moving JSX. Incoming requests are a standalone network queue because notification targets already deep-link there; the owner profile should link to it rather than grow a hidden tab. List loading and accept/reject are one authenticated-profile contract, while request-card normalization stays a defensive mobile view model. The controller audit found that accept/reject trusted any non-empty `fromUserId`, allowing malformed values to reach Mongoose as 500s; acceptance also left its original `follow_request` notification behind while rejection removed it.

**Changes:** Added `loadIncomingFollowRequests` and `decideIncomingFollowRequest` to the authenticated-profile boundary plus `useIncomingFollowRequests` for cancellable loading, durable error state, single-flight decisions, and successful local removal. `FollowRequests.jsx`, `MainLayout`, and `useShellNotifications` now call that boundary rather than three endpoint copies. Added `FollowRequestsMobile`, a pure list model, isolated `ckm-follow-requests` styles, and native loading/failure/retry/empty/list/action states; promoted `/follow-requests` in the manifest/router and linked it from `ProfileOwnerMobile` with `pendingFollowRequestCount`. The server now validates canonical ObjectIds before lookup or mutation and removes the accepted request's source notification before creating the acceptance notification. While touching the shared notification hook, its seen-toast hydration moved fully out of render and now restores the persisted per-user Set instead of replacing it with an empty Set before the first poll.

**Defects fixed:** DEF-43, malformed accept/reject requester ids could throw CastError and answer 500, with reject especially dangerous because its owner-side request removal occurred before the invalid requester update. DEF-44, acceptance left a stale actionable request notification even after the queue entry was consumed. DEF-45, `useShellNotifications` read acknowledged toast ids from storage during render and then immediately erased the in-memory Set in its polling effect, replaying old unread toasts after refresh.

**Verification:** The expanded profile/network contract, hook, model, render, route, notification-persistence, and CSS matrix passes 153 client tests. The complete server suite passes 399 tests in 69 suites, including malformed accept/reject ids and accepted-notification cleanup. Every touched client and server JavaScript file passes ESLint. The production build transforms 4,135 modules and prerenders/verifies all 53 public routes; only the existing admin circular-chunk and large-chunk warnings remain. `git diff --check` is clean. No deterministic five-width, real-device, socket, or physical-keyboard run was added, so none is claimed.

**Exact next action:** Begin D39 with a research gate over `/messages`, its controllers/routes, sockets, unread counters, composer, attachments, and request/approval states. Write down the list/detail state machine and shared contract boundary before implementing the native route. Keep reader collections and bank/guild-proof review separate.

#### 2026-08-21 — Codex — D37: native settings with an actual security boundary (COMPLETE)

**Requested continuation:** Continue the native app implementation and keep the code-quality bar high.

**Starting checkpoint:** D36 made the owner's identity and professional editor native but deliberately routed `/profile?tab=settings` back to the 3,000-line desktop profile. That tab still contained every account operation as inline API calls: preferences, email verification/change, password, notifications, sessions, localization, Google Calendar, blocked users, deleted projects, and deletion.

**Research and boundary decision:** Audited the rendered settings tab, calendar card, auth/user controllers, User schema, session middleware, and own-profile response before moving JSX. Banking and guild proof belong to separately reviewed credential/finance workflows and are not part of the live settings tab. The rest is one account-security surface, but its requests must be shared with desktop rather than copied. The audit also showed that `.select("-password")` was not a security projection: the owner's general profile response still carried verification/reset state, active session material, payment/provider identifiers, OAuth internals, and the account-deletion archive.

**Changes:** Added `pages/profile/accountSecurity.js` as the tested request/validation/envelope contract and moved the desktop settings and Google Calendar card onto it. Added `AccountSettingsMobile`, its pure role/session/deleted-project view model, and isolated `ckm-account-settings` styles. The native route covers currency, privacy/contact controls, verification and pending-email change, password, three notification preferences, active/current/remote sessions, language/timezone, industry Calendar connection, unblock, writer deleted-project history, and admin-aware account deletion. Destructive session and deletion actions use native confirmation dialogs. The manifest query exclusion was removed only after route/render/contract coverage existed. On the server, own-profile projection now removes credential, reset, session, OAuth/payment-reference, and deletion-archive material; password changes retain only the authenticating session; and remote-session deletion rejects the current session.

**Defects fixed:** DEF-40, the own-profile response returned sensitive account internals through a broad User serialization. DEF-41, a successful password change did not invalidate any stolen or forgotten session on another device. DEF-42, `DELETE /auth/sessions/:sessionId` accepted the current session even though current-device termination has a dedicated logout endpoint and token cleanup path.

**Verification:** The expanded profile/settings contract, model, render, route, policy, and projection matrix passes 121 client tests. The complete server suite passes 396 tests in 68 suites. Every touched client and server JavaScript file passes ESLint. The production build transforms 4,131 modules and prerenders/verifies all 53 public routes; only the existing admin circular-chunk and large-chunk warnings remain. `git diff --check` is clean. No deterministic five-width, real-device, OAuth consent round-trip, or physical-keyboard run was added, so none is claimed.

**Exact next action:** Begin D38 by auditing incoming follow-request list/accept/reject behavior in `Profile.jsx` and the server routes, extract it into the authenticated-profile boundary, and add native management from the owner workspace with pending, empty, failure, accept, and reject coverage. Keep reader collections and bank/guild-proof review separate.

#### 2026-08-21 — Codex — D36: the owner's profile, with security kept separate (COMPLETE)

**Requested continuation:** Continue the native app implementation and write the next slice to a higher code-quality bar.

**Starting checkpoint:** D35 made visitor profiles native but deliberately left every own-id/username form on the 1,590-line desktop `EditProfileModal`. That modal mixed identity/professional fields with banking and guild-proof workflows, while the settings tab separately owned email, password, sessions and account deletion.

**Research and boundary decision:** Audited the modal, `Profile.jsx`, `getUserProfile`, `updateUserProfile`, image upload, username availability, membership proof, and settings endpoints before moving JSX. Identity and professional overview are one reversible profile mutation. Banking/guild proof have review state and document uploads; email/password/sessions/delete are account-security operations, including destructive and session-invalidating outcomes. The native editor therefore ports only the first boundary. Route policy explicitly sends `/profile?tab=settings` to desktop rather than hiding incomplete security controls inside the owner screen.

**Changes:** Added `pages/profile/profileEditor.js` as the shared draft, validation, role vocabulary, username, image-upload, save, and nested-merge contract. `EditProfileModal.jsx` now calls that boundary instead of retaining private API copies. Added `ProfileOwnerMobile`, a pure owner view model, isolated `ckm-owner-profile` styles, and a full-screen native editor for identity, photo, address, bio/skills, writer representation/genres/tags/diversity, and every industry role's professional preferences. `useAuthenticatedProfile` now retains the owner's deleted/purchased/bookmarked collections and can merge a server update without refetching or dropping nested account data. The route selector recognizes own id, sid, and username forms across `/profile`, `/profile/:id`, signed-in `/share/profile/:id`, and canonical `/:id`.

**Defects fixed:** DEF-38, “Remove current photo” sent an empty string but the server's `normalized || oldValue` assignment always restored the old image; omission now retains, an explicit empty string clears, and malformed non-string input cannot masquerade as removal. DEF-39, the desktop professional editor checked only `role === "investor"`, excluding producer, director, industry, and professional accounts; it now uses the shared five-role policy.

**Verification:** The expanded profile/route/model/render matrix passes 107 client tests. The complete server suite passes 393 tests, including explicit photo retain/replace/remove/malformed cases. Every touched client/server JavaScript file passes ESLint. The production build transforms 4,127 modules and prerenders/verifies all 53 public routes; only the existing admin circular-chunk and large-chunk warnings remain. No deterministic five-width, real-device, or physical-keyboard run was added for this personalized route, so those visual/interaction checks remain explicitly unclaimed.

**Exact next action:** Begin D37 by extracting the live email/password/session/delete operations from `Profile.jsx` into a tested shared account-security contract, then implement `/profile?tab=settings` natively and remove its manifest exclusion only when the destructive confirmations and session states have parity. Keep bank and guild-proof review as a later credential/finance slice.

#### 2026-08-21 — Codex — D35: authenticated visitors, without authenticated secrets (COMPLETE)

**Requested continuation:** Continue the native app implementation and improve the code quality.

**Starting checkpoint:** D33/D34 had promoted only signed-out `/share/profile/:id`. A signed-in visitor still received the 74 kB desktop profile at the share URL, `/profile/:id`, and canonical `/:id`; own profile deliberately shared that desktop component because its edit/security/account actions had not been separated.

**Research and security findings:** Audited the complete `Profile.jsx` action set and `getUserProfile` before moving JSX. The authenticated endpoint selected the entire User document except `password`; another member could therefore receive email/phone, reset and verification state, sessions/IPs, payment references, OAuth/calendar data, moderation/deletion fields, and subscription internals. Its visitor script query also returned complete Script documents, including screenplay and stored-PDF fields. The private-state button sent a username to a follow endpoint that accepts only ObjectIds. The desktop message composer posted to `/users/message-request`, a route that does not exist, while the real controller admitted only exact `investor` accounts even though the product has five industry roles. The message-slot endpoint also trusted the target id without checking that the caller had FIP access and the target was a writer.

**Changes:** Added explicit server allowlists for authenticated visitor users and project summaries, denial builders that carry only the target id private follow needs, and a shared writer/industry direct-message pair resolver. Added `authenticatedProfile.js` and `useAuthenticatedProfile` as the one desktop/mobile boundary for cancellable profile loading, stale-route protection, canonicalization, follow/request/cancel/unfollow, message, block, contact reveal, and pitch. `Profile.jsx` now calls that contract instead of private endpoint copies. Added `ProfileVisitorMobile`, its defensive view model and isolated token-based stylesheet; it presents identity, credentials, professional facts, projects, contact quota, complete access/error states, and live message/pitch/block dialogs. Route policy promotes all three visitor forms for authenticated accounts while recognizing the current account by id, sid, or username and leaving it on desktop.

**Defects fixed:** DEF-33, authenticated visitor User data was a blacklist with one excluded field; DEF-34, visitor project lists were a second screenplay/PDF endpoint; DEF-35, private canonical usernames could not send follow requests; DEF-36, the profile message UI called a nonexistent route and the real route excluded producer/director/industry/professional roles; DEF-37, the message-slot consumer checked neither FIP entitlement nor writer target role.

**Verification:** 92 focused client tests passed across loader/hook/model/render/route/CSS contracts. All 389 server tests passed, including projection and five-role direct-message coverage. Every touched client/server JS file passed ESLint, and all modified controllers imported together. The production build transformed 4,122 modules and prerendered/verified all 53 public routes; its existing admin circular-chunk and large-chunk warnings remain. The repository-wide client lint still fails on its pre-existing baseline (175 errors, 35 warnings), including untouched files. No deterministic five-width or real-keyboard pass was added for this personalized route, so visual viewport and keyboard QA remain explicitly unclaimed.

**Exact next action:** Begin D36 by separating identity/overview editing in `EditProfileModal.jsx` from sessions, password, deletion and other account-security actions; create the shared editor mutation boundary first, then promote the own `/profile` variant without reviving the dead `PrivacySettings*` components.

#### 2026-08-21 — Codex — D33/D34: public identity without private capability (COMPLETE)

**Requested continuation:** Continue the native app implementation and write the next slice to a higher code-quality bar.

**Starting checkpoint:** D32 closed Phase 4. The Phase 5 gate named `/profile/:id?`, `/reader/profile/:id?`, `/share/profile/:id`, and canonical `/:id`, but no profile route had a native disposition.

**Research and decision:** Audited `Profile.jsx`, `ReaderProfile.jsx`, `PublicProfile.jsx`, the four App routes, `getProfileCanonicalPath`, profile policy, `getUserProfile`, and `getPublicUserProfile`. The authenticated profile is a workspace with follow/request, message, block, contact, post/project, edit, session, password and account-delete capabilities; the reader profile separately owns reads, favourites and reviews. The public controller is intentionally narrower: public identity and professional fields, counts rather than relationship arrays, safe-tier metadata, and published script summaries without contact data, private flags, or screenplay bodies. That made signed-out `/share/profile/:id` the only honest first vertical slice. Because App gives a signed-in viewer the richer `Profile` at that same URL, the manifest now expresses `signedOutOnly`; mobile policy falls back for an authenticated account instead of silently removing capabilities.

**Changes:** Extracted cancellable `usePublicProfile` and moved desktop `PublicProfile` onto it. Added the `PublicProfileMobile` presentation, isolated `ckm-public-profile` styles, and a defensive pure model that normalizes identity, counts, lists, industry/writer facts, project teasers and credential-free HTTP(S) links. Route-id changes render loading rather than the previous person's identity; private, invalid/not-found, malformed-response, network-failure and retry states are distinct. The public screen has one H1, a public shell, safe sign-in return path, public project links, and no authenticated relationship capability.

**Verification:** 69 focused tests passed across the loader, model, render contract, route policy/coverage, and CSS contract. Touched-file ESLint passed. The production build and all 53 prerendered SEO routes passed; the existing admin circular-chunk and large-chunk warnings remain. No deterministic five-width harness was added, so visual viewport inspection is explicitly unclaimed rather than inferred from unit tests.

**Exact next action:** Begin D35 by extracting the authenticated profile load/relationship contract from `Profile.jsx`, then port the visitor variant for `/profile/:id` and authenticated `/share/profile/:id`; leave own editing/settings and reader collections behind until their mutations have shared boundaries.

#### 2026-08-21 — Codex — D32: one reader, one authorization boundary (COMPLETE)

**Requested continuation:** Continue the native app implementation and improve the code quality.

**Starting checkpoint:** D31 was open in PR #576; Phase 4 had only `/reader/script/:id`, reader/preview performance, and DEF-27 left.

**Research and decision:** Audited `ScriptReader.jsx`, `ScriptWorkbenchPage`, `ScreenplayPdfViewer`, `ProjectReaderDialog`, `getScriptById`, `getScriptPdf`, and `exportScreenplayPdf`. The existing native project screen already owns reader review and access states, so `/reader/script/:id` reuses it with reader-specific navigation rather than creating another mobile page. For DEF-27, selected structured projected text for preview-only viewers and full PDF fidelity only after an explicit full-access relationship. Marketplace eligibility is not screenplay authorization.

**Changes:** Added `server/utils/scriptReadAccess.js` and tests; applied its predicate to detail-body and stored-PDF decisions; added pure `projectReaderSource.js` and tests; changed the reader dialog so preview mode cannot select a PDF; parameterized the native detail screen's back target, analytics id, and canonicalization; promoted the reader route for the reader audience. No new CSS or presentation family was added.

**Verification:** 92 focused client tests passed, including the full native detail render suite; all 377 server tests passed; client and server touched-file ESLint passed; production build passed (4,113 modules) and all 53 SEO routes prerendered and verified. Existing admin circular-chunk and large-chunk warnings remain. Because the promoted route mounts the identical D28/D29 component and no CSS changed, the prior five-width visual evidence applies; the new preview/full selection is covered at the pure model and rendered-dialog boundaries.

**Exact next action:** Begin D33 with the Phase 5 profile-family research gate across own, visitor, reader and public routes before selecting the first vertical slice.

#### 2026-08-20 — Codex — D31: the public shared project (COMPLETE)

**Requested continuation:** Continue the native app implementation.

**Starting checkpoint:** D30 was merged; D31 named `/share/project/:id` and required auditing the unauthenticated controller before reusing any signed-in detail assumptions.

**Research and parity decision:** Inspected `PublicScript.jsx`, `getPublicScriptById`, the public route policy, the authenticated detail model, shell contract, and shared trailer/button/badge/message primitives. The controller returns an explicit public projection: no screenplay body, stored PDF URL, or creator contact fields. Mobile therefore owns a public loader/model and does not call `getViewerCapabilities`. The desktop tab rail becomes five stacked sections; the public surface offers profile/trailer/sign-in navigation and never fabricates purchase, contact, or collaboration entitlement.

**Changes:** Added `usePublicProject.js`; added `ProjectPublicMobile.jsx`, its isolated `ckm-public-project` stylesheet, `publicProjectModel.js`, and model tests; promoted the manifest entry to `SHARED_PUBLIC_SCREEN`; registered the route, shell, CSS prefix, and signed-out policy test.

**Verification:** 62 focused tests passed across route policy, route coverage, CSS contract, and public model. Touched-file ESLint passed. Production build passed (4,112 modules), with the existing admin circular-chunk and large-chunk warnings; all 53 SEO routes prerendered and verified. No deterministic five-width harness was added, so visual viewport inspection remains explicitly unclaimed.

**Exact next action:** Begin D32 by auditing `/reader/script/:id`, `ScriptWorkbenchPage`, `ScreenplayPdfViewer`, and `ProjectReaderDialog`; settle DEF-27's server-side preview contract before promoting a reader that could leak a full uploaded screenplay.

#### 2026-08-20 — Claude — D30: the buyer's checkout, and the charge that nobody could finish (COMPLETE)

##### What this session was for

D29 finished the project page's writes and named the one it did not build: `/script/:id/pay`. It is
the only Phase 4 surface whose primary control hands the viewer to a screen we do not own — Razorpay
Checkout, in an iframe, outside our DOM — and the plan's own note about it was written before anyone
had read the endpoint: *back during checkout must not orphan a charged payment*.

Reading `createScriptPurchaseOrder` and `verifyScriptPurchase` end to end made that concrete, and
made it worse than the note assumed. Verification needs the Razorpay signature; the signature exists
in exactly one place — the `handler` callback that runs **in our page, after the money has moved**.
If the request made from that callback never lands, the server has no way to find the payment and
the buyer has no way to prove it. The old page's entire answer was the sentence *"Payment
verification failed. Please contact support."*

##### The shape: one contract, two presentations

- **`pages/script-detail/checkout.js`** — no state, no hooks, no router, no toast, and the same
  `{ ok, data }` / `{ ok, message, status, flags }` envelope `projectActions.js` already uses (it
  imports `fail` rather than redeclaring it). It holds the pricing arithmetic in the server's own
  order, the nine-way standing, the acceptance rule, the gateway loader, the three requests, the two
  PDFs, and the pending-charge record.
- **`pages/script-detail/useProjectCheckout.js`** — what a screen has to *remember* while a buyer
  moves through those steps. One hook, not three, because the steps are not independent: creating an
  order RECORDS the acceptances server-side, so a dismissed sheet is not a lost agreement; a verified
  payment changes the project, which the caller's `refresh` re-reads; and the two documents only
  exist after it.
- **`ScriptPaymentPage.jsx` went from 659 lines to 384 and is now presentation only.** It did not
  gain a sibling; it lost its private copies.
- **`mobile/screens/projects/checkout/ProjectCheckoutMobile.jsx`** (`ckm-checkout`, `flow` shell with
  a one-slot docked footer) is the phone's presentation of the same facts.

##### Four things the desktop page was doing that neither platform does now

1. **DEF-31 — the page promised rupees and the gateway could charge dollars.** `create-order`
   resolves the currency as `resolveCurrency(req.body?.currency, req.user.preferredCurrency)`. The
   payment page never sent `currency`, so the account decided it silently: a buyer whose profile says
   USD read "Pay ₹2,52,000.00" and met a dollar amount in the sheet, with no line of the page saying
   so. Every *other* checkout in this client (`useWriterPlanCheckout`,
   `useFilmIndustryProfessionalCheckout`) already sends the currency it displayed. Fixed: the
   currency is sent, the created order is read back, and the screen states the charge when it differs
   — including the server's INR fallback when the gateway refuses a USD order.
2. **DEF-32 — a charged payment with no way to finish it.** Fixed by writing the payment to
   `localStorage` **before** verifying it, scoped to project *and* account, expiring after 24 hours,
   and retrying once automatically on the next visit. Verification is idempotent by design — the
   server answers an already-released request with `success: true` and the existing invoice — so a
   retry that was not needed costs nothing, and one that was needed is the difference between an
   unlocked screenplay and a support ticket. Both platforms render it: a warning with a manual
   "Confirm it now" if the automatic retry also fails.
3. **The 72-hour payment window was enforced twice and stated never.** `getApprovedPaymentDueAt`
   closes an approved request after 72 hours, and both the order and the verification answer 410 —
   *after* the buyer has committed. It is now a line beside the amount ("Pay by 22 Aug, 3:55 am — 1
   day left"), and an expired window is a standing with no pay control and a way back to request
   again, rather than a live button that fails at press time.
4. **`window.confirm("Payment successful. Do you want to download your invoice now?")`** — a blocking
   browser dialog fired 120 ms after the success banner, over two buttons already on screen offering
   the same file. Gone; the buttons are the answer. The acceptance PDF's silent auto-download went
   with it (see the follow-up below).

Also folded in: the fourth surviving copy of DEF-28's four rights/deal enum maps (this page had its
own), and the third copy of the Razorpay SDK loader — the one that *rejected* where the other two
resolved `false`.

##### The rule, applied to money

D29's rule was that an action not offered still says why. A checkout is where that matters most,
because most visits to this URL cannot pay: the link arrives in an approval notification and is
opened after the writer has sold it elsewhere, or after the window has closed, or while the request
is still pending. So there are **nine standings**, every one with a headline, a sentence and a real
way forward, and the order they are asked in is the *server's* order — own project, already bought,
wrong account type, sold, no request, pending, expired, free, payable — so the screen never offers a
button the server will refuse. **No control on the screen is disabled**, including the pay control
with an unticked box: pressing it is how a buyer learns *which* box, which a `disabled` attribute
cannot say.

##### Evidence

- **76 new tests in 5 files**: `checkout.test.js` (33), `useProjectCheckout.test.jsx` (9, driving a
  stubbed gateway through both of its callbacks — the handler and the dismiss), `checkoutModel.test.js`
  (17), `ProjectCheckoutMobile.render.test.jsx` (11) and `ScriptPaymentPage.test.jsx` (6, which is
  the first test this page has ever had). The mobile + script-detail + payment suites run **1,067 in 70 files** (from 990 in 65).
- **A five-width CDP sweep** (320/360/390/430/768) over the ten `?state=` forms of the new
  `/__mobile-checkout` fixture: **0 overflows, 0 touch targets under 44px, 0 text under 11px, 0
  contrast failures below the 4.5:1 / 3:1 thresholds, 0 disabled controls, 0 elements outside the
  frame.**
- **The full client suite has 13 failures in 6 files, and none of them belong to this session.** They
  were re-run on a clean `git worktree` at HEAD (with `node_modules` junctioned in) and the same files
  fail there: `AppShell.render.test.jsx`, `financeSession.test.jsx`,
  `WriterRosterPage.render.test.jsx` and `adminCompetitionsEditor.test.jsx`, every one of them on a
  5000 ms `Test timed out` under load. Two more — `Upload.render.test.jsx` and
  `panels.render.test.jsx` — failed only inside the full parallel run and pass 102/102 in isolation on
  both trees. Load, not regression.
- **Two instrument failures before any of that was true, both already on this ledger's list.** The
  first sweep reported ten empty screens: a fixed 1.2 s settle against a cold Vite chunk. The second
  reported an element 45px outside the frame at 320px in eight of ten states: the Material Symbols
  font had not loaded, so `arrow_back_ios_new` was rendering as 154px of literal text inside a 44px
  button — the same false red as the cold font cache this ledger already records. The sweep now waits
  for the screen *and* for the icon font before it measures anything.
- **The sweep also caught a real one**: the payment deadline printed twice — once inside the standing
  note, once beside the amount. `describeCheckoutStanding` no longer folds `window.note` into its own
  sentence; it returns it alongside, and each platform prints it exactly once.

##### What was NOT done

`/script/:id/pay` is native now, but nothing about **DEF-27** changed: `GET /scripts/:id/pdf` still
serves the complete screenplay to any authenticated viewer past the marketplace gate, with no
purchase check. It is in this family, it is the most serious open item in this plan, and it is still
blocked on the product decision recorded below. A buyer completing this checkout pays for something
that endpoint would have handed them.


#### 2026-08-20 — Claude — D29: the project-detail write half, and the endpoint that would tell you anybody's phone number (COMPLETE)

##### What this session was for

D28 made the authenticated project page readable on a phone and drew a line under it: the writes —
requesting a purchase, deciding on one, reviewing, rating, revealing a contact, booking a meeting,
deleting — were named as D29 rather than silently dropped, and every state they operate on was
rendered as text so that no viewer had to infer their standing from a missing button.

This session built them. The interesting part is not that the buttons exist; it is where they live.

##### The rule that survived the arrival of buttons, by inverting

D28's rule was **a missing BUTTON never means a missing FACT**. With the actions built, the same
rule points the other way: an action that is *not* offered still says why, in words, because every
reason is a real product state — no plan on this account, a quota spent this month, an account type
that cannot buy, an editor locked while an admin holds a submission, a competition entry that cannot
be deleted. There is **not one disabled control** on this screen. A greyed-out button with no
explanation is a dead end on a phone, which has neither a tooltip nor a hover to inspect it with.

Concretely, that produced `describeQuotaAction` — one function behind both the message and the
meeting standings, because both follow the identical rule (N per cycle, repeats with the same writer
are free, no plan is a different answer from no quota left) and the desktop page had already let
their copy drift into two different sentences.

##### Where the writes live, and why not in the screen

Nine endpoints, each with a role gate, a quota rule and a set of refusals that mean different things
— "your request is already approved, pay now" is not "you already asked". A mobile copy of those
rules is exactly how two platforms start disagreeing about whether a producer may still request a
project. So:

- **`pages/script-detail/projectActions.js`** — no state, no hooks, no router. Each function makes
  one request and returns one envelope: `{ ok, data }` or `{ ok, message, status, flags }`. The
  `flags` are what let a UI branch without regex-matching a sentence: `limitReached`,
  `needsCalendar` (a 428 IS that answer, whether or not the body repeats it), `requiresUpgrade`,
  `optedOut`, `conflict`.
- **`pages/script-detail/useProjectActions.js`** — what the screen has to *remember*: which control
  is busy, which request row is mid-decision, what the server last said about a quota, and which
  list a write invalidated. One hook rather than five because the writes are not independent:
  approving changes the project AND the request list AND the badge; submitting a review changes the
  aggregate rating AND the review list; revealing a contact changes the cached ACCOUNT, not the
  project.
- **`ScriptDetail.jsx` deleted its copies rather than gaining a sibling: -262 lines, +75.** What is
  left there is genuinely the desktop page's own: which modal to close, where to navigate, which
  notice to raise.

##### What the phone got

Three new sections — `feedback` (ratings and reviews), `purchase` (the buyer's request, or the
writer's incoming ones) and an owner-only `manage` — and five components:

- **`StarRating`** is a real radio group in a fieldset, not five buttons. Five buttons announce as
  five unrelated actions with no sense that choosing one unchooses the others; a radio group
  announces as one question with five answers and gets arrow-key operation for free. The inputs are
  `.ckm-sr-only` rather than `display:none`, because a display-hidden input is not in the
  accessibility tree or the tab order at all, and the label is the 44px target.
- **`FeedbackSheet`** is one form behind both a reader review and a producer rating. They are
  different tables with different role gates, but on a phone they are the same task, and two sheets
  would have meant two star controls and two ideas of when submit is live.
- **`PurchaseRequestSheet`**, **`PurchaseRequestList`**, **`MeetingSheet`** (including the Google
  Calendar connect leg, shown *before* the form whenever we already know the calendar is missing —
  connecting is a full-page redirect, so typing three fields first and losing them is the version of
  that flow that wastes the user's time).

Two decisions worth keeping:

- **Every sheet's draft lives in the SCREEN, seeded by the handler that opens it.** A sheet stays
  mounted while closed (its exit animation needs it to), so a self-seeding sheet has to reset itself
  in an effect keyed on `open` — and an effect that writes state can wipe what the user typed on any
  unrelated re-render. This is the arrangement `DiscoveryFiltersDialog` already used; the lint rule
  that refuses `setState` in an effect is right, and following it produced the better design.
- **Approving is confirmed, and the confirmation says the part the desktop page never did.** An
  approval locks the project to that one buyer for three days: `approveScriptPurchase` refuses a
  second approval with `APPROVAL_LOCK_ACTIVE` until the first pays or lapses. The writer learned
  that from a refusal; now they learn it before the tap.

##### DEF-29: an endpoint named for writers that would reveal anybody

`POST /payment/reveal-contact/:writerId` took an id from the URL, checked that the CALLER had a
plan, spent one of their contacts, and returned the target's email and phone. Nothing checked what
kind of account the id pointed at. Any industry account could therefore read another producer's, an
admin's or a reader's contact details, one quota slot at a time.

It was not inferred from reading alone: the opt-out check on the next line
(`allowIndustryContact === false && ["writer","creator"].includes(role)`) was already writer-shaped,
which is precisely what makes the gap visible — a non-writer could not opt out of a disclosure the
product says is about writers. Every real caller (`script.creator._id`, a writer profile, a deal's
writer) passes a writer, so narrowing refuses only calls the product never makes.

**FIXED**: the target must be a writer (404 otherwise) and `allowIndustryContact === false` is now
honoured for every role. Seven tests in `server/controllers/revealWriterContact.test.js` pin it.
The class is worth remembering: *an endpoint named for one kind of subject, taking that subject's id
from the URL, and validating only the caller.*

**DEF-30**, found beside it: the sibling `consumeMessageSlot` never validated the id, so a malformed
one reached `new mongoose.Types.ObjectId(...)`, threw, and answered 500 for what is a 400. FIXED.

##### One behaviour change both platforms get

The writer's purchase-request list polled every 15 seconds forever — including in a background tab
and on a dead connection, which is 240 authenticated requests an hour from a page nobody is looking
at. It now polls only while the document is visible, and reads once immediately when the tab returns
so the writer never waits out the remainder of an interval.

##### Verification

- **Tests:** mobile + `pages/script-detail` at **990 in 65 files** (from 905/58). New: 16 in
  `projectActions.test.js`, 9 in `useProjectActions.test.jsx`, 22 added to `projectDetailModel.test.js`,
  10 added to `ProjectDetailMobile.render.test.jsx`. Server **375/375** (from 368). Full client suite
  1769 passing with the same 5 pre-existing failures (`AppShell`, `WriterRosterPage`), confirmed
  against a stashed tree.
- **Lint** clean on every touched file, both packages. **Build + 53-route prerender** pass, with
  `useProjectActions` emitted as a chunk shared by both platforms.
- **Five-width CDP sweep**, 320/360/390/430/768: **80 measurements, 0 findings.** Eight fixture
  states (preview, requests, requests-empty, locked, reviewed, rated, sold, bare) across four viewer
  accounts, plus **eight opened overlays** — purchase sheet, rating sheet, review sheet, approve
  confirm, decline sheet, delete confirm, meeting connect, meeting form — each verified as actually
  open with its controls counted before measuring. Measured: touch targets (including `::after`
  regions), type size, accessible names, contrast against composited backgrounds, containment in the
  520px frame, no horizontal page scroll, exactly one `<h1>`.
- **Keyboard leg:** 12 real Tab presses through the open rating sheet at each of the five widths —
  **60 stops, 0 escapes from the surface, 0 without a visible focus ring** — and a real ArrowRight
  moving the star selection, with the fill following it.

##### Two things the sweep caught that a reading would not have

1. **Five cases reported "no control to open".** Three were the sweep's own bug — a `Button` renders
   its Material Symbols ligature inside itself, so `textContent` is `"shopping_bagRequest purchase
   access"` and a `startsWith` match fails. The fourth was the product being right: a reader who has
   already reviewed is *deliberately* offered no form, because the server refuses a second review.
   The instrument was wrong twice and the surface once, which is the fifth entry in this ledger's
   "a probe's own red result has been wrong" list.
2. **Control counts fluctuated between widths on identical fixtures** (12 vs 21). Cause: navigating
   from one case to the next with the same URL is a soft navigation the SPA may not re-mount for, so
   the mounted-check passed against the PREVIOUS render. Every case now goes through `about:blank`
   first. This is the same failure mode as D28's "30/30 clean while nineteen had rendered nothing",
   arriving by a different route — and it is why the sweep now records the rendered facts (control
   counts, section ids, overlay controls) beside every zero.

##### What remains in this family

`/script/:id/pay` — the Razorpay checkout — and the public shared project. **DEF-27 is still live
and still blocked on a product decision** (`GET /scripts/:id/pdf` serves the complete screenplay to
any authenticated viewer who clears the marketplace gate); it is the most serious open item in this
plan and it belongs to this route family.

#### 2026-08-14 — Claude — Native authenticated project detail, and four defects in the endpoint family it ports (COMPLETE)

**Requested continuation:** "continue in native app implementation".

**Starting checkpoint (measured, not quoted):** the D27 working tree is uncommitted and preserved; `npx vitest run src/mobile` is **856 passing in 56 files** at claim time. `/featured`, `/top-script` and `/search` are `SCREEN`; all three detail route forms are `DESKTOP_MIGRATION_FALLBACK`.

**Research gate (§4) — the load-bearing finding is that the controller is already separated**
- `pages/ScriptDetail.jsx` is 1,811 lines and renders exactly one thing: `<ScriptWorkbenchPage vm={…} />`. It is already a pure controller handing a ~120-key view model to a 744-line presentation. That is the same shape D8 chose for `/upload` ("reuse the vm prop shape, not the CSS"), except here it exists already — so native detail does not need a seam invented for it, it needs the controller lifted out of the desktop file so two presentations can read one definition of the endpoints and permissions.
- `scriptDetailModel.js` (`getViewerCapabilities`, `deriveScriptJourney`, `getRecommendedAction`) is already platform-neutral and is IMPORTED, not ported — the same rule D27 applied to the broadsheet derivations.
- All three route forms mount the same component. `/script/:id` and `/script/:projectHeading/:writerUsername` are aliases; after either load `getScriptCanonicalPath` replaces the URL with the server's canonical root-level path. `getScriptByPath` resolves the path to an id and then calls `getScriptById` directly, so there is one payload contract for all three, not three.

**Defects found by the gate, before any code was written — recorded here at claim time so they are not mistaken for a later discovery**
- **DEF-25 (candidate): the authenticated detail response gates two body fields and leaks two more.** `getScriptById` builds its response as `{ ...script.toObject(), … }` and then explicitly nulls `fullContent` and `textContent` for a viewer without `canViewFullScript`. `fountainContent` and `fileUrl` are not nulled and are not projected away — and `fountainContent` is the schema's own "canonical Fountain markup … source of truth when present", which the desktop reader itself prefers over `textContent`. So the gate is bypassed by reading the field the gate forgot. Same family as DEF-21, on the endpoint this session ports.
- **DEF-26 (candidate): the paid contact-reveal quota is bypassable by reading the JSON.** The same handler populates `creator` with `"name email phone profileImage role bio followers username …"` and never strips it, while the whole `writerContact` / `writerContactRevealStatus` block below it exists to release email and phone only to a viewer with an active FIP plan and remaining quota. Grepped rather than assumed: nothing in `client/src` reads `creator.email` or `creator.phone`, and the workbench's contact panel reads only `vm.writerContact` — so the populated fields have no consumer and exist only to leak. `getPublicScriptById`, by contrast, builds an explicit whitelist and is not affected.
- Both will be fixed on the server with tests before the native screen consumes the payload, because a native screen built against a leaky payload is a screen that cannot tell which fields it was entitled to.

**Boundary claimed for this slice:** read the project. The write half (purchase requests, reviews/ratings, contact-message-meeting quotas, owner edit/delete, AI trailer, invoices) is D29. Permission, request and payment STATES are still rendered as text here.

**Two more defects, found after the claim**
- **DEF-27 — the PDF proxy asks every question except the one it turns on. RECORDED, DELIBERATELY NOT FIXED; it needs a product decision (see the question at the end of this entry).** `GET /scripts/:id/pdf` checks the marketplace gate, draft privacy and sold state, then serves the complete stored screenplay. It never asks whether the viewer may read the full script. Proven by contrast rather than argued: its sibling `exportScreenplayPdf`, which serves the SAME screenplay in generated form, refuses through `canAccessScript` (owner, admin, accepted collaborator, buyer), and `getScriptById` withholds the very same text. The obvious gate is NOT applied, because it would also break a legitimate surface — the desktop Preview panel points `ScreenplayPdfViewer` at this same URL and limits the visible pages IN THE BROWSER, so preview-entitled viewers reach it too. That is also exactly why the leak exists: client-side page limiting is a presentation choice, not an access boundary. Closing it means deciding what a preview-entitled viewer receives instead, which is a fidelity decision. A comment at the line states all of this and says "do not fix this by adding the gate alone".
- **DEF-28 — a closed schema enum with four copies, one of them wrong.** The rights/modification/payment/negotiation label maps existed in `ScriptDetail.jsx` (where all four were DEAD — declared and never read, since that file is a controller), `ScriptWorkbenchPage.jsx`, `ScriptPaymentPage.jsx` and `AdminScriptView.jsx`. The workbench's copy — the one on the live page a buyer reads — is missing `ckript_not_involved`, a value `models/Script.js:295` accepts and the admin editor offers. A writer who chose it had their rights term shown to buyers as **"Not specified"**, on the platform that takes a commission on the resulting sale. The failure was the duplication, not a typo: adding a value to the schema updated none of the four.

**Implemented**
- `server/utils/scriptDetailPayload.js` + 8 tests: the detail response's privacy boundary as one testable unit — the creator select without `email`/`phone`, all four body fields gated together, and `hasUploadedScriptFile` so withholding `fileUrl` does not also withhold the non-private fact that a PDF exists. Deliberately NOT a Mongoose projection: this handler saves the loaded document (spotlight sync, PDF text hydration), and saving with unselected paths is how a partial write happens — the same reasoning `getScripts`' find branch already carries.
- `pages/script-detail/useProjectDetail.js`: the shared data layer — endpoint choice for all three route forms, canonicalization, the blocked/not-found/failed split, an in-place `refresh` and a `reload`. **It made `ScriptDetail.jsx` smaller, not larger:** the desktop page consumes it, so there is one definition of "which URL do I call and what does a 403 mean here", which is what D25's inventory required of this family. It also gained cancellation the desktop page never had — changing the URL used to race two loads and let the slower one win.
- **The bookmark was DELETED, not shared.** `hooks/useScriptBookmark` already called itself "the one implementation of star this project" and already owned the optimistic account update, the `localStorage` write and the `bookmarkUpdated` event — and `ScriptDetail.jsx` carried a third, hand-rolled copy of all three anyway. The new hook delegates to the real one, so giving mobile a bookmark REMOVED a copy instead of adding a fourth.
- `pages/script-detail/scriptDealLabels.js`: one deal vocabulary for the workbench and the native screen, with `DEAL_ENUMS` beside it so the next value added to the schema fails a test instead of rendering as "Not specified".
- `mobile/screens/projects/project-detail/`: `ProjectDetailMobile.jsx` (`detail` shell, one `h1`, hero + status, the recommended action, five stacked sections), `projectDetailModel.js`, `ProjectSection.jsx`, `ProjectReaderDialog.jsx` and their CSS under two newly registered prefixes (`ckm-project`, `ckm-reader`).
- **The eight-tab rail is replaced by five labelled landmarks, not five headings.** Each section is a `<section aria-labelledby>` with `tabIndex={-1}`, so the recommended action moves FOCUS and not merely scroll position — a section scrolled to but not focused leaves the next Tab back at the top of a long project page. The tabs were the navigation; removing them without giving the sections landmarks would have removed the navigation too.
- `FeaturedTrailerDialog` PROMOTED to `mobile/components/media/TrailerDialog.jsx` (prefix `ckm-featured-trailer` → `ckm-trailer`). §6 reserves a family's `components/` folder for components exclusive to that family, and D28 is the session where it stopped being exclusive. Registry entry, owner path and D27's call site moved together.
- All three route forms promoted, plus `/__mobile-project` with six `?state=` fixtures. The two-segment catch-all is promoted **without moving**: it stays last and `findMobileRoute` returns the first match, so every static route above still wins — pinned by a test that walks `/script/:id/pay`, `/admin/scripts/:id`, `/reader/script/:id` and `/create-project/:draftId` and asserts none resolves to `project-detail`.
- One model decision worth naming: `getScriptCompletionStatusLabel` defaults an unset status to **"complete"**. Harmless as a badge; as a labelled FACT on a buyer's screen, "Completion: Complete" on a project whose writer never answered is an assertion nobody made. The fact is omitted unless the status was actually set.

**What the sweep found, and all three were real**
- **A live contrast failure in a Phase 1 shared component, invisible for four sessions.** `ckm-page-header__eyebrow` is `--ckm-muted` at 11 px — **3.56:1** — and `PageHeader` is the app bar for every non-dashboard screen in the product. No earlier sweep caught it because no earlier fixture ever passed `PageHeader` an `eyebrow`; D28 is the first screen that does. Moved to `--ckm-text-3`. This is the **fourth** confirmed caller of the recorded "`--ckm-muted` is a graphical-object token and is not safe for text" follow-up, and the first one outside a screen's own CSS.
- **The revealed contact links measured 113×37 and 134×17 px.** Anchors in a fact list are targets, not words in a sentence, so WCAG 2.5.8's inline exception does not cover them; they are full-width 44 px rows now. Only the `sold` fixture reaches that state — which is the argument for a six-state matrix rather than one rich fixture.
- **A bug in code written this session that no unit test would have thought to ask about.** `getRecommendedAction` emits its `trailer` intent from exactly one branch — an OWNER whose listing has no trailer yet, labelled "Complete the listing" on desktop. Reading the intent's NAME instead of its branch produced a **"Watch the trailer"** button on a project that by definition has no trailer. The `bare` fixture rendered it and the sweep printed the label. Fixed to the editor link and pinned by a test.

**Verification**
- Server suite **368/368**, up from 360, with the 8 new privacy tests. Touched server lint clean.
- Mobile suite **905 in 58 files**, against the **856 in 56** measured before any edit. Focused additions: 26 model, 14 screen render, 9 shared-hook, 5 deal-vocabulary, plus the new route-policy cases. Shared layer (`src/pages/script-detail`) **28 in 5 files**.
- Client lint clean on `src/mobile`, `src/pages/script-detail` and `src/App.jsx`. `ScriptDetail.jsx` went from **2 errors to 0** (one dead import orphaned by the extraction, one already dead at HEAD). `ScriptWorkbenchPage.jsx`'s 1 error + 1 warning confirmed **pre-existing and unchanged** by stashing the file and linting the `HEAD` copy — identical findings, shifted only by this session's line delta.
- Production build passes; **53 public SEO routes prerendered and verified**. Separate `ProjectDetailMobile` chunk, and — the visible proof of the two extractions — separate shared `useProjectDetail` and `TrailerDialog` chunks. Existing >500 kB warnings unchanged in category.
- **Real Chrome/CDP, 6 states × 5 widths = 30 measurements** at 320×720, 360×800, 390×844, 430×932 and 768×1024, every one settled past the 1500 ms DEF-23 window and past `document.fonts.ready`: **0 undersized targets, 0 unnamed controls, 0 text below 11 px, 0 contrast failures, 0 genuine overflow, 0 nested interactive controls**, no page-level horizontal scroll, exactly one `main` and one `h1` everywhere, all five sections present in all 30, and 32–71 text nodes with 4–8 controls per measurement. The six states rendered six genuinely different screens, confirmed by their primary actions: Review deal terms / Read the full screenplay / Complete the listing / Continue to payment / Read the preview / Complete the listing.
- Reader dialog at all five widths: `aria-modal="true"`, labelled, covering the frame, **12 real Tab presses with 0 escapes and 0 unringed stops**, and a real Escape that closed it, cleared every `inert` and returned focus to the exact "Read the full screenplay" control that opened it. It is opened by focusing the control and THEN clicking, because a bare programmatic `.click()` never focuses and leaves focus restoration with nothing to restore — the probe error D27 filed. The app frame measured **520 px at 768** and the viewport width below it.
- **The sweep's first run was wrong, and running it down changed the sweep.** It reported 30/30 clean while `h1` was **0** on nineteen of them: Vite had not finished compiling the lazy chunk, so it was measuring an empty frame — which is indistinguishable from success. It now waits for the five sections and treats their absence as a hard failure. A second artifact, two `material-symbols` spans "overflowing" at 320 px, was the un-ligatured icon text on a cold font cache, because the first `fonts.ready` await resolved before the chunk had mounted any icons; awaiting again after the screen exists cleared it. The ledger records that exact artifact once already.
- **One dialog reading was run down rather than filed.** The probe reported "not all shell regions inert". It was matching the shell CONTAINER — which holds the dialog and must stay live — and `.ckm-page-header`, which sits inside the genuinely inert `.ckm-shell__app-bar` and inherits it. `reachable: 0` on both is the measurement that settles it.

**Known limits, named rather than implied:** no production database, physical device or screen reader was used. The reader was measured with `ScreenplayPdfViewer`/`ScreenplayReadOnly` stubbed in the unit suite and mounted for real in the browser sweep, but no real stored PDF was fetched — `pdf.js` at 320 px still needs a real device, as the Phase 3 debts already record. The D29 write half is deferred and its states are rendered as text, which is a smaller claim than "project detail is done". DEF-27 is live and unfixed.

**One question for the user, and it is the only thing blocked.** DEF-27 cannot be closed without deciding what a preview-entitled viewer receives from `GET /scripts/:id/pdf`. The three options, with their consequences:
1. **Slice the real PDF server-side** to the writer's preview window. Highest fidelity — the buyer sees the writer's actual typesetting — but needs a new dependency (`pdf-lib`; the server has `pdfkit` and `pdf-parse`, neither of which extracts pages), and the client's `startPage`/`endPage` become wrong because the served document is no longer the whole one.
2. **Generate a preview PDF** from `scriptPreviewPageTexts` with the existing screenplay generator. No new dependency and it stays a PDF, but the preview becomes Ckript-typeset rather than the writer's own file.
3. **Send preview viewers to the structured-text fallback** the viewer already supports. Smallest change by far — the plumbing exists — but an uploaded-PDF project's preview loses PDF fidelity entirely.
Doing nothing leaves the full screenplay of every published, unsold project fetchable by any authenticated viewer who clears the marketplace gate.

**Exact next action:** D29 — the write half of project detail, in `mobile/screens/projects/project-detail/`: purchase request create/approve/reject, reviews and producer rating, the contact/message/meeting reveal actions over the quota states this slice already renders, and owner edit/delete with destructive confirmation. Consume `ScriptDetail.jsx`'s existing handlers by extracting them into `useProjectDetail` as each one lands, the same way the load and the bookmark were extracted here; do not fork them. Settle every sweep past 1500 ms, wait for the screen's own markup before measuring, and await `document.fonts.ready` AFTER it has mounted.

#### 2026-08-14 — Claude — Native Featured, and five defects the port found in shared code (COMPLETE)

**Requested continuation:** "continue in native app implementation".

**Starting checkpoint:** D26 native Top Scripts was complete but uncommitted in the working tree; the mobile suite stood at 818 tests in 54 files and the server suite at 353. D27 called for reusing the shared discovery card/facet components, adding backward-compatible paging to Featured's two sources, and promoting `/featured`.

**Research and direction changes (D27)**
- Re-read the four-file, 4,083-line `features/featured-broadsheet/` family, `getScripts`, `getFeaturedScripts`, `topListQuery.js`, `industryAccess.js` and commit `edf3743`. The broadsheet's derivations (`featuredBroadsheet.js`, 452 lines with 281 lines of tests) are already platform-neutral, so they are IMPORTED by the native screen rather than ported — spotlight windows, mandate fit and "why this leads" have one definition, which is the one thing a page selling paid placement must not get wrong twice.
- **The restriction modal is dead code and is not ported**, confirming D26's correction rather than re-deciding it: `isIndustryProfessionalWithPersonalEmail` returns a hardcoded `false`, so `isBlocked` is always false and the entire `fbp-restrict` dialog is unreachable.
- **The facets go single-value, and this reversed the shape of the port.** `DiscoveryFiltersDialog` is single-select, and desktop's own `buildQueryParams` only sends a facet `if (f.genres.length === 1)` — choosing two genres sends the server neither, then narrows client-side over an unbounded fetch. Under real server paging that silently drops results, so the multi-select drawer could not survive the port honestly.

**Three live defects, all found by porting rather than by using, all fixed on both platforms**
- **DEF-20 — a facet that never matched anything.** `Script.budget`'s enum is `["micro","low","medium","high","blockbuster"]`, but `pages/TopList.jsx` has offered `mid` since it shipped, and D26's `topScriptsModel.js` copied it. "Mid (₹1Cr–₹10Cr)" returned zero projects under every ranking, on both platforms. `/search` and `/featured` always used `medium`, so the three discovery pages disagreed with each other about their own vocabulary. Fixed in the desktop page, its `budgetLabel` map and the mobile model, and pinned by a regression test.
- **DEF-21 — list responses carried whole screenplays.** `getScripts` stripped `fullContent` by hand (its comment reads "Locked full content"), but `textContent`, `fountainContent`, `fileUrl` and `scriptPreviewPageTexts` carry the same body and the private asset URL, and all four were serialized to any authenticated caller. `getFeaturedScripts` hydrated full documents with no projection at all. Both now exclude them, on the legacy path as well as the paged one, because the leak was never specific to paging.
- **DEF-22 — `limit` was accepted and ignored.** `getScripts` never read the parameter; `Script.find(query).sort()` returned the entire published collection. `FeaturedSection.jsx` asks for `limit=8` and `FunctionalTestChecklist.jsx` for 1/5/10/20/50, and all of them received everything. Desktop `/featured` then sliced that at 8 per page in the browser.

**Implemented**
- `server/utils/scriptListPaging.js`: typed and bounded page/limit, an opt-in envelope keyed on the presence of `page` (the same mechanism `parseTopListQuery` established, so every existing caller keeps its bare array byte for byte), one named body-field exclusion list in both `$project` and object form, and facet unpacking with an authoritative total. `getScripts` uses `$facet` on its aggregation branch and `countDocuments` + `skip/limit` on its `find` branch; the `find` branch deliberately fetches whole documents and strips after `toObject()`, because the `sid` backfill below it calls `doc.save()` and saving a document with unselected paths is how a partial write happens.
- `mobile/screens/discovery/featuredModel.js`: the URL contract (six server-implemented sorts, four facets), the two bounded request builders, page normalization/append with id dedupe, and the ranked metric stated in words. The editorial set is deliberately NOT narrowed by the viewer's facets — shelf 01 answers "who is paying for placement right now", which a genre filter does not change.
- `FeaturedProjectsMobile.jsx` + CSS: `standard` shell, one `h1`, the at-a-glance strip as a real definition list, URL-owned sort and facets, removable chips, the lead with its reason, spotlight/ranked/mandate sections, explicit server-backed Load more, and states for loading, nothing-at-all, filtered-to-nothing, ONE source failing (degrades that section only) and BOTH failing.
- `FeaturedLeadCard.jsx` and `FeaturedTrailerDialog.jsx` with their own registered prefixes. The lead's rotator is prev/next plus a stated "Lead 3 of 5" in a live region rather than desktop's dots — five 8 px dots are five sub-44 px targets in a row, and the sentence says the same thing to a screen reader.
- **The trailer contract was extracted, not copied:** `features/featured-broadsheet/featuredTrailer.js` now owns source preference/fallback, the narration lines, and the speech-cancel-on-unmount rule, and BOTH platforms read it — the desktop `TrailerModal` is 30 lines lighter. The build emits it as a shared chunk, which is the visible proof.
- The table view is dropped (an eight-column table is a desktop affordance; the cards carry every column but rank) and `autoPlay` is not carried over.

**Two probe errors, both run down rather than filed, and both changed the probe**
- Seven `A.ckm-card__link` "targets" at 211×33 px were the probe measuring an `inset: 0` pseudo against the element that DECLARES it instead of against its containing block. `.ckm-card__link::after` is the overlay that makes the whole card tappable, so the real target is the 211×244 card. Corrected, then zero.
- "Escape did not return focus to Filters" was the probe opening the dialog with a bare programmatic `.click()`, which never focuses the control — so `previouslyFocused` was `<body>` and `useFocusTrap` correctly used its scroll-surface fallback. Focusing first, as a real tap or Enter does, returned focus to Filters at all five widths.

**Verification**
- Focused client matrix and full mobile suite: **851 tests in 56 files, all passing**, against the 818/54 baseline measured before any edit (19 model, 13 screen, plus the DEF-20 regression). Server suite **360/360**, up from 353, with 7 new paging/privacy tests. Client and server touched-source ESLint clean; `TopList.jsx`'s 6 pre-existing problems confirmed unchanged by linting the stashed `HEAD` copy.
- Production build: 53 public SEO routes prerendered and verified, with separate `FeaturedProjectsMobile` and shared `featuredTrailer` chunks. Existing >500 kB warnings unchanged in category.
- Real Chrome/CDP at **320×720, 360×800, 390×844, 430×932, 768×1024** against the live dev server, 96–99 text nodes and 33–35 controls measured per width: **0 undersized targets, 0 unnamed controls, 0 text below 11 px, 0 contrast failures, 0 genuine overflow, 0 nested interactive controls**, and no page-level horizontal scroll. All four sections, six cards and the lead's reason sentence were confirmed rendered at every width, and the 768 frame stayed 520 px.
- Filter Dialog at every width: 5 selects, 8 controls, 0 undersized, labelled with `aria-modal="true"`, all three shell regions inert, **12 real Tab presses with 0 escapes** and a visible ring, and a real Escape that closed it and returned focus to Filters.
- DEF-23 after the gate, re-measured in a real browser with a 2.6 s settle: the Top Scripts sweep that had reproduced all three findings at all five widths now reports **0 global-chrome findings at all five widths**. A separate route probe confirms the notice still appears on `/messages` and `/pricing` (genuine fallbacks) and on `/featured` for a SIGNED-OUT visitor — who does get the desktop page there — and is gone on `/__mobile-featured`. Its close control measures 47x47 px with an accessible name. 7 new tests pin the gate, including the harness case and both floor fixes.
- Client totals after the DEF-23 work: mobile + notice **863 in 57 files**; full client run **1,646/1,651**, one fewer failure than the pre-existing baseline because the full-suite-only finance timeout did not recur. The 4 `AppShell.render` failures were re-confirmed pre-existing by stashing every change and watching the identical four fail by name; `DesktopExperienceNotice.jsx`'s single `motion` lint error was confirmed identical on the stashed `HEAD` copy. Build re-run: 53 routes prerendered and verified.

**DEF-23 — a desktop-era modal was covering the whole native app, and it is now gated (decided by the user: "decide for me")**
- `DesktopExperienceNotice` is mounted globally at `App.jsx:703` and opens a `fixed inset-0 z-[9999]` scrim on a 1500 ms timer whenever the viewport is <=768 px, telling the user the full experience needs a laptop. It was reproduced on `/__mobile-featured` AND `/__mobile-top-scripts` at all five widths once the probe settled past its timer.
- **It is GATED, not deleted**, and the reason is that the two options are not equally reversible. On a route that is still a `DESKTOP_MIGRATION_FALLBACK` the message is simply TRUE — that page really is desktop markup on a phone — so deleting it would discard a correct warning from most of the product to fix a wrong one on three routes. The gate asks `resolveMobileExperience`, the SAME policy the router asks, so the notice disappears from a route on the day that route is promoted, with no second list to keep in sync, and it removes itself entirely when the migration finishes. Dev harnesses are also suppressed, because that is where the five-width sweeps run.
- Visibility is DERIVED (`isVisible && !nativeScreen`) rather than closed from an effect, so navigating from a fallback route to a native screen with the notice already open never paints it over the screen even once.
- Its own two floor breaches are fixed: the close control was an unnamed 38.25x38.25 px target and is now a named 44 px one, and the primary label went from **2.17:1 to 9.12:1**.
- **This also explains a gap in every earlier sweep in this ledger.** D25's and D26's probes measured inside the 1500 ms window before the timer fired and therefore reported zero. That is the "a sweep only measures what it rendered" lesson in a new form — a TIMING window rather than a fixture gap — and every future sweep must settle past 1500 ms.

**DEF-24 — found while fixing DEF-23, recorded and NOT fixed, because the safe fix is not a mobile session's to make**
- The reason that button measured 2.17:1 is that its `text-white` was **dead code**. `index.css:136` declares an unlayered `button, input, select, textarea { color: inherit }`; Tailwind v4 emits utilities inside `@layer utilities`, and unlayered author CSS beats any layer regardless of specificity. So every text-colour utility on a `<button>` in this codebase is silently discarded and the button renders the inherited body colour.
- Proven rather than argued: the button computed `rgb(11, 10, 6)` with `text-white` present, and setting the colour inline moved it to `rgb(255, 255, 255)` / 9.12:1. The 2.17:1 figure reproduces the original sweep reading exactly, which is what confirms the mechanism.
- Fixed only inside this component, inline and commented. The general fix changes the resolved colour of every button in the product at once and needs a desktop visual pass.

**Known limits:** No production database, physical device or screen reader was used. The aggregation boundary is covered by typed/paging/privacy unit tests and the full server suite, but no collection larger than one page was exercised against a real Mongo — staging should page a real featured list before release. The narrated-summary fallback was not heard: headless Chrome has no speech synthesis voices, so only its cancel-on-unmount wiring is covered. DEF-24's blast radius is stated as a mechanism, not as a count: a regex over single-line `className` strings found 7 buttons, but multi-line template literals are not countable that way and no visual pass was run.

**Exact next action:** Begin D28 on the three authenticated project-detail route forms, consuming the existing `scriptDetailModel.js` rather than forking endpoint logic. Settle every sweep past 1500 ms.

#### 2026-08-13 — Codex — Native Top Scripts and shared discovery contracts (COMPLETE)

**Requested continuation:** "continue in native app implementation".

**Starting checkpoint:** D25 native Search was complete. D26 called for extracting its project-card/facet contracts, adding backward-compatible page metadata to `GET /scripts/top-list`, and promoting `/top-script` with five ranking modes and four facets.

**Research and parity correction (D26)**
- Re-read `pages/TopList.jsx`, `getTopList`, `ProjectCard`, `industryAccess`, the current route policy, and D25's family inventory. Current React Native FlatList/accessibility and Android filter-chip guidance (sources 29–30) were re-opened on 2026-08-13; stable keys, bounded incremental results, explicit state text and a separate full-screen facet task remain the right model.
- Repository history changed one part of the direction: commit `edf3743` is explicitly **"Remove access restrictions for industry professionals with personal emails"** and makes `isIndustryProfessionalWithPersonalEmail` return false. The desktop Top page still contains an unreachable restriction modal, which D25 mistakenly inventoried as live. Native does not port that dead UI or revive the removed policy. A render test pins the correction with an industry viewer on a Gmail address.
- The controller already accepts five stable ranking keys (`platform`, `score`, `views`, `featured`, `trending`) even though today's desktop tab row exposes only three. Native surfaces the full server contract and states the active metric on every card; it does not invent a sixth ranking.

**Implemented**
- Extracted `DiscoveryProjectCard` and `DiscoveryFiltersDialog` with their own registered shared prefixes. Search now consumes them without changing its URL/data contract; Top uses the same bookmark, canonical destination, public-share, price, media, facet and accessibility behavior. Featured can reuse both next.
- Added `topListQuery.js`: typed/bounded five-mode input, 1–50 page size, opt-in paging envelope, facet unpacking and a tested privacy exclusion for the qualification User document, script bodies and private asset fields. The historical no-`page` caller still receives the same bare array; an explicit `page` receives `{ scripts, pagination: { page, limit, total, hasMore } }`.
- `getTopList` now keeps its writer-plan qualification and deterministic `_id` tie-breaks, but uses `$facet` for authoritative count/skip/limit when paging is requested. Both legacy and paged responses remove `creatorDoc`, all script bodies and private reader assets before serialization.
- Added `TopScriptsMobile.jsx`/CSS/model/tests: standard shell, one `h1`, URL-owned ranking plus four URL-owned facets, full-screen five-select filter Dialog, removable active chips, ranked shared cards with metric text, loading/empty/initial-error/append-error/end states and explicit server-backed Load more. `/top-script` is promoted for authenticated writer and industry audiences; other policy cases retain the desktop branch.
- Added deterministic `/__mobile-top-scripts`, route/policy/coverage/render registration, and the three CSS registry entries. Search's extracted presentation remains covered by its existing render suite.

**Verification**
- Focused final client matrix: **7 files / 65 tests** across Top model/render, Search render, route policy/render/coverage and CSS ownership. The first run found one assertion expecting the desktop word "Premium" while the shared facet correctly says "Paid only"; after correcting the assertion, Top's final model/render rerun was 8/8 and every other focused file had already passed.
- Server: full suite **353/353**, including the final top-list privacy assertion; touched server lint is clean. Client touched-source lint is clean. `git diff --check` is clean apart from the repository's LF→CRLF notices.
- Production build: **4,075 modules**, separate native Top chunk, and all **53** public SEO routes prerendered and verified. Existing admin circular-chunk and >500 kB warnings remain unchanged in category.
- Real Chrome/CDP at **320×720, 360×800, 390×844, 430×932 and 768×1024**: one main/one h1, two ranked fixture cards, 14-result paging truth, zero new undersized or unnamed controls, zero text below 11 px, zero measured contrast failures, and no page-level horizontal scroll. At 768 the app stayed in the centred 520 px frame. The active-chip row intentionally scrolls horizontally at 320 while document width remains exactly 320 px.
- At every width the filter Dialog had five selects and no sub-44 px control, made the app bar/main/bottom navigation inert, and restored focus to Filters on Escape. The shared icon buttons' 44 px pseudo hit regions were measured according to their existing component contract rather than misreported from the painted 36 px circle.
- Full client run: **1,600/1,606**. Four failures are the recorded stale `AppShell.render` expectations, one is the already-recorded WriterRoster gated-link expectation, and one is a full-suite-only 5 s finance timeout. No D26 file failed.

**Known limits:** No production database, physical phone or screen reader was used. The aggregation boundary is covered by typed/query/privacy tests and the full server suite; staging should exercise a collection beyond 50 matching projects before release. Featured, authenticated detail, public detail and payment remain deliberate migration fallbacks.

**Exact next action:** Begin D27 in `mobile/screens/discovery/`: re-audit Featured against commit `edf3743`, reuse the shared discovery card/facet components, add backward-compatible paging to its two sources, and build lead, spotlight, mandate-match, ranked, detail and trailer surfaces before promoting `/featured`.

#### 2026-08-13 — Codex — Phase 4 family gate and native Search (COMPLETE)

**Requested continuation:** "continue".

**Starting checkpoint:** D24 is complete and all code-backed Phase 3 bullets are closed. Phase 4 has no mobile screen. The ledger requires one research gate across `/search`, `/top-script`, `/featured`, all three authenticated project-detail route forms, `/share/project/:id`, and `/script/:id/pay` before choosing the first screen. Existing unrelated D23/design/sitemap changes remain in the working tree and are preserved.

**Repository and parity inventory (D25)**
- **Search:** `pages/Search.jsx` calls protected `GET /search`; its query/type are partly URL-derived, while five facets and sort are component-only. The server returns at most 30 users and 30 published projects with no total/page metadata, no stable ordering, and currently returns the matched Script document without a result-card projection. Project cards add canonical navigation, bookmark and public sharing. Required states: no query/suggestions, debounced loading, mixed people/projects, filters-only, no results, request failure, append failure, bookmark state and share outcomes.
- **Top:** `pages/TopList.jsx` calls `GET /scripts/top-list`, with five ranking modes, four facets, a 24-item default/50 maximum, business-email restriction on opening a project, and no paging metadata. It shares the same project destination/card/filter vocabulary as Search, so it follows the Search contract rather than inventing a second one.
- **Featured:** `FeaturedProjectsPage.jsx` combines `GET /scripts/featured` with a filtered `/scripts` list, then derives lead, spotlight, mandate-match and ranked shelves. It owns detail, trailer, restriction and filter overlays plus bookmark and copy-link actions. Mobile keeps those distinct tasks but reuses one result card and one public-share operation.
- **Authenticated detail:** `/script/:id`, `/script/:projectHeading/:writerUsername`, and `/:projectHeading/:writerUsername` all mount `ScriptDetail`. ID and `/script/...` are accepted aliases; after either load, `getScriptCanonicalPath` replaces them with the server's canonical root-level project/writer path. The shared controller owns loading/access restriction, collaboration socket refresh, time/read interactions, bookmark, preview/full-script access, ratings/reviews, purchase requests/approval/rejection, contact quotas, meeting/message actions, media, edit/delete, invoice/PDF actions and similar projects. `scriptDetailModel.js` already centralizes owner/collaborator/industry/reader capabilities and the journey; the mobile presentation must consume that controller/model, not fork endpoint logic.
- **Public share:** `/share/project/:id` is intentionally outside authenticated detail and calls public `GET /scripts/public/:id`. It exposes only a published, unsold, undeleted project whose creator is public/active, offers overview/classification/evaluation/roles/synopsis, trailer and collaboration/login/full-page paths, and preserves the share URL instead of canonicalizing it. Static `/share/project/:id` must continue to outrank the two-segment catch-all.
- **Payment:** `/script/:id/pay` reloads the personalized detail payload, requires an approved unreleased purchase request and the eligible industry role, computes the 5% buyer commission, displays rights plus up to four acknowledgements, creates the authoritative server order, opens Razorpay's external Checkout, verifies on Ckript's server, and then exposes invoice/accepted-terms downloads. Already-purchased, unapproved, free, blocked-SDK, dismissed, verification-after-charge and success are separate states. The later mobile port must reconcile server state after foreground/reload; it may not fulfil from the browser callback alone.

**Current native/platform research**
- Sources 28–33 were read and added to §17: Android/Apple search, React Native FlatList/accessibility, Android filter chips, React Router ranking, MDN Web Share, and Razorpay Checkout/signature verification.
- Decisions adopted: search is its own `standard` screen with a persistent labelled field; the type scope and every facet live in the URL so deep links/back restore the same question; long results use semantic lists plus explicit server-backed Load more and a polite count; the full facet picker is a full-screen Dialog; project Share always targets `/share/project/:id` via native share with clipboard fallback; Razorpay fulfilment remains server-authoritative and later needs foreground/reload reconciliation.
- Patterns rejected: client-side slicing of the first 30 results (a false page); infinite scroll (unreachable end and unstable return position); a short bottom sheet containing nineteen genres plus sort/type/budget/pricing; copying ScriptDetail's endpoints into a mobile screen; sharing the authenticated canonical detail URL; treating Razorpay's handler as proof that access was granted.

**Written wireframes before JSX**
- **Search:** standard app bar + bottom navigation; one `h1`; persistent search field; four-way scope; compact Sort/Filters row and removable active chips; full-screen filter Dialog; People semantic list; Projects card list with Save/Share; count status + explicit Load more; suggestion, loading, empty, initial-error and append-error states.
- **Top:** standard shell; title/ranking explanation; ranking scope; filter Dialog; ranked project cards with their metric stated in text; Load more; restriction Dialog before project navigation.
- **Featured:** standard shell; lead project; spotlight and mandate-match sections; ranked list; filter Dialog; project-detail sheet; trailer Dialog; native Share; restriction Dialog. Horizontal rails are optional enhancement, never the only path to an item.
- **Project detail (all three route forms):** detail app bar with canonical Back/Share; media/title/status; role-aware recommended action; Story, Read, Evidence, Deal and Contact sections; preview/full reader as full-screen task; trailer Dialog; Actions sheet; owner/collaborator destructive confirmation; permission and request/payment states remain visible in text.
- **Public share:** public shell; brand/back/login affordance; media/title/byline; overview-first disclosure for classification/evaluation/roles/synopsis; trailer; collaboration/login CTA; authenticated full-page handoff. No bookmark/purchase/contact data is invented on the public response.
- **Payment:** flow app bar; project + approved-request summary; price breakdown; rights/terms disclosure; acknowledgements; sticky total/Pay; gateway-preparing/external/dismissed/reconciling/verification-failed/success states; invoice and accepted-terms actions after authoritative success.

**Work item claimed:** Implement Search first, because its bounded paging, URL state, semantic result list, project card and share/bookmark behavior are direct dependencies of Top and Featured. Additive server metadata must preserve the desktop response arrays; mobile passes an explicit bounded page size. Promote `/search` only after the router, manifest, audience policy and state/action coverage are present. Keep the Phase 3 physical-device debts open rather than simulating them.

**Implementation boundary:** No Top/Featured/detail/payment JSX in this slice. Do not change canonical routes, purchase rules, role gates or public visibility. Do not commit or rewrite unrelated working-tree files.

**Implemented**
- `server/utils/searchQuery.js` now bounds and types the search contract, gives every script sort a stable id tie-break, and owns explicit safe projections. `server/routes/search.js` preserves its existing `users`/`scripts` arrays while adding per-facet totals/hasMore and page/limit metadata through `$facet`; result cards cannot receive script bodies, file URLs, user email or relationship arrays merely because a model gained a field.
- `mobile/screens/discovery/SearchMobile.jsx` is a `standard`-shell screen over the Phase 1 primitives: one labelled search field, four-way scope, full-screen native-select filter Dialog, removable active chips, semantic People rows, composed Project cards, bookmark/public-share actions, a polite result count and explicit server-backed Load more. Query, scope, all four facets and sort are URL-owned. Initial suggestion, loading, no-result, initial-error, append-error and completed-page states are all rendered.
- `/search` is promoted to `SCREEN` for authenticated writer and industry audiences in the manifest and router; every other audience/protection case retains the existing route. `shareProject` now defaults to the visibility-filtered public `/share/project/:id` route rather than an authenticated canonical detail path.
- Added a deterministic `__mobile-search` development harness with mixed people/projects, active filters and an incomplete page. Search's model, rendered screen, routing, CSS registry and public-sharing contracts all have focused tests.

**Browser finding and shared correction (DEF-19)**
- The first contrast probe found that `ListRow`'s overline/trailing slots and `Card`'s eyebrow use `--ckm-muted`, only about **3.56:1** on white despite carrying 11–12 px text. Those primitive states had not appeared in the earlier collection fixture. They now use `--ckm-text-3`; the row chevron moves from `--ckm-muted-3` to `--ckm-muted`, clearing the graphical-object 3:1 floor. The same five-width probe then measured 50 visible text nodes per width with zero failures and the chevron at 3.56:1.

**Verification**
- Focused D25 client matrix: **7 files / 62 tests**, all passing. It covers URL restoration/validation, pricing mapping, paging dedupe, page-2 append, initial/error states, canonical destinations, route policy/coverage, CSS ownership and native-share/clipboard outcomes.
- Full server suite: **349/349**. Six new search-contract tests pin query bounds, stable sorts, the privacy projection and facet metadata. Client and server touched-source ESLint is clean; `git diff --check` is clean apart from the repository's existing LF→CRLF notices.
- Production build: **4,067 modules**; the native Search chunk is separately emitted. SEO prerender and verification pass all **53** public routes. Existing admin circular-chunk and >500 kB warnings remain unchanged in category.
- Real Chrome/CDP at **320×720, 360×800, 390×844, 430×932 and 768×1024**, base results plus the filter Dialog: one main/one h1, `standard` shell, 2 people + 2 project cards, 14-result/Load-more truth, 2 active chips, zero undersized or unnamed controls, zero text below 11 px, zero text-contrast failures after DEF-19, zero genuine overflow, zero nested interactive controls and zero orphan list items. The 768 px frame stays 520 px. Every Dialog width had five native selects and eight named ≥44 px controls, made app bar/scroll/bottom navigation inert, and restored focus to Filters on Escape. Twelve real Tab presses wrapped inside the Dialog with zero escapes and zero unringed stops.
- Full client run: **1,582/1,593**. The five non-timeout assertion failures are the recorded baseline (four stale `AppShell.render` expectations and the unrelated WriterRoster gated-link expectation). Six additional failures are full-suite-only 5 s concurrency timeouts in WriterRoster/admin/finance/Upload; no D25 file failed, and the complete focused D25 matrix above is green.

**Known limits:** No production database or physical device was used. The server aggregation is covered at its request/projection/facet boundary and by the full server suite; staging should exercise a large mixed result set before release. The family is not complete: Top, Featured, all authenticated detail forms, public share detail and payment remain deliberate migration fallbacks.

**Exact next action:** Begin D26 by extracting the D25 discovery project card and filter Dialog for Top to reuse; add backward-compatible page/limit/totals metadata to `/scripts/top-list`; then implement its five ranking modes, four facets and personal-email restriction Dialog in `TopScriptsMobile.jsx` before promoting `/top-script`.

#### 2026-08-13 — Codex — Server-backed resumable trailer and pitch upload (COMPLETE)

**Requested continuation:** "continue in native app implementation".

**Starting checkpoint:** D23 is complete in the working tree. The exact ledger action is D21's missing server gate: current trailer/pitch endpoints accept a complete `multer.memoryStorage()` buffer (up to 250 MiB) and every client retry resends from byte zero. The contract must exist before either native UI may say Resume.

**Research and decision gate (D24)**
- Current Cloudinary documentation and its official React sample confirm manual ranged uploads: one stable `X-Unique-Upload-Id`, exact `Content-Range`, non-final chunks larger than 5 MB, intermediate `done:false`, and one final `done:true` asset. Signed secrets remain server-only. Sources 26–27 in §17.
- Ckript uses 6 MiB parts. This bounds Node memory to one verified part instead of one 250 MiB file while keeping script ownership, writer-plan access, accepted ranges and completion authoritative on Ckript's server. Direct unsigned browser upload was rejected because it would weaken those gates and make server status depend on a client claiming that Cloudinary accepted a part.
- Failure and Cancel are now intentionally different. A network failure keeps the 24-hour session and Continue starts at the last server-confirmed range. Explicit Cancel calls abort, cleans a finalized-but-unattached asset, and a later retry starts at zero. UI progress rolls back to confirmed bytes after a failed in-flight part rather than preserving unacknowledged transmitted bytes.

**Implemented**
- Added `MediaUploadSession`: script/user/kind/file fingerprint, stable Cloudinary upload id, 6 MiB part policy, accepted ranges + SHA-256, asset result, status and expiry. Session creation is authenticated and idempotently restores the same selected file while its session is usable.
- Added `mediaUploadController`: create, status, checksummed part PUT, complete and abort endpoints. Parts must match the exact expected range, arrive sequentially and match their digest; repeating the same accepted part returns success without a second upstream write, while different bytes for the same index return 409. Final completion attaches the asset to the script and is idempotent. Scheduled and lazy cleanup retry upstream deletion before marking a ready session expired.
- Added a bounded `uploadChunkToCloudinary` helper using the SDK's signed stream request with manual range/upload-id headers. The legacy whole-file video endpoints remain for older clients, but both current creation flows now use the new contract. `scriptMedia.js` makes legacy and resumable completion share one trailer/AI-queue/pitch attachment rule.
- `projectMediaUpload.js` now slices and SHA-256 hashes trailer/pitch files, restores authoritative status, begins at `nextPart`, reports aggregate progress, rolls failed UI back to confirmed percent, completes the server session, and aborts without reusing the already-aborted signal. Thumbnail stays on its bounded 5 MiB endpoint. `MediaProgress` says **Resuming N%** once confirmed prior chunks exist; native notices/buttons distinguish Continue from cancelled-from-zero Retry.
- CORS explicitly permits `Content-Range` and `X-Chunk-SHA256`; the part route accepts only `application/octet-stream` and refuses bodies above 6 MiB before the controller.

**Verification**
- New server controller contract: 8/8 tests. Full server suite: **343/343**.
- Shared uploader/media/native integration: 16 files / **265/265**. D23 competition/navigation regression: 8 files / **266/266**. The updated native ScriptUpload cancellation integration crosses session creation → part PUT → abort DELETE.
- ESLint clean on all touched server and client source/test files. `git diff --check` clean.
- Production build: **4,063 modules**, all **53** SEO routes prerendered and verified; only the existing admin circular-chunk and >500 kB warnings.
- Full client run: **1,570/1,575**. Four failures are the already-recorded stale `AppShell.render.test.jsx` contract; the fifth is an unrelated WriterRoster gate expectation and reproduces in that file alone. Every touched file's focused suite is green.
- Not claimed: a paid real-Cloudinary interruption/expiry run or a physical-device pass. The staging operation is in `open_follow_ups`; the editor keyboard/screen-reader debts remain unchanged.

**Exact next action:** Begin Phase 4's research gate across search/top/featured, all canonical project-detail forms, public share, and payment before choosing the first discovery/detail screen.

#### 2026-08-13 — Codex — Native competition submission and writer Projects tab (COMPLETE)

**Requested continuation:** "continue in native app implementation"; user approved both recorded recommendations: port native `?ctx=competition`, and restore Projects in the writer compact bottom bar.

**Starting checkpoint:** D22 is committed at `05d4135`, draft PR #561 is green and mergeable, and the unrelated sitemap/design files remain untouched. Competition editor state, autosave, authoritative `useCompetition({ id })`, pitch fields, and final submission endpoint already exist in shared/desktop code, but the mobile route policy deliberately falls back to desktop for `?ctx=competition`. Separately, `writerNav.mobileKeys` names Create even though the approved compact contract and existing tests require Projects; simply restoring Projects to `rail` would undo a deliberate desktop decision.

**Work item claimed (D23):** Build native competition chrome over the existing shared create orchestrator: authoritative competition/deadline state, optional logline/synopsis, final-save-before-submit, both irreversible acknowledgements, error/success states, and read-only lock after success. Then remove the query exclusion. For navigation, give `buildNav` an explicit mobile-only destination source so Projects returns to the compact bar without returning to the desktop rail; Create remains in rail/drawer.

**Implementation boundary:** No new competition API and no forked editor. Reuse the existing `useCompetition` state and submission endpoint/service semantics. Do not change the server's deadline authority or the desktop rail. Verify the one-way submission path, route policy, active query tab, four-slot ordering, and five target widths before closing the entry.

**Implemented**
- `components/competition/competitionSubmission.js` is the one desktop/mobile operation and lifecycle model: it flushes current keystrokes before POST, refuses an explicit failed save, sends both server confirmations, preserves server rejection copy, and recognises all submitted lifecycle statuses. Desktop `SubmitEntryModal` and `CompetitionBar` now use it too.
- `mobile/screens/create/CompetitionEditorPanel.jsx` supplies separate native presentation: a pinned competition/deadline/count strip, optional pitch Dialog over the existing `formData`, a final confirmation Dialog, durable error, success timeline/return, and immediate read-only lock. `CreateProjectChrome` keeps competition entries in the editor even if an old restored `step` drifted beyond 1.
- The orchestrator waits for the loaded script's exact competition id before enabling `useCompetition`, then exposes its load/error state. The manifest's two competition exclusions are removed, and both route forms now resolve to the mobile screen.
- `buildNav` accepts explicit preset `mobileItems`; writer Projects is compact-only at `/dashboard?tab=projects`. Create remains in the desktop rail and drawer. The harness now fixtures writing and submitted competition states.

**Verification**
- Broad focused matrix: 20 files / 464 tests passed across competition, create-project, route policy/coverage and all native navigation contracts. Post-browser-fix affected matrix: 8 files / 293 tests passed.
- Touched-source lint passed. The wider targeted command reports only `CreateProject/index.jsx`'s four pre-existing findings: unused `motion`, one empty block, and two hook-dependency warnings.
- `npx vite build`: 4,063 modules transformed; production bundle passed. Existing admin circular-chunk and >500 kB chunk warnings remain.
- Chromium five-width matrix (320/360/390/430/768), three states each (editor strip, pitch Dialog, submit Dialog): zero targets below 44px, unnamed controls, text below 11px, or horizontal document/root/dialog overflow. At 768 the app and dialogs stayed in the centred 520px frame. The 320px submit footer measured 284×44 for both actions and ended inside the frame.
- The browser sweep found a stacking defect the DOM suite could not: mounting dialog state inside the app-bar slot let the bottom dock paint above the dialog footer. The state hook now returns panel and overlay layers separately; the panel remains in the app bar while both Dialogs mount in `MobileShell.overlays`. Re-measured full-frame at 320px.
- One combined run including the legacy `AppShell.render.test.jsx` remained 294/298. Its four failures are pre-existing/stale AppShell expectations (old mobile bar and Upload in writer rail), not native `NavBar`; the native nav suites are green.

**Remaining limits:** No real device or screen reader was used; the existing editor keyboard/screen-reader debt remains. D21's resumable upload is still a server contract, not a client percentage trick.

**Exact next action:** Run the D21 server-contract research gate against the current Cloudinary and script-authorization paths, then pin authenticated session/part/status/complete/abort behavior in controller tests before modifying the mobile uploaders.

#### 2026-08-13 — Codex — Media cancellation and large-file preflight (COMPLETE)

**Requested continuation:** "continue in native app implementation".

**Starting checkpoint:** D21 is committed at `02c30fd`. Both creation entry points share byte progress and honest whole-file retry, but the uploader accepts no signal, every rejection is classified as `failed`, and neither native media panel warns before a large transfer or offers Cancel. The unrelated sitemap/design files remain untouched.

**Work item claimed:** Complete the dependency-safe client half of Phase 3 bullet 6: shared AbortController cancellation, a cancelled state distinct from genuine failure, and a deterministic size-based preflight in `/create-project` and `/upload`. Do not implement or label client-only resume.

**Research and decision gate (D22)**
- Current Axios cancellation guidance says to pass `AbortController.signal`; a single controller may cancel several requests. MDN confirms an AbortSignal is one-use and aborted work rejects, so each upload attempt gets a fresh controller rather than reusing one. Sources: <https://axios-http.com/docs/cancellation>, <https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal>.
- MDN still marks `NetworkInformation` as limited availability, so the preflight must not depend on `navigator.connection`, `effectiveType`, or `saveData`: <https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation>.
- Product threshold: warn when any selected trailer or pitch video is at least 25 MiB. This is an explicit, deterministic Ckript policy—not a claim about the connection. Covers are excluded because their enforced ceiling is 5 MB. The warning lists exact files and total bytes.
- Cancellation applies to the current concurrent media batch. Files already completed stay complete; unsettled requests become `cancelled`, never `failed`. Retry remains a whole-file retry from 0% under D21.

**Wireframe**
```text
Native Visual assets panel, before transfer
  warning: "Large media upload" + filenames/sizes + total
  footer primary: "Start uploads"; Back remains available

Native Visual assets panel, transfer active
  info: project saved + keep Ckript open
  action: "Cancel uploads"
  each slot: determinate byte progress

After user cancellation
  warning: upload cancelled; project remains saved
  affected slots: "Upload cancelled" (not "Upload failed")
  footer primary: retry cancelled uploads; every retry begins at 0%
```

**Implemented**
- `projectMediaUpload.js` now owns the single policy: a 25 MiB trailer/pitch preflight derived only from `File.size`, recovery-type unioning, cancellation detection, and `{ failedTypes, cancelledTypes }` results. Every axios media request receives the current attempt's `signal`; one batch controller may cancel all unsettled requests while fulfilled files remain complete.
- Both `/create-project` and `/upload` run preflight before creating/updating the base record, remember acknowledgement only for the exact selected-file signature, create a fresh controller for every initial/retry attempt, abort on unmount, retain the saved script id after interruption, and never turn a cancel-only result into a red server error.
- Both native Visual assets panels list exact large files plus total bytes, expose **Start uploads**, expose **Cancel uploads** while active, disable replace/remove/choose mutation during the batch, render **Upload cancelled** separately from failure, and say plainly that retry begins at 0% rather than resuming.
- The upload footer recovery branch now precedes its ordinary non-final-step branch. This fixes the existing step-2 recovery regression where returning to Visual assets silently changed **Retry the media upload** into **Next**; the actual step-2/detail-5 position is pinned by test.
- Deterministic harness states were added for both flows: `media-preflight`, active upload, and `media-cancelled`.

**Verification**
- Focused media/helper/chrome/render/panel batch: 8 files / 221 tests passed. Create/upload orchestrator regression: 3 files / 13 tests passed. The updated native success-flow integration was rerun independently after its inert media/fetch fixture fix: 2/2 passed with a clean teardown.
- ESLint is clean across every touched JS/JSX file except `pages/CreateProject/index.jsx`; that file reports the exact known baseline of four findings (unused `motion`, two hook-dependency warnings, one empty block), with no new finding from D22. `git diff --check` passes.
- `vite build` passed with 4,061 modules; SEO prerender and verification passed all 53 public routes. Existing admin circular-chunk and large-chunk warnings remain unchanged in category.
- Real Edge/Chromium CDP sweep: create + upload × preflight + uploading + cancelled × 320/360/390/430/768 = 30/30 passing. No horizontal page/surface overflow, missing state copy, unnamed new action, or new action below 44×44.
- The pre-existing modified sitemap and six untracked design/spec files were not edited.

**Exact next action:** Ask for the two product decisions required to close Phase 3: whether `?ctx=competition` should receive a native competition submit flow, and whether the writer bottom bar restores **Projects** or formally keeps **Create**. Treat D21's server-backed resumable upload as a separate backend/API slice; do not label the completed client retry as resume.

#### 2026-08-12 — Codex — Create-project media upload progress (COMPLETE)

**Requested continuation:** "continue" after the native-app implementation handoff.

**Starting checkpoint:** Phase 3 bullet 4 is closed. The exact recorded next action is the remaining half of bullet 6: `/upload` already renders real axios byte progress, while `/create-project` sends the same cover, trailer and pitch-video requests through a second orchestration path with no progress state. The shared `MediaSlot` already owns the presentation contract. Existing editor/report work and unrelated design/SEO changes remain untouched.

**Work item claimed:** Add real per-file progress to the create-project media uploader, expose that state to the native media panel, pin start/update/success/failure/retry reset behavior with focused tests, and re-run the media panel at 320, 360, 390, 430 and 768 px. Record the server contract required for resumable trailer uploads without claiming client-only resume.

**Finding that changed the implementation (D21)**
- Passing `mediaProgress` to `MediaSlot` was not enough: Submit starts on step 5 while the three slots exist on the step-2 Media panel, which is unmounted. A progress bar hidden in React state is not progress UX. After the project record succeeds, the orchestrator now returns to Visual assets, locks navigation during transfer and states that the project is already saved.
- The old failure path threw after `POST /scripts/upload` but did not retain the returned id. Pressing Publish again could post the entire project a second time. Recovery now stores the target script id and failed media types; the retry branch runs before validation/base submission and calls only those media endpoints.

**Changes made**
- Added `pages/CreateProject/lib/projectMediaUpload.js` and six tests. It is now the one multipart/axios `onUploadProgress` implementation for both `CreateProject` and `ScriptUpload`; unknown totals do not produce invented percentages, failures are per-file, and every requested retry begins at 0%.
- Added `mediaProgress`, `mediaUploadActive` and `pendingMediaRecovery` to the create-project orchestrator. Replacing/removing a local file clears its stale progress. A partial failure returns to Media with explicit saved-project copy; retry sends only failed types, and removing a failed optional file completes recovery without a request.
- Wired all three create-project `MediaSlot`s to their matching progress state. `Wizard` and `wizardChrome` now distinguish **Uploading media…** from **Retry the media upload**, hold navigation during the former, and do not ask the writer to re-enter the form during the latter.
- Added attached/uploading/failed fixtures to `CreateHarness` and native panel/footer/notice tests. No new CSS or prefix was needed; this uses the existing `ckm-media`, `ckm-create-project` and shared feedback families.

**Verification**
- Focused shared uploader/native seam: **6 files / 153 tests passed**. Broader create + upload + shared-media + working-draft/loader/success regression: **26 files / 457 tests passed**.
- Full client run completed at **1,520/1,542 tests passing (101/111 files)**. It is not a green baseline: 22 failures across 10 files include the already-recorded writer-navigation/AppShell/roster expectation drift plus several 5-second full-suite concurrency timeouts (including one `Wizard` render and one upload-panel render). Both touched timeout suites pass in the focused and 457-test regression runs above; no full-suite failure exposed a media-uploader assertion failure.
- Touched-file ESLint is clean. `pages/CreateProject/index.jsx` still reports exactly the same four baseline findings as `HEAD` (two errors/two warnings, line numbers shifted only); no new finding was introduced. `git diff --check` passes.
- Production build: **4,061 modules**, all **53** SEO routes prerendered and verified; only the existing admin circular-chunk and large-chunk warnings.
- Real Edge/Chromium CDP at **320×720, 360×800, 390×844, 430×932 and 768×1024**, across attached, uploading and failed/retry: **15 rendered measurements**, each with three media cards (the one cold first pass was rejected and rerun), zero genuine targets under 44×44 (the sentence-inline Plans link uses the already-recorded WCAG exception), zero unnamed controls, zero text below 11 px, zero text-contrast failures, zero genuine overflow and no horizontal page scroll. The app frame is 320→520 px; uploading shows `Uploaded` + `Uploading 41%`, failure shows `Upload failed`, and the footer names the correct action in each state.
- Real Tab events over the 320 px failed state traversed all **15 app controls** with zero unnamed or unringed app stops. The subsequent body/Google-Translate stop was excluded from the app result rather than misreported as a product control. No physical-device, background-tab or real network-drop pass was performed.

**Server contract / honest limitation**
- Current trailer and pitch endpoints use `multer.memoryStorage()` and send one complete `req.file.buffer` to Cloudinary. The required resumable session/part/status/complete/abort/expiry contract is recorded in D21. This client therefore says Retry and resets to 0%; it never claims Resume.
- Phase 3 bullet 6 remains `[~]`: D9's explicit cancel action and deterministic large-file preflight warning are still absent and are the next dependency-safe client slice.

**Exact next action**
- Add AbortController cancellation plus a size-based large-file warning to `projectMediaUpload.js`, expose cancel as distinct from failure in both native media panels, and rerun the same focused tests and five-width state sweep. Do not implement client-only resume. After that, Phase 3 still needs product direction on `?ctx=competition` and the writer bottom-bar regression.

#### 2026-08-12 — Codex — Reports, the last Phase 3 bullet 4 surface (COMPLETE)

**Requested continuation:** "continue in native app implementation".

**Starting checkpoint:** The 2026-08-11 version-history entry is present and its focused mobile create suite passes (11 files / 234 tests). Reports is the exact `next_action` and the only unported surface still named by Phase 3 bullet 4. Existing unrelated design/SEO changes remain untouched.

**Work item claimed:** Port the screenplay scene/character reports into the mobile editor, share the report/download logic with desktop, and verify the complete surface before closing bullet 4.

**Research and desktop parity inventory**
- Desktop source: `components/screenplay/ReportsPanel.jsx` in `ScreenplayFocusMode`'s right rail. It derives scenes and characters through the shared `screenplayReports.js`, sorts each report, jumps from a scene row to its script line, and exports the active report as PDF or CSV.
- Current guidance checked: W3C's APG Tabs pattern (one tab stop, arrow-key movement, labelled tab panels); W3C's Tables tutorial (real tabular data needs programmatic row/column relationships and small-screen tables are inflexible); MDN's `HTMLAnchorElement.download` guidance (the filename is a hint and cannot prove a download completed).
- Mobile hazards found: the desktop rail uses 9–10 px labels, controls below the 44 px product target, a list scroller nested inside the rail, and a popover export menu. Reusing that JSX would preserve the data but violate the mobile presentation and interaction contract.

**Wireframe/design decision (D20)**
- Shell: existing immersive editor; Reports opens from its overflow as a full-screen `Dialog`, because studying/sorting/exporting a report replaces writing for its duration (D15), and the report can be dozens of rows.
- Dialog: title `Reports`; Scenes / Characters through the shared APG `Tabs`; one labelled native sort control; direct 44 px PDF and CSV actions (no modal menu over a modal); then one scroll body.
- Scene view: semantic list of tappable scene summaries; choosing one closes the dialog and then moves the shared editor to that line. Character view: semantic list of read-only summaries. Each metric keeps its visible label, so the card transformation does not erase the column relationships a wide table would have supplied.
- States: explicit empty copy for no scenes and no speaking characters. Reports remain available to view-only collaborators and absent in prose mode, where screenplay scenes/characters do not exist.
- Back/focus/safe area: `Dialog` owns Escape, focus trap/restoration, keyboard inset and safe-area behavior. No report state is stored outside the dialog; it is derived from the current screenplay whenever opened.
- Shared boundary: `screenplayReports.js` remains the one parser; export serialization/download helpers move out of the desktop component into a shared module used by both presentations. No desktop layout JSX or CSS is imported by mobile.

**Changes made**
- Added `screenplayReportExport.js` (+ tests), the one shared CSV/PDF column and download implementation now used by the existing desktop `ReportsPanel` and mobile.
- Added `reportsModel.js` (+ tests) and `overlays/ReportsDialog.jsx`; wired Reports into `editorChrome.js` and `Editor.jsx`; added the report card/dialog CSS and seven editor seam tests.
- Added deterministic `reports-empty` and `reports-long` (60 scenes) states to `CreateHarness`. No new CSS prefix: the surface belongs to the existing `ckm-editor` family.

**Verification**
- Focused report/editor matrix: **3 files / 94 tests passed**. Create + mobile CSS contract matrix: **13 files / 251 tests passed**. Touched-file ESLint clean; `git diff --check` clean.
- Full client suite: **1,514/1,528 passed**. All 14 failures are outside this slice: the documented 13-test navigation/AppShell/WriterRoster baseline plus the known `financeSession` concurrency timeout; `financeSession` passes **10/10** alone. Every new report test passed in the full run.
- Production build: **4,060 modules**, all **53** SEO routes prerendered and verified; only the existing admin circular-chunk and large-chunk warnings.
- Real Chrome/CDP at **320, 360, 390, 430 and 768 px**, Scenes and Characters at every width plus both empty states and a 60-scene stress report at 320/768: zero undersized targets, unnamed controls, horizontal overflow, text below 11 px or text-contrast failures. The long report has exactly one scrollable element — the dialog body. At 768 the dialog stays inside the 520 px app frame.
- Real keyboard events at 390 px over the 60-scene report: 24 Tab stops, all inside the dialog and all with a visible focus ring. No physical device or screen-reader pass was performed; those existing editor debts remain named.

**Decisions or deviations**
- D20: Reports is a Dialog because inspecting/sorting/exporting a long report replaces writing for its duration. A table was not squeezed into 320 px; each visual card repeats every metric label, preserving relationships without horizontal scroll. Direct PDF/CSV buttons avoid opening a second modal layer over the dialog.
- Report derivation runs only while the dialog is open, so normal typing does not repaginate and reclassify the whole script for an invisible surface.

**Open issues/blockers**
- No blocker in Reports. The full editor still owes the recorded physical-device keyboard/AT pass.
- Phase 3 remains open for bullet 6's create-project media progress and the resumable-upload server contract, plus product direction on `?ctx=competition` and the writer bottom-bar regression.

**Exact next action**
- In the create-project orchestrator, pass real `onUploadProgress` values into the shared `MediaSlot` state for thumbnail, trailer and pitch-video uploads; pin progress/reset/retry behavior in tests and rerun the media-panel width sweep. Then document (do not fake) the server-side resumable-upload contract.

#### 2026-08-11 — Claude — Version history, and a diff that was lying

**Requested continuation:** "continue".

**Starting checkpoint:** bullet 4's version history, after the previous entry's two open verifications were cleared.

**The gate barely had to run for the Sheet-vs-Dialog question (D19).** The desktop surface is already a full-screen modal — but a bare `fixed inset-0` div with no `role="dialog"`, no focus trap, no Escape and no labelled title, the same shape as the title-page modal the third session replaced. `ckm-dialog` supplies all four. Two things did change shape:
- **The diff is a second view.** Desktop expands it inside the list row in its own `max-h-64 overflow-auto` box — a scroller, inside a row, inside the modal's scroller, and on a phone the row would be mostly diff. So the list pushes to a diff view and the dialog's title changes with it. Because the rows no longer show diffs, each carries a one-line summary.
- **Restore asks, by explaining rather than warning.** It replaces the entire draft from a small button beside another small button. It *is* recoverable — the server writes today's text as a snapshot first — but desktop states that in an 11px line at the bottom of the modal, below the fold. The confirmation moves the fact to the moment it matters, because the safety net is what makes "yes" an easy, informed answer.

**DEF-18 — the diff itself was lying, and I first assumed my fixture was wrong.** A model test expected "1 line added" for a one-line append and got "2 lines added, 1 removed". `diff_linesToChars_` keys a line by its text *including its newline*, so a final line with no terminator is a different line from the same text with one: appending to a script reported the previous last line as removed and re-added, two visually identical rows. Live in the desktop modal since it shipped, and invisible there because desktop only renders the rows — it never states a count. The mobile row summarises in words, which is what made a wrong count impossible to miss. Both sides are now newline-terminated before diffing.

**Changes made**
- `useVersionHistory.js` — the three endpoints, `lineDiff`, `summariseDiff` and `timeAgo`, extracted so both platforms share one path. `VersionHistoryModal.jsx` reads it and is 90 lines lighter.
- `versionsModel.js` + `VersionsDialog.jsx` — rows, the one-line summary, `describeRestore` and `describeSaveVersion`.
- The overflow item's hint is **static**, deliberately: Comments can say "3 open notes" because the orchestrator already holds them, but the version list does not exist until something asks the server, and fetching it on every editor mount to populate a line of menu text is the duplicate, noncritical request §15 forbids. The count lives inside the dialog, where the data is.

**Verification**
- **Five-width sweep, 4 states (list, diff, confirm-restore, empty), 20 measurements: 0** across targets, text size, unnamed controls, contrast and overflow — after one real fix. The diff's added lines were `--ckm-green` at **4.12:1** on the diff's own ground: the **third** semantic token caught doing text duty this session, after `--ckm-muted` and `--ckm-gold`. The pattern is now explicit enough to state as a rule — *a token tuned for a fill or a graphic is not a text colour* — and the fix is a measured `--ckm-editor-add-text` at 5.55:1. `--ckm-red` was checked and left alone at 4.84:1.
- **Real keys:** 30 Tabs, **0** escapes / **0** unnamed / **0** unringed, names resolving through `<label for>`. Enter pushed to the diff view (17 lines); Enter on Restore produced the explanation and the button became "Yes, restore it"; Escape returned from the diff to the list. **That leg prompted a fix**: focus was landing nowhere useful on the way back, so leaving the diff now returns it to the exact row's "See what changed" — the same data-attribute restoration the corkboard uses, with a test.
- **22 new tests** (12 model, 10 screen); full suite **1494/1512** — the 13-test baseline plus 5, every one confirmed as the documented concurrency flakiness by re-running its file alone. Lint clean; build + **53-route prerender pass**.
- **Two of this slice's own red results were the instrument, not the surface** (making six and seven overall, both recorded in `open_follow_ups`): the sweep's intercept pattern `*versions*` also matched Vite's request for `versionsModel.js`, so the module graph was served a JSON array and the app never booted — 20 runs of "no overflow button"; and the focus probe read `aria-label` on a button whose name is its text, reporting "focus: null" where focus was exactly right.
- **Named as unmeasured:** no real device, no screen reader. And the diff fixture is ~17 lines — a 100-page version diff's render cost and scroll length are untested, which matters more here than on the other surfaces because `lineDiff` runs over the whole document for *every row's summary*.

**Exact next action**
- Reports — the last item in bullet 4.

#### 2026-08-11 — Claude — People, and three defects that porting found

**Requested continuation:** "continue".

**Starting checkpoint:** the previous entry's exact next action — People/presence, flagged as the first surface in this family whose actions are administrative rather than editorial.

**The gate's answer (D18).** By D15's test it replaces the writer's whole task, so it is a **Dialog**. A second, concrete reason decided the shape: desktop opens `InviteModal` *on top of* the collaborators panel, and a modal over a bottom sheet is two modal layers — refused once already (D17's inline delete confirmation). As a Dialog, the invite form is a section and there is one layer.

**The data layer was extracted, not copied.** `useCollaborators` came out of `CollaboratorsPanel` and both platforms use it, so there is one definition of the four endpoints and one answer to "is this person listed twice?" (§15 — reuse the service calls, not the DOM).

**Three live desktop defects, all found by porting rather than by using the feature**
- **DEF-14** — removing a collaborator was a *single click* that irreversibly revoked another person's access, on a control sitting beside a role dropdown. Both platforms now ask; mobile states the consequence ("…loses access to this script immediately. Getting it back needs a new invitation.") rather than leaving a red button to imply it.
- **DEF-15** — an invitation to an address with **no Ckript account** never appeared in Pending Invites. `collab.controller.js` stores `invitedEmail: invitedUser ? undefined : email`, and the shared dedupe required a `userId`, so it dropped exactly those rows: the owner could not see the invite, cancel it, or avoid duplicating it. Found because the fixture used a plain email and the row vanished — a test failure I first assumed was my fixture.
- **DEF-16** — the access-level `<select>` had exactly one option on every non-`full_admin` row: a control that cannot change anything, which §2.8 calls a placeholder dead end. It is worse than absent, because it says an access level is adjustable when it is not. Now offered only where it has two answers; every other row states its level as text.

**Verification**
- **Five-width sweep, 4 states, 20 measurements: 0** undersized targets, **0** text under 11px, **0** unnamed controls, **0** text-contrast failures, **0** overflow, no horizontal scroll. This surface *fetches*, so the collaborators endpoint is fulfilled per state through CDP `Fetch` — owner, guest, empty and confirm-remove are real surfaces, and the rendered facts prove each was entered (owner: 8 controls, 5 rows, 1 pending, invite form, 2 access selects — the second being DEF-16 working, since only the `full_admin` row gets one; guest: 1 control, no invite form, no removes; confirm-remove: the warning shown and one fewer Remove).
- **The sweep's finding was in a shared Phase 1 component, so fixing it fixes the whole app.** `EmptyState`'s body text was `--ckm-muted` at **3.56:1** and its compact variant `--ckm-muted-2` at ~2.9:1 — the **third** confirmed caller of the standing "`--ckm-muted` is not safe for text" follow-up, and the first found in a component every screen uses. Now `--ckm-text-3` at **5.44:1**, re-measured to zero.
- **22 new tests** (13 model, 9 screen); full suite **1473/1488** — the 13-test baseline plus the 2 known `financeSession` flakes. Lint clean; build + **53-route prerender pass**.
- **ONE VERIFICATION NOT COMPLETED, and named rather than implied: the People keyboard leg.** The probe fulfilled the collaborators fetch (confirmed by an intercept counter) and still rendered a dialog containing only its close button, while the sweep's 20 measurements and a direct diagnostic both rendered the full surface through the same stub. I could not reproduce the difference, so the leg is **unrun, not passed**. Nothing about the surface is known to be wrong — the focus trap did hold across 32 real Tabs — but "the keyboard walks this dialog correctly" has not been observed.
- **Also unmeasured:** no real device, no screen reader. And `EmptyState`'s icon measures **1.59:1** against its own tile. It is `aria-hidden`, so 1.4.11 exempts it and this is not a violation — but a glyph that faint is a design-intent question across every empty state in the app, and changing it unilaterally is not a mobile-session decision.

**Both open items were then cleared in the same session**
- **The People keyboard leg is RUN and passing, and the cause was the probe — a fifth time.** `peoplekeys.mjs` was the only one of the three scripts fulfilling the collaborators response *without* `Access-Control-Allow-Origin`; the API is on a different origin from the dev server, so the browser blocked the response it had just been handed, axios reported a network error, and the dialog correctly rendered its error state — which contains exactly one focusable, the close button. Diffing the three scripts' headers found it in a minute; guessing at the surface had not. With the header: **6 focusables, 32 real Tabs, 0 escapes / 0 unnamed / 0 unringed**, stops resolving through `<label for>` ("Their email", "What they can do", "Remove", "Cancel invite", "Close people"), and Enter on Remove producing the DEF-14 confirmation with the button changing to "Confirm remove". "Send invitation" is present but correctly absent from the tab order while disabled.
- **The keyboard-over-a-sheet-body risk is mitigated rather than merely recorded.** `CommentsSheet` now ends its body with a spacer exactly as tall as the keyboard is covering — the same `useKeyboardInset` measurement `Sheet` uses for its footer — so the browser can scroll any field in the body above the keyboard. Zero-height and unrendered when no keyboard is open. Two tests pin the height and the `aria-hidden`; a device is still the only thing that can confirm the *result*, and that is recorded as such.

**Exact next action**
- Version history and reports.

#### 2026-08-11 — Claude — Comments: the first mobile surface that writes

**Requested continuation:** "continue".

**Starting checkpoint:** the previous entry's exact next action, which flagged this surface as the one needing the §4 gate most — the only remaining one with write actions, and the only one desktop keeps open *while the writer types*.

**The gate's finding, and it is about WHEN rather than layout (D17).** `handleAddComment(body, range)` falls back to `apiRef.getSelection()` when no range is passed. On desktop that is correct — the rail sits beside a selection the writer can still see. A mobile sheet is modal: the editor behind it is `inert` and blurred, and the selected text is not on screen at all. So:

1. **the range is captured when the sheet opens** and passed explicitly. The handler has always accepted one; nothing now depends on a selection surviving a modal, a blur and a virtual keyboard;
2. **the captured quote is shown in the composer**, because otherwise the writer is annotating something invisible. Desktop does not need this and does not do it;
3. **it refuses before the typing.** With nothing selected, desktop lets a writer compose a paragraph and then rejects it with a `setError` banner at the *top* of a surface whose composer is at the *bottom*, behind the keyboard. Here the composer is disabled with the reason as visible text — the rule the wizard footer already follows;
4. **delete asks**, inline rather than as a second modal layer over the sheet. A mis-tap is far easier on a phone and the deletion is irreversible.

**Changes made**
- `commentsModel.js` — threads, the three filters, the open count, and `describeComposer`, which is D17 as a pure function a test can read without a CodeMirror. Thread grouping is built once into a map: the desktop rail calls `repliesOf(id)` inside its render map, which is O(n²) over a hundred notes, on the device least able to afford it (§15).
- `overlays/CommentsSheet.jsx` — composition of the shared family (`Sheet`, `TextArea`, `SegmentedControl`, `Button`, `InlineMessage`, `EmptyState`) plus the two shapes the design system has no equivalent for: the thread card and the quoted anchor.
- The overflow item's **hint carries the live open count**. Desktop shows it on a rail tab that is visible the whole time; behind a menu, the count is the only thing that says there is anything to look at. Zero is stated rather than hidden — "no open comments" and "I have not counted" are different answers.
- The item is gated on `presenceEnabled` (`useScreenplayEditor && Boolean(scriptId)`), the same condition the comment *fetch* is gated on upstream, so an unsaved draft has no Comments entry rather than an empty one (§2.8).

**Verification**
- **Five-width sweep, 6 states, 30 measurements: 0** undersized targets, **0** text under 11px, **0** unnamed controls, **0** text-contrast failures, **0** graphical-contrast failures, **0** overflow, no horizontal scroll, and `sheetCoversFrame` false everywhere.
- **The `selected` state is driven through the REAL editor API.** The composer only exists when CodeMirror holds a selection, and there is no fixture for a selection — so the harness gained a dev-only `window.__ckmEditorApi` and the sweep calls the real `scrollToRange`. What was measured is the genuine enabled composer, not a mock of one; its 10 controls against the refused state's 8 are the proof it entered the state.
- **The sweep found one real defect, in code written this session:** the orphaned-comment notice used `--ckm-gold` (#b7871f) at **3.23:1**, under 1.4.3's 4.5:1. Same class as the recorded `--ckm-muted` finding — a *graphical-object* token doing text duty. Now a named, measured `--ckm-editor-warn-text` at **5.90:1**, declared beside this surface's other measured colour tokens so the next warning label here cannot repeat it.
- **Real keys:** 30 Tabs (22 forward, 8 Shift) — **0** escapes from the sheet, **0** unnamed, **0** unringed. The composer accepted typed characters and its submit button was the very next stop. Enter on Delete showed the confirmation instead of deleting. Escape closed the sheet and returned focus to "More editor actions".
- **22 new tests** (11 model, 11 screen); mobile + screenplay **811 passing**; full suite **1451/1466** — the documented 13-test baseline plus 2, confirmed as the recorded concurrency flakiness by running `financeSession.test.jsx` alone, where all 10 pass. Lint clean; build + **53-route prerender pass**.
- **Named as unmeasured:** no real device and no screen reader. Two specific gaps beyond that. (a) **The keyboard inset over this sheet is the least-covered thing in the whole family** — this is the first mobile surface with a text field inside a bottom sheet whose submit sits below it, and headless Chrome has no virtual keyboard. `Sheet` pads its *footer* by the inset; this composer is in the sheet **body**, so whether "Comment" clears an open keyboard is genuinely unknown. (b) The fixture has four comments; a thread list of eighty notes is untested for scroll length or virtualization.

**Open issues/blockers**
- The keyboard-inset question above is the first one where the answer might change the markup (moving the composer into `Sheet`'s footer slot), so it is worth answering on a device before more sheets adopt this shape.

**Exact next action**
- People/presence — the rail's other collaboration tab. It is the first in this family whose actions are *administrative* rather than editorial (invite, change role, remove a collaborator via `CollaboratorsPanel`), which by D15 may well make it a Dialog rather than a Sheet; and the destructive ones need the same "ask first" treatment delete just got.

#### 2026-08-11 — Claude — The Navigator, and a hole nothing we measure could have found

**Requested continuation:** "continue".

**Starting checkpoint:** the previous entry's exact next action — bullet 4's Navigator, decided Sheet-vs-Dialog by D15.

**The gate's answer, and why it matters more than this one surface (D16).** D15 said choose by what the surface REPLACES. Applied here it gives the opposite answer to Scene cards: the navigator replaces nothing — you open it, pick a destination, and leave, with the script still the thing you are doing. So it is a **Sheet**, and D15 is now a rule with a case on each side of it rather than a preference for Dialogs. Two things deliberately did not port: desktop's Page ⇄ Cards toggle (Scene cards is its own overflow entry — two doors to one surface is two things to keep in sync) and the rail's persistent open state (a rail is furniture; a sheet is summoned).

**DEF-13 — and the class of bug is the finding, not the bug.** Porting the Pages tab surfaced that **there was no way to create a title page on mobile at all.** `TitlePageDialog` shipped in the third session, but `Editor.jsx` opens it only from `TitlePageSheet`'s `onEdit`, and that sheet renders only when `titlePageActive` — so the configurator was reachable exactly when it was least needed. Live on `/create-project` since 2026-08-09. Every check in this plan asks *"is what is on screen correct?"*; none asks *"is anything missing?"*. Recorded in `open_follow_ups` with a recommendation: an explicit inventory pass against the desktop rails before Phase 10, rather than trusting six more sheets to each notice their own gap.

**Changes made**
- `navigatorModel.js` — pure. Scene rows (numbering counts scenes only, so it matches the corkboard's card numbers; sequence headings stay tappable rows because they are destinations on desktop, not decoration), page rows (labelled with the first meaningful line — "12" navigates nothing, "12 · INT. CAR - NIGHT" does), and the tab counts.
- `overlays/NavigatorSheet.jsx` — almost pure composition of the existing family (`Sheet`, `Tabs`/`TabPanel`, `List`/`ListRow`, `EmptyState`, `Button`), which is why it needed six CSS rules and no new §7.2 prefix: an overlay belongs to the family that summons it, following `TitlePageDialog`'s precedent.
- **Both lists are derived, never stored** — a navigator that cached either would drift from the script the moment the writer typed, which is what it exists to index. Pagination runs only while the sheet is open, so a navigator nobody opened costs no repaginate per keystroke (§15).
- A lock is stated as **text** in the row ("Locked by Ravi") as well as a coloured glyph — colour and icon are not a status (§14).

**Verification**
- **Five-width sweep, 4 states, 20 measurements: 0 undersized targets, 0 text under 11px, 0 unnamed controls, 0 text-contrast failures, 0 graphical-contrast failures, 0 overflow, no horizontal scroll.** `sheetCoversFrame` is false at every width — D16's claim measured rather than asserted.
- **Two of the sweep's own results were wrong, and both were run down.** (1) It flagged a `material-symbols` lock glyph at 3.83:1 against a 4.5:1 floor — an icon font renders a *graphic* through a text node, whose floor is 3:1 and whose "font-size" is a drawn size, not a reading size. The audit now measures glyphs separately at 3:1 and reports them in their own bucket rather than skipping them. (2) It asked the harness for `?state=titlepage` expecting a title-page row and got the configurator open over a script with **no** title page — so it measured the default list and passed on a state it never entered. `?state=titled` now exists and the two measurably differ (7 controls vs 6, 2 rows vs 1). **The rendered facts recorded beside every measurement are what caught it**; a sweep that reports only zeros cannot tell a pass from a state it failed to reach. Third instance of the same lesson, and the first where the fixture request rather than the fixture was at fault.
- **Real keys:** 26 Tabs (20 forward, 6 Shift) inside the open sheet — **0** escapes, **0** unnamed, **0** unringed. The tab bar is a genuine APG tablist, not buttons that look like tabs: `tabIndex` reads `[-1, 0]` (one stop for the whole bar), ArrowRight moves and wraps, End jumps. Enter on a scene row closed the sheet and landed focus in the editor at that scene.
- **17 new tests** (9 model, 8 screen); affected suites 225/225; full suite **1427/1444**. That is the documented 13-test baseline plus 4 extra, and the 4 were confirmed as the recorded concurrency flakiness by re-running those three files alone — where two pass outright and the third drops to its single documented failure. Lint clean; build + **53-route prerender pass**.
- **Named as unmeasured:** no real device, no screen reader. And the sweep's fixture is a **two-scene** script — a 60-scene navigator's scroll length, and whether the Scenes list wants virtualization (§15 says measure first), is untested. The sheet body did not scroll at any width here, which means the one property worth measuring was not exercised.

**Open issues/blockers**
- None new. DEF-13's *class* — missing surfaces are invisible to every check we run — is the one worth acting on before Phase 10.

**Exact next action**
- Comments/presence. It needs the §4 gate most of the remaining surfaces: it is the only one with write actions (add, reply, resolve, delete) and its own empty/loading/error states, and desktop keeps it open in a right rail *while the writer types* — a case neither Sheet nor Dialog covers well. Decide that before building.

#### 2026-08-11 — Claude — Scene cards on mobile, and what measuring an old component found

**Requested continuation:** "continue".

**Starting checkpoint:** the previous entry's exact next action — mount the corkboard as the first of bullet 4's remaining surfaces. DEF-3 had just given it a reorder path that works without a drag, which is what made putting it on a phone legitimate at all.

**Work item claimed:** Run the §4 gate over the editor's overflow surface, mount the board, and measure it at five widths — the corkboard had never been rendered at 320px on any platform.

**The gate's load-bearing finding, and it corrected a standing decision (D15).** D5 says "every desktop rail becomes a bottom sheet". The corkboard is not a rail — on desktop it is `centerView === "cards"`, the other half of a view switch that *replaces* the script page. Our own primitives settle it in their own doc comments: `Sheet.jsx` is for "a short, contextual task" whose scrim strip says the thing behind is still there; `Dialog.jsx` is for "a task that REPLACES the screen for its duration". So Scene cards is a `ckm-dialog`, and the rule for the rest of bullet 4 is now written down: choose by what the surface replaces, not by how big it looks.

**Changes made**
- `editorChrome.js` — a `cards` overflow item, guarded on `useScreenplayEditor` rather than `canEditContent`: a reader who cannot edit can still want to see the shape of the script, and the board's own `canEdit` already withholds every control that writes. Prose mode is the real exclusion, since a book format has no sluglines.
- `Editor.jsx` — the Dialog, `cardScenes` derived exactly as the desktop focus mode derives it (same identity the locks key off, or a card's lock badge and the editor's disagree), and four new context reads. **No new state**: reorder and synopsis edits go to the orchestrator's own `handleReorderScene` / `handleSynopsisChange`, so autosave, the draft signature and the lock guard are the shared ones.
- **The seam is one prop.** `Corkboard` gained a `className` the host owns, because the shared board arrives carrying desktop Tailwind and two of those utilities are wrong in a dialog — `overflow-y:auto` would be a second scroller inside the dialog body's, and `px-6 py-8` doubles its padding. Correcting them on a `ckm-editor__cards` class is the alternative to reaching through `.px-6`, which §7.1 forbids.
- `CreateHarness.jsx` — a synopsis fixture where **one card is filled and one is not**, a `?state=locked` that puts another writer's lock on scene 2, and a reorder handler wired to the real `moveScene`. All three exist because of the `MediaSlot` lesson: a sweep only measures the state it rendered, and a fixture that never fills a control never tests the filled control.

**Verification**
- **Five-width CDP sweep (320/360/390/430/768) across 3 states — 15 measurements**, against the live dev server. Final: **0** targets under 44×44, **0** text under 11px, **0** unnamed controls, **0** contrast failures, **0** overflow, no horizontal scroll on page or surface. The rendered column is recorded alongside every measurement (2 cards, move controls present/absent per state, the lock badge in `locked`, the filled synopsis, 1 grid column at phone widths and 2 at 768, `overflow-y: visible` on the board) so a pass on an empty grid is not possible.
- **The sweep found four real defects, all in the shared corkboard, all live on DESKTOP the whole time** — recorded in full in `open_follow_ups`. The heading that opens a scene was a 22px-tall target; the synopsis textarea had no accessible name and no placeholder to borrow one from when locked; two labels were 10px; and the lock label wore the *collaborator's assigned colour* at 3.83:1. Fixed, re-measured to zero, and each pinned by a unit test so the next regression does not need a browser.
- **Real dispatched keys.** 33 Tabs (25 forward, 8 Shift) inside the open board: **0** escapes from the dialog, **0** unnamed stops, **0** unringed stops. A real Enter on "Move down" reordered the actual document through the real `moveScene`, announced "Moved INT. RAILWAY RETIRING ROOM - NIGHT to position 2 of 2.", and left focus on that scene's card at its new index — on "Move up", because "Move down" is disabled at the last position. That is DEF-3's enabled-not-merely-present fallback, confirmed in a browser rather than only in jsdom. Escape closed the board and returned focus to "More editor actions".
- **The key probe was wrong twice and both were the probe.** It reported 23 of 25 stops unringed — because it read `outline`, and this app's focus ring is a `box-shadow` (`index.css`, "Focus Ring System"). And it reported that Enter did not reorder — because a CDP key event without `text` never makes Chrome synthesise the button click. Both fixed; then 0 and a real reorder. Same lesson as the fourth session's `<label for>` probe: an audit's first red result is a claim about the audit until it is run down.
- **14 new tests** (10 on the screen, 4 on the component); `screenplay` + `create` + `theme` suites **265 passing**; full suite **1414/1427** — the 13-test baseline documented in `open_follow_ups`, unchanged and none of it in these files. Lint clean on `src/mobile` and `Corkboard.jsx`. Build + **53-route prerender pass**. The mobile CSS contract test passes with the two new rules.
- **Named as unmeasured rather than implied:** no real-device pass and no screen-reader pass on this surface; the dialog's keyboard-inset behaviour is untested here for the same reason it is untested elsewhere (headless Chrome has no virtual keyboard); and the board has not been measured with a *long* script — 60 cards at 320px is a scroll-length and performance question that a two-scene fixture cannot answer.

**Open issues/blockers**
- The writer bottom-bar product regression is now three sessions old and still red. It blocks nothing here but it is the reason the suite's baseline is 13.

**Exact next action**
- Continue bullet 4 with the Navigator, then comments/presence, version history and reports — each an overflow entry, each decided Sheet-vs-Dialog by D15.

#### 2026-08-11 — Claude — DEF-3: the corkboard gets a reorder path that is not a drag

**Requested continuation:** "continue in native app implementation".

**Starting checkpoint:** DEF-3 was the live ledger's exact next action, recorded since the bullet-1 research spike as a **live desktop WCAG 2.1.1 failure rather than a mobile gap**: `components/screenplay/Corkboard.jsx` reordered scenes through HTML5 `draggable` / `onDragStart` / `onDrop` alone. Touch fires none of those, so on a phone the board was inert; and with no keyboard or button path, a desktop keyboard user could not reorder either. The card's only other control opened the scene.

**Work item claimed:** Build the accessible reorder primitive over the existing pure `moveScene(text, from, to)`, on the shared component, so both platforms are fixed by one change.

**Changes made**
- `Corkboard.jsx` — every movable card ends in a **Move up / Move down / Move to…** row. The first two are 44x44 icon buttons; the third toggles an inline labelled `<select>` of positions 1..n plus a **Move** button. All of it is always visible: revealing the row on hover would have re-created the defect on the device it exists for.
- **One entry point, not three.** `requestMove(from, to, control)` holds the `canEdit` guard, the other-writer lock guard, the clamp, the announcement and the focus intent — and `handleDrop` now calls it too. Drag and buttons cannot drift apart, because after this change there is only one path.
- **`aria-live="polite"`**, naming the scene and its new position ("Moved EXT. STREET - NIGHT to position 3 of 4."). Polite, per §14: the reorder is the writer's own action and must not interrupt. A drop announces identically — the same move should not be silent depending on how it was made.
- **Focus follows the scene.** `sceneId` embeds the index (`scene:2:INT. CAR - NIGHT`), so a reorder re-keys every card past the move and React drops focus to `<body>`. A post-render effect re-focuses the same control on the card at its **new** index, so holding Move down walks a scene down the board.

**Verification**
- **13 new tests** in `corkboardReorder.test.jsx`, all passing. The parity test is the load-bearing one: it renders the board twice and asserts that pressing Move down on card 1 and dropping card 1 onto card 2 call `onReorder` with the identical `(1, 2)` — then feeds the button path's indices through the real `moveScene` and asserts the resulting scene order. "Move to position 4" is checked against insert-at semantics rather than assumed, because a fudged index here would silently place scenes one slot off.
- Lint clean on both touched files. Build + **53-route prerender pass**.
- **The fallback chain was wrong and the test caught it, not review.** After moving a scene to the top, the effect re-focused "Move up" — which is `disabled` there — because the chain picked the first control that *existed* rather than the first that was *enabled*. So a writer's own successful move would have parked them on a dead control. Fixed to test `!el.disabled` at each step; the test that failed is the one that now pins it.
- **NOT measured, and named rather than implied:** the corkboard has never been rendered at 320px on any platform — it is not yet mounted on mobile, so there was nothing for a CDP sweep to visit. The 44px targets are asserted here as declared classes (`w-11 h-11`); real geometry gets measured when the editor sheet mounts it. No screen-reader verification on a real AT.

**Open issues/blockers**
- **The full suite's red baseline is no longer 2 tests — it is 13**, and this was measured, not assumed: with every change of this session stashed, the same 13 fail. 10 of the 11 new ones are one product regression (the writer's mobile bottom bar now reads `dashboard, create, messages, profile` against §8.2's approved `dashboard, projects, messages, profile`), attributed by checking `writerNav.js` out at 2113dc9~1 and watching the four suites drop to exactly the 2 documented failures **by name**. It needs a product decision and is recorded in `open_follow_ups`, not silently fixed.
- This change alters a **desktop** view's density (each card grew a control row). Behaviour is independent of the styling if that density is unwanted.

**Exact next action**
- Mount the corkboard as the first remaining editor sheet from D5, running the §4 gate over the sheet and measuring the card grid at 320px in the five-width CDP sweep.

#### 2026-08-10 — Codex — DEF-8: safe draft/edit source loading

**Requested continuation:** "implement native app implementation".

**Starting checkpoint:** DEF-8 was the live ledger's exact next action. Both GET `/scripts/:id` loaders swallowed every failure. `?edit=<id>` could therefore draw an empty form and later PUT it over a live listing; `?draft=<id>` also drew the empty form while loading and after failure.

**Work item claimed:** Replace both swallowed loaders with one explicit source-load contract, integrate DEF-7 recovery conservatively, and enforce the no-write invariant below the presentation layer.

**Changes made**
- Added `pages/CreateProject/lib/uploadSourceLoad.js`: edit-over-draft query precedence, loading/ready/not-found/forbidden/failed/local-only states, HTTP/offline classification, shared copy and the source write-gate predicate.
- Both query forms now render a loader before any form. HTTP 404 and 401/403 render terminal unavailable/access states and never expose a cached copy; 5xx/network failures render retry and only offer **Open device copy** when DEF-7 finds a valid same-user, same-flow snapshot.
- Local recovery is explicit, remains editable for continued device safety, and blocks manual Save, keepalive Save, revision POST, publish POST and edit PUT until retry successfully loads the server copy. Native and desktop both show the local-only warning and disabled submit reason.
- Retry synchronously flushes local work and preserves the snapshot's original `baseUpdatedAt`. A newer server `updatedAt` restores the server form first and offers the existing opt-in local restore instead of auto-clobbering it.
- Server hydration now resets fields that a local-only form could otherwise leak forward (roles, files, preview state and film details). Requests ignore late results after effect cleanup.
- Added native source-failure/recovery screens and deterministic `source-error` / `source-local` harness states. The native footer model and desktop workspace both expose the hard write gate.

**Verification**
- Focused matrix: **4 files / 64 tests passed** after the final conflict fix; the wider seven-file matrix passed **78/78** before the additional local-only render test. New coverage pins edit 404, draft 403, offline classification, retry, explicit local recovery, newer-server conflict and direct no-PUT/no-POST enforcement.
- ESLint is clean across the touched orchestrator, helper, native chrome/model, harness and tests. `ScriptUploadWorkspace.jsx` retains the same four documented pre-existing unused-variable errors; no new lint finding was introduced there.
- Vite production build passed: 4,047 modules. The existing `adminApi` circular-chunk and large-chunk warnings remain. SEO prerender and verification passed all **53** public routes. The aggregate npm script exceeded the command window during its long Vite stage, so its three stages were run and verified separately.
- Real Chrome/CDP at **320×720, 360×800, 390×844, 430×932 and 768×1024**, on both `source-error` and `source-local`: **10 measurements**, zero page overflow, zero shell overflow, zero visible target below 44×44 (form checkbox rows measured as their owning labels; the sentence-inline terms link uses WCAG 2.5.8's inline exception), zero unnamed controls and zero text below 11 px. Every failure screen carried the correct heading; every local-only form carried the visible submit-blocking reason.
- The final broad mobile run passed **664/671**; all seven failures are the current repository's unrelated writer-navigation mismatch (`writerNav.js` supplies Create while the ledger/tests expect Projects). An earlier run's eighth failure was this slice's conflict test and exposed the `baseUpdatedAt` preservation bug; the final run proves that fix while leaving only the known navigation mismatch.

**Decisions or deviations**
- A hard 403/404 never offers cached content, even if present: local storage cannot override current authorization or prove a deleted id still exists.
- A transient failure does not auto-open local work because the missing server `updatedAt` cannot prove the cache is based on the latest copy. Recovery is a named user action and writes remain blocked.
- The source write gate lives in `ScriptUpload.jsx`, not only in disabled buttons, so stale UI, keyboard submission or a direct action call cannot bypass it.

**Open issues/blockers**
- No DEF-8 blocker remains. The broader writer-navigation mismatch is unrelated and was preserved rather than silently changing a user-facing tab set outside this slice.
- Phase 3 bullet 4 and bullet 6 remain partial as described in the checkpoint.

**Exact next action**
- Implement DEF-3 in `components/screenplay/Corkboard.jsx`: accessible keyboard/touch reorder controls over `moveScene`, tests and focus/announcement behavior, then mount Corkboard as the first remaining editor sheet.

#### 2026-08-10 — Codex — DEF-7: upload working-draft protection on desktop and native

**Requested continuation:** "continue" after the Phase 3 bullet 5 PR was opened.

**Starting checkpoint:** DEF-7 was the ledger's exact next action. `/upload` had a manual server-draft button but no local snapshot, unload guard or Back interception; the same shared orchestrator served desktop and native, including the `?draft=` and `?edit=` forms.

**Work item claimed:** Close DEF-7 as one shared data-safety slice, keep manual/server confirmation distinct from local recovery, and pin refresh, exit, Back, terms-link and query-key behavior before moving to DEF-8.

**Changes made**
- Added `pages/CreateProject/lib/uploadWorkingDraft.js`: versioned and prunable per-flow keys (`new`, `draft:<id>`, `edit:<id>`), user binding, JSON-safe serialization that drops `Blob`/`File`, deterministic signatures and server-version-aware recovery decisions.
- Wired `pages/ScriptUpload.jsx` to take a 300 ms local snapshot of all JSON form state and the exact workflow position. Pending file names are recorded and disclosed after recovery; browsers cannot restore the file handles themselves.
- Recovery runs only after the empty initial form or loaded server copy has been hydrated. A moved server `updatedAt` produces an explicit restore choice instead of silently applying the local copy. Draft/edit snapshots cannot leak into each other.
- Manual Save now returns success/failure, clears the snapshot only after confirmed server success, and prevents "Save a draft & leave" from navigating on failure. Submission/revision success and explicit discard are the other clearing paths.
- Added synchronous snapshot flushing for terms links, native Close/overflow destinations, backgrounding, page hide, unmount and `beforeunload`. A best-effort `fetch(..., keepalive: true)` is size-gated at 64 KiB, remains separately labelled, and never claims confirmation or clears the device copy.
- Browser Back is intercepted. Native opens the existing exit sheet; desktop asks for confirmation. Content-only edit Cancel is protected too.
- Native upload chrome now distinguishes "Draft saved", "Saved on this device" / "Local copy saved", and "Unsaved changes". The exit sheet names local versus server safety and the narrow app bar gives the status its own row rather than hiding it.
- Added deterministic `local-saved` and `exit` upload harness states and documented them in `mobile/README.md`.

**Verification**
- Focused matrix: **7 files / 113 tests passed**. This includes 11 pure helper tests and six ScriptUpload integration cases covering debounced refresh recovery, failed-versus-successful manual Save, synchronous unload plus distinct keepalive, browser Back, draft-key isolation and edit-version conflict/opt-in restore.
- Full client suite: **95/101 files passed; 1,373/1,387 tests passed**. All 14 failures are outside this slice: 12 stale navigation expectations across four suites, one writer-roster anchor/button expectation, and one finance-session timeout. Every new/touched DEF-7 suite passed in the full run.
- ESLint is clean across the touched orchestrator/helper/native/harness/test files. `ScriptUploadWorkspace.jsx` retains the same four pre-existing lint errors (`setOpenSection`, `freePlan`, `accordionSections`, `visibleSection`), verified against the committed HEAD copy. `git diff --check` passed.
- Production client build passed: 4,046 modules, 53 SEO routes prerendered and verified; only the existing circular `adminApi` and large-chunk warnings appeared.
- Headless harness captures exercised the device-saved status and native exit sheet. The first narrow capture exposed the save label/overflow competing for one app-bar row; the ≤479 px layout now reserves a second status row. Chrome's command-line screenshot mode enforces a roughly 500 CSS-pixel minimum without CDP emulation, so the exact 320/430 breakpoint geometry remains a real-CDP/device recheck rather than an overclaimed measurement.

**Decisions or deviations**
- Workflow position is part of the signature. Moving panels alone can therefore trigger the guard, deliberately, because resume is expected to return to the exact screen the writer left.
- Local storage is the reliable exit safety net. Keepalive is opportunistic and cannot truthfully drive a "saved" state.
- `File` objects are never serialized. Recovery identifies each filename to reselect instead of inventing a usable upload handle.
- DEF-8 was not folded into this slice. Its swallowed loaders are the next explicit change; keeping it separate makes the recovery contract testable before changing loader state.

**Open issues/blockers**
- No blocker for DEF-7. A long keepalive body stays local-only, and pending local files must be reselected after refresh.
- The dangerous swallowed `?edit=` loader remains live until DEF-8: without a snapshot, a failed GET can still draw an empty form over a listing id.
- The six unrelated design files and the pre-existing generated `client/public/sitemap.xml` change were preserved and excluded from this work.

**Exact next action**
- Implement DEF-8 in `pages/ScriptUpload.jsx`: explicit not-found/forbidden/offline loader states for both query flows, retry/local-recovery handling, and a hard submit/PUT gate until `?edit=` has loaded successfully. Pin 404, 403, offline, retry, local-only recovery and no-PUT-on-failed-load tests.

---

#### 2026-08-10 — Codex — Phase 3 bullet 5: shared AI entitlements and quota states

**Requested continuation:** "continue in native app implementation".

**Starting checkpoint:** The §4 gate and three product decisions had already been recorded, and an interrupted working tree contained the first entitlement implementation: every paid plan unlocks AI, AI covers receive a real allowance of 15 per plan period, and dead AI surfaces are documented rather than built or deleted. The slice was still unverified and the ledger still called bullet 5 not started.

**Work item claimed:** Finish, harden and verify Phase 3 bullet 5 across the server, desktop orchestrators and both native create/upload surfaces.

**Research performed**
- Sources inspected: `User.subscription` schema; every payment/admin/competition/manual grant reset path; auth payloads; all seven exported AI controller actions and their route registrations; both create/upload orchestrators, desktop panels, native panels and deterministic harnesses.
- Comparable interaction patterns: not applicable — the gate established that this is a shared entitlement/quota state, not a route or new mobile workflow.
- Decisions adopted: the server is authoritative; client/server dependency-free mirrors are pinned by parity tests; free-plan refusal is 403 + `requiresUpgrade`; an exhausted paid allowance is 429 + `quotaExhausted` and never offers an upgrade; an image is reserved atomically before upstream spend and returned after upstream failure; every visible count is the server's plan-period count.
- Patterns rejected and why: per-script React attempt state (resets on reload and was never enforced); read-then-increment quota checks (two concurrent taps can both pass); one generic 403 for both locks (sells a current subscriber a plan they already hold); a new `/ai-tools` screen (the route remains the documented Dashboard alias and no distinct product exists behind it).

**Desktop parity inventory**
- Desktop files inspected: `pages/CreateProject/index.jsx`, `hooks/useAiCover.js`, `hooks/useAiGeneration.js`, `steps/Step2Details.jsx`, `pages/ScriptUpload.jsx`, and `components/script-upload/ScriptUploadWorkspace.jsx`.
- Data/services/hooks: `client/src/config/aiEntitlements.js` mirrors `server/config/aiEntitlements.js`; the server module is authoritative and a cross-tree parity test fails on drift. `useAiCover` owns the authoritative count on create; ScriptUpload retains its existing view-model seam.
- Roles/permissions/quotas: `free`/`none`/missing are locked; `pro`, `enterprise`, `silver`, `gold` and `diamond` are allowed. Cover allowance is 15 per plan period on `subscription.aiImagesGeneratedTotal`, which all current purchase/grant paths reset to zero.
- Routes/query/navigation: unchanged. Server enforcement now covers `/ai/generate-metadata` and `/scripts/generate-ai-cover`; the existing prose, grammar, score and trailer handlers use the same rule. A duplicate unreachable `/scripts/generate-ai-cover` registration was removed.
- Page states and child overlays: free-plan tap → persistent pricing action; quota exhausted → visible disabled state plus no-upgrade toast if stale client state still taps; generating → pending/disabled; server failure → ordinary error; successful cover → remaining count replaced by the response.

**Wireframe/design decision**
- Shell/top bar/scroll hierarchy/footer/bottom navigation/back/keyboard/safe-area: unchanged; this slice changes states inside the existing Media panels.
- Primary/secondary actions: the secondary AI cover card becomes visibly disabled and says `AI cover limit reached` / `No AI covers left this plan period` at zero. A paying writer is not sent to Pricing for spent quota.
- Overlays: the existing pricing modal remains the free-plan action; no quota overlay was added.
- Long text/localization: the two-line quota card wraps inside the existing shared `MediaSlot` and was measured at every required width.

**Changes made**
- Files added: `client/src/config/aiEntitlements.js`, `client/src/config/aiEntitlements.parity.test.js`, `client/src/pages/CreateProject/hooks/useAiCover.test.jsx`, `client/src/pages/CreateProject/hooks/useAiGeneration.test.jsx`, `server/config/aiEntitlements.js`, `server/utils/aiEntitlements.test.js`.
- Files modified: both create/upload orchestrators and their desktop/native media panels/tests/harnesses; `client/src/components/PricingModal.jsx`; `server/controllers/aiController.js`; `server/routes/scriptRoutes.js`; `server/models/User.js` (legacy-field documentation only); mobile README; this ledger.
- Shared logic extracted: plan normalization/access, remaining-image calculation, machine-readable lock/quota response bodies, and client error classification. The server cover handler atomically reserves the counter with `findOneAndUpdate`; a failure release is conditional on the counter still being positive so a concurrent plan reset cannot create `-1`.
- Route/prefix registration: no mobile route or CSS prefix changed; existing `ckm-media` owns the state.
- Dead code record: `components/AiWritingAssistant.jsx` has no caller; `scriptController.generateAiCover` is orphaned after removing the duplicate route; `User.aiThumbnailUsage` is an unused legacy per-title counter; the AI trailer UI/endpoints are not part of either shipped creation flow. Per the user's decision, none was revived or broadly deleted. The Pricing modal's free tier no longer advertises AI metadata that the server correctly refuses.

**Verification**
- Automated: focused entitlement/hook/native/desktop panel suite 6 files / 103 tests (including 34 direct entitlement/hook tests); full client suite 1,266/1,268 with only the two long-recorded `AppShell.render.test.jsx` expectations for removed `.ck-mobile-nav`; full server suite 109/109. ESLint clean on the new entitlement modules/tests, both hooks, `ScriptUpload.jsx`, PricingModal, the touched native panels/harnesses/tests, and the changed server files. The existing unrelated lint debt in `CreateProject/index.jsx` and `ScriptUploadWorkspace.jsx` remains outside the changed lines. `npm run build` passed (4,035 modules) with 53 SEO routes prerendered and verified; only existing large-chunk warnings.
- Viewports/devices/browsers: headless Chrome/CDP on the deterministic `?state=quota` create and upload media panels at 320, 360, 375, 390, 412, 430, 480 and 768 px — 16 measurements. Every state reported `flow`; the phone frame was 320→520 px; page and shell-surface overflow were 0; the quota control was 254–454 × 104 px; no rendered text was below 11 px. The raw target probe reported only the shared component's intentionally 1×1 visually-hidden file inputs, each named and backed by its full-card label/Replace control; there were zero undersized visible action targets.
- Accessibility: the exhausted reason is visible before interaction rather than hidden in a disabled control's tooltip; free-plan and quota refusals are semantically distinct; same-frame double taps are coalesced; no new live region or focus movement was introduced.
- Performance: no dependency and no new request. Client gating avoids known refusals, while the server remains authoritative. Atomic reservation prevents paid upstream work beyond the allowance.

**Decisions or deviations**
- Decision: bullet 5 is COMPLETE without a new screen.
- Reason: every live AI action already sits in the correct create/upload panel; the missing product was a coherent entitlement and quota contract.
- Decision: retain the historical deny-list behavior for future enum plans (unknown non-empty plan values receive access), parity-tested on both sides.
- Reason: a newly sold plan should not silently lose AI until two mirrors are manually updated; the schema still constrains persisted values today.
- User approval, if required: the three load-bearing product decisions were explicitly recorded at the starting checkpoint.

**Open issues/blockers**
- No blocker for bullet 5. The quota reservation behavior is unit/parity tested and build-verified, but not integration-tested against a disposable MongoDB instance; concurrency safety follows the single atomic update used in production.
- Plan expiry semantics remain the repository's existing plan-string convention; this slice did not introduce a separate subscription-expiry policy.
- Phase 3 remains open for bullet 4, bullet 6, DEF-7 and DEF-8 as listed in `next_action`.

**Exact next action**
- Implement DEF-7 in `pages/ScriptUpload.jsx`: per-flow local working snapshots plus `beforeunload`/`popstate` protection for `/upload`, `?draft=` and `?edit=`, with refresh/back/terms-link tests; then fix DEF-8's swallowed loaders before returning to the editor sheets.

---

#### 2026-08-09 (fourth session) — Claude (Claude Code) — Phase 3 bullet 3: the §4 gate for `/upload`, and the mobile upload screen

**Requested continuation:** "continue in native app implementation".

**Starting checkpoint verified before claiming (§20.4).** Branch `feat/mobile-role-aware-chrome` at `122dba7`. The previous session's work is present in the working tree and uncommitted; it was left exactly as found, along with the user's own `client/public/sitemap.xml` edit and the six untracked design files. The previous entry's claims were checked rather than trusted: `mobileRouteManifest.js` does hold `/create-project` and `/create-project/:draftId` as `SCREEN` with the `excludeQuery` competition exclusion, `mobile/screens/create/` does hold the wizard's six files plus `panels/` and `overlays/`, `pages/CreateProject/index.jsx` does carry the three defaulted seam props, and `/upload` is still `migration("upload", "/upload")` on manifest line 224.

---

##### §4.1 — Functional inventory of the `/upload` route family

Four files, 3,181 lines, plus two shared utilities that turn out to be the most important thing in the inventory.

| File | Lines | What it is |
|---|---|---|
| `pages/ScriptUpload.jsx` | 2,389 | The orchestrator. All state, all API calls, the `workspaceVm` assembly, and a portal-rendered Tailwind thumbnail cropper |
| `components/script-upload/ScriptUploadWorkspace.jsx` | 834 | The whole desktop UI: three-column workspace (tracker rail / form column / helper rail), ten panels, toast, action bar |
| `components/script-upload/ScriptUploadWorkspace.css` | 492 | Its stylesheet — the one carrying DEF-4's four floor breaches |
| `components/script-upload/ScriptUploadSuccess.jsx` + `.css` | 147 | The post-submit surface |
| `utils/scriptUploadValidation.js` | 258 | **Platform-neutral.** Ten screens, per-field issues, server-error routing |
| `constants/scriptUploadTerms.js` | 47 | The agreement text and its version |

**Ten screens, in one linear order** (`UPLOAD_SCREEN_ORDER`): `upload` → `basics` → `story` → `cast` → `progress` → `access` → `media` → `classify` → `film` → `publish`. Steps 1–5 with step 2 ("Details") holding six sub-screens — the same two-level shape `/create-project` has, and the same shape the mobile wizard already draws.

**API surface, and what each call's failure looks like:**

| Call | When | Failure shape |
|---|---|---|
| `GET /scripts/script-limit` | mount, once | swallowed to `null`; the plan gate then never appears |
| `POST /scripts/extract-pdf` (multipart) | file chosen | `setError(...)`; the file is discarded and the picker returns to empty |
| `GET /scripts/:id` | `?draft=` or `?edit=` | **swallowed entirely** — `catch {}` with a `// proceed normally` comment |
| `POST /ai/generate-metadata` | logline / synopsis / roles | `setError`, plus a `usedFallback` "AI is busy" branch |
| `POST /scripts/generate-ai-cover` | cover generation | toast; 3 attempts per script, plan-gated |
| `POST /scripts/draft` | Save draft | `setError` |
| `POST /scripts/upload` | Publish | routed through `resolveUploadServerIssue` to a field |
| `PUT /scripts/:id` | `?edit=` publish | same, plus a `revisionSubmitted` branch |
| `POST /collab/:id/revisions` | content-only edit | navigates away on success |
| `POST /scripts/:id/upload-{thumbnail,trailer,pitch-video}` | after the metadata call | `Promise.allSettled`; failures become `pendingMediaRecovery` |

**Roles, gates and limits.** `["creator","writer"]` only — anything else gets a centred red "Access Denied" card. `scriptLimit.limitReached` blocks a *new* upload but never an edit (`creationBlocked = limitReached && !scriptId && !editId`). AI cover is free-plan-locked and capped at 3. Pitch video is locked for `free` and `silver`. Ceilings: script 30 MB, thumbnail 5 MB, trailer 250 MB, pitch video 90 MB **and** 90 seconds.

**Query parameters — both undocumented in §9 before today.** `?draft=<id>` loads a draft written by the editor and converts it to an upload (sets `scriptId`, so submit carries it and the server updates rather than creating). `?edit=<id>` loads a published script; if the loaded script reports `isCollaborator && canEditMetadata === false` it becomes **content-only edit mode**, a genuinely different screen — step is pinned to 1, the tracker, helper rail and sub-steps are all suppressed, the body is one textarea, and Submit posts to `/collab/:id/revisions` with `baseContent`/`content`/`sectionRef` instead of `/scripts/upload`. `?edit=` also has an `editApprovalLocked` state (a script already in `pending_approval` with `approvalRequestType === "edit_submission"`), which refuses submit.

**Touch-hostile behaviour found (beyond DEF-4's four measured floor breaches):**

1. **The dropzone is a `<div role="button">` with `onDrop`/`onDragOver`.** Drag-and-drop does not exist on a touch screen. The div *is* keyboard-operable (Enter/Space), so this is not a WCAG failure — it is half a control's affordance that means nothing on a phone.
2. **The three-column workspace.** A 158px tracker rail on the left and a helper rail on the right, both of which exist to show information the phone has to carry some other way.
3. **The cropper is a portal-rendered Tailwind modal** with a hand-rolled focus trap, a `45vh` cropper box, and two `<input type="range">` controls in a 2-column grid.
4. **`su-save-state` is `display:none` at ≤720px** — the "Draft saved" / "Changes submit for review" indicator vanishes on every phone, which is DEF-4's most consequential breach: a writer on a phone cannot tell whether the draft saved.
5. **The validation focus routine reaches for `document.getElementById(issue.fieldId)`** and then `scrollIntoView`. That is the mechanism that has to survive the port, and it is the reason the mobile controls adopt the same ids (see D11).

---

##### §4.2 — Research, and the seven answers

Sources retrieved this session (content actually read, not recalled):

- MDN, [`<input type="file">`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file) — `accept` is a **hint, not validation**; `accept="image/*"` is what makes a phone offer the camera; `capture` selects which camera; the input must be hidden with `opacity: 0` rather than `display:none` so it stays reachable by assistive tech, with a styled `<label>` as the visible target; `change` fires even when the same file is re-picked, and `cancel` is the event for a dismissed picker.
- W3C, [Understanding SC 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) — a progress bar for an upload is named explicitly as a status message; `role="status"` for state and success, `role="alert"` for errors, and **the message must not take focus**.
- The repository itself, as a primary source for two questions no external document can answer: `utils/scriptUploadValidation.js` (the shared contract), and `axios@1.13.5` (`onUploadProgress` is available on the instance `services/api.js` already exports, so real per-file progress needs no new dependency).

Two further fetches — Material 3 progress indicators and Apple HIG progress indicators — **returned no page content**, only the title. They are named here as *attempted and unretrieved* rather than cited from memory, because §4.2 forbids inventing claims about a source that was not inspected.

**1. Screen, sheet, or flow?** A **multi-step flow**, exactly as `/create-project` steps 2–5 already are — same two-level stepper, same footer, same shell mode. Not a dialog: it is entered from a chooser, it is resumable, and it has its own URL.

**2. App bar / body / sticky action / tabs / overflow?** App bar: the project title as `h1`, the position line, the save state (which desktop hides on phones), Exit and an overflow. Body: one panel. Sticky: Back + Next/Publish, in a slot that **displaces** the form. No bottom tabs — this is a flow. Overflow: Save draft, My projects, and (when the flow was entered from a draft) Back to the script.

**3. What becomes progressive disclosure?** The tracker rail and the helper rail both collapse into the app bar's one position line plus a progress fill — the same collapse `describeWizardPosition` already performs, and for the same measured reason (five labels and four connectors do not survive 320px). The 4,000-word agreement stays a focusable scroll region. The buyer preview becomes a summoned dialog rather than an embedded PDF viewer.

**4. Back, cancellation, unsaved changes, keyboard, interrupted uploads?** Back walks the flow; Exit leaves it. Unsaved work is protected by an explicit **Save draft** rather than an autosave — and this is the sharpest difference from `/create-project`, which autosaves every 3s. `/upload` has no autosave at all, on either platform, so "leave and resume" here means "tap Save draft first", and the screen has to say so. Interrupted media upload is already modelled by `pendingMediaRecovery`; on desktop it is a sentence in a toast, which is D9's target.

**5. Pagination / virtualisation?** None. The longest lists are the chip pools (48 genres, 36 tones, 40 themes, 34 settings) which the wizard already renders as `ChipSelect` at 320px without overflow, and the roles list, which is writer-authored and small.

**6. Which actions need which states?** File choose → *extracting* (indeterminate, because `POST /scripts/extract-pdf` reports no progress) → *ready* / *failed*. Media upload → determinate per file (D9). Save draft, Publish, AI generate → pending. Everything destructive here is reversible (remove a cover, replace a file) except Publish, which is a one-way submit to admin review.

**7. What should a screen reader announce?** Panel changes are a route-like move, so the panel heading is the landmark. The save state is `role="status"`; validation errors are `role="alert"` and must not steal focus (4.1.3) — but the *navigation* to the offending panel does move focus, deliberately, because that is a user-initiated response to pressing Next.

---

##### §4.3 — Text wireframe

```text
Route and page name       /upload — "Upload a script" (mobile)
                          + ?draft=<id> (convert an editor draft)
                          + ?edit=<id>  (update a published script)
                          + ?edit=<id> where the loader reports
                            isCollaborator && canEditMetadata === false
                            → CONTENT-ONLY mode, a different screen

Audience and permissions  Writer/creator only. Non-writers get a real mobile
                          refusal, not the desktop Tailwind card.
                          creationBlocked (plan limit) blocks a NEW upload and
                          never an edit.

Top app bar               [Exit ×] [title + "Step n of 5 · Label · Panel"]
                          [save state] [⋮]
                          + a progress fill under the bar
                          + notices below it, in fixed chrome: plan limit,
                            extraction warning, validation error, media recovery

Primary scroll hierarchy  ONE panel at a time, drawn from the shared
                          UPLOAD_SCREEN_ORDER. Panel head (h2 + blurb), then
                          the fields, on the ckm form family.

Primary / secondary       Footer slot: [Back] [Next] — [Publish for review] on
                          step 5. Save draft lives in the overflow, not the
                          footer: three actions in a 320px bar is how the
                          desktop footer ended up with a 42px control.

Bottom navigation         None. flow shell + a one-slot footer override.

Overlays                  Cover cropper (full-screen dialog), buyer preview
                          (full-screen dialog), overflow sheet, exit
                          confirmation, success screen.

Loading / empty / error   Boot: skeleton while ?edit= resolves.
                          Empty: the file picker IS the empty state of step 1.
                          Error: per-field message + a chrome-level alert;
                          Next refuses and names the reason as visible text.
                          Success: a full mobile screen, not a redirect.

Keyboard and safe-area    Inherited: the footer is a shell slot, so it
                          displaces rather than covers; useKeyboardInset is the
                          shell's, unchanged.

Back-navigation           Footer Back walks panels; app-bar Exit leaves, with a
                          confirmation that offers Save draft first — because
                          this flow does not autosave.

Long text / i18n          Titles clamp to two lines; the agreement is a
                          focusable region; chip pools wrap rather than scroll.

Desktop→mobile decisions  D8 (already taken): real mobile screen, reuse the vm
                          prop shape, do NOT adopt the CSS.
                          D10–D14 below.
```

---

##### Decisions D10–D14

- **D10 — The panels are NOT the create-project panels, and the reason is measured rather than assumed.** `next_action` asked whether `mobile/screens/create/panels/` could be fed by ScriptUpload's state. Checked field by field: `story`, `cast`, `progress`, `classify` and `film` are near-identical (same keys, same setters, same `handleGenerateMetadata` signature), but `basics` is a different question entirely (upload asks format + an auto-detected page count; create asks writer credits + company + a derived page estimate), `access` reads a different preview source (`pdfPageTexts` from a real PDF vs. Fountain-derived pages), `publish` has different price presets and a different legal gate (**one** acknowledgement, not two — `scriptUploadValidation.js` documents at length why adding the second one once made the flow impossible to finish), and `upload` has no counterpart at all. Feeding those panels through a synthesised `CreateProjectContext` would mean a context that answers `writers`, `targetFilm` and `estimatedPages` with fictions, and would silently re-point `/upload` every time someone edits a create-project panel. **So the shared thing is the component family, not the panel bodies** — which is what the Phase 1 form family is for.
- **D11 — The shared validation contract is honoured two ways, and neither touches a Phase 1 component.** `validateUploadScreen` returns `{ screen, step, detailStep, fieldId, message, label, code }`, where `fieldId` is a DOM id. The *message* becomes the control's `error` prop, so the Phase 1 `Field` wires `aria-invalid` and `aria-describedby` for free; the *id* goes on a `display: contents` wrapper around that control, so `document.getElementById(fieldId)` finds it. **Wrapping rather than pinning the id onto the control was the second attempt and is the right one:** pinning would silently break the `<label for>` association `Field` generates with `useId()`, which is a worse bug than the one it solves. A second mobile→field lookup table was the third option and was rejected — it is a copy of a mapping that already exists, and the copies would disagree the first time a field was renamed. *(Revised during implementation; the first draft of this decision proposed adding a `controlId` prop to `Field`, which the wrapper made unnecessary.)*
  - **The scroll-and-focus routine had to be rebuilt, and that is the part that is easy to miss.** `focusValidationIssue` in the orchestrator only moves `step`/`detailStep` and bumps `validationAttempt`; the actual `scrollIntoView` and focus live in `ScriptUploadWorkspace`'s own effect, which `nativeChrome` never mounts. Without a mobile equivalent, pressing Publish over a missing logline would jump to step 2 panel 2 and then leave the writer to find the problem. `Upload.jsx` carries it, keyed on `validationAttempt` rather than the errors array so that pressing Publish twice over the *same* unfixed field moves focus twice.
- **D12 — Three components are promoted out of `screens/create/` into `mobile/components/media/` under a new registered `ckm-media` prefix.** `MediaSlot` (already fully prop-driven), `PreviewDialog` (already fully prop-driven) and `CoverCropDialog` (context-bound, becoming prop-driven with a thin create-project adapter). This is the honest half of the reuse `next_action` asked for: these three are genuinely the same component on both routes, and copying them would be the second port the ledger warned against. Their rules move out of `Wizard.css` into `components/media/Media.css`.
- **D13 — Save draft is in the overflow sheet, not the footer.** Desktop's action bar carries Back, a save-state string, Save draft and Next, and at ≤520px that is what produced DEF-4's 42px control. The footer keeps the two controls that move the flow; the one that does not is one tap away. The exit confirmation offers Save draft as its primary, so the destructive path (leaving with unsaved work) always passes through it.
- **D14 — Media upload progress becomes real, and it is shared code.** `uploadMediaForScript` currently fires three `api.post` calls into `Promise.allSettled` with no progress at all; the only progress bar on the page is `handleFileSelect`'s **simulated** one (a `setInterval` that adds 10% every 200ms and stops at 90%). A 250 MB trailer on a phone is exactly the case Apple's ">2 seconds needs feedback" rule exists for. `axios@1.13.5`'s `onUploadProgress` needs no new dependency, and putting it in the shared function means desktop gets it too.

---

##### Defects and risks found by this gate

- **DEF-7 (live, both platforms, silent data loss on a slow network): `/upload` has no autosave and no unsaved-change guard.** `pages/CreateProject` debounces a save at 1s, runs an interval save every 3s, snapshots to `localStorage`, and intercepts `popstate` to confirm an exit. `/upload` does none of it: there is no `beforeunload`, no `popstate` interception, and no local snapshot. A writer who fills in five panels and then backgrounds the tab, follows the "Script Upload Terms" link in step 5, or turns the phone, loses everything typed since the last manual **Save draft** — and Save draft is a control DEF-4 measured as being 42px wide at ≤520px in a bar whose save-state indicator is `display:none`. The mobile screen adds the exit confirmation (D13); the *guard* is shared work and is recorded here rather than smuggled in.
- **DEF-8 (live, both platforms): `?draft=` and `?edit=` failures are swallowed.** Both loaders end in `catch { /* proceed normally */ }`. "Proceed normally" for `?edit=abc` means the writer is shown an **empty upload form** that will `PUT /scripts/abc` over their published script when submitted. The same class of bug the previous session fixed for `loadDraft` in `CreateProject` (offline load now offers the local snapshot instead of showing an empty editor over a draft that has content) — and the fix has the same shape.
- **DEF-9 (mobile-only, and the reason step 1 is not just a `FilePicker`): the progress bar on step 1 is a lie.** `handleFileSelect` starts a `setInterval` that advances 10% every 200ms, caps at 90%, and jumps to 100% when `POST /scripts/extract-pdf` resolves — so it reports "80%" for a request whose real progress is unknown, and on a slow phone connection it sits at 90% for as long as the upload actually takes. WCAG 4.1.3 names a progress bar as a status message; this one states something untrue. The mobile screen renders an **indeterminate** busy state for extraction instead, and keeps determinate bars for the media uploads, where D14 makes the number real.
- **RISK — the third-party PDF viewer.** `ScreenplayPdfViewer` mounts `pdf.js` inside the desktop access panel. The mobile access panel routes the preview through the same summoned `PreviewDialog` the wizard uses, so the viewer is mounted at most once and only when asked for; whether `pdf.js` renders acceptably at 320px is a real-device question a jsdom suite cannot answer, and is named here rather than implied.

---

##### What was built

**The seam is three defaulted props, and desktop's DOM is unchanged.** `pages/ScriptUpload.jsx` gained `Workspace` (defaulting to `ScriptUploadWorkspace`), `nativeChrome` and `hostClassName`. `nativeChrome` changes exactly four things, and each is *replaced* rather than dropped: the three early returns — access refused, an `?edit=` load still resolving, the post-submit screen — become view-model flags, and the portal-rendered Tailwind cropper with its hand-rolled focus trap is not rendered because the native chrome mounts the shared one. The early returns are **gated, not removed**, which is asserted by reading the file rather than by trusting a comment. The toast needs no flag at all: `ScriptUploadWorkspace` is what draws it, so replacing the workspace replaces the toast, and `useUploadToasts` forwards `toastMessage` to the app-wide layer so nothing is swallowed. A DEV guard shouts if `nativeChrome` arrives paired with the desktop workspace, because that pairing removes four surfaces on a promise the desktop workspace does not keep.

**Ten panels, one registry, keyed by the shared resolver.** `panels/UploadPanels.jsx` is keyed by `getUploadScreenKey(step, detailStep)` — the same function `validateUploadScreen` and `focusValidationIssue` use — so neither platform can disagree about what step 2, panel 4 is. A test asserts the registry covers `UPLOAD_SCREEN_ORDER` exactly.

**The one real improvement over the desktop page, and it is not cosmetic.** `.su-save-state` is `display: none` at ≤720px, so on every phone the desktop page hides the only thing that says whether the work is safe — on a flow that, unlike `/create-project`, has no autosave at all. Here it is in the app bar with `role="status"`, at every width, and the sweep measured it there.

**Three things were shared rather than ported a second time (D12).** `MediaSlot`, `CoverCropDialog` and `PreviewDialog` moved into `mobile/components/media/` under a new registered `ckm-media` prefix, with 228 lines of rules lifted out of `Wizard.css`. `CoverCropDialog` was context-bound and is now prop-driven, with a four-line create-project adapter; the aspect, the blob work, the quality step-down and the 5 MB ceiling all stay in `useThumbnailEditor` and `lib/imageCrop`, so a cover cropped on either route is byte-identical.

**Progress is honest on both platforms now (D14).** `uploadMediaForScript` reports real bytes through axios's `onUploadProgress` — no new dependency, since `services/api.js` already exports an axios instance — and the desktop media panel renders it too, so the shared state is not dead there. Where the number cannot be known it is not invented: `event.total` absent leaves the bar where it is, and step 1's extraction is an indeterminate busy state rather than desktop's 10%-per-200ms fiction (DEF-9).

---

##### Verification

**110 new tests**; mobile suite **647 in 44 files** (was 537/39); full suite **1230/1232** — the two documented pre-existing `AppShell.render.test.jsx` failures, re-confirmed by stashing every change and watching the identical two fail *by name*. Lint clean on `src/mobile`, `src/pages/ScriptUpload.jsx` and `src/App.jsx`; `ScriptUploadWorkspace.jsx` verified unchanged at its 4 pre-existing problems by linting the `HEAD` copy of the file. Build + **53-route prerender pass**.

**Five-width CDP sweep (320/360/390/430/768) across 22 states — 110 measurements.** Every width, every state: **0** targets under 44×44 (`::after` hit regions measured through `getComputedStyle`, not assumed), **0** text under 11px, **0** unnamed controls, **0** contrast failures, **0** genuine overflow, no horizontal scroll on page or surface, frame 320→520px, all ten panels drawn, shell reporting `flow|bottomNav`, the footer never overlapping the body, and the save indicator present at every width.

**The sweep earned its keep, and the finding was in code that shipped last session.** With a file attached, `MediaSlot` drops the `<label for>` that names its input — the card shows the asset and a Replace button that clicks the input from JS — so both file inputs were silent focus stops on `/create-project` as well as here. The third session's sweep *did* cover the media panel and *did* pass, because its fixture had `thumbnailFile: null`. A sweep measures the state it rendered. Named, re-measured to zero.

**Real dispatched keys, not reasoning.** 70 Tabs down step 5 — the longest panel, carrying the price, nine term controls, the agreement and two acknowledgements — reached the sticky footer at stop **32** with **0** unringed and **0** unnamed stops, the agreement region among them. 20 forward Tabs and 8 Shift+Tabs inside the exit sheet escaped it **0** times. Six real PageDowns scrolled the agreement from 0 to 810px while the surface behind it stayed at 1819px, which *measures* `overscroll-behavior: contain` rather than assuming it. Escape closed the overflow sheet, cleared `inert`, and returned focus to the exact control that opened it. That walk produced a second finding — a `<video controls>` in an attached media slot is a focus stop with no accessible name — which was named rather than filed.

**The key probe's own first result was wrong, and running it down changed the probe.** It reported 14 unnamed inputs on step 5 while the sweep reported zero on the same markup. The probe read only `aria-label` and text content and never resolved `<label for>`, which is how every `ckm-field` control is named; the sweep had always resolved it. Fixed, then 0 — the audit's bug, not the markup's.

**Named as unmeasured rather than implied.** DEF-7 is recorded, not fixed: this flow has no autosave and no unsaved-change guard on either platform, and the mobile exit confirmation is a mitigation. `pdf.js` at 320px and the keyboard inset still need a real device.

---

#### 2026-08-09 (third session) — Claude (Claude Code) — Phase 3 bullet 2 COMPLETE: mode B, the chrome seam, and the route promotion

**Requested continuation:** "continue in native app implemenation".

**Starting checkpoint verified before claiming (§20.4).** Branch `feat/mobile-role-aware-chrome` at `122dba7`; the working tree's only pending changes were the user's own `client/public/sitemap.xml` edit and six untracked design files, all preserved untouched. The previous entry's claims were checked rather than trusted: `mobileRouteManifest.js` did still hold `/create-project` and `/create-project/:draftId` as `DESKTOP_MIGRATION_FALLBACK`, `mobile/screens/create/` did hold only the editor's four files, and `pages/CreateProject/index.jsx` did still hardcode `<CreateProjectShell>`.

---

##### The seam, and why it is three props rather than a fork

`pages/CreateProject/index.jsx` is 2,500 lines of state — autosave, the draft signature, the 64 KiB-aware keepalive exit save, the working-draft snapshot, `chooseDraftRecovery`, collaborator locks, plan gates, per-panel validation, `handlePublish` — and every line of it is platform-neutral. What is not neutral is `CreateProjectShell`, a three-pane desktop workspace whose footer carries word counts, zoom buttons and a prose toggle that mean nothing on four of its five steps.

So the chrome is injected: `Shell`, `nativeChrome`, `hostClassName`, all defaulted so App.jsx's `<CreateProject />` renders exactly what it rendered before.

- **`nativeChrome` suppresses exactly six surfaces**, and each is *replaced*, not dropped: the exit confirmation (→ `ExitFlow`), the drafts drawer (→ `DraftsSheet`), the toast (→ the app-wide `ToastProvider`, bridged by `useCreateProjectToasts`), the under-review acknowledgement (→ `SubmittedDialog`), the thumbnail cropper (→ `CoverCropDialog`) and the title-page configurator (→ `TitlePageDialog`). Nothing else is conditional: the grammar undo bar and focus mode have no mobile caller and can never open there, and suppressing them would be dead code pretending to be a decision. `VersionHistoryModal` is deliberately left alone for the same reason.
- **The step body is `null` under `nativeChrome`, not ignored JSX.** With `null`, a chrome that forgets to render its own bodies renders nothing and the omission is obvious. With an ignored child, it silently keeps working until someone edits a desktop step and wonders why mobile did not change.
- **`hostClassName` is not cosmetic.** `.ckm-shell` is `height: 100%`, the orchestrator's outermost div sits between it and `.ckm-root`, and at the desktop default that div has no height of its own — the entire screen collapses to the height of its content. The mobile class stays on the mobile side of the seam.
- **A DEV guard shouts** if `nativeChrome` arrives with the desktop shell. That pairing removes six surfaces on the promise that something else renders them; paired wrongly the promise is false and the failure is silent — a writer taps Exit and nothing happens.

`saveTitlePage` was hoisted out of the desktop modal's JSX into the context for one reason worth stating: an all-blank set of title-page fields must become `null` (no title page), not an empty one, and two chromes deciding that separately is how one of them starts exporting a blank sheet.

---

##### What mode B is

`Wizard.jsx` + `wizardChrome.js` + `Wizard.css` (`ckm-create-project`, registered), ten panels in `panels/`, six overlays in `overlays/`.

- **Three navigators became one.** Desktop draws a 158px step rail, a second horizontal stepper for narrow screens, and a footer pager. On a phone the position lives in the app bar — "Step 3 of 5 · Classify", and inside Details "· Basics" too, because a writer three panels deep who only sees "Step 2 of 5" has no way to tell how much of step 2 is left. Nothing that told the writer where they are was dropped; three things saying the same thing were collapsed into one.
- **The footer is a shell slot, not a fixed bar.** `flow` forbids bottom chrome, so `WIZARD_SHELL_SLOTS` turns exactly one slot back on — the second use of the mechanism the editor added, and one slot rather than two because `flow` already allows the app bar and overriding that would be a no-op dressed as a decision. The point is displacement: a `position: fixed` footer of our own would sit on top of the last field of every panel, which on a phone is usually the field being typed into.
- **Exit and Back are different controls now.** The §4.3 wireframe listed "Back" in both the app bar and the footer. Two controls in one screen that both say Back and do different things is an ambiguity, so the bar's control is Exit (the same action the browser's back gesture triggers through the orchestrator's popstate guard) and the footer's Back walks the flow. Recorded here as a correction to the wireframe.
- **The panels are ports of content, not of markup.** Every hand-rolled pill row became `ChipSelect` — a new form-family member with `role="group"` + `aria-pressed`, matching `TagSelect`'s semantics exactly so the two platforms describe the same control the same way. Two panels changed shape because their desktop shape was wrong at 320px rather than merely large: the writer-credit row (six controls in a line) became a card per credit with named reorder actions, and the Access panel's inline preview — up to eight CodeMirror instances inside a scrolling form — became a summoned full-screen dialog.
- **The one deliberate behavioural fix.** Desktop puts the reason a Submit is refused in a `title` attribute. There is no hover on a phone, so a mobile writer met a greyed-out "Submit for approval" with no way at all to find out what was missing. `describeWizardFooter` returns a `blockedReason` string; it renders as visible text above the footer and is referenced by `aria-describedby`. Its four branches — no publishing access, the plan limit, unaccepted terms, unconfirmed ownership — are pinned by test, including the order they resolve in, because "you cannot publish this at all" and "tick this box" are different answers and offering the tickable one first sends the writer to do something that will not help.

---

##### The promotion, and the one thing that is not promoted with it

`/create-project` and `/create-project/:draftId` are `SCREEN`. Both patterns mount one component: the orchestrator reads `:draftId` through `useParams`, so there is nothing for the route to hand over.

**Competition mode is excluded by declaration.** `?ctx=competition` replaces the entire publish wizard with `CompetitionBar` + `CompetitionPitch` and a one-way Submit, and neither is ported. Shipping the promotion without an exclusion would have left a competition writer holding the mobile editor with **no way to submit their entry at all** — worse than the desktop page, not merely different from it. So `mobileRoutePolicy` gained a `search` input and the manifest gained `excludeQuery`, which makes the limitation greppable from the file that is supposed to answer "what does mobile cover?" rather than hidden in a component.

**`/__mobile-editor` is retired**, as the checkpoint asked — but the *reason a harness exists* did not retire with the URL. The live route authenticates, fetches drafts, autosaves and opens a collaboration socket, so it renders a different screen on every run. `/__mobile-create` mounts both modes over a deterministic fixture and is navigable by URL (`?step=`, `?panel=`, `?state=`) rather than needing to be clicked into a state.

---

##### Verification

**115 new tests.** Mobile suite **537 in 39 files** (was 422/33). Full suite **1120/1122** — the two documented pre-existing `AppShell.render.test.jsx` failures, re-confirmed by stashing every change and watching the identical two fail by name. Lint clean on `src/mobile`; `src/pages/CreateProject` unchanged at its 12 pre-existing problems, verified by the same stash. Build + **53-route prerender pass**; `CreateProjectChrome` code-splits into its own 48.8 kB chunk.

**Five-width CDP sweep at 320/360/390/430/768 across 17 states — 85 measurements**, against the live dev server rather than a static harness, so the real component with the real CSS and the real CodeMirror was measured (asserted at all five widths for the editor states). At every width in every state: **0** targets under 44×44 (`::after` hit regions measured through `getComputedStyle`), **0** text under 11px, **0** unnamed controls, **0** contrast failures, **0** genuine overflow, no horizontal scroll on page or surface, frame 320→520px, `data-shell-mode`/`data-shell-slots` reporting `immersive|appBar bottomNav` and `flow|bottomNav`, and the chrome never overlapping the body.

**The sweep found two real defects, and neither was in this session's own layout.**

1. **`ckm-field__flag--soft` and `ckm-field__meta` measured 3.56:1** — `--ckm-muted` on `--ckm-bg`, at 11–12px, against WCAG 1.4.3's 4.5:1. That is a live failure in the **Phase 1** form family, shipped since Phase 1 and never caught because no earlier sweep rendered an "Optional" flag or a character counter. Fixed to `--ckm-text-3` at **5.62:1** and re-measured to zero. The token is still right for the graphical objects it was chosen for (3:1, SC 1.4.11); it was never safe for text. Every other text caller of `--ckm-muted` is now a recorded follow-up.
2. **`react-easy-crop`'s crop area is `tabIndex=0` with arrow-key handlers and ships unnamed** — a keyboard or switch user reaches a focus stop that announces nothing. Named through the library's supported `cropperProps` spread.

**Two of the sweep's own findings were the audit's bugs, and running them down changed the checks rather than the CSS.** `.ckm` — the `position: fixed; inset: 0` surface that *centres* the 520px frame — was flagged for overflowing the frame it contains; the check now skips the frame's own ancestors. And two inline links inside sentences were flagged as undersized targets; WCAG 2.5.8's inline exception covers text "constrained by the line-height of non-target text" explicitly, so the check now encodes the exception instead of the links being waved through.

**Real dispatched keys.** 60 Tabs down the longest panel (step 5, 28 distinct stops) reached the sticky footer at stop 32 with **0** unringed stops, the scrollable agreement region among them — that region is `tabIndex={0}` with a role and a name precisely because a 4,000-word scroll container that cannot be focused cannot be scrolled by a keyboard at all (WCAG 2.1.1). Inside the exit sheet, 20 forward Tabs and 8 Shift+Tabs escaped **0** times. Escape closed the overflow sheet, cleared `inert`, and returned focus to the exact control that opened it.

**A third finding was the keyboard probe's bug**, not the CSS's: it first reported 43 of 60 stops unringed. `Chip.css` draws the focus ring on the *pill wrapper* and sets `outline: none` on the inner button — it says so in a comment — so reading only the focused element was measuring the wrong box. Walking up to the nearest ringed ancestor gave 0.

**Not verified here, and named rather than implied:** the keyboard inset (headless Chrome has no virtual keyboard) and DEF-5 both still need a real Android device. The cropper's pinch gesture is the library's and is untested on touch hardware for the same reason.

---

#### 2026-08-09 (later) — Claude (Claude Code) — Phase 3, the screenplay editor surface (mode A)

**Requested continuation:** "continue in native app implemention".

**Starting checkpoint verified before claiming (§20.4).** Branch `feat/mobile-role-aware-chrome` at `e522298`; the working tree's only pending changes are the user's own `client/public/sitemap.xml` edit and six untracked design files, all preserved untouched. The previous entry's claims were checked rather than trusted: `mobileRouteManifest.js` did still hold `/create-project`, `/create-project/:draftId` and `/upload` as `DESKTOP_MIGRATION_FALLBACK`, `MobileShell.jsx` had no slot-override mechanism at all, and `ckm-editor` was allocated in §7.2 with no code-side entry.

---

##### The scope decision, made before any code, and why the route did NOT get promoted

The checkpoint's `next_action` asks for "the mobile `/create-project` and `/create-project/:draftId` screens". That route carries **two** surfaces — the editor (mode A) and the publish wizard, steps 2–5 (mode B) — and mode B is `Step2Details` (693 lines), `Step3Classify`, `Step4FilmInfo` and `Step5Publish` (243 lines): roughly 1,100 lines of desktop form JSX to port, on top of the editor.

Promoting the route needs **both**, because there is no route-level fallback below a route. A promoted `/create-project` with an unported wizard would render desktop Tailwind form markup inside the mobile frame the instant a writer taps "Continue to details" — which is exactly the thing §2.2 names: *"Desktop markup must not become the mobile page through CSS hiding or wholesale responsive reflow."*

So the work was split at the honest seam: **mode A is built, verified and documented; the manifest entry stays `DESKTOP_MIGRATION_FALLBACK`; mode B and the promotion land together.** Nothing regressed for a mobile writer — `/create-project` behaves today exactly as it did yesterday — and the next session inherits a finished editor rather than two half-finished surfaces.

The cost of that choice is that the editor has no production URL, which would normally make it unverifiable. `/__mobile-editor` is the answer to that, not a decoration: see Verification.

---

##### D2 needed a mechanism that did not exist, and D2 was slightly wrong

`mobileShellModes.js` has said since Phase 0 that "a screen may override an individual slot on `<MobileShell>`… so the override is always a visible decision". Nothing implemented it. `MobileShell` read `getShellModeConfig(mode)` and that was the end of it.

Added: `resolveShellSlots(mode, overrides)`, `changedShellSlots(mode, overrides)`, `assertShellSlotOverride(overrides, screenId)` and a closed `MOBILE_SHELL_SLOTS` list, with a `slots` prop on `MobileShell`. Four properties are pinned by test rather than by comment:

- an override can only change **slots**, never a mode's `intent` — the sentence that says what the mode is for is not a screen's to rewrite;
- non-booleans and unknown keys are ignored, and in development an unknown key **logs loudly**, because silently ignoring `appbar` (lower-case b) leaves a screen with chrome it believes it disabled;
- the shell publishes `data-shell-slots="appBar bottomNav"` — only the slots that actually **differ** from the mode — so "why does an immersive screen have bars?" is answerable from the DOM, exactly as `data-shell-mode` answers "which mode is this?";
- `MOBILE_SHELL_SLOTS` is asserted to cover every boolean key a mode config declares, so a fifth slot added to the contract cannot quietly become un-overridable.

**And a correction to D2 as written.** D2 says the manifest entry stays `flow` and step 1 "overrides the app-bar and bottom-nav slots to become immersive". Under `flow` the app bar is *already* allowed and the bottom nav *already* forbidden — that override would have been a no-op. The honest expression is the reverse: mode `immersive`, with **both** slots forced back on, because immersive's default is no chrome at all and the editor has two bars it must keep. `EDITOR_SHELL_MODE` and `EDITOR_SHELL_SLOTS` are exported together for that reason, and the correction is recorded in `editorChrome.js` where the next reader of D2 will hit it.

Why the bars belong in the shell's slots rather than being hand-rolled: the slots are `flex: none` siblings of the one scroll surface, so the docked bar **displaces** the script instead of covering it. A `position: fixed` bar of our own would sit on top of the line being typed — the single failure this surface exists to avoid. The sweep measures it (`dockOverlapsScript: false` at every width, in every state).

---

##### What was built

`mobile/screens/create/` — `editorChrome.js` (the chrome as data), `EditorDock.jsx`, `Editor.jsx`, `Editor.css` (`ckm-editor`), and two test files.

- **D1 — the engine is not forked.** `Editor.jsx` mounts `components/screenplay/ScreenplayEditor` with the same props the desktop `Step1Write` passes, and drives it through the same 10-method `apiRef`. It is chrome over shared state: it reads `CreateProjectContext`, the same context `CreateProjectShell` reads, so autosave, the draft signature, the keepalive exit save, the working-draft snapshot and `chooseDraftRecovery` are all the code that shipped this morning. **That is why "save/resume" needed no new mobile persistence** — only a surface that shows the writer what the shared code decided.
- **D3/D4 — one docked bar.** `EditorDock` is a single row: an Elements/Format switch, then a horizontally scrolling track. One bar, not two, per the approved wireframe's frame B — two rows cost ~110px of the ~260px of script that survives the keyboard. The rarer elements go to a `ckm-action-sheet` rather than crowding the row. The Format controls are ordinary buttons: D4's point is that the desktop pill's `onMouseDown` + `preventDefault()` has nothing to preserve on touch, so the editor holds the range across the blur and the API applies to whatever `getSelection()` reports.
- **The switch is `aria-pressed`, not an APG tablist.** The tablist contract brings roving tabindex and arrow-key navigation — a desktop keyboard model that replaces behaviour a phone user already has (Tab moves on) with behaviour they have to discover. Same argument `ActionSheet` made in Phase 1.
- **Case buttons carry no `aria-pressed`.** "UPPERCASE" transforms text; there is no state of *being* uppercase, and `aria-pressed="false"` would tell a screen reader there is. Bold/Italic/Underline/Centre do carry it, from the editor's reported emphasis state.
- **D5 — the overflow.** An action sheet, and **items that are not built are absent, never present-and-inert**: a menu entry that does nothing is the placeholder dead end §2.8 forbids. Built: Import (behind the same `enforceGoldPlan` gate desktop uses), Export (handing off to a second sheet of four formats), the prose/screenplay toggle, and Continue to details. Absent by capability rather than by omission: no publish step for a competition entry (it is written, submitted and judged, never published) and none for a content-only collaborator.
- **Unsaved-change protection is a sheet, not a two-button confirm.** Three outcomes, one of which destroys work: "Discard" and "Keep editing" must not be adjacent same-shaped buttons. The destructive item does not act — it opens a `ckm-confirm` `alertdialog` focused on Cancel, which is `ActionSheet`'s documented contract for exactly this case.
- **Notices live in the fixed chrome**, under the bar rather than in the scroll body. A plan limit or a failed save that scrolls out of sight is a message the writer never sees again. A test asserts they are in the app-bar slot and *not* in the scroll surface.

`buildEditorOverflowItems` returns **descriptors only** — which items exist and what each says — and the screen attaches handlers by `id`. That split arrived as a lint fix (`react-hooks/refs` flagged a ref reaching a function called during render) and stayed because it is the better shape: the capability rules are now a pure function a test can read without stubbing four handlers.

---

##### DEF-6 — a keyboard trap, found by dispatched keys, fixed in shared code

The Tab-traversal leg of the sweep found something a unit suite and a screenshot would both have passed:

**`components/screenplay/screenplayMode.js:376` binds `Tab` to element cycling with no escape.** Ten real dispatched Tab keys against the real editor never once left `.cm-content` — and each one *mutated the document*, prefixing the current line (`@`, `(`, `>`, `.`) as it cycled the element type. A keyboard, switch or screen-reader user who enters the script cannot leave it. That is **WCAG 2.1.2 (No Keyboard Trap), a live failure on both platforms**, and on mobile it is worse than on desktop: the dock follows the editor in DOM order, so the entire toolbar was unreachable.

Fixed at the source, in shared code: `Escape` blurs the editor's `contentDOM`. That is CodeMirror's documented answer for editors that capture Tab, and it fixes desktop in the same change. `blur()` rather than a focus-move, because where focus goes next is the platform's decision; after the blur the next Tab resumes the document's own order.

Verified with real keys, not reasoning: after `Escape`, six Tabs walked **Elements → Format → Scene → Action → Character → Paren.**, each with a `rgb(255, 255, 255) 2px` focus ring. Before the fix, the same six Tabs never left the editor.

---

##### Verification

**43 new tests** in `screens/create/` (15 dock, 28 editor) plus **11** on the shell-slot contract. **Mobile suite 422 tests in 33 files**, was 410 in 31 (that earlier figure counted `pages/CreateProject/lib`). `src/components/screenplay` + `src/mobile` together: **519 passing**. Full suite **1005/1007** — the two failures are the documented pre-existing `AppShell.render.test.jsx` ones, by name. Lint clean across `src/mobile`, `screenplayMode.js` and `App.jsx`.

**Five-width CDP sweep at 320/360/390/430/768, across six states** (default, recovery, error, exit-confirm, read-only, prose) — 30 measurements. The Chrome extension was again unavailable, so the sweep drove headless Chrome through the DevTools Protocol with Node 22's global `WebSocket`; no browser-automation dependency was added. Unlike the previous session's static harness, this ran against the **live dev server**, so the thing measured was the real component with the real CSS and the **real CodeMirror** (`editorMounted: true` asserted at every screenplay width).

At every width, in every state: **0** targets under 44×44 (`::after` hit regions measured through `getComputedStyle(el, "::after")`, not assumed — the 36px chips and tabs pass on their grown region), **0** text under 11px, **0** unnamed controls, **0** contrast failures, no horizontal scroll on the page or the scroll surface, the frame 320 → 520px, `data-shell-slots="appBar bottomNav"`, and the dock never overlapping the script.

**The sweep's first result was wrong, and running it down changed the check.** It reported 8 elements past the frame at every width — the element chips. They are inside `.ckm-editor__dock-track`, which is `overflow-x: auto`: content extending past the frame is *what makes it a scroller*. Flagging it was the audit's bug, not the CSS's. The check now attributes overflow to the nearest scroll container and asserts **the track itself** stays inside the frame, which is the property that actually matters; genuine overflow then measured **0** everywhere, with 11–17 elements correctly classified as scroller content.

**Not verified here, and named rather than implied:**

- **The keyboard inset.** `useKeyboardInset` pads the dock by what the virtual keyboard covers, and headless Chrome has no virtual keyboard. The mechanism is the one `Sheet` has used since Phase 1, but "the dock rides the keyboard" is a real-device claim and is not being made on this evidence.
- **DEF-5 is still open** and is now more pointed: the first tap of a brand-new script lands on a placeholder-only CodeMirror document, and D4's format buttons deliberately blur the editor. Whether the Android keyboard survives that blur is the same class of question. Both need a real device before the editor is called complete.
- Prose (book) mode renders in the harness with no TipTap instance, so its editor body is empty there. The branch, and the dock's absence in it, are covered by test.

---

##### What this session did NOT do

No mode B. No route promotion. No change to `pages/CreateProject/index.jsx` — the chrome seam that will let the orchestrator render mobile chrome (a `Shell`-style injection point, plus suppressing the desktop exit-confirm and drafts drawer when a native chrome owns them) is designed but deliberately unwritten, because writing it without the wizard it has to serve would be guessing at its shape. No sheets for Navigator, Corkboard, Comments, People, Reports, Outline notes, Title page or Version history — those are §11 bullet 4 and are listed in `editorChrome.js` as the items that get appended.

#### 2026-08-09 — Claude (Claude Code) — Phase 3 bullet 2, first half (save/resume core, `/new-project`, editor wireframe approved)

**Requested continuation:** "continue in native app implementaiotn".

**Starting checkpoint verified before claiming (§20.4).** `git status` clean of mobile changes (the pending work is the user's own `client/public/sitemap.xml` edit, six untracked design files, and the previous session's uncommitted `NATIVE_APP_IMPLEMENTATION.md` — all preserved untouched); branch `feat/mobile-role-aware-chrome` at `aef9f11`. The previous entry's claims were checked rather than trusted: `mobileRouteManifest.js` did still hold all five creation routes as `DESKTOP_MIGRATION_FALLBACK`, and `index.jsx:958-959` did still return early on `draftId`.

**Work item claimed:** §11 Phase 3 bullet 2. **Delivered in full: the save/resume core and `/new-project`. Not delivered: the mobile `/create-project` screens**, which the newly-approved wireframe unblocks for the next session. The bullet is marked `[~]`, not `[x]`.

---

##### Why the save/resume core came before any screen

Bullet 2 names three things — new/draft routes, save/resume, unsaved-change protection — and two of the three are **not mobile problems**. DEF-1 and DEF-2 are defects in shared code that ship to desktop today. Building a mobile editor on top of a save path that silently discards long scripts would have meant building the mobile experience of a bug.

So the order was: fix the persistence, then put a screen on it.

##### DEF-1 — the exit save now refuses rather than pretends

`queueKeepaliveDraftSave` posted the draft with `keepalive: true`. MDN caps those bodies at 64 KiB, the rejection arrives *after* `fetch()` returns, `.catch(() => {})` swallowed it, and `lastDraftSignatureRef` was advanced anyway — so the client believed it had saved, and `beforeunload` warned the writer their changes might be lost and then failed to save them.

`lib/keepaliveSave.js` drops the derived `scriptPreviewPageTexts` (the server only writes fields that are not `undefined`, so omitting it is safe by the server's own contract), **measures** the encoded body, and returns no body at all when it will not fit. The caller then does not advance the signature, and `beforeunload` still warns — which is now true rather than decorative.

The measurement is computed by the suite rather than quoted. Against a **1,219-byte realistic page**, the untrimmed payload crosses 64 KiB at **page 13**; trimmed, at **page 17**; a 100-page feature encodes to **510,233 bytes**, 7.8× the cap. The test asserts the crossing point falls in the 9–16 range the spike recorded, and a separate test asserts the page fixture itself stays between 1,200 and 2,000 bytes — otherwise every number above is decoration.

**This is a mitigation, not a cure**, and it is recorded as such: a real fix needs a server-side compact exit-save, because the payload carries the same Fountain string three times (`textContent`, `fountainContent`, `baseContent`) and the server writes each independently.

##### DEF-2 — resumed drafts get a snapshot, and it records *where* the writer was

`lib/workingDraft.js` owns the storage key now (`LOCAL_WORKING_DRAFT_KEY` was deleted from `constants.js` — two copies of a storage key is how a safety net stops matching what it catches). Per-draft keys, with the historical bare key kept for brand-new scripts so nobody mid-script loses a snapshot to a rename. `pruneWorkingDrafts` exists because per-draft keys multiply.

Two things beyond the literal defect:

- **The snapshot records `step` AND `detailsStep`.** D7 asks resume to land on the panel the writer left, and Details is a mini-wizard of up to six sub-panels.
- **Restoring is a decision, not a reflex.** `chooseDraftRecovery` is pure and separately tested. It compares the snapshot's `baseUpdatedAt` — the server version *this session started from* — against the server's current `updatedAt`. Same version → the snapshot is strictly ahead, restore it. Moved on → a co-writer or another device saved in between, so it **asks** (a notice in the shell's banner slot with *Restore my changes* / *Keep the saved version*) rather than overwriting someone's work. Deliberately compares identities, not timestamps: a device with a wrong clock still decides correctly, and there is a test for exactly that.

##### A bug I introduced and caught before it shipped

Removing the `draftId` early-return from the snapshot effect had a consequence I did not anticipate: on a resumed draft the effect now ran against the **empty initial state** — before `loadDraft` had returned — hit its "no content" branch, and called `clearLocalWorkingDraft()`, destroying the snapshot microseconds before recovery could read it. The fix is a guard on the hydration flag, and it depends on effect declaration order (recovery is declared above the writer, so it flips the flag first on the commit where the editor appears). Both the guard and the ordering it relies on are commented in place, because the next person to reorder those effects needs to know.

##### One improvement the defects implied

A `loadDraft` that fails for any reason other than 403/404/pending-invite now offers the local snapshot instead of rendering an empty editor over a draft that has content. On a phone that failure is usually "offline", and an empty editor is how a writer concludes their work is gone.

---

##### `/new-project` — the cheapest screen in the phase, and an honest finding about it

Built to the §19.3 wireframe: `flow` shell, two stacked cards, three affordances each, whole card tappable with the link's accessible name kept to the title alone.

**`startFresh` is the reason this screen has tests at all.** `/create-project` reads `location.state.startFresh` as an entry mode — it resets the wizard and drops the local working draft. Lose it and "New project" silently reopens whatever the writer last wrote, which reads as data corruption rather than a missing field. It travels on a real `<Link state=…>` (a new `state` prop on `CardTitle`) rather than an `onClick` + `navigate`, so long-press and open-in-new-tab survive; a test asserts it arrives, and a second asserts it is *not* sent to `/upload`, which has no such mode.

**The finding: nothing links to `/new-project` on either platform.** The Create entry in `writerNav.js` points at `/create-project` with `fresh: true` — desktop and mobile alike — so the chooser is reachable only by typing the URL. It is deep-linkable and listed in `seo/seoRoutes.js`, so building it was right; pointing Create at it is a product decision that would change desktop too, and it is recorded as a follow-up rather than made unilaterally. Same shape as the `/offer-holds` finding, and handled the same way.

**One copy correction, deliberate.** Desktop's card claims "Auto-save every 30 seconds"; the editor debounces at 1s and runs an interval save every 3s. The mobile copy says what the code does. The desktop string was left alone — editing it is not a mobile session's call — and recorded.

---

##### Verification

**410 tests across the touched areas** (was 358): 42 new unit tests over the two lib modules, 10 over the screen. Full suite **951/953**, the same 2 pre-existing `AppShell.render.test.jsx` failures — re-confirmed by stashing every change in `client/src` and watching the identical 2 fail. Lint clean on every touched file; `index.jsx`'s 4 pre-existing problems verified byte-identical by the same stash. Build + 53-route prerender pass.

**Five-width CDP sweep** at 320/360/390/430/768 over the real component with the real stylesheets. The Chrome extension was not connected, so the sweep was driven through the DevTools Protocol directly — Chrome headless with `--remote-debugging-port`, Node 22's global `WebSocket` as the CDP client, and a harness generated by rendering the actual component with `renderToStaticMarkup` against the actual CSS files. No browser-automation dependency was added to the project.

Result at every width: 0 targets under 44×44 (`::after` hit regions measured through their positioned ancestor, not assumed), 0 text under 11px, 0 unnamed controls, 0 elements past the frame, no horizontal scroll on the page or the scroll surface, shell mode `flow` with no bottom nav, frame 320 → 520px.

**The sweep earned its keep twice.**

1. It caught a **real 2.69:1 contrast failure in this session's own CSS** — the card chevron on `--ckm-muted-2`. The chevron is `aria-hidden`, but it is the only visual signal that the card navigates, which makes it a graphical object under WCAG 1.4.11 with a 3:1 floor. Moved to `--ckm-muted`, measured at **3.56:1**, re-swept to **0 failures at every width**.
2. It reported an overflow at 320px that **was run down rather than waved away**. The harness was measuring the un-ligatured icon *text* (`chevron_right`, ~206px wide) before the webfont landed. Proven two ways: awaiting `document.fonts.ready` cleared it, and re-running the widths in reverse with no font wait moved the artifact off 320px entirely — so it followed the first navigation of the session, not the width. A layout defect would not move.

##### The two open user decisions — both answered

- **`/script/:id/pay` moves to Phase 4.** Approved. §11, §9.4 and the Phase 3 exit-gate note updated.
- **The low-fidelity editor wireframe is APPROVED**, so §4.3's gate is passed and the editor's CSS may be written. Four frames — editor at rest, typing with the docked bar riding the keyboard inset, a summoned Navigator sheet, and a flow step for contrast — published at <https://claude.ai/code/artifact/37cbc7e7-1b2d-4a41-8ac2-279af9fe333d>. What the approval settles: one route with two shell modes, a persistent docked Elements/Format row (one bar with a tab switch, not two), every desktop rail as a one-at-a-time bottom sheet, and the real `ScreenplayEditor` mounted rather than forked. What it explicitly does not settle: type, colour and spacing; the corkboard reorder replacement; and whether the first tap raises the Android keyboard on a placeholder-only document.

#### 2026-08-08 — Claude (Claude Code) — Phase 3 bullet 1 (research spike: creation, upload and screenplay editor)

**Requested continuation:** "continue in native app implementation".

**Starting checkpoint verified before claiming (§20.4).** `git status` clean of mobile changes (the only pending work is the user's own `client/public/sitemap.xml` edit and six untracked design files, all preserved untouched); branch `feat/mobile-role-aware-chrome` at `aef9f11`. The previous entry's claims were checked rather than trusted: `mobileRouteManifest.js:135-140` does still hold all five routes as `DESKTOP_MIGRATION_FALLBACK`, and `writerNav.js` does still carry `mobileKeys: ["dashboard", "projects", "messages"]`.

**Work item claimed:** §11 Phase 3 bullet 1 — the research spike. Deliberately a spike and not a page, because §4.2 question 1 has to be answered for the highest-risk surface in the plan before any JSX exists.

**Scope of the gate:** all five routes at once, because they share state — `/new-project`, `/create-project`, `/create-project/:draftId`, `/upload`, `/script/:id/pay`. Roughly 11,300 lines of desktop source plus the server controllers.

---

##### The headline finding: the editor does not need to be rebuilt

The plan has treated the screenplay editor as the largest unknown in the project. It is not, and the reason is that the screenplay feature is already factored the way §5.4 asks for.

`components/screenplay/` is 4,579 lines across 32 files, and **only two of them are desktop UI** — `ScreenplayEditor.jsx` (352) and `ScreenplayFocusMode.jsx` (761). Everything else is pure logic with no DOM opinion: `classify.js`, `screenplayMode.js`, `paginate.js`, `pages.js`, `sceneIdentity.js`, `sceneReorder.js`, `emphasisRender`, `fdx.js`, `commentAnchor.js`, `lineCommentLayer.js`, `lockLayer.js`, `screenplayReports.js`.

And `ScreenplayEditor.jsx` itself is **not desktop-shaped**. It is a controlled CodeMirror 6 host with a props interface (`value`, `onChange`, `readOnly`, `zoom`, `locks`, `comments`, `dark`) and an imperative `apiRef` exposing exactly the operations a toolbar needs — `setElementType`, `applyEmphasis`, `applyCase`, `applyCentered`, `scrollToLine`, `scrollToRange`, `getSelection`, `commentLine`, `focus`, `requestMeasure`. It renders one `<div>` and a comment composer. There is no rail, no ribbon, no fixed width, no hover dependency in the editor itself.

**Decision: mobile mounts the same `ScreenplayEditor` component and builds different chrome around it.** No second editor, no second Fountain parser, no second pagination. That collapses Phase 3's risk from "port a rich editor to touch" to "design a touch toolbar for an existing editor API" — which is the ordinary work this plan is built for.

---

##### §4.1 functional inventory

**`/new-project`** — `pages/NewProject.jsx`, 153 lines. A two-card chooser (Create / Upload). No data, no permissions beyond auth, no states. It navigates to `/create-project` with `location.state = { startFresh: true }`, which §5.2 explicitly requires mobile to preserve. The cheapest screen in the phase.

**`/create-project` and `/create-project/:draftId`** — one component, `pages/CreateProject/`, 2,386 lines in `index.jsx` plus 5 steps, 5 components, 8 hooks and 4 lib modules. A five-step wizard where **step 2 is itself a mini-wizard** of up to six sub-panels (`DETAILS_STEPS`, filtered by film vs. publishing track), each with its own validation gate.

| Concern | Detail |
|---|---|
| Entry modes | fresh (`state.startFresh` **or** `?fresh=1`), resumed draft (`:draftId`), local snapshot restore, competition mode (`?ctx=competition`) |
| Editors | two, switched by format: CodeMirror/Fountain for screenplay formats, TipTap for `book`. Both are mounted at once; screenplay text is mirrored into TipTap on a 400 ms debounce so word count and the AI tools keep reading `editor.getText()` |
| Save model | three concurrent paths — 1 s debounced autosave, 3 s interval autosave, and a `fetch(keepalive)` on `beforeunload`/`pagehide`/`visibilitychange`/unmount. Plus a 300 ms-debounced `localStorage` working-draft snapshot |
| Permissions | owner / `full_admin` / `editor` / `merger` / `commenter` / viewer, split into `canEditContent`, `canComment`, `hasFullAccess`, `hasPublishAccess`; plus `competitionLocked`, `editApprovalLocked`, `accessDenied`, `invitePending` |
| Gates | plan script limit (`GET /scripts/script-limit`, blocks *new* scripts only), `enforceGoldPlan()` on every Next and every AI tool |
| Overlays | exit-confirm, drafts drawer, title page modal, version history, thumbnail cropper (`react-easy-crop`), summary-PDF confirm, under-review modal, grammar undo bar, import spinner, toast — **ten**, several portalled with hand-picked z-indexes from 100 to 10000 |
| Collab | live presence, per-scene locks, scene comments with replies/resolve, three-way merge on save (`baseContent`) |
| Server contract | `POST /scripts/draft` → 402 plan limit, 409 competition-locked, 409 non-draft, 409 edit-under-review, 410 deleted, 404 for a non-collaborator |

**`/upload`** — `pages/ScriptUpload.jsx`, 2,389 lines, which renders exactly one thing: `<ScriptUploadWorkspace vm={workspaceVm} />` (834 lines). Same five phases, same six detail sub-steps. Also accepts **two query parameters the route ledger does not record** — `?draft=<id>` (convert an editor draft to an upload) and `?edit=<id>` (content-only revision of a published script, which posts to `/collab/:id/revisions` instead). PDF/DOCX text extraction via `POST /scripts/extract-pdf` (30 MB cap, 413 on overflow). Media caps read from the server, not guessed: **thumbnail 5 MB, pitch video 90 MB, trailer 250 MB** (`scriptController.js:6792-6804`).

**`/script/:id/pay`** — `pages/ScriptPaymentPage.jsx`, 659 lines. Loads the script, computes base + 5 % buyer commission, requires up to four separate acceptance checkboxes (platform terms, writer terms, custom writer terms, rights summary), then drives **Razorpay Checkout** — a third-party script injected from `checkout.razorpay.com` that opens its own overlay outside our DOM. Verify via `POST /scripts/purchase/verify-payment`; invoice and acceptance PDFs are authenticated blob downloads.

##### The orphan hunt — clean this time, but the scope is wrong in a different way

The last two sessions each found a declared-but-unbuilt surface, so every component in this family was checked for callers. **All five routes render something real and distinct; there is no orphan here.** One adjacent check did move something, though: `features/script-workbench/ScriptWorkbenchPage.jsx`, which `next_action` named as a Phase 3 source, is **not** an editor. Its only caller is `pages/ScriptDetail.jsx:1687` — it is the script *reading* surface. It belongs to **Phase 4** (project consumption) and is out of scope here.

**`/script/:id/pay` is in the wrong phase.** Phase 3's exit gate is entirely writer-facing — "a writer can create or upload, leave, resume, validate, collaborate where allowed, and finish a project". `/script/:id/pay` is a **buyer** surface: it is reached from a script detail page by an industry professional purchasing access, and a writer will never legitimately see it for their own script. Its neighbours — project detail, unlock, purchase — are all Phase 4 bullets. Building it here means building a buyer's checkout with none of the buyer's surrounding screens in place, and the money-adjacent states (already purchased, request not approved, payment released, gateway blocked) can only be honestly verified against those screens. **Recommendation: move `/script/:id/pay` to Phase 4.** Recorded as an open follow-up for the user rather than acted on unilaterally, since it changes a phase boundary the user approved.

---

##### §4.2 native interaction research

Primary sources and two comparable products, per §4.2. Interaction patterns and hierarchy captured; no styling copied.

- **CodeMirror 6 on mobile** — [codemirror.net](https://codemirror.net/) states it uses the platform's native selection and editing on phones, which is what makes the reuse decision above viable. The [changelog](https://codemirror.net/docs/changelog/) is a record of mobile-specific fixes (iOS dead-key composition getting stuck, iOS autocorrect-on-Enter splitting into two events, an Android virtual-keyboard regression from a composition workaround) — the surface is supported and actively maintained, not incidental.
- **A specific, testable risk** — [discuss.CodeMirror #3370](https://discuss.codemirror.net/t/clicking-anywhere-on-the-placeholder-text-on-chrome-android-wont-pop-up-the-virtual-keyboard/3370): on **Chrome Android**, tapping placeholder text rendered by the `placeholder` extension does not raise the virtual keyboard (Firefox Android and iOS Safari are unaffected). Our editor configures `cmPlaceholder("INT. LOCATION - DAY")`, and **a brand-new script is a placeholder-only document** — so this is precisely the first tap of the first session. Must be verified on a real Android device; the fallback is a focus-forcing tap target over the empty document.
- **`fetch` keepalive limit** — [MDN `RequestInit`](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit): *"The body size for `keepalive` requests is limited to 64 kibibytes."* This produced DEF-1 below.
- **Unload is unreliable on mobile** — [MDN `sendBeacon`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon) and [web.dev bfcache](https://web.dev/articles/bfcache): a backgrounded tab can be discarded without unload handlers running, the OS kills browser processes to reclaim memory, and people swipe apps closed. On a phone, "leaving the editor" is normally an app switch or an OS kill — **none of the three events the desktop save path listens for is dependable**. The durable snapshot, not the exit save, has to be the safety net.
- **Final Draft Go (iPhone)** — [App Store listing](https://apps.apple.com/ca/app/final-draft-go/id1614876398). The most useful precedent, because it draws an explicit line between tablet and phone: an **Elements bar on iPad, a Menu on iPhone**, plus a one-finger swipe anywhere on screen as an accelerator for cycling elements. It also keeps a **Scene Navigator** as a distinct jump surface on the phone, keeps accurate page-view pagination rather than reflowing to a mobile layout, keeps reports (cast/scene/location), and retains pinch-zoom.
- **WriterDuet** — [App Store listing](https://apps.apple.com/us/app/writerduet/id1237820649). Comparable because it is the collaborative one: "smart line types and one-touch icons" (a persistent quick-pick row rather than a dropdown), real-time collaboration across devices, a **left sidebar of widgets** rather than simultaneous rails, offline mode, and auto-snapshots with export from any point in history.

**The convergent pattern across both products:** the phone gets *one* content surface at a time, element choice is a persistent one-touch row plus an overflow menu, and every rail the desktop shows side-by-side becomes a summoned panel. That is exactly what §8.1's `immersive` shell plus this project's existing `ckm-bottom-sheet` describe.

**A caution, not a pattern to copy:** Final Draft Go's swipe-to-change-element would violate §14 ("no action available only by swipe") if shipped alone. Their own listing pairs it with the Menu. Ship the menu; a swipe accelerator is optional polish later.

---

##### §4.2 answers

1. **Screen, sheet, or full-screen editor?** Three different answers in one family, which is why the family had to be gated together. `/new-project` is a plain screen. `/upload` and `/create-project` steps 2–5 are a **multi-step flow**. `/create-project` step 1 is a **full-screen editor** that owns its chrome. The editor and the flow are the *same route*, so the shell mode must change with the mode — see D2 below.
2. **Top bar / body / sticky action / tabs / overflow.** Editor: a minimal app bar (back, title, save state, overflow), the document as the only scroll surface, a docked element/format bar above the keyboard, no bottom tabs. Flow: app bar with step position, one scrolling panel, a sticky Back/Next footer, no bottom tabs.
3. **What becomes progressive disclosure.** Every desktop rail: scene navigator, pages, corkboard, people/presence, comments, reports, outline notes, title page, version history, export — all bottom sheets. Step 2's six sub-panels stay six sequential panels (they already are).
4. **Back, cancellation, unsaved changes, keyboard, interrupted uploads.** The hardest quadrant, and the one that produced three of the five defects below. Covered by D6–D8.
5. **Pagination/virtualization.** The drafts list needs `ckm-load-more`. The document itself must **not** be virtualized by us — CodeMirror already viewport-renders, and second-guessing it would break selection and scroll restoration. §15 says measure first; the measurement is that CM6 already does it.
6. **Which actions need which states.** Save (idle/saving/saved/failed/blocked-by-plan/blocked-by-lock), file import (picking/extracting/failed/partial), media upload (queued/uploading/failed/retryable — the existing `pendingMediaRecovery` is the seed of this), publish (validating/submitting/under-review), and the destructive ones: discard draft, delete draft, competition submit (irreversible).
7. **Screen reader.** The element bar is a toolbar whose current element is `aria-pressed`; the element change must be announced, because a sighted user sees the line re-indent and a blind user gets nothing. Save state is a polite live region. Validation errors already carry `fieldId` in the upload flow and connect via `aria-describedby` — that mechanism is sound and mobile should keep it rather than invent one.

---

##### §4.3 text wireframes

```text
Route            /new-project
Audience         writer (auth required)
Shell            flow  (app bar + back; no bottom tabs)
App bar          Back · "New project"
Body             two ckm-card rows, stacked, full-width:
                   Write from scratch  → /create-project  (state: startFresh)
                   Upload a file       → /upload
                 each: title, one-line purpose, 3 bullet affordances, chevron
Primary action   none (the two cards are the action)
Overlays         none
States           none — static content, no fetch
Keyboard         n/a
Back             history if present, else /dashboard
Long text        cards wrap; no truncation
Transformation   desktop's 2-col grid + hover lift → 2 stacked rows, pressed state
```

```text
Route            /create-project   (mode A — the editor, step 1)
Audience         writer: owner, or collaborator with editor/full_admin
Shell            immersive  (screen-level override of the manifest's flow — see D2)
App bar          Back · title (inline-editable) · save state · overflow (⋯)
Body             ONE scroll surface: the real <ScreenplayEditor>, page-styled,
                 title-page sheet above it when configured
Docked bar       above the keyboard (useKeyboardInset):
                   row 1  Elements — horizontally scrolling chip row
                          (Scene · Action · Character · Dialogue · Parenthetical ·
                           Transition · More…)
                   row 2  Format   — B I U · AA aa · Center      (tab-switched)
Overflow (⋯)     Navigator · Corkboard · Comments (badge) · People · Reports ·
                 Outline notes · Title page · Version history ·
                 Import · Export · Zoom · Continue to details
Overlays         each of the above as a ckm-bottom-sheet; one at a time (§13)
States           read-only (commenter/viewer) · locked scene (another writer) ·
                 competition-locked · edit-under-review · plan limit ·
                 offline · saving/saved/save-failed · importing · access removed ·
                 invite pending
Keyboard         docked bar tracks the inset; the caret line stays visible
Back             dirty → one prompt: Keep editing / Save as draft / Discard
Long text        no clamping anywhere in the document
Transformation   3-pane IDE (left rail + center + right panel + ribbon)
                 → 1 surface + 1 docked bar + summoned sheets
```

```text
Route            /create-project   (mode B — details → publish, steps 2–5)
Shell            flow
App bar          Back · "Step N of 5 · <name>" · save state
Body             one panel at a time; step 2 walks its own sub-panels
Sticky footer    Back · Next  (Next = Publish on step 5), above the keyboard
Overlays         thumbnail cropper (full-screen dialog), summary-PDF confirm,
                 under-review acknowledgement, drafts sheet
States           per-panel validation error tied to its field · plan-limit gate ·
                 gold-plan gate · publishing vs film track · media upload
                 progress/failure/retry · submitting
Keyboard         footer lifts; the invalid field and its message stay visible
Back             step-wise; at step 2 walks its sub-panels first; at step 1 → editor
Transformation   desktop rail + footer pager → app-bar position + sticky footer
```

```text
Route            /upload   (+ ?draft=<id>, ?edit=<id>)
Shell            flow
App bar          Back · "Step N of 5 · <name>" · save state
Body             step 1 is the file picker: choose file → extracting → ready
                 (name, size, detected pages) → replace/remove
                 steps 2–5 mirror the create flow's panels
Sticky footer    Back · Save draft · Next
Overlays         cropper · media-retry · terms (full-screen, scrollable)
States           no file · picking · extracting · extraction empty (scanned PDF) ·
                 over 30 MB (413) · upload failed · partial media failure with
                 per-file retry · cellular-data warning on large media ·
                 content-only revision mode (?edit) · plan limit
Keyboard         as create flow
Back             dirty → prompt; a selected file is part of "dirty"
Transformation   drag-and-drop zone → a tap target (drag/drop does not exist on
                 touch); side tracker → app-bar position
```

```text
Route            /script/:id/pay        ** recommend moving to Phase 4 **
Audience         industry buyer (investor/producer/director), NOT the writer
Shell            flow
App bar          Back to project · "Complete purchase"
Body             script summary · price breakdown (base + 5% commission = total) ·
                 rights terms as an accordion · up to 4 acceptance checkboxes
Sticky footer    single primary: "Pay ₹X" — disabled until every box is ticked
Overlays         Razorpay Checkout — a THIRD-PARTY overlay we do not own
States           loading · not approved for payment · already purchased ·
                 free (₹0, no gateway) · gateway script blocked/failed to load ·
                 verifying · verified + invoice · verification failed after charge
Back             during checkout, back must not orphan a charged payment
Transformation   2-col summary/terms → one column, terms as accordion
```

No low-fidelity visual wireframe is proposed for `/new-project` or the flow steps — they are conventional. **The editor warrants one before high-fidelity styling** (§4.3), and that is where the user's approval should be sought.

---

##### Decisions

**D1 — Reuse the screenplay engine wholesale.** Mobile imports `ScreenplayEditor` and every pure module in `components/screenplay/`. No forked editor, parser, paginator or comment anchor. Consequence: a fix to Fountain classification lands on both platforms at once, which is the same argument §8.2 made for one navigation model.

**D2 — One route, two shell modes, declared not improvised.** `/create-project` is `flow` in the manifest; step 1 overrides the app-bar and bottom-nav slots on `<MobileShell>` to become `immersive`. `mobileShellModes.js` already documents per-slot override as the supported escape hatch ("a screen may override an individual slot… so the override is always a visible decision"). This is the intended mechanism, not a workaround — but it is the first use of it, so the override belongs in a named constant with a test, not inline JSX.

**D3 — Element switching is a persistent docked bar, not a dropdown.** Core elements as a horizontally scrolling `ckm-chip-row` docked above the keyboard via the existing `useKeyboardInset`; the rest in a `ckm-action-sheet`. Follows WriterDuet's one-touch row and Final Draft Go's iPhone Menu. No swipe-only affordance (§14).

**D4 — The desktop selection pill cannot be ported.** `Step1Write.jsx:103-110` applies formatting through `onMouseDown` + `preventDefault()` to keep the selection alive. On touch there is no `mousedown` before the selection settles, and preventing a synthesized mouse event does not preserve a native touch selection. Mobile uses a **persistent Format row** on the same docked bar, applying to whatever `apiRef.getSelection()` reports. No selection-preserving trickery.

**D5 — Every desktop rail becomes a bottom sheet, one at a time.** Navigator, corkboard, comments, people, reports, outline, title page, version history. §13's "opening one blocking overlay closes or suspends conflicting overlays" is already enforced by the Phase 1 overlay set.

**D19 (2026-08-11) — Version history is a Dialog whose diff is a second VIEW, and Restore asks by explaining rather than warning.** The desktop surface is already a full-screen modal, so D15 barely had to be applied — but it is a bare `fixed inset-0` div with no `role="dialog"`, no focus trap, no Escape and no labelled title, so `ckm-dialog` is a straight accessibility gain. Two things changed shape for touch. **(1) The diff is a separate view.** Desktop expands it inside the list row, in its own `max-h-64 overflow-auto` box — a scroller, inside a row, inside the modal's scroller, which is the nested-scroll trap §5.5 names and which on a phone would leave the row mostly diff. The list therefore pushes to a diff view and the dialog's title changes with it; because the rows no longer show diffs, each carries a one-line summary ("1 line added since") so "which of these six do I want?" does not require opening all six. **(2) Restore asks.** It replaces the writer's entire draft from a small button beside another small button. It IS recoverable — the server writes today's text as a snapshot first, which is why `restore` posts `content: currentText` — but desktop states that in an 11px line at the bottom of the modal, below the fold. The confirmation moves the fact to the moment it matters and reads as an explanation, not a warning: the safety net is what makes "yes" an easy, informed answer.

**D21 (2026-08-12) — Upload progress must be visible, partial failure must not resubmit the project, and retry is not resume.** `/create-project` begins media transfer only after `POST /scripts/upload` or the existing-script update succeeds. Its Media slots live on Details while Submit lives on Publish, so merely storing progress would leave the real bar behind an unmounted panel. The orchestrator now returns to Visual assets after the project record exists, holds Back/Next while transfer is active, and says explicitly that the project is saved. A partial failure retains `{ targetScriptId, failedTypes, title }`; the next primary action retries those media types directly and never re-posts `/scripts/upload`, closing a duplicate-project path. Every requested retry starts at 0%, because the present server accepts one complete multipart body and cannot resume bytes.

**Required resumable-media server contract (documented, not implemented).** Today `server/routes/scriptRoutes.js` receives trailer and pitch files through `multer.memoryStorage()` with 250 MB / 90 MB limits, and `uploadScriptTrailer` / `uploadScriptPitchVideo` pass the complete `req.file.buffer` to Cloudinary. There is no durable upload id, accepted-range query, idempotent part address, completion transaction or abort endpoint. A truthful resumable implementation therefore needs: (1) an authenticated create-session endpoint bound to script id, media type, owner, filename, MIME type, byte length and checksum, returning an opaque upload id, part size and expiry; (2) idempotent part uploads, preferably direct-to-cloud signed parts, identified by upload id + part number and verified by per-part checksum; (3) a status endpoint returning accepted part numbers/ranges so a reconnect can continue; (4) an atomic complete endpoint that verifies total length/checksum, finalizes the cloud asset and attaches it to the script once; (5) abort and expiry cleanup; and (6) streaming/direct transfer so the Node process never buffers 250 MB per request. The client may persist the opaque session metadata, but after a reload it must ask the writer to reselect and fingerprint the same local file unless a browser-granted persistent file handle is genuinely available. Client-only percentages or a retry beginning at 87% do not satisfy this contract.

**D22 (2026-08-13) — Cancellation is a batch state, large-file preflight is deterministic, and neither is resume.** Current Axios cancellation accepts an `AbortController.signal`, and one controller can cancel several requests; an AbortSignal is one-use, so every initial or retry attempt creates a fresh controller and aborts it on unmount. The controller owns the current concurrent cover/trailer/pitch batch: fulfilled files remain done, while unsettled requests become `cancelled`, never `failed`. A cancel-only result keeps the saved project and does not raise a red server error. Before either native flow creates or updates the base record, selected trailers and pitch videos at least 25 MiB produce one confirmation that lists exact filenames, sizes, and total bytes. This threshold is Ckript policy derived only from `File.size`; covers cannot reach it under their 5 MB ceiling, and `navigator.connection` is deliberately excluded because Network Information is not consistently available. Acknowledgement is keyed to the selected-file signature so replacement media warns again. Retry sends each unfinished whole file from 0%, exactly as D21 requires.

**D18 (2026-08-11) — People is a Dialog, and its invite form is a section rather than a second modal.** By D15's test it replaces the writer's whole task — inviting someone, changing what they may do, revoking access — which is administration, not writing, and is Dialog.jsx's own definition. There is a concrete second reason that decided the shape: desktop opens `InviteModal` ON TOP of the collaborators panel, and a modal over a bottom sheet would be two modal layers, which this plan already refused once (D17's inline delete confirmation). As a Dialog with the invite form inline, there is one layer and no nesting. The "who is in the document now" glance is included but is not the reason to open it — presence already appears where a writer needs it, as dots on the Navigator's rows and the corkboard's cards, beside the scene the person is in. **The data layer is shared, not ported:** `useCollaborators` was extracted out of `CollaboratorsPanel` and both platforms now use it, so there is one definition of the four endpoints and one answer to "is this person listed twice?" (§15 — reuse the service calls, not the DOM).

**D17 (2026-08-11) — The comment composer captures its range when the sheet OPENS, and refuses before the typing.** `handleAddComment(body, range)` falls back to `apiRef.getSelection()` when no range is passed, and on desktop that is right: the rail sits beside a selection the writer can still see. A mobile sheet is modal — the editor behind it is `inert` and blurred, and the selected text is not on screen at all. So the range is read at open time and passed explicitly (the handler has always accepted one), and the quoted text is shown in the composer, because otherwise the writer is annotating something invisible. The second half matters as much: with nothing selected, desktop lets a writer compose a paragraph and then rejects it with a `setError` banner at the TOP of a surface whose composer is at the bottom, behind the keyboard. Mobile refuses up front with the reason as visible text — the same rule the wizard footer follows. Third: delete asks first, inline rather than as a second modal layer, because a mis-tap on a phone is easy and the deletion is irreversible.

**D16 (2026-08-11) — The Navigator is a Sheet, and that is what makes D15 a rule rather than a preference for Dialogs.** Apply D15's test — what does the surface REPLACE? — and the corkboard and the navigator come out on opposite sides. The corkboard replaces the script page (it is the other half of a view switch); the navigator replaces nothing, it is a list you open, pick a destination from, and leave, with the script still the thing you are doing. That is `Sheet.jsx`'s own definition of a short contextual task, and the strip of scrim above a bottom sheet is the statement it makes. Measured rather than asserted: the sweep records `sheetCoversFrame` at every width and it is false at all twenty. Two things deliberately did not come across — desktop's Page ⇄ Cards toggle (Scene cards is its own overflow entry; two doors to one surface is two things to keep in sync) and the rail's persistent open state (a rail is furniture, a sheet is summoned).

**D15 (2026-08-11) — Scene cards is a Dialog, not a Sheet, and that is a correction to D5.** D5 says every desktop rail becomes a bottom sheet, and for the rails that is right. The corkboard is not a rail: on desktop it is `centerView === "cards"`, the other half of a VIEW SWITCH that replaces the script page rather than sitting beside it. Our own primitives already draw the line — `Sheet.jsx` is documented for "a short, contextual task ... the strip of scrim above it is what says the thing you were doing is still there", and a board of sixty index cards a writer restructures a screenplay in is not that; `Dialog.jsx` is documented for "a task that REPLACES the screen for its duration". It is not a route because the desktop view is component state with no URL (§5.2). The general rule for the rest of bullet 4: choose by what the surface REPLACES, not by how big it looks.

**D6 — Scene reorder needs a non-drag mechanism, and building it fixes desktop too.** See DEF-3. `moveScene(text, from, to)` is pure, so "Move up / Move down / Move to position…" is cheap and is the accessible primitive both platforms should have had.

**D7 — Resume, not exit-save, is the mobile contract.** The durable local snapshot becomes the primary safety net, extended to cover `:draftId` (DEF-2), and the flow must resume into the exact step and sub-panel the writer left. The keepalive exit-save stays as a best-effort extra, but nothing may be *designed* to depend on it.

**D8 — Build a real mobile `/upload` screen; do not adopt the responsive desktop page.** It is tempting — `ScriptUploadWorkspace.css` already has breakpoints at 900/720/520 px and a modern `su-*` BEM system with `role="switch"` and `aria-invalid`. But measured against this plan's floors, its phone layout fails in four specific ways (DEF-4), one of which hides the save-state indicator on exactly the devices most likely to lose work. The `vm` prop shape is the right seam to reuse; the CSS is not.

**D9 — Large media needs an explicit mobile policy.** A 250 MB trailer over cellular is not a desktop problem. Required: per-file progress, cancel, a deterministic warning before starting, and the existing `pendingMediaRecovery` state promoted from a toast into a real retry surface. **Resolved on the client by D21 + D22:** progress, visible recovery, cancellation, and size-only preflight are shared by both native creation routes. Connection inference was rejected because its browser API is not dependable; server-backed resume remains the separate D21 contract.

---

##### Defects and risks found by the gate

**DEF-1 — the exit save silently drops for any real screenplay.** `queueKeepaliveDraftSave` (`index.jsx:761`) posts `buildDraftPayload()` with `keepalive: true`. MDN: keepalive bodies are capped at 64 KiB. And the payload carries the script text **three times** — `textContent`, `fountainContent` and `baseContent` are the same Fountain string in screenplay mode — plus `scriptPreviewPageTexts`. Measured, not assumed: a JSON build of the real payload shape crosses 64 KiB at **48 pages** with a sparse 404-byte test page, and at **9–16 pages** at realistic page density (1,200–2,000 bytes/page). Beyond that the request is rejected, `.catch(() => {})` swallows it, and `lastDraftSignatureRef.current` is updated anyway — so the client believes it saved. `handleBeforeUnload` also warns the user their changes may be lost and then fails to save them. **Impact is bounded** — the 3 s interval autosave uses a normal `api.post` with no cap, so at most the last ~3 s of typing is lost — but it is a real silent failure on a data-loss path, on both platforms. Fix belongs with D7.

**DEF-2 — resumed drafts get no local snapshot.** `index.jsx:958-959` returns early when `draftId` is set, so the `localStorage` working draft is written **only for brand-new scripts**. A writer who opens an existing draft at `/create-project/:draftId` and has the tab killed has no local fallback — exactly the scenario mobile makes common.

**DEF-3 — scene reorder is drag-only, with no alternative.** `Corkboard.jsx` uses HTML5 `draggable` / `onDragStart` / `onDrop`. Touch devices do not fire those events, so the corkboard is inert on a phone. Its only other control (`:116`) opens a scene. There is **no keyboard or button path to reorder**, which is a live WCAG 2.1.1 failure on desktop today, not just a mobile gap. §14 requires an alternative to drag/reorder.

**DEF-4 — the desktop upload page's own phone breakpoints breach four of this plan's floors.** From `ScriptUploadWorkspace.css`: `.su-save-state { display: none }` at ≤720 px removes the save indicator on phones; `.su-detail-tabs button { font-size: 0 }` at ≤520 px reduces the sub-step tabs to bare numerals; `.su-action-bar button { min-width: 42px }` is under the 44 px product target; `.su-mobile-phases button` sets 10.5 px text with a 19×19 px indicator. Evidence for D8.

**DEF-5 (risk, unverified) — the first tap on a new script may not raise the Android keyboard.** See the CodeMirror thread above. Placeholder-only documents are exactly the new-script case. **Must be tested on a real Android device before the editor is called complete** — a jsdom suite and a desktop CDP sweep can both pass while this is broken.

---

##### What this spike did NOT do

No JSX, no CSS, no route manifest change, no prefix registered in `cssPrefixRegistry.js` — that registry's contract test fails on any prefix no stylesheet uses, so `ckm-create-project`, `ckm-upload-project` and `ckm-project-payment` (already allocated in §7.2) get their code-side entries when their stylesheets land. One prefix is newly proposed and added to §7.2: **`ckm-editor`**, for the full-screen editor chrome, which is a different surface from the create wizard and must not share `ckm-create-project`.

No test suite was run, because nothing executable changed.

Two items need the user before implementation proceeds — both recorded as open follow-ups: the `/script/:id/pay` phase move, and approval of a low-fidelity editor wireframe before high-fidelity styling (§4.3).

#### 2026-08-08 (later) — Claude (Claude Code) — Phase 2 bullet 6 (account/settings and global auth/session)

**Work item claimed:** §11 Phase 2 bullet 6, the last bullet before the phase exit gate.

##### The §4 gate: there is no settings page to port, on either platform

Checked before designing anything, because the `/ai-tools` finding earlier the same day is a standing warning that a phrase in the plan is not evidence of a page behind it. It was the right instinct twice over:

- **No `/settings` route and no settings page exist.** `App.jsx` declares neither; `pages/` contains no `Settings*` or `Account*` file. Grep for `settings` across the client returns admin competition settings, currency context, a script-upload workspace panel — nothing account-level.
- **Desktop's entire account surface is `layouts/app-shell/components/UserMenu.jsx`**, whose `ACCOUNT_MENU` is exactly four entries — Profile, Contact, T & C, Privacy — plus a Log out button. That is the whole thing.
- **Mobile is already at parity with it.** `screens/overlays/AccountMenu.jsx` carries the same four entries plus a `role="alertdialog"` logout confirmation focused on Cancel — which is *better* than desktop, where Log out fires immediately with no confirmation.
- **Account editing is not in this family.** It lives in `EditProfileModal`, mounted from `pages/Profile.jsx`. `/profile/:id?` is still a `DESKTOP_MIGRATION_FALLBACK`, so it belongs to **Phase 5**, not here. Pulling it forward would scatter an unfinished profile surface across two phases.
- **A third orphan, alongside `/ai-tools` and the holds backend:** `components/PrivacySettings.jsx` and `components/PrivacySettingsWrapper.jsx` exist with **zero callers** anywhere in the client. Recorded, not built — there is no desktop entry point to match.

##### Global auth/session is already shared, and that is the correct design

`§5.4` asks for one logic boundary, and this already is one. Every session behaviour lives **outside React**, in `services/api.js` and `context/AuthContext.jsx`, and mobile inherits all of it by importing the same `api`:

| Behaviour | Where | Mobile status |
|---|---|---|
| Client-side expiry check before every request | `api.js:46-71` request interceptor | Inherited |
| 401 → clear session → redirect | `api.js:74-94` response interceptor | Inherited |
| Intended destination parked for the auth modal | `api.js:15-24` (`PENDING_AUTH_REDIRECT_KEY`) | Inherited — `AuthModalProvider` (`App.jsx:440`) wraps `RootExperience` (`App.jsx:454`), so the mobile branch is inside it |
| Auto-logout timer on JWT `exp` | `AuthContext.jsx:50-64` | Inherited |
| `/auth/me` validation on mount | `AuthContext.jsx:148` | Inherited |
| Logout: clear state, clear `dashboard:` cache for privacy, `location.replace("/")` | `AuthContext.jsx:262-277` | Inherited — and the cache prefix genuinely covers mobile, which writes `dashboard:v1:<userId>` |

Two mobile-specific risks were checked rather than assumed, and **both are clean**:

1. **A session dying while an overlay holds the scroll lock.** `useScrollLock` locks `.ckm-shell__scroll` — an element *inside* `MobileApp` — so it cannot outlive the unmount. The document-level `ckm-html-lock` on `<html>` is removed by `MobileApp`'s own cleanup effect. No lock leaks onto the desktop document when the experience switches.
2. **Logout leaving mobile's cached dashboard on disk.** It does not: `clearCacheByPrefix("dashboard:")` and mobile's `DASH_CACHE_NS = "dashboard:v1:"` are the same namespace by design.

##### So what bullet 6 actually is

Not a screen. The honest scope is one real defect, plus turning inherited behaviour into asserted behaviour:

**The defect — mobile sends users through a redirect hop that desktop does not.** `AccountMenu.jsx:30-31` links `/terms` and `/privacy`. `App.jsx:481,483` mounts both as `<Navigate replace>` to the canonical `/terms-of-service` and `/privacy-policy`, which is where desktop's `UserMenu` links directly. It works, but it costs an extra navigation and breaks §5.2's canonical-URL rule on the only two account destinations mobile owns.

##### What was done

- **Fixed** the two account links to the canonical routes. The aliases stay declared in the manifest because external links to them exist; they are simply no longer what this app emits.
- **`screens/overlays/AccountMenu.test.jsx` (new).** The account surface had **no test coverage at all**, which is how two alias links survived unnoticed. 8 tests: the canonical destinations, the full destination set asserted against desktop's own `ACCOUNT_MENU` (so if desktop gains "Billing", mobile fails until it gains it too — §8.2 applied to account admin), and the four states of the logout confirmation.
- **`mobileSession.test.js` (new).** 5 tests pinning the cross-file contracts mobile inherits. The load-bearing one: `AuthContext.logout()` clears cache keys by the literal `"dashboard:"` and mobile's `useDashboardData` writes the literal `"dashboard:v1:<userId>"` — **nothing but this test connects those two strings**, and if they drift, a logged-out phone keeps the previous account's earnings, project titles and review scores readable in localStorage. Asserted on a shared device with two accounts' snapshots, and that unrelated cached data survives.
- **Corrected `mobile/README.md`.** It still described `island.desktopOnly(feature)` and the Dynamic Island in the present tense as current behaviour. Both were deleted on 2026-08-07; the doc was actively misleading the next reader.

##### Verification

**358 mobile tests in 29 files** (was 345/27). Full suite **899/901** across **three consecutive runs** — the same 2 pre-existing `AppShell.render.test.jsx` failures, nothing else. Lint clean across `src/mobile`; build + 53-route prerender pass.

**A flaky assertion of my own was found and fixed rather than retried.** Earlier full-suite runs failed 2, 5, and 4 tests on successive passes, and the varying ones included files this work never touched (`WriterRosterPage`, `adminCompetitionsEditor`) — load-dependent flakiness under parallel workers, not a regression. But one of the varying failures *was* mine: `Holds.render.test.jsx` asserted `toHaveBeenCalledTimes(1)`, which is hostage to React re-running an effect under concurrent rendering. The test is named "reads the one endpoint that exists, **and no other**", so it now asserts the distinct set of called URLs — the actual contract, which still fails just as loudly if a second endpoint appears, and passed 5/5 in isolation and 3/3 in the full suite afterwards. **Worth knowing for future sessions: this suite is flaky under full-suite concurrency, so a single red run is not evidence of a regression — re-run before investigating.**

##### Phase 2 exit gate — met

> *"Every dashboard interaction works on mobile; no `desktopOnly()` branch remains in the dashboard family."*

Verified by grep: **zero** live `desktopOnly` call sites remain anywhere in `client/src/mobile` — every surviving mention is a comment recording what the call *became*. `DynamicIsland`, `BottomSheet`, `TopBar` and `BottomNav` are all deleted, and their prefixes retired from the registry.

##### What bullet 6 did NOT build, and why

No settings screen, because there is nothing to port — see the gate above. Account editing (`EditProfileModal`) belongs to **Phase 5** with `/profile/:id?`. `components/PrivacySettings.jsx` and `PrivacySettingsWrapper.jsx` are dead code with zero callers on either platform; building a mobile surface for them would be inventing a feature, not migrating one. All three are recorded as follow-ups rather than silently absorbed.

#### 2026-08-08 — Claude (Claude Code) — Phase 2 (approved writer tabs; `/ai-tools` and `/offer-holds`) — **bullets 4 and 5**

**Requested continuation:** "continue in native app implementation".

**Starting checkpoint:** Verified against the repository before claiming (§20.4). `git status` clean of mobile changes; branch `feat/mobile-role-aware-chrome` at `7a31e91`. The previous entry's `next_action` named two things, and both were checked rather than assumed: `writerNav.js` does carry `mobileKeys: ["dashboard", "projects", "messages"]` as described, and `mobileRouteManifest.js:145-146` does still hold `/ai-tools` and `/offer-holds` as `DESKTOP_MIGRATION_FALLBACK`.

**Work items claimed:** §11 Phase 2 bullet 4 (approved writer tabs) and bullet 5 (`/ai-tools` and `/offer-holds`).

---

##### Bullet 4 — the writer tab set, approved

Put to the user with the three real options (approve; swap Projects back to Create; break the four-slot preset contract for a fifth tab). **Answered: approve as-is.**

The approved set is **Dashboard · Projects · Messages · Profile**, and it needs no code — the bars have been preset-driven and URL-driven since Phase 1 (§8.2), and the Phase 1 CDP sweep already measured this exact bar at 320/360/390/430/768 with 0 undersized targets, 0 text under 11px, 0 unnamed controls, exactly 1 `aria-current`, and the selected tab at 5.13:1 with a distinct `FILL` axis so the state is not carried by colour alone.

Create keeps its place in the rail and the drawer and remains the dashboard hero's primary action, so approving this set does not cost a tap on the writer's most common action. What it buys is the thing the 2026-08-07 swap was made for: a writer's own project list has an entry point in the compact bar.

The approval is now **enforced rather than remembered** — see the test note below. A silent edit to `mobileKeys` should fail a test, not ship.

---

##### The §4 gate: `/ai-tools` and `/offer-holds` — the research changed the direction (§20.7)

Phase 2 bullet 5 reads "Implement `/ai-tools` and `/offer-holds` as real route-aware screens/sections." **The premise is wrong, and it was wrong when the plan was written.** Read out of the source, not inferred:

- `client/src/App.jsx:582-583` mounts **both** as `<DashboardRoute />` — the *identical element* as `/dashboard` on line 581. Not a variant, not a prop: the same three-line component.
- `pages/Dashboard.jsx` (1460 lines) never reads `pathname`, `useLocation`, or a route param. There is no branch for either URL. Confirmed by grep: zero occurrences of `ai-tools`, `offer-holds`, `aiTools`, `offerHolds` or `pathname` in the file.
- They have been that way since **`93055d0`** ("change in investor", Yash Chichad, 2026-02-25), the commit that introduced them — the original diff wraps a bare `<Dashboard />` in `<PrivateRoute><MainLayout>` for both. They were never built.
- **Nothing in the application links to either one.** The only match in the whole client outside the route table and the SEO no-index list is `pages/FunctionalTestChecklist.jsx:50,52`.

So there is no desktop screen to port. Bullet 5 is net-new product design wearing a migration bullet's clothes. That was put to the user with the options; the answer was **"holds real, ai-tools alias"**.

**`/ai-tools` — a documented alias, not a port.** Seven live AI endpoints exist (`server/routes/aiRoutes.js`: generate-trailer, trailer-status, script-score, prose-sample, correct-script-text, writing-assist, generate-metadata) but every one is consumed from the screen that owns the script — the editor, create-project — never from a hub. A hub would need a script picker in front of every action, which is new design, not migration. Mobile therefore does what desktop does: renders the dashboard. The one thing worth fixing is that mobile was rendering the *desktop* dashboard there while rendering the *mobile* one at `/dashboard`, which is a parity gap in the opposite direction from the one the plan expected.

**`/offer-holds` — real, and the audience is not the writer.** This route has the rarer problem: a **fully shipped backend with no client at all.**

| Server surface | Where | Client consumers |
|---|---|---|
| `GET /scripts/holds` → `getMyHolds` | `scriptRoutes.js:123`, `scriptController.js:4854` | **none** |
| `POST /scripts/hold` → `holdScript` | `scriptRoutes.js:162`, `scriptController.js:4753` | **none** |
| `POST /scripts/release-hold` → `releaseHold` | `scriptRoutes.js:163`, `scriptController.js:4825` | **none** |
| `POST /scripts/hold/quote`, `/hold/create-order`, `/hold/verify-payment` | `scriptRoutes.js:118-120` | **none** |
| `ScriptOption` model, `script_hold` ledger entry, `hold` + `hold_expiring` notification types | `models/` | — |

The decisive detail, and the reason this belongs to a different audience than the phase it sits in: **`holdScript` 403s anyone whose role is not `investor`, `producer` or `director`** (`scriptController.js:4770-4772`), and **`getMyHolds` queries `{ holder: req.user._id }`**. A writer can never be a holder, so `GET /scripts/holds` returns `[]` for a writer unconditionally, forever. `/offer-holds` is an **industry-audience** screen that Phase 2 happens to name.

It is built here for the industry audience, with `fallbackDisposition` leaving every other audience on the existing desktop route — the manifest already supports exactly this shape (`mobileRoutePolicy.js:65-68`), and it is the same mechanism `/dashboard` uses to be writer-only.

**Payload shape, read from the controller rather than the client** (this is the discipline that caught the review-mapping defect on 2026-08-07):

```
ScriptOption[]  — sorted createdAt desc, holder-scoped
  _id, fee, platformCut, creatorPayout
  startDate (default now), endDate (required), createdAt, updatedAt
  status: "active" | "expired" | "converted" | "cancelled"
  convertedToSale: boolean
  paymentId, orderId
  script (populated, select: title genre coverImage creator price trailerThumbnail)
    creator (populated, select: name profileImage)
```

Three traps in that shape, each of which would produce a plausible-looking lie on screen:

1. **`status` is not the truth about time.** `holdScript` writes `status: "active"` with `endDate = now + 30 days` and nothing ever sweeps it — there is no cron, no TTL, no `expired` writer anywhere in the server. A hold whose `endDate` passed six months ago is still `status: "active"` in the database. The screen must derive expiry from `endDate` against the clock and treat `status` as the *deal* state, never as the *time* state.
2. **`script` can be `null`.** `populate` on a deleted or missing script yields `null`, and `holdScript` itself has a `script.isDeleted` 410 branch — so deletion is a real, handled state in this system. Every row must survive a null script rather than throwing on `hold.script.title`.
3. **`convertedToSale` and `status: "converted"` are set by two different code paths** and are not guaranteed to agree; `getInvestorDashboard:344` already counts a deal converted if *either* is true. The model follows that precedent rather than inventing a third rule.

---

##### What was built

| File | Role |
|---|---|
| `mobile/data/holdsModel.js` (new) | Pure payload → view derivation. The clock is an **argument**, so every time-dependent rule is testable at a chosen instant instead of trusted. |
| `mobile/hooks/useHoldsData.js` (new) | The one request, the error/retry state, and an hourly clock tick. |
| `mobile/screens/Holds.jsx` + `Holds.css` (new) | The screen; prefix `ckm-holds`, registered before the CSS was written (§7.2). |
| `mobile/routes/mobileRouteManifest.js` | Both routes flipped from `DESKTOP_MIGRATION_FALLBACK` to `SCREEN`, each with its audience gate and `fallbackDisposition`. |
| `mobile/routes/MobileRoutes.jsx` | `/ai-tools` → the dashboard element; `/offer-holds` → the new screen. |
| `mobile/theme/cssPrefixRegistry.js` | `ckm-holds` registered. |

Three decisions inside that are worth finding later without re-deriving them:

- **No cache, deliberately.** The dashboard caches to localStorage because it is the app's home screen. This screen's whole subject is a countdown, and a cached "6 days left" painted before the network answers is precisely the stale-but-plausible number class that the 2026-08-07 audit was about. A skeleton that resolves beats a confident lie.
- **The clock is state, not `new Date()` in render.** A session left open overnight would otherwise keep rendering yesterday's "1 day left". It ticks hourly — the coarsest interval that cannot show a wrong whole-day count.
- **No write actions yet.** `releaseHold`, `hold/quote`, `hold/create-order` and `hold/verify-payment` all exist, but releasing a hold is a destructive, money-adjacent action whose desktop counterpart has never been built: there is no established confirmation copy, no refund rule, and no place a failure is currently reported. The read surface is the honest half to ship first.

##### Verification

**Tests.** 345 mobile tests in 27 files (was 288/25). Full suite **886/888** — the same 2 pre-existing `AppShell.render.test.jsx` failures, re-confirmed this session by stashing every change and watching the identical 2 fail. Lint clean across all of `src/mobile`. Build + **53-route prerender pass**.

New coverage: 26 model tests written against the controller's shape (each of the three traps asserted from both sides), 12 screen render tests, 10 route-policy tests asserting the audience gate from **both** directions, and 2 MobileRoutes tests.

**Five-width browser sweep (320/360/390/430/768), driven over CDP.** There is no puppeteer in this repo, so headless Chrome was driven directly over the DevTools protocol with `Emulation.setDeviceMetricsOverride` — never `--window-size`, which Chrome on Windows clamps near 500px and which crops rather than reflows (the Phase 0 baseline README's own warning). The page measured is the **real component**, rendered with real fixture data and carrying the real mobile stylesheets, so these are measurements of shipped CSS rather than of a mock.

At **every** width: **0** undersized targets across 12 interactive elements, **0** text nodes under the 11px floor across 76, **0** unnamed controls, **0** elements past the frame, **no** horizontal page scroll, and the frame itself never wider than 520px (320/360/390/430/**520** at 768).

Measured rather than assumed:

- **The sweep found a real defect in this session's own CSS and it was fixed, not excused.** `ckm-holds__terms-sep` — the "·" between the fee and the date — was `--ckm-muted-2` (#a39d92) on white at **2.69:1**, failing SC 1.4.3 at 12px, 7 occurrences at all 5 widths. It is a rendered glyph, so the decorative exemption does not cover it. It now inherits the text colour and separation comes from the spacing: **0 contrast failures** at all five widths afterwards.
- **One reported failure was the harness's, not the app's**, and was run down rather than waved away: `ckm-appbar__home` measured 8×44. The app bar's logo `src` is the absolute `/ckript-logo-landscape-nobg.png`, which over `file://` resolves to the drive root, so the `<img>` collapsed and took the link's width with it. Rewritten to a relative path, the same sweep reports **0** undersized targets at all five widths. Recorded because the next agent to build a `file://` harness will hit it.
- **All three payload traps render correctly at every width.** 7 rows: **6** links and **1** inert (the deleted script), in 3 groups reading `Expiring soon 2`, `Active holds 2`, `Closed 3`. The badges are `Last day`, `5 days left`, `15 days left`, `26 days left`, `Lapsed`, `Bought`, `Released` — so the `status: "active"` row whose `endDate` passed 90 days ago reads **Lapsed**, and the `status: "active"` row with `convertedToSale: true` reads **Bought**. Each countdown badge also carries its sr-only expansion ("Last day" + "Expires last day").
- **The summary excludes closed money.** Measured `4 / 2 / ₹13,100` — open = 200 + 12,500 + 200 + 200, with the released ₹200 and the lapsed ₹200 correctly outside it.
- **Exactly 0 `aria-current` on a 4-tab industry bar**, which is the correct answer rather than a miss: `/offer-holds` belongs to no industry tab, and MDN's rule is that at most one element in a set carries it. Marking a fallback tab current here would be a lie told on every visit.
- **Content stress (§16.2) held.** A 78-character title, a 30-character hyphenated writer name and a ₹12,500 fee all wrapped inside the 320px frame with no overflow and no text shrunk below the floor.

**Known limitation, recorded rather than papered over:** the screen is deep-linkable but reachable from no navigation. Adding it to `industryNav.js`'s drawer is the correct fix and is deliberately **not** done here, because that preset feeds the desktop rail and drawer too (§8.2: a destination cannot exist in one bar and not the other) — and on desktop `/offer-holds` still renders the dashboard. Shipping a drawer link that lands industry users back on their own dashboard is a worse defect than the one it fixes. The nav entry should land in the same change as the desktop screen. Logged as a follow-up.

#### 2026-08-07 — Claude (Claude Code) — Phase 2 (dashboard parity audit + data truth) — **bullet 1 closed, bullet 2 in progress**

**Requested continuation:** "continue in native app implementation".

**Starting checkpoint:** Verified against the repository before claiming (§20.4). Every file the Phase 1 entry names exists; `components/TopBar.*`, `components/BottomNav.*`, `components/BottomSheet.*` and `components/DynamicIsland.*` are all still present. One correction to the previous session's `next_action`: it says "migrate the four dashboard overlays (AccountMenu, AiDetailSheet, AllProjectsSheet, NotificationsPanel) off `components/BottomSheet.jsx`". Only **two** of the four use it — `AiDetailSheet` and `AllProjectsSheet`. `NotificationsPanel` (`ckm-noti`) and `AccountMenu` (`ckm-acct`) are bespoke anchored popovers with their own scrims, their own `AnimatePresence`, no focus trap, no scroll lock and no `inert`; they are not sheets at all and migrating them is a larger job than the note implies (see the follow-up list below).

**Work item claimed:** §11 Phase 2 bullet 1 (dashboard research/parity audit) and bullet 2 (remove static placeholders, wire real services).

---

##### The §4 gate: dashboard page family

**Desktop component tree** (`client/src/pages/Dashboard.jsx`, 1460 lines). `Dashboard` is an audience *router*: `isIndustryAudience(user?.role)` lazy-loads `ProducerDashboardPage`, otherwise `CreatorDashboard`. Only the creator branch has a mobile counterpart. Its children: `ProfileCompletionBanner`, hero, Script Performance (3 stats + hand-rolled bar chart), Reviews & Insights (`CarouselNav`/`NavBtn` + `AiReviewCompact` + `AdminReviewCard` + `EmptyPanel`), My Projects (`ProjectCard` grid + pending/rejected notices + Collaborations), a `lg:`-only right rail (At a Glance 2×2, Avg Score, Biggest Mover, Top Scripts, Full Analytics), and two modals (`ReviewModal` → `AiReviewDetail`, `AllProjectsModal` paginated 9/page). `DashboardSkeleton` mirrors the whole layout.

**Services.** Three parallel `Promise.allSettled` calls, identical on both platforms: `GET /scripts/mine?includeCollaborations=1`, `GET /dashboard`, `GET /dashboard/reviews`. Plus a `/auth/me` session sync in the router, a `socket.io` subscription to seven `collab_*` events that refetches, and a localStorage stale-while-revalidate cache (`dashboard:v1:<userId>`, written via `writeCache` with a trimmed retry).

**Server payload shapes, read from `server/controllers/dashboardController.js` rather than inferred:**

| Endpoint | Field | Shape |
|---|---|---|
| `/dashboard` | `stats` | `totalEarnings`, `totalUnlocks`, `totalViews`, `profileViews`, `trailersGenerated`, `avgScore` (nullable), `activeHolds`, `scoredScripts`, `auditionCount`, `scriptScoreCredits`, `plan`, **`isAnalyticsLocked`** |
| `/dashboard/reviews` | `ai[]` | `scriptId`, `scriptTitle`, **`rating`**, **`scores{plot,characters,dialogue,pacing,marketability}`**, `feedback`, `strengths[]`, `weaknesses[]`, `improvements[]`, `audienceFit`, `comparables`, `date` |
| `/dashboard/reviews` | `adminScores[]` | `scriptId`, `scriptTitle`, **`overall`**, `content`, `trailer`, `title`, `synopsis`, `tags`, `feedback`, `scoredAt` |
| `/dashboard/reviews` | `readers[]`, `platform[]` | present in the payload; **neither platform renders them** |

**Permissions.** `getDashboardStats` and `getDashboardReviews` both compute `isFreeWriter` (role writer/creator with no plan or `plan === "free"`) and return `null` for `profileViews` / `totalViews`, plus `isAnalyticsLocked: true` and locked reader insights. This is §13's "plan/quota restricted" state and **neither desktop nor mobile renders it** — both coerce the `null` to `0` with `??` and silently show a free writer "0 profile views" where the truth is "upgrade to see this". Recorded as a shared follow-up, not a mobile-only one.

**Parity inventory — what the audit actually found.** Ordered by severity, and every one of these was read out of the source, not assumed:

1. **The reviews tab renders fabricated data on both lists.** `mobile/hooks/useDashboardData.js` maps AI reviews with `r.score` and `r.summary`, and platform reviews with `r.score`. The server sends **`rating`** and **`overall`**. Neither `score` nor `summary` exists on either payload, so every AI card scores **0/100** with four identical 0% bars and the hardcoded excerpt "AI Analysis completed.", and every platform card scores **0/100**, "Grade B", "Platform review completed." The mobile dashboard has been showing invented review content for real scripts. This is not a placeholder — it is worse, because it is indistinguishable from data.
2. **The literal `Placeholder` badge** — `screens/sections/OverviewSection.jsx:72` renders `<span className="ckm-ov__badge">Placeholder</span>` beside "At a Glance" in production.
3. **The notification bell is fiction.** `screens/Dashboard.jsx:44` seeds state from `data/dashboardData.js`'s `NOTIFICATIONS` — three hand-written rows ("Meera K. liked Nocturne") shipped to every user, with `dangerouslySetInnerHTML`. Meanwhile `layouts/app-shell/hooks/useShellNotifications.js` already exists as a presentation-agnostic hook doing polling, sockets, unread counts, mark-read, delete and follow-request decisions. §5.4 says share the logic; mobile should consume that hook, not a second implementation and certainly not a constant.
4. **Nine `desktopOnly()` call sites**, seven of which have a real destination available today: Create → `/create-project` (state `{startFresh:true}`), Upload → `/upload`, Edit profile → `getProfileCanonicalPath(user, …)`, Open project / Top Scripts rows / All Projects rows / Collaborations → `getScriptCanonicalPath(script)`. Desktop already navigates to exactly these. Two need a real in-place behaviour instead: Share and Filter.
5. **Project cards carry `score: null` with the comment "would need to merge with reviews".** The merge is available — `/dashboard/reviews` returns `scriptId` on both lists, so the join is by id.
6. **Mobile drops the rejected-projects notice** that desktop renders. Mobile has the pending notice only.
7. **Mobile has no cache and no socket refresh.** Desktop hydrates synchronously from `readCache` (first paint with no skeleton) and refetches on seven collab events. Mobile shows `MobileRoutePending` on every visit and never updates until remount.
8. **Mobile's loading state discards `useDashboardData`'s partial-failure handling.** The hook uses `Promise.allSettled` and defaults each leg, but a total failure only `console.error`s and leaves `data` null — so the screen renders the pending skeleton **forever** with no error, no retry and no offline distinction. `ckm-message` (Phase 1) is the component that fixes this and it is already built.
9. **A desktop defect found during the audit, not to be copied:** desktop's `fetchData` filters `myScripts` to `status === "published"`, then computes `pending`/`rejected` from `myScripts` — so the two status notices it renders are **unreachable on desktop**. Mobile does not filter, so mobile's pending count is the correct one. Keeping mobile's behaviour and adding the rejected notice is the right call; the desktop bug is logged as a separate follow-up rather than silently mirrored.
10. **Superseded primitives still in the dashboard's own markup:** `ckm-btn` (superseded by `ckm-button`), `ckm-viewmore` (superseded by `ckm-load-more`), the bespoke `ckm-rev__subtab` pair (superseded by `ckm-tabbar`), and `ckm-sheet` via `BottomSheet`. Phase 1 built all four replacements.
11. **Baseline accessibility debt on the dashboard's own content** (measured in the Phase 1 CDP sweep, restated here because Phase 2 owns it): 5 text nodes under the 11px floor and ~25 colour pairs under 4.5:1, listed in the previous `next_action`.

**Not a gap, deliberately:** mobile shows Overview as its own tab, recovering the right rail that `hidden lg:block` drops on a phone. Mobile paginates reviews with "View more" where desktop uses a one-card carousel — a carousel is a desktop affordance and §4.2 favours the list. Both are kept.

---

##### ⚠ BLOCKING PRODUCT QUESTION — three of the four dashboard sections have no way in *(RESOLVED 2026-08-07 — option B, implemented below)*

Found while writing the render tests, not from the ledger: **`components/SectionTabs.jsx` lists only two tabs, Overview and Challenge.** Commit `ada2b85` (2026-08-03, Yash Chichad, "Update SectionTabs to only show Overview and Challenge") removed `performance`, `reviews` and `projects`.

`Dashboard.jsx` still renders all four sections, and `useDashboardData` still fetches everything all four need. So today:

- **Performance** is reachable by exactly one control — Overview's "Full Analytics" button;
- **Reviews** is reachable by nothing;
- **Projects** is reachable by nothing;
- **AllProjectsSheet** is reachable by nothing (its only opener is inside Projects);
- **AiDetailSheet** is reachable by nothing (its only opener is inside Reviews).

That is roughly 700 lines of fully-wired screen — including everything this session repaired in Reviews and Projects — that a signed-in writer cannot currently open. It is also why Phase 2's exit gate ("every dashboard interaction works on mobile") cannot honestly be signed off yet: the interactions work, but three quarters of them cannot be started.

The commit message states the intent plainly and carries no explanation, so this is treated as a **deliberate product decision that the plan must not silently reverse** (§20.14). It was left exactly as committed. The options, with consequences:

| Option | Consequence |
|---|---|
| **A. Restore the four tabs** | Everything Phase 2 fixed becomes reachable, and the tab strip returns to five items (with Challenge) — measured at 320px, five tabs give a 41.7px-wide target, under the 44px floor, so the strip would need to scroll horizontally or drop to icons. |
| **B. Keep two tabs; move Reviews and Projects to their own routes** | Matches §5.2's URL contract better than tabs do — a writer can link to their projects — and the bottom nav already has room. Costs two new route entries and their manifest/shell registrations. |
| **C. Keep two tabs; fold Reviews and Projects into Overview as sections** | One long scroll, which is what the mobile plan explicitly moved away from. |
| **D. Keep as-is and delete the three sections** | Honest, but throws away working screens and re-opens Phase 2 as new work later. |

**Recommendation: B.** The plan's own URL contract wants these to be addressable, the sections are already built and now verified, and it avoids the 320px tab-strip problem entirely.

**ANSWERED 2026-08-07 by the user: option B.** Implemented the same session — see "How B was built" below. The tab strip is untouched; `ada2b85` stands.

##### How B was built, and the one place it deviates from the sketch

The sketch said "new routes `/projects` and `/reviews`". That turned out to be the wrong mechanism, and the manifest is what said so: `mobileRouteCoverage.test.js` asserts that the registered mobile routes are **exactly** the path literals in `App.jsx`, and §5.2 says "desktop and mobile use the same canonical URL". A mobile-only `/projects` would therefore either fail the coverage contract or ship a URL that 404s the moment the same writer opens it on a laptop — which is precisely the class of thing the URL contract exists to prevent.

So the destinations are **query-string tabs of the dashboard's own URL**: `/dashboard?tab=projects` and `/dashboard?tab=reviews`. That delivers everything option B was chosen for — deep-linkable, correct under browser Back, addressable from the nav — with none of the cost:

- one canonical URL per platform, because it *is* `/dashboard`, which both already serve;
- no new `App.jsx` route, no coverage-contract change, no 404 risk on desktop;
- §5.2 names "query strings and tab selection" as something mobile routing must preserve, so this is the contract's own idiom;
- and the writer preset **already** shipped a destination of exactly this shape — `{ key: "competitions", path: "/challenge?tab=mine" }`.

Concretely:

1. `screens/Dashboard.jsx` takes its section from `useSearchParams` instead of `useState`, validated against a known list and falling back to Overview. Section changes `replace:` rather than push, so moving between sections does not build a stack of history entries the user has to Back through, while arriving from the nav is a real navigation with its own entry.
2. `presets/writerNav.js` gains `projects` (rail + drawer + compact bar) and `reviews` (drawer). Declared in the **desktop preset**, per §8.2 — a destination cannot exist in one bar and not the other — so the desktop rail and drawer gain them too.
3. `mobileKeys` becomes `["dashboard", "projects", "messages"]`. **Create gave up its compact slot to Projects.** Create is still one tap from home — it is the dashboard hero's primary action on every visit — and it keeps its place in the rail and drawer; a writer's own project list had no entry point anywhere in the compact bar.

**Two real defects this surfaced, both fixed:**

- `resolveActiveTabKey` matched on pathname alone, so `/dashboard?tab=projects` and `/dashboard` were indistinguishable and Dashboard won both. It now requires every query param a destination declares to be present with that value, and scores each as specificity — so the query tab beats its host page on the query URL, and the host page still wins on its own.
- **`NavBar` was marking two tabs `aria-current="page"`.** It used `NavLink`, which decides "am I active?" itself from the path, and applies its *own* `aria-current` when it does — so passing `undefined` could not suppress it. This was latent before (no two tabs had shared a path) and became visible immediately. The bar is now a plain `Link` with `resolveActiveTabKey` as the single authority, which is what its own comment had always claimed. Two tabs claiming to be the current page is a lie told to a screen reader on the app's most-visited screen, so this was worth the change on its own.

**Verified:** full suite **835/837** (same 2 pre-existing AppShell failures); lint clean on every touched file; build + 53-route prerender pass. New tests cover the query-vs-host resolution both ways, that exactly one tab is current on each URL, that `?tab=` opens the named section, and that an unknown `?tab=` falls back to Overview rather than blanking. Real browser at 320/360/390/430/768: `?tab=projects`, `?tab=reviews` and `?tab=performance` each render their section with **0 undersized targets, 0 text under 11px, 0 unnamed controls, 0 overflow and no horizontal scroll at every width**, with the bottom bar reading Dashboard · Projects · Messages · Profile.

---

##### What was built (bullet 2, and the deletions bullet 1 unblocked)

**The data.** New `data/dashboardModel.js` — pure, no React — is the single mapping from the three payloads to what the sections render, and `hooks/useDashboardData.js` is now only the data session. Concretely fixed: AI reviews read `rating`/`scores{}`/`feedback`/`strengths`/`weaknesses`/`improvements`/`audienceFit`/`comparables`; platform reviews read `overall` plus all five dimensions; verdict bands and A–F grades match desktop exactly (the old grade helper could only ever emit A or B, so a failing script was shown to its author as a "Grade B"); project cards carry the real merged score (`platformScore.overall ?? scriptScore.overall`), the real `coverImage`, the real price via `premium`, and a canonical `href`; an unscored dimension is omitted rather than drawn as a 0% bar.

**The session.** `useDashboardData` now hydrates synchronously from the **same** `dashboard:v1:<userId>` cache desktop writes, so a returning phone paints real numbers with no skeleton and revalidates behind them, and a form-factor switch does not discard the other client's snapshot. A total failure surfaces an `InlineMessage` with a working retry instead of leaving the pending skeleton up forever; a partial failure keeps the sections that loaded.

**The nine `desktopOnly()` call sites are gone, and with them `DynamicIsland`.** Create → `/create-project` (with `startFresh`), Upload → `/upload`, Edit profile → `getProfileCanonicalPath`, Open project / Top Scripts rows / All-projects rows / Collaborations → `getScriptCanonicalPath`, account menu → `/contact` `/terms` `/privacy` + the profile. Filter became a real `ckm-segmented` status filter with a recovery action on the empty result. Share became `data/shareProject.js` — Web Share API, clipboard fallback, and it distinguishes an `AbortError` (the user closing the OS sheet) from a real failure so cancelling is never reported as an error.

**The bell became real.** `NotificationsPanel` consumes `useShellNotifications` — the desktop shell's own hook — plus the shared `timeAgo` / icon-map / decision-test helpers, so the same notification cannot look different on a phone. The three invented rows and their `dangerouslySetInnerHTML` are deleted, as is the `dangerouslySetInnerHTML` on the AI sheet's audience text (defensible for a hand-written fixture; not defensible for model output stored on a script).

**Retired and deleted, with their prefixes:** `TopBar` + `BottomNav` (`ckm-topbar`, `ckm-bottomnav`), `BottomSheet` (`ckm-sheet` — its only two callers, `AiDetailSheet` and `AllProjectsSheet`, are now real `Sheet`s with focus trap, scroll lock and `inert`), `DynamicIsland` + `context/dynamicIsland.js` (`ckm-island`), `AccountMenu.css` (`ckm-acct` — it is now `ActionSheet` + `ConfirmDialog`), and `ckm-btn` / `ckm-viewmore` from `theme/primitives.css`. `AllProjectsSheet`'s pager also stopped printing one button per page — 200 scripts meant 23 numbered buttons wrapped across a phone — and now uses desktop's windowed `1 … n-1 n n+1 … N`.

**Also removed, deliberately:** Performance's "Details" list. Its two rows were "Avg watch time —" and "Saves —", values no endpoint supplies, behind a chevron that opened a `desktopOnly()` toast. Desktop shows the three stats and the chart and nothing else, so removing it is also the parity-correct shape.

**Accessibility debt this phase owned, cleared.** Every item the Phase 1 sweep listed is fixed and re-measured: `ckm-ov__mover-head` 8.5→11px, `ckm-ov__mover-note` 10.5→11px, `ckm-ov__top-meta` 10→11px, `ckm-ov__glance-label` 2.69:1 → `--ckm-text-3`, `ckm-ov__badge` 3.02:1 → `--ckm-gold-ink` at 11px, `ckm-ov__profile-sub` 3.36:1, `ckm-ov__top-rank` 1.82:1, and `ckm-tabs__btn` — which turned out to be worse than recorded: a 29px-tall control with a 9px label at 3.41:1, failing size, target and contrast at once. The browser sweep also found debt nobody had listed, because nobody had been able to reach those screens: 10 undersized text nodes in Performance and **43** in Reviews, plus a 23px `ckm-rev__subtab` and a 16px `ckm-rev__details`. All fixed. One new token pair, `--ckm-info` / `--ckm-info-bg`, because the platform score runs A–F and the existing warm semantics covered only four of the five bands.

##### Verification

- **288 mobile tests in 25 files** (was 251 in 22). Full suite **829/831**; the 2 failures are the same pre-existing `AppShell.render.test.jsx` ones, re-confirmed this session by stashing every change and watching the identical 2 fail. Lint clean on the whole mobile tree. Production build + 53-route prerender pass.
- New `data/dashboardModel.test.js` (21 tests) is written against fixtures **transcribed from `dashboardController.js`**, not from client code — that distinction is the whole point, since every previous test used the client's own invented shape and so agreed with the bug. It asserts `payload.score === undefined` before asserting the mapping reads `rating`, so the regression cannot come back quietly.
- New `screens/Dashboard.render.test.jsx` and `screens/sections/ProjectsSection.test.jsx` assert the things a model test cannot: that Create/Upload/Edit-profile/Top-Scripts/project-title are **links with the right `href`**, that Share is not nested inside the card's link, that the filter is a real radio group with a recovery path, that the rejected notice renders, and that a total failure produces a `role="alert"` message whose retry **re-issues the requests** and then clears.
- **Real browser, five widths (320/360/390/430/768), headless Chrome via CDP.** On the shipped two-tab dashboard: 0 undersized targets, 0 text under 11px, 0 unnamed controls, 0 elements past the frame, no horizontal scroll, and no "Placeholder" string, at every width. Then, with the four tabs **temporarily restored locally and reverted immediately after** (the only way to reach the other sections), the same sweep over Performance, Reviews, Projects and the AI-detail / all-projects / account overlays at all five widths: **0 real violations** after the fixes above, 0 nested interactive elements, 0 orphan `<li>`.
- The load-bearing checks a unit suite cannot make, measured in a real browser: the project card's tap region is genuinely the whole card — **4 of 4 probe points** well away from the title resolve to the title's link — while Share stays a sibling and is still independently hittable; the AI sheet opens as `role="dialog" aria-modal="true"` named "The Last Scene" with the scroll surface *and* app bar measuring `inert`, focus inside, and **14 dispatched Tab presses escaping 0 times**; Escape closes it, clears every `inert`, and — with the opener focused for real rather than by a synthetic `.click()` — **restores focus to `ckm-rev__details` exactly**; the account sheet's four items are real anchors (`/profile`, `/contact`, `/terms`, `/privacy`) with logout as the one button, and it hands over to a `role="alertdialog"` whose focus lands on **Cancel**, not "Log out".
- Baselines recaptured at all five widths; the previous images are archived in `baselines/phase0-dashboard/pre-phase2-data-truth/`.

##### Follow-ups recorded, not silently absorbed

1. **Desktop bug, unfixed on purpose.** `pages/Dashboard.jsx` filters `myScripts` to `status === "published"` and then computes `pending`/`rejected` from it, so both status notices it renders are unreachable on desktop. Mobile does not filter and now shows both. Fixing desktop is out of this phase's scope; it is logged here so it is not rediscovered as a mobile inconsistency.
2. **The locked-analytics state is unhandled on both platforms.** The server returns `profileViews: null` + `isAnalyticsLocked: true` for a free writer; desktop coerces it to `0` and so says "0 profile views" where the truth is "upgrade to see this". Mobile now carries `analyticsLocked` through the model and shows "—" plus an "Upgrade to view" badge, but there is no upgrade destination behind it yet, and desktop still shows the misleading zero.
3. **`ckm-tabs` (SectionTabs) is still the legacy strip**, superseded by `ckm-tabbar`. Its size/contrast failures are fixed but the primitive migration is not done; it is entangled with the tab-set question above and should be done with whatever answer that gets.
4. `/dashboard/reviews` also returns `readers[]` and `platform[]`. Neither platform renders either. Not a regression — noted because the data is already being fetched and paid for.
5. Mobile still has no socket refresh; desktop refetches on seven `collab_*` events. The cache and retry landed this session; the socket did not.

---

#### 2026-08-07 — Claude (Claude Code) — Phase 1 (role-aware chrome) — **Phase 1 closed**

**Requested continuation:** "continue in native app implementation".

**Starting checkpoint:** Verified against the repository before claiming, as §20.4 requires — `components/feedback/` and `hooks/useOnlineStatus.js` were present and uncommitted, and no role-aware bar existed, so the ledger was accurate. The item was claimed in §19.1 before any code was edited (§20.8).

**Work item claimed:** Phase 1 bullet 2 — role-aware top app bars and bottom navigation — the last open bullet, plus closing the phase.

**The blocking decision, and what changed it**

The previous session left this blocked on user approval of §8.2's four proposed five-tab sets. Before asking, this session searched for how the desktop app decides its own navigation, and found that **the question was already answered in code**: `client/src/layouts/app-shell/navigation/buildNav.js` builds a hard-capped four-slot *mobile* bar from each audience preset's `mobileKeys`, with Profile always last. §8.2 had been written without knowledge of it, and its proposals conflicted with it for all four audiences.

That reframed the question from "approve these tab sets" to "which model owns the tab sets", and it was put to the user that way. **The user chose the existing presets** and chose to build the chrome now rather than carry it into Phase 2. §8.2 is rewritten to record the decision, with the superseded proposal kept in a collapsed block.

The reason the preset model wins is written in `buildNav.test.js`'s own header and is not hypothetical: the app previously had two independent navigation systems, a feature was added to only one, and every writer had a live competition they could not reach from anywhere in the UI. A second, mobile-only list of destinations would have rebuilt exactly that.

**Research performed**
- Sources fetched: [W3C Understanding SC 3.2.3 Consistent Navigation](https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation.html) — "same relative order … unless a change is initiated by the user", and the definition that inserting or removing items does not break relative order; [MDN `aria-current`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-current) — `page` for the current page in a set, and "only mark one element in a set of elements as current"; [Android Developers: Navigation bar](https://developer.android.com/develop/ui/compose/components/navigation-bar) — three to five destinations of equal importance, consistent across screens. Added to §17 as sources 23–25.
- **Two sources were attempted and are deliberately not cited.** Material 3's navigation-bar guidelines page and Apple's HIG tab-bars page both render through client-side script and returned empty documents; the summariser answered from recollection rather than from the page. Citing either would have put unverified claims in this plan under an authoritative-looking link. Recorded as an honest gap in §17 with the Android page standing in as the server-rendered equivalent that was actually read.
- Repository research: `layouts/app-shell/navigation/{buildNav,symbols}.js` and all four presets; `layouts/app-shell/shellPolicy.js` (the exhaustive role→audience map and why an unmapped role falls back to *reader* rather than writer); `hooks/useShellIdentity.js` and `utils/profilePath.js` (which returns a bare root segment such as `/ada` whenever the account has a username — the fact that decided the profile tab's matching rule); `hooks/useShellNotifications.js` (a socket plus a 30s poll — the reason the unread badge is a parameter here rather than a second session); `mobile/routes/mobileRoutePolicy.js`; `components/{TopBar,BottomNav}.{jsx,css}`.
- Decisions adopted: the mobile module **adapts, never declares**; the active tab is derived from the URL through React Router's matcher, never passed in; a tab is a link.
- Patterns rejected and why: **a mobile-only tab manifest** (the two-navigation defect above, in a new place); **reordering or hiding tabs on scroll** (SC 3.2.3, and a bar that moves under the thumb is worse on a phone than one that costs 62px); **`role="tablist"` for the bar** (these are destinations with URLs, not panels — the APG tablist contract would replace browser navigation the user already has); **mounting `useShellNotifications` in mobile chrome** (it would double the app's notification traffic on a device already running the desktop shell's copy).

**Desktop parity inventory**
- Desktop files inspected, none changed: `buildNav.js`, the four presets, `shellPolicy.js`, `useShellIdentity.js`, `useShellNotifications.js`, `utils/profilePath.js`.
- Data/services/hooks: `buildNav` and `getProfileCanonicalPath` are consumed directly. No new endpoint, no new request. The unread badge is a prop; nothing fetches it yet.
- Roles/permissions: every role in `KNOWN_ROLES` is asserted to produce a four-tab bar ending in Profile, and no non-writer audience is asserted to be offered `/create-project` or `/upload`.
- Routes/query/navigation: `location.state.startFresh` is threaded onto the Create tab, so the tab opens a new draft rather than resuming the last one.

**Wireframe/design decision**
- Shell: unchanged. Both bars mount through `MobileShell`'s existing `appBar` and `bottomNav` slots; nothing new was added to the shell contract.
- `PageHeader` (`detail`) and `AppBar` (`standard`) are the two app bars, and cannot collide — the shell has one `appBar` slot.
- The app bar owns only the home link and the search entry; the bell and avatar are an `actions` slot, because they are wired to state a *screen* owns.
- Search is a link, not an input: a text field in fixed chrome opens the keyboard over the content being searched, so the native pattern is an entry point to a screen that owns the input.

**Changes made**
- Files added: `mobile/navigation/mobileNav.{js,test.js}`, `mobile/hooks/useMobileNav.js`, `mobile/components/app-bars/AppBar.{jsx,css,test.jsx}`, `mobile/components/navigation/NavBar.{jsx,css,test.jsx}`.
- Files modified: `theme/tokens.css` (`--ckm-accent-on-dark`), `theme/cssPrefixRegistry.js` (2 new prefixes; `ckm-topbar`/`ckm-bottomnav` re-noted as superseded), `screens/Dashboard.jsx` (adoption), `dev/PrimitiveGallery.{jsx,css}` (all four audiences' chrome), `baselines/phase0-dashboard/` (recaptured, previous images archived), and this plan (§7.2, §8.2, §11, §17, §19).
- Shared logic extracted: "which destinations does this viewer get" and "which tab is the URL on" now have exactly one implementation each, composed by `useMobileNav`, so the app bar and the tab bar cannot disagree.
- Route/prefix registration: `ckm-appbar`, `ckm-navbar`.

**Verification**
- Automated: `npx vitest run src/mobile` → 22 files / 251 tests (was 19 / 206). Full `npx vitest run` → 792 passed / 2 failed. The 2 failures were confirmed pre-existing by stashing this session's changes and re-running that file: the identical 2 fail without any of this work. ESLint clean on every touched file. `npm run build` → passed, 53 routes prerendered.
- Viewports: headless Chrome over CDP at 320×720, 360×800, 390×844, 430×932, 768×1024, against `/__mobile-primitives` (all four audiences at once) and `/__mobile-preview` (the real dashboard). Identically at every width: **0** targets under 44×44 (`::after` hit regions measured through `getComputedStyle(el, "::after")`, which is what proves the 34px avatar's 44px region), **0** text under 11px, **0** unnamed links or buttons, **0** contrast failures, **0** elements past the 520px frame, `documentElement.scrollWidth === innerWidth`, and 16/16 tab labels rendered without clipping.
- The load-bearing measurements are the ones a unit suite cannot reach: the selected tab computes to `rgb(221,90,66)` at **5.13:1** on the bar's `rgb(15,15,15)`, its glyph's `FILL` axis at **1** against the idle tab's **0** (so selection is not carried by colour alone — SC 1.4.1), the idle label at 19.17:1, both badges at 4.72:1 and the app-bar search label at 5.21:1. Tabs measured 49px tall and 80/90/96/106/128px wide by viewport. Real dispatched Tab keys walked **4** stops, one per destination, each with a measured `rgb(255,255,255) 2px solid` ring.
- Accessibility: exactly **1** element carried `aria-current` with the state applied, and **0** on a URL belonging to no tab.

**Decisions or deviations**
- **Decision: `TopBar` and `BottomNav` superseded, not upgraded** — the fourth time this call has been made the same way (`ckm-btn`→`ckm-button`, `ckm-tabs`→`ckm-tabbar`, `ckm-sheet`→`ckm-bottom-sheet`, `ckm-island`→`ckm-toast`). The shape genuinely differs: the old bar's items were `<button>`s calling `onSelect`, so a destination could not be opened in a new tab, long-pressed or copied; and its current tab was a prop that every caller set to the constant `"dashboard"`. Unlike the previous three, this one had a single call site, so the dashboard was migrated in the same slice rather than deferred — which is why the Phase 0 visual baseline was recaptured rather than preserved.
- **Deviation from the earlier supersede precedent, stated plainly:** the previous sessions left the old component mounted alongside the new one during migration. Here the old components have **no** remaining caller, but the files and their prefixes were still left in place, because deleting them is a separate change from replacing their behaviour and Phase 2's first tasks already touch that family. The deletion is written into `next_action` so it is a scheduled task rather than a forgotten file.
- **Finding: `--ckm-accent` is not usable as text on the dark bar.** Measured at ~4.35:1 on `#0f0f0f`, so the selected tab's 11px label would have failed SC 1.4.3 — the mirror image of the problem `--ckm-accent-strong` already solves on light surfaces. Added `--ckm-accent-on-dark: #dd5a42`, the same hue lightened only as far as 4.5:1 requires, measured in the browser at 5.13:1.
- **Finding: the provisional bar was below three of the plan's own floors**, and none of it had ever been in a CDP sweep. Its label and badge were 9px against §7.3's 11px floor, its item measured ~42px against §7.4's 44px, and its `justify-content: space-around` made the gaps between targets wider than the targets. The app bar was the same story: a 38px bell, a 34px avatar and a search label in a literal `#b3ac9f` measuring roughly 2.2:1. All corrected; all re-measured.
- **Finding: the profile tab cannot be prefix-matched.** `getProfileCanonicalPath` returns a bare root segment (`/ada`) whenever the account has a username, and the app's canonical project URL is *also* two root segments (`/:projectHeading/:writerUsername`) — so a prefix match would light the profile tab on someone else's project page whenever a heading collided with the viewer's username. It is matched exactly, which costs nothing because the profile's own sub-views are query-string tabs. A first attempt generalised this to "any single-segment path", which was wrong — nearly every tab path is one segment, and it would have broken `/messages/123` keeping Messages selected. The rule is keyed to the tab whose path is user data.
- **Honest note on the sweep:** its first run reported the selected tab as white and looked like a cascade defect. Diagnosing it against the DOM (rather than adjusting the probe until it agreed) showed only two colour rules matched and the more specific one *was* the accent — the probe was reading `getComputedStyle` in the same tick it added the class, so it captured the `transition: color` mid-flight at its start value. The probe now settles the transition before measuring. Same class of harness defect as the last two sessions found, and diagnosed the same way.
- User approval: obtained for the tab sets and for closing Phase 1 with this bullet (§8.2).

**Open issues/blockers**
- **A real finding that belongs to Phase 2, measured here because the sweep now covers the whole shell:** the dashboard's own content — not the new chrome — has 5 text nodes below the 11px floor (`ckm-ov__mover-head` 8.5px, `ckm-ov__mover-note` 10.5px, three `ckm-ov__top-meta` 10px) and roughly 25 colour pairs below 4.5:1, the worst being `ckm-ov__top-rank` at 1.82:1 and `ckm-ov__glance-label` at 2.69:1. This is Phase 0 baseline debt; the Phase 2 dashboard slice owns it. Listed in `next_action` so it is not rediscovered.
- The unread badge is **not wired**. `NavBar`/`AppBar` accept `msgCount` and the dashboard does not pass one, so the Messages tab shows no count in production. Wiring it means giving mobile access to the shell's notification session without standing up a second socket — a Phase 2 "wire real services" task.
- The role-aware bar is **exercised, not yet reachable, for three audiences.** `/dashboard` is the only implemented mobile route and its manifest entry is writer-only, so the industry, reader and admin bars exist and are verified in the gallery and in tests, but no production URL renders them yet. That resolves as Phase 7 lands those audiences.
- Tapping a tab other than Dashboard **leaves the mobile experience** and lands on the responsive desktop page, because the route policy marks those routes `desktop-migration-fallback`. That is §5.1's sanctioned behaviour and is a better answer than the "use desktop" dead end it replaces, but it is a seam a user can feel until Phase 2–5 land those screens.
- `useKeyboardInset` remains unexercised (carried). 200% text zoom remains unexercised (carried) — the four-column tab bar at 320px is now the most likely thing to break under it. The `@supports not selector(:has(a))` fallback remains unexercised (carried). The safe-area-top change from Phase 0 is still unverified on a notched device (carried).
- The two `AppShell.render.test.jsx` failures remain pre-existing desktop-shell debt in their own workstream, re-confirmed as unrelated this session.

**Exact next action**
- As recorded in §19.1: open Phase 2 and claim its first bullet, the dashboard research/parity audit against desktop `pages/Dashboard.jsx`, then the three follow-on tasks in order (wire real services; migrate the four overlays onto `Sheet` and delete `BottomSheet`; retire every `desktopOnly()` call-site and delete `DynamicIsland`). Delete the now-callerless `TopBar`/`BottomNav` files and drop their prefixes while there.

---

#### 2026-08-05 20:40 +05:30 — Claude (Claude Code) — Phase 1 (the state set)

**Requested continuation:** "continue in native app implementation".

**Starting checkpoint:** Verified against the repository before claiming, as §20.4 requires — there was no `components/feedback/` directory and no `useOnlineStatus`, so the ledger's `next_action` was accurate. The item was claimed in §19.1 before any code was edited (§20.8).

**Work item claimed:** Phase 1 bullet 7 in full — toast/status, inline error, retry, skeleton, empty state, offline — including the three decisions the previous session's `next_action` demanded be made explicitly.

**Research performed**
- Sources fetched: [ARIA APG Alert pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alert/) — assertive and interrupting, must never take focus, not announced if already present at load, and **"avoid designing alerts that disappear automatically"**; [W3C Understanding SC 2.2.1 Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html) — the exception list, and its worked example that a notification may vanish *because the information stays reachable elsewhere*; [MDN `navigator.onLine`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine) — "inherently unreliable", `true` non-conclusive (a LAN with no upstream still reports online), `false` more trustworthy, and the explicit instruction to hint rather than to disable. Added to §17 as sources 20–22.
- Repository research: `components/DynamicIsland.jsx` (the message is a `<button>`; single slot, no queue; 3s auto-dismiss for everything; its production purpose is `notify.desktopOnly()`), `components/lists/LoadMore.jsx` for the SC 4.1.3 status contract the plan told this session to reuse, `hooks/useInertBackground.js`, `shell/MobileShell.{jsx,css}` and `components/BottomNav.css` (the tab bar's height is content-driven, not the `--ckm-bottom-nav-h` token — the reason the toast lift is measured rather than assumed).
- Decisions adopted: the toast/inline split is **"something happened" vs "something is"**, and it decides shape everywhere in this slice; the persistence rule is enforced in code rather than written in a comment; connectivity is reported asymmetrically because the two values are not equally trustworthy.
- Patterns rejected and why: **hosting the toast in `MobileShell`** — the plan's `next_action` suggested it and it solves the bottom-nav offset for free, but the most common toast in any app ("Project deleted", then navigate) is raised immediately before a route change, and a shell-hosted host unmounts with the outgoing screen, destroying the message at the moment it is meant to be read; **stacking multiple toasts** — two on a 320px phone is most of the screen and two live regions changing at once is a screen reader talking over itself; **a fifth `Button` intent for the toast action** — the terracotta `tertiary` label measures 3.99:1 on ink, and the plan allows four intents deliberately, so the toast draws its own action instead; **auto-dismissing anything actionable** — source 20, directly.

**Desktop parity inventory**
- Desktop files inspected: none changed. These are presentation primitives with no service dependency.
- Data/services/hooks: none consumed. `useOnlineStatus` reads a browser API, not an endpoint, and deliberately fires no request of its own.
- Roles/permissions/quotas, routes/query/navigation: unchanged.
- Page states and child overlays: this slice *is* the state set; the overlay set is unchanged apart from the inert exemption.

**Wireframe/design decision**
- Shell: gained one slot it did not have — the connectivity region, below the app bar and above the scroll body, in flow. Every screen inherits it by adopting the shell, the contract §5.6 already established for scroll-depth analytics. `onConnectionRestored` is the only new prop.
- Scroll hierarchy: unchanged. The toast layer is absolutely positioned and adds no scroll surface; asserted by the sweep's single-`<main>` and no-horizontal-scroll checks.
- Primary/secondary actions: a toast carries at most one action, deliberately. Two competing actions in a surface that may vanish is a decision the user is being rushed into; if a real choice is needed that is a `ConfirmDialog`, which is modal precisely because it waits.

**Changes made**
- Files added: `components/feedback/` — `toastContext.js`, `Toast.{jsx,css}`, `ToastProvider.jsx`, `InlineMessage.{jsx,css}`, `OfflineBanner.{jsx,css}`, `Skeletons.{jsx,css}`, `feedback.test.jsx`; `hooks/useOnlineStatus.js`.
- Files modified: `hooks/useInertBackground.js` (the live-region exemption), `hooks/overlayHooks.test.jsx` (its regression test), `shell/MobileShell.{jsx}` + `MobileShell.test.jsx` (the banner, asserted for all six modes), `MobileApp.jsx` (ToastProvider above the router), `components/EmptyState.jsx` (`titleAs`), `theme/cssPrefixRegistry.js` (3 prefixes + a second owner for `ckm-skel`), `dev/PrimitiveGallery.jsx` (five new rows), and this plan (§7.2, §11, §17, §19).
- Shared logic extracted: "may this message disappear?" and "does this message interrupt?" are now two pure functions in one module, so a fifth caller cannot answer them differently.
- Route/prefix registration: `ckm-toast`, `ckm-message`, `ckm-offline`; `ckm-skel` re-registered with two owner files.

**Verification**
- Automated: `npx vitest run src/mobile` → 19 files / 206 tests (was 18 / 179). Full `npx vitest run` → 747 passed / 2 failed, the same pre-existing `AppShell.render.test.jsx` failures carried since Phase 0. ESLint clean on every touched file. `npm run build` → passed, 53 routes prerendered.
- Viewports/devices/browsers: headless Chrome over CDP at 320×720, 360×800, 390×844, 430×932, 768×1024. Identically at every width: 10 state surfaces with **0 targets under 44×44** (`::after` hit regions measured, not assumed), 0 unnamed controls, 0 text under 11px, 0 elements past the frame, `documentElement.scrollWidth === innerWidth`.
- Accessibility checks: the decisive one is the inert exemption **measured in a real browser** — with a full-screen dialog open, `.ckm-shell__app-bar`, `.ckm-offline` and `.ckm-shell__scroll` all carried `inert` while `.ckm-toast__layer` did not, and a toast raised beforehand was still tappable *and was actually dismissed* from over the dialog. Also: the error toast routed to `role="alert"` and the rest to `role="status"`; a real dispatched Tab produced `solid 2px rgb(255,255,255)` on the toast's dismiss control (the shared terracotta ring is near-invisible on ink, so this surface overrides it); the error icon measured 8.66:1 on ink and the offline banner 4.90:1.
- Offline was exercised with real `Network.emulateNetworkConditions`, not a stub: `navigator.onLine` flipped to `false`, the banner appeared, was measured as *displacing* the scroll body rather than covering it, then showed the recovery state with a 78×44 action that cleared on dismiss.
- Timing was re-verified in a real browser because the unit suite stubs framer-motion: an acknowledgement still present at 3.4s and gone by 6.0s; a three-message queue advancing First → Second → error in order; the error still on screen at t+15s; and under emulated `prefers-reduced-motion` the toast still appeared and still left, with the skeleton pulse measured at `1e-06s`.
- Performance checks: no new dependency. The toast layer renders two empty divs when idle; skeletons are CSS-animated with no JS timer.

**Decisions or deviations**
- **Decision: `DynamicIsland` superseded, not upgraded** — the call the previous session's `next_action` asked for, made the same way as `ckm-btn`→`ckm-button`, `ckm-tabs`→`ckm-tabbar` and `ckm-sheet`→`ckm-bottom-sheet`. Reason, and it is a shape difference rather than a style one: the Island makes the entire message a `<button>`, so it can never carry an "Undo" (a button cannot nest in a button) and its accessible name is the whole card; it has one slot and no queue, so a second message clobbers the first; it auto-dismisses everything at 3s including errors; and its one production caller is `notify.desktopOnly()`, which §2.8 deletes by completion. Both providers are mounted during migration, with a comment in `MobileApp.jsx` recording that no single screen may use both (§13).
- **Decision: the persistence rule is enforced, not documented.** `toastPersists()` makes an error or an actionable toast ignore any `duration` it is handed, and says so in a dev-mode warning. Reason: source 20 says plainly to avoid alerts that vanish, and source 21's own example shows the test is whether the information survives elsewhere — an "Undo" that fades has taken the user's ability to act with it. A rule that lives only in a comment is a rule the fifth call-site breaks.
- **Finding, and the reason `aria-atomic` is absent: a test caught a double-announcement.** The obvious markup — `aria-atomic="true"` so the whole region is read rather than a fragment — is wrong here. A dismissed toast stays mounted for the length of its exit animation, so for ~200ms the region holds the outgoing message *and* the next one from the queue, and atomic would read both as one utterance. Left non-atomic, only the added subtree is announced (the new toast in full) and removals are announced not at all. The same reasoning removed it from the offline banner.
- **Decision: `useOnlineStatus` derives its recovery state during render, not in an effect.** ESLint's `react-hooks/set-state-in-effect` flagged the first version and was right twice over: the effect form is a cascading render, and it also renders one frame of the wrong thing — the bar would still read "offline" for a frame after the connection returned.
- **Known, deliberate: the offline banner goes inert while a modal is open.** Measured, not assumed. It is screen chrome that sits visually behind the dialog, so announcing it while it cannot be seen or reached would be the mismatch; a modal that needs to report a connectivity failure reports it inline, or raises a toast, whose layer *is* exempt. Recorded here so it is a decision rather than a surprise.
- **Honest note on the sweep:** it reported 5 failures on the first run, all one assertion, and **all 5 were harness defects**. The probe asserted `.ckm-shell` was inert; the DOM showed it correctly is not — the overlay lives *inside* the shell, so the shell is the walk's container and what must go inert is its other children. Diagnosed by dumping the actual inert tree before touching the probe, rather than by relaxing the check.
- **Deviation worth naming:** `EmptyState`'s new `titleAs` defaults to `"div"`, preserving the existing markup exactly, rather than to a heading. A titled block with no heading is worse markup, but this component is a verified Phase 0 baseline used by four dashboard sections, and moving its heading outline belongs to the Phase 2 slice that owns the dashboard. New callers pass `titleAs="h3"`; the gallery does.
- User approval, if required: none — covered by the canonical plan.

**Open issues/blockers**
- **Phase 1 bullet 2 is blocked on a product decision**, and it is now the only thing between this phase and its exit gate. §8.2 says the two-item Dashboard/Challenge bar is provisional and proposes writer/industry/reader/admin tab sets that need user approval. See `next_action`.
- The unit suite **stubs framer-motion** in `feedback.test.jsx`, because happy-dom never completes an exit animation and every queue assertion would otherwise be testing the animation library. The behaviour that stub gives up is re-verified in a real browser (above), but it is a seam future sessions should know exists.
- Swipe-to-dismiss on a toast was **not built and not verified**. §14 forbids an action available only by gesture, so the dismiss button is the contract; a swipe would be an addition, needing real touch input to test.
- The toast layer's bottom-nav clearance depends on one `:has()` rule. `CSS.supports("selector(:has(a))")` measured `true` in Chrome 150, so **the no-`:has()` fallback path is unexercised** — the same debt Card and Chip already carry.
- `useKeyboardInset` remains unexercised (carried). A toast is bottom-anchored, so it is now a third component that the virtual keyboard can interact with, and nothing here proved that either.
- 200% text zoom remains unexercised (carried). The toast's three-column grid at 320px is the most likely thing to break under it.
- The safe-area-top change from Phase 0 is still unverified on a notched device (carried).
- The two `AppShell.render.test.jsx` failures remain pre-existing desktop-shell debt in their own workstream.

**Exact next action**
- As recorded in §19.1: decide bullet 2 — ask the user to approve the §8.2 tab sets and build the role-aware chrome, or close Phase 1 explicitly without it and carry it into Phase 2. Do not tick it silently. Either way the first code task after is Phase 2's dashboard parity audit, then migrating the four dashboard overlays onto `Sheet` and the `desktopOnly()` call-sites onto `useToast()`.

---

#### 2026-08-05 18:45 +05:30 — Claude (Claude Code) — Phase 1 (overlay set + focus/scroll helpers)

**Requested continuation:** "continue in native app implementation".

**Starting checkpoint:** Verified against the repository before claiming, as §20.4 requires — there was no `components/overlays/` directory and no focus-trap or scroll-lock hook in `hooks/`, so the ledger's `next_action` was accurate.

**Work item claimed:** Phase 1 bullet 8 (scroll lock, focus trap/restoration, reduced motion, safe-area/keyboard helpers) **first**, then bullet 6 (the overlay set) on top of them, in the order the previous session's `next_action` specified.

**Research performed**
- Sources fetched: [W3C ARIA APG Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) (initial focus placed deliberately — *least destructive option* for a destructive action; Tab/Shift+Tab wrap; Escape; focus returns to the invoker unless it is gone; and the warning not to claim `aria-modal` unless interaction outside really is prevented); [MDN `inert`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inert) (no clicks, no focus, no selection, no find-in-page, **and removed from the accessibility tree**); [MDN `<dialog>`/`showModal()`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog); [APG Menu Button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) and [APG Menu](https://www.w3.org/WAI/ARIA/apg/patterns/menu/) (roving tabindex, arrows, Escape returns focus to the button, **Tab exits the menu entirely**); [Inclusive Components: Menus & Menu Buttons](https://inclusive-components.design/menus-menu-buttons/). Added to §17 as sources 16–19.
- Repository research: `components/BottomSheet.jsx` (the dashboard-era sheet — Escape only, no focus trap, no inert, no scroll lock), `MobileApp.css` (`.ckm-root` is `max-width: 520px; overflow: hidden; isolation: isolate` — the fact that decided the `<dialog>` question), `MobileApp.jsx` (`ckm-html-lock` already locks the document), `MobileShell.jsx` (`overlays` slot is never mode-gated; `.ckm-shell` is `position: relative`).
- **A capability probe was run before designing, not after**: happy-dom implements `showModal()` and reflects `inert`, but enforces *neither* modal focus containment nor inertness — focus moved to a button outside an open modal and it took it. That removed "the browser does it and my tests prove it" as an argument for either design, and set the expectation that the CDP sweep is the only real proof. Recorded at the top of `Overlay.jsx` for whoever revisits the decision.
- Decisions adopted: the background is hidden with the browser's own `inert`, so the hard half of "modal" is not hand-written; the focus trap is only the small remainder (the wrap and the restoration policy); a destructive confirmation focuses Cancel; Escape and the scrim both resolve to *cancel*, never confirm.
- Patterns rejected and why: **native `<dialog showModal()>`** — better at focus containment, but the top layer is viewport-scoped and escapes `.ckm-root`, so at the 768px verification width the app is a 520px column and the dialog would be 768px wide, forcing every overlay to re-declare the frame geometry in a second place that can drift; **`role="menu"` for the context menu** — a desktop application-menu contract (arrows, Tab leaves) imposed on a short list of actions and links, replacing behaviour every user already has with behaviour they must discover; **drag-to-dismiss bound to the whole sheet surface** — it dismisses when the user meant to scroll the body, so the gesture is bound to the grip and header via drag controls.

**Desktop parity inventory**
- Desktop files inspected: none changed. These are presentation primitives with no service dependency.
- Data/services/hooks, roles/permissions/quotas, routes/query/navigation, page states: unchanged.

**Wireframe/design decision**
- Shell/top bar/bottom nav/back behaviour: unchanged; this slice adds no screen. Overlays mount through `MobileShell`'s existing `overlays` slot, outside the scroll surface.
- Scroll hierarchy: each overlay is a three-part column (fixed header / one scroll body / fixed footer) — deliberately the same shape as `MobileShell`, because a full-screen dialog *is* a screen while it is open. Asserted by test: exactly one `.ckm-scroll` inside a Dialog.
- Primary/secondary actions: `ConfirmDialog` puts Cancel first in the DOM (so Tab and a screen reader reach the safe option first) and reverses the visual order in CSS.

**Changes made**
- Files added: `hooks/` — `tabbable.js`, `useFocusTrap.js`, `useInertBackground.js`, `useScrollLock.js`, `useReducedMotion.js`, `useKeyboardInset.js`, `useOverlay.js`, `overlayHooks.test.jsx`; `components/overlays/` — `Overlay.{jsx,css}`, `Sheet.{jsx,css}`, `Dialog.{jsx,css}`, `ConfirmDialog.{jsx,css}`, `ActionSheet.{jsx,css}`, `overlays.test.jsx`.
- Files modified: `theme/base.css` (`.ckm-scroll.is-locked` → `is-scroll-locked`, with `touch-action: none`), `theme/cssPrefixRegistry.js` (5 prefixes; `ckm-sheet` re-noted as superseded), `dev/PrimitiveGallery.jsx` (two new rows, the four overlays wired into the shell's overlays slot, and a chip specimen corrected from `onClick` to `onSelect`), and this plan (§7.2, §11, §17, §19).
- Shared logic extracted: focus trapping, focus restoration, background inertness, scroll locking and Escape now have exactly one implementation each, composed by `useOverlay` so a fifth overlay cannot be written that forgets one.
- Route/prefix registration: `ckm-overlay`, `ckm-bottom-sheet`, `ckm-dialog`, `ckm-confirm`, `ckm-action-sheet`.

**Verification**
- Automated: `npx vitest run src/mobile` → 18 files / 179 tests (was 16 / 138). Full `npx vitest run` → 720 passed / 2 failed, the same pre-existing `AppShell.render.test.jsx` failures carried since Phase 0. ESLint clean on every touched file. `npm run build` → passed, 53 routes prerendered.
- Viewports/devices/browsers: headless Chrome over CDP at 320×720, 360×800, 390×844, 430×932, 768×1024, opening all four surfaces at each width. Identically at every width: 22 controls, **0 targets under 44×44** (`::after` hit regions measured, not assumed), 0 unnamed controls, 0 text under 11px, 0 elements past the 520px frame once the deliberately-scrolling chip rail is excluded, and `documentElement.scrollWidth === innerWidth`.
- Accessibility checks: the decisive evidence is **real dispatched key events** — 14 forward Tabs and 6 Shift+Tabs per surface per width (400 key events) never once put focus outside the surface. Escape then closed the surface, cleared `inert` from the background, released the scroll lock, restored the exact prior scroll position, and returned focus to the opening control. A destructive confirmation focused **Cancel** at all five widths. With a confirm dialog stacked over an action sheet: two layers, lower measured `inert`, upper live, focus inside the upper, and Escape closed only the top and made the sheet below live again.
- Performance checks: no new dependency (framer-motion was already in use by the dashboard sheets). Overlays render only when open, so a closed overlay costs nothing.

**Decisions or deviations**
- **Defect found and fixed by its own test — stacked overlays made each other inert.** The obvious design, "each overlay marks its own siblings inert", left a confirm dialog over a sheet with *both* surfaces inert and neither usable; which one won depended on effect order. Replaced with a single module-level stack in `useInertBackground`: only the topmost overlay is live, and every change recomputes from scratch. The lower overlays are siblings of the top one, so they are made inert by that same walk rather than by a rule of their own.
- **Worse defect the unit suite could not see — the inert walk was killing tap-to-dismiss.** The scrim is a *sibling* of the surface, so a walk starting at the surface marked the scrim inert, and an inert element fires no click events. happy-dom does not enforce `inert`, so the test asserting scrim dismissal passed anyway. Fixed by giving `useOverlay` two refs — inertness is computed from the layer (keeping the scrim live), the focus trap is scoped to the surface (keeping the scrim out of the tab order). A regression test now asserts the scrim is not inside `[inert]`, and the CDP sweep proves the click still lands.
- Decision: `useScrollLock` locks the shell's `<main>`, not `body`. Reason: `ckm-html-lock` already locks the document, so the copy-pasted `body` scroll lock is a **no-op in this app**; and `inert` is not a substitute, because a touch drag over an inert scroll container still scrolls it.
- Decision: reduced motion *changes* the animation rather than shortening it. Reason: `theme/base.css` cannot reach framer-motion's inline transforms, and a sheet that still travels the height of the screen in 1ms is a flicker — worse for a vestibular disorder than the cross-fade it should have been.
- Decision: the full-screen dialog titles itself with an `<h2>`. Reason: the screen's own `<h1>` is still in the document while the dialog is open (inert, so unreachable, but present); emitting a second `<h1>` that is only sometimes hidden is more fragile than nesting under the one that is always there.
- Decision: `BottomSheet.jsx` superseded, not upgraded. Reason: consistency with the two precedents already set (`ckm-btn`→`ckm-button`, `ckm-tabs`→`ckm-tabbar`) — it is a verified Phase 0 baseline used by four dashboard overlays, and rewriting it here would move a baseline that is not this slice's to move. Phase 2 owns the migration.
- Honest note on the first sweep: it reported 29 failures, and **all 29 were harness defects, not product defects** — the probe read the scroll position before `.focus()` scrolled the opener into view, did not treat `<label for>` as naming a control, and did not exclude the chip rail that scrolls sideways on purpose. Each was diagnosed against the DOM before being changed, rather than the threshold being relaxed until it passed.
- User approval, if required: none — covered by the canonical plan.

**Open issues/blockers**
- `useKeyboardInset` is **unexercised**. It is wired into both sheet and dialog footers, but headless Chrome has no virtual keyboard, so nothing in this session proved it. It is the same debt §16.4 already carries for the form family, now with a second component depending on it.
- Drag-to-dismiss was **not** verified. It needs real touch input; the CDP sweep dispatches keys and clicks only. `touch-action: none` on the grab region is the part most likely to be wrong on a device.
- The `@supports not selector(:has(a))` fallback in Card/Chip remains unexercised (carried).
- 200% text zoom remains unexercised (carried). The centred confirm dialog's `max-height` is the most likely thing to break under it.
- The safe-area-top change from Phase 0 is still unverified on a notched device (carried).
- The two `AppShell.render.test.jsx` failures and the four unused-`motion` lint errors remain pre-existing debt in their own workstreams. This session avoided adding a fifth by aliasing the import (`motion as Motion`) rather than suppressing the rule.

**Exact next action**
- As recorded in §19.1: build the state set (bullet 7) — toast/status, inline error, retry, skeleton, empty state, offline — reusing `ckm-empty`/`ckm-skel` and LoadMore's SC 4.1.3 contract, and making the explicit supersede-or-upgrade call on `components/DynamicIsland.jsx` that this session made for `BottomSheet.jsx`.

---

#### 2026-08-05 17:55 +05:30 — Claude (Claude Code) — Phase 1 (collection and display family)

**Requested continuation:** "continue in native app implementation".

**Starting checkpoint:** Phase 1 action primitives and form family complete; the ledger's `next_action` named the collection and display primitives, starting with list row and card.

**Work item claimed:** The whole of Phase 1 bullet 5 — list row, card, chip, badge, segmented control, tabs, pagination/load-more.

**Research performed**
- Sources fetched: [W3C ARIA APG Tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) (roving tabindex so the bar is one Tab stop; Left/Right with wrap and Home/End; activation follows focus when panels render without latency; `tabindex="0"` on a panel that has no focusable content); [W3C Understanding SC 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) (a *count* — "18 results returned" — is a status message and must be announced through role/properties without taking focus, while the result list itself is not); [Inclusive Components: Cards](https://inclusive-components.design/cards/) (a block link makes the card's entire text the link's accessible name and forbids any second control inside it; the fix is one heading link whose `::after` covers the card, with nested controls raised by `position: relative`). All three added to §17 as sources 13–15.
- Repository research: `screens/sections/ProjectsSection.css` for the established card and collaborator-row language (hairline borders, Spectral titles, 14–18px radii), `components/SectionTabs.css` for the legacy `ckm-tabs` strip, and `theme/primitives.css` for the base chip the plan told this session to reuse rather than replace.
- Decisions adopted: a list is a real `<ul>`/`<li>`, because the announced item count is most of what a blind user knows about a list before committing to read it; a segmented control is a radio group and a tab bar is a tablist, decided by whether the choice *filters the same content* or *swaps panels*; badges are never interactive and chips always are.
- Patterns rejected and why: infinite scroll (unreachable footer, no answer to "where was I" after a back navigation, and pages loaded that were never asked for on a metered connection); a second chip family (`ckm-chip` was extended in place, per the plan's instruction); `<Card image title price…>` as one configured component (the fifth screen always needs a sixth arrangement — parts instead); hit-region overlays on chips (chips sit in tight rows, so overlapping overlays hand a mis-tap to the neighbour — interactive chips are drawn at the full 44px instead).

**Desktop parity inventory**
- Desktop files inspected: none changed. These are presentation primitives with no service dependency.
- Data/services/hooks: none consumed.
- Roles/permissions/quotas, routes/query/navigation: unchanged.
- Page states and child overlays: unchanged.

**Wireframe/design decision**
- Shell/top bar/bottom nav/back behaviour: unchanged; this slice adds no screen.
- Scroll hierarchy: two new *nested* scroll surfaces — the chip rail and the tab bar — both horizontal only, both with the page's own scroll measured as unaffected at every width.
- Primary/secondary actions: unchanged.

**Changes made**
- Files added: `components/lists/` — `List.{jsx,css}`, `listContext.js`, `ListRow.{jsx,css}`, `LoadMore.{jsx,css}`, `lists.test.jsx`; `components/cards/` — `Card.{jsx,css}`, `Card.test.jsx`; `components/badges/` — `Badge.{jsx,css}`; `components/chips/` — `Chip.{jsx,css}`, `Chip.test.jsx`; `components/tabs/` — `SegmentedControl.{jsx,css}`, `Tabs.{jsx,css}`, `tabIds.js`, `tabs.test.jsx`.
- Files modified: `theme/tokens.css` (four `*-ink` tokens — see the finding below), `theme/cssPrefixRegistry.js` (8 new prefixes, plus a second owner file recorded for `ckm-chip`), `components/forms/Switch.jsx` (`srOnlyLabel`, so a switch can sit in a list row whose title is already its label), `dev/PrimitiveGallery.{jsx,css}` (seven new rows), and this plan (§7.2, §11, §17, §19).
- Shared logic extracted: one `::after` overlay technique, used by both `Card` and `ListRow`, so "the whole surface is tappable and still holds a second control" has exactly one implementation; `tabIds.js` so a `TabPanel` can be wired to its tab from anywhere on the screen without a context.
- Route/prefix registration: `ckm-list`, `ckm-row`, `ckm-load-more`, `ckm-card`, `ckm-badge`, `ckm-chip-row`, `ckm-segmented`, `ckm-tabbar`; `ckm-chip` re-registered with two owner files.

**Verification**
- Automated: `npx vitest run src/mobile` → 16 files / 138 tests (was 12 / 99). Full `npx vitest run` → 679 passed / 2 failed, the same pre-existing `AppShell.render.test.jsx` failures carried since Phase 0. ESLint clean on every touched file. `npm run build` → passed, 53 routes prerendered.
- Viewports/devices/browsers: headless Chrome over CDP at 320×720, 360×800, 390×844, 430×932, 768×1024. At every width, identically: **37/37 targets ≥44×44** (the `::after` hit region is *measured* through `getComputedStyle(el, "::after")`, not assumed, and the card's target is measured as the card rather than as its title text); **no text under 11px** anywhere in the new primitives; **no unnamed button or link** (`aria-labelledby` resolved, not just `aria-label`); **0 nested interactive elements** (`a button`, `button a`, `a a`); 9 list items and **0 orphan `<li>`**; 0 elements spilling past the viewport once the two deliberately-scrolling rails are excluded; and `documentElement.scrollWidth === innerWidth`.
- Accessibility checks: real `Input.dispatchKeyEvent` traversal — Tab lands on the *selected* tab (roving tabindex), ArrowRight → next, End → last, Home → first, ArrowLeft → wraps to last, each with `aria-selected="true"`, an `rgb(209,77,55) solid 2px` ring, and the focused tab inside the viewport (SC 2.4.11); one further Tab leaves the bar and lands on the tab panel, proving both the single stop and the panel's reachability. Computed colours confirmed against the intended tokens: badge text `rgb(42,122,72)` / `rgb(138,100,20)` / `rgb(186,64,52)` / `rgb(176,58,34)`, idle segment and tab labels `rgb(111,105,95)` on `rgb(251,250,247)` and `#fff` (5.3:1 and 5.5:1), chip border `rgb(141,135,126)` (the 3:1 token).
- Performance checks: no new dependency. `CardMedia` reserves its box with `aspect-ratio` and lazy-loads, so a list of cards does not reflow as images arrive.

**Decisions or deviations**
- Finding (the one that changed tokens): **none of the semantic colours is legible as small text on its own soft background.** Measured: `--ckm-green` on `--ckm-green-bg` ~3.88:1, `--ckm-gold` on `--ckm-gold-bg` ~2.95:1, `--ckm-red` on `--ckm-red-bg` ~4.47:1, `--ckm-accent` on `--ckm-accent-soft` ~3.93:1 — all fail SC 1.4.3, and a status badge is exactly where these pairings get used. Added `--ckm-green-ink`, `--ckm-gold-ink`, `--ckm-red-ink`, `--ckm-accent-ink`: the same hues darkened only as far as 4.5:1 requires (4.76 / 4.90 / 4.81 / 5.50:1 on their soft backgrounds), and chosen so one token also serves as a solid fill under white (5.28 / 5.37 / 5.42 / 6.09:1). The shape colours are unchanged and still correct for dots, bars and icons; the dashboard's existing chips were left untouched.
- Decision: a row or card that navigates *and* carries its own control is a positioned container with a `::after` overlay on its primary link, not a block link. Reason: source 15; the alternative makes the link's accessible name the whole row and makes the second control illegal. Cost, recorded honestly: the overlay masks text selection inside a linked row or card, so a surface whose text must be copyable should be non-interactive and put its action in the `action` slot.
- Decision: `SegmentedControl` is a radio group, `Tabs` is a tablist. Reason: they look alike and are not alike — the first changes what one list shows, the second swaps panels, and only the second has panels to point `aria-controls` at.
- Decision: interactive chips are drawn at the full 44px rather than at 32–36px with a `hitSlop` overlay, unlike the small icon button. Reason above.
- Decision: `ckm-tabs` (the dashboard's 9px uppercase strip) was **not** retired, matching the earlier decision to leave `ckm-btn` alone — it is a verified baseline and Phase 2 owns it. It is now marked superseded in §7.2.
- Two eslint findings worth carrying: a module that exports both a component and a hook/helper breaks React Fast Refresh, which is why `listContext.js` and `tabIds.js` exist as their own files; and `as: As = "article"` destructuring is not seen as a JSX use, so polymorphic components assign `const Surface = as` instead.
- User approval, if required: none — covered by the canonical plan.

**Open issues/blockers**
- `Card` and `Chip` put the focus ring on the pill/card through `:has()`, with an `@supports not selector(:has(a))` fallback that puts it back on the inner control. Chrome 150 was used for verification, so the fallback path itself is **unexercised**.
- The horizontal rails (chip row, tab bar) were verified for overflow and keyboard, but **not** for a two-finger/trackpad horizontal gesture on a real device, and not with `prefers-reduced-motion` interacting with `scroll-snap`.
- Everything owed from previous sessions still stands: the virtual-keyboard result is a resized-viewport proxy rather than a real soft keyboard; 200% text zoom is unexercised; the safe-area-top change is unverified on a notched device; the two `AppShell.render.test.jsx` failures and the four unused-`motion` lint errors remain pre-existing debt.

**Exact next action**
- As recorded in §19.1: build bullet 8's scroll-lock / focus-trap / focus-restoration helpers first, then the overlay set on top of them (deciding explicitly what happens to the existing `components/BottomSheet.jsx`), then the state set reusing `ckm-empty`, `ckm-skel` and LoadMore's SC 4.1.3 contract.

---

#### 2026-08-05 17:20 +05:30 — Claude (Claude Code) — Phase 1 (form family)

**Requested continuation:** "continue in native app implementation".

**Starting checkpoint:** Phase 1 action primitives landed and shipped as PR #502 on `feat/mobile-native-app-phase-1`. The ledger's `next_action` named the form family.

**Work item claimed:** Field, text field, textarea, select, checkbox, radio group, switch, file picker — with the keyboard-open verification the previous session recorded as owed.

**Research performed**
- Sources fetched: [W3C Understanding SC 3.3.3 Error Suggestion](https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html) (an error must suggest the correction, not just report failure — hence messages like "Enter a valid email address, like name@example.com" rather than "Invalid"); [MDN `inputmode`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inputmode) (the full value list, and the rule that `inputmode` hints the keyboard while `type` is what validates — so both are set, never one); [MDN `<input type="text">`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/text) (explicit warning against using `placeholder` as a label).
- Repository research mattered more than the web here: `client/src/pages/admin/ui/fields.jsx` already implements a `Field` render-prop with id wiring, "error replaces help", and `role="alert"`. The mobile family adopts that same contract deliberately, so the two halves of the codebase read the same way (plan §5.4: share the behaviour, not the CSS).
- Decisions adopted: `purpose` sets `type` + `inputMode` + `autoComplete` together, because setting one and forgetting the others is the usual bug; native `<select>`, never a custom listbox; a switch is `role="switch"` and means "takes effect now", a checkbox means "commits on save".
- Patterns rejected and why: a searchable combobox (only earns its cost where a list must be *filtered* — deferred to the screen that needs it rather than built speculatively); `type="number"` for page counts (drops leading zeros, gives a phone a spinner) — `inputMode="numeric"` on a text input instead; `display: none` on the real checkbox/radio inputs (removes them from the accessibility tree) — `opacity: 0` with the drawn indicator as a sibling.

**Desktop parity inventory**
- Desktop files inspected: `pages/admin/ui/fields.jsx` (read for its contract, not modified). No desktop file changed this session.
- Data/services/hooks: none. Validation stays with the caller — `FilePicker` reports a selection and renders the error it is handed, so the desktop upload's existing rules remain the single source of truth.
- Roles/permissions/quotas, routes/query/navigation: unchanged.
- Page states and child overlays: unchanged.

**Wireframe/design decision**
- Shell/top bar/bottom nav/back behaviour: unchanged; this slice adds no screen.
- Scroll hierarchy: unchanged, but the field now participates in it — see the keyboard finding below.
- Primary/secondary actions: unchanged.

**Changes made**
- Files added: `components/forms/` — `Field.{jsx,css}`, `Control.css`, `TextField.jsx`, `TextArea.jsx`, `SelectField.jsx`, `Checkbox.{jsx,css}`, `RadioGroup.{jsx,css}`, `Switch.{jsx,css}`, `FilePicker.{jsx,css}`, `formatFileSize.js`, `forms.test.jsx`.
- Files modified: `theme/cssPrefixRegistry.js` (6 prefixes), `dev/PrimitiveGallery.jsx` (six new rows with live state, plus a deliberate last-field-on-the-page fixture for the keyboard case), and this plan.
- Shared logic extracted: one control box (`ckm-control`) for input/textarea/select, so a screen cannot produce a second field shape; one label/hint/error column (`ckm-field`) reused even by the choice controls' error rows.
- Route/prefix registration: `ckm-field`, `ckm-control`, `ckm-checkbox`, `ckm-radio`, `ckm-switch`, `ckm-file-picker`.

**Verification**
- Automated: `npx vitest run src/mobile` → 12 files / 99 tests (was 15 files / 68 — the form suite is one file). Full `npx vitest run` → 640 passed / 2 failed, the same pre-existing `AppShell.render.test.jsx` failures. ESLint clean on the new files (the 4 unused-`motion` errors elsewhere in `src/mobile` are pre-existing at HEAD). `npm run build` → passed, 53 routes prerendered.
- Viewports/devices/browsers: CDP sweep at 320×720, 360×800, 390×844, 430×932, 768×1024. Across 18 form controls at every width: **no typed control renders below 16px**, **no control's hit region is under 44px** (measured on the row that owns the target, since checkbox/radio/file inputs are transparent overlays), **no control lacks an accessible name**, **every `aria-invalid` control's error text is reachable through `aria-describedby`**, and no element exceeds the viewport.
- Accessibility checks: the above, plus `role="switch"`/`aria-checked` on the switch and `fieldset`/`legend` grouping with the error attached to the group rather than to one radio.
- Performance checks: no new dependency; no runtime cost beyond the controls themselves.

**Decisions or deviations**
- Finding (the reason the keyboard check was worth doing): with the visual viewport collapsed to 390px — roughly what a keyboard leaves on a 390×844 device — the browser scrolled the focused input into view and left **its error message below the fold**. The user was being told something was wrong by text they could not see. Fixed with `scroll-margin-block` on `.ckm-control`, sized to a two-line message plus a counter; re-measured, and the field (274–318) and its error (326–342) are now both inside the 390px viewport. This is the field-level half of the pair whose surface-level half (`scroll-padding`) landed last session.
- Finding: the character counter rendered *above* the hint, because anything the render-prop returns precedes the wrapper's own text. `Field` gained a `meta` slot rendered beside the hint — and `meta` survives an error, since a count still matters while you are fixing one.
- Finding: `SelectField`'s placeholder never appeared. A disabled first option is not enough — the browser selects the first *enabled* option, so an untouched select read as "Drama" and would have submitted it. It now also sets `defaultValue=""`, but only when the caller is not driving the value.
- Decision: no combobox. Reason: recorded above; the plan's Phase 1 bullet is marked with that deviation rather than silently ticked.
- User approval, if required: none — covered by the canonical plan.

**Open issues/blockers**
- The virtual-keyboard result is a **proxy**: a resized headless viewport, not a real soft keyboard. iOS Safari's behaviour differs (the visual viewport moves rather than resizing the layout viewport), so §16.4 still owes this on a physical device.
- 200% text zoom remains unexercised; still owed.
- The two `AppShell.render.test.jsx` failures and the four unused-`motion` lint errors remain pre-existing debt in their own workstreams.
- The safe-area-top change from Phase 0 is still unverified on a notched device.

**Exact next action**
- Continue Phase 1 with the collection and feedback primitives — list row and card first (`components/lists/`, `components/cards/`), since every Phase 4 discovery screen depends on them — then segmented control, tabs, load-more, and the overlay set (bottom sheet, full-screen dialog, confirm dialog, context menu) together with focus trapping and restoration, which is still unbuilt. Reuse the existing `ckm-chip` rather than minting a second chip.

---

#### 2026-08-05 16:55 +05:30 — Claude (Claude Code) — Phase 1 (opening slice)

**Requested continuation:** "continue in native app implementation".

**Starting checkpoint:** Phase 0 complete and verified against the repository (route manifest/policy, shell modes, boundary, tokens, CSS contract, analytics all present). Phase 1 not started.

**Work item claimed:** The action primitives the shell already implies — page header, back button, icon button, primary/secondary/tertiary/destructive buttons — plus the Phase 1 demo harness, pulled forward so every later primitive is verifiable at 320–768 px without a real screen.

**Research performed**
- Sources fetched this session: [React Native Pressable](https://reactnative.dev/docs/pressable) (press lifecycle, `HitRect`/`hitSlop`, default `pressRetentionOffset` `{20,20,20,30}`, `disabled`); [W3C Understanding SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) (24 px floor, five exceptions, the 24 px undisturbed-circle spacing rule); [W3C Understanding SC 2.4.11 Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) — **newly adopted, added to §17 as source 12**.
- The Apple HIG buttons page could not be read (JS-rendered; the fetch returned only its title). The 44 pt figure already recorded in §17.8 was therefore *not* re-verified this session and is carried forward unchanged.
- Router behaviour was verified against the installed dependency rather than a doc: `react-router` 7.13.1 `getUrlBasedHistory` seeds `idx: 0` on the entry it adopts and increments on every push, so `window.history.state.idx > 0` is a truthful "this app has a previous entry" signal.
- Decisions adopted: press feedback is immediate and never hover-derived; a control may look smaller than 44 px but its *hit region* never is; `pending` keeps a control focusable and announced rather than disabling it mid-task; `to`/`href` keep navigation a real link.
- Patterns rejected and why: a terracotta primary button (measured ~4.35:1 for white label text — fails SC 1.4.3, so `primary` is ink); `navigate(-1)` inside screens (walks a deep-linked user out of the app); a `titleAs` escape hatch on PageHeader (would weaken the one-`h1`-per-screen guarantee the component exists to give); retiring `.ckm-btn` now (it is the dashboard's verified baseline — Phase 2 owns that).

**Desktop parity inventory**
- Desktop files inspected: `App.jsx` only, to add the development-only harness route beside the existing preview route. No desktop page, service or style was touched.
- Data/services/hooks: none consumed; these are presentation primitives.
- Roles/permissions/quotas: unchanged.
- Routes/query/navigation: one new `dev-only` route, `/__mobile-primitives`, registered in the manifest and mirrored into the coverage test's App.jsx list (88 patterns).
- Page states and child overlays: unchanged.

**Wireframe/design decision**
- Shell: the harness runs on `MobileShell` in `detail` mode — the first real consumer of a non-standard shell mode.
- Top bar: `PageHeader` = back + title column (eyebrow/title/subtitle) + actions, left-aligned rather than iOS-centred, because a centred title cannot survive two actions and a screenplay name at 320 px.
- Scroll hierarchy: one `<main>`, asserted by the CDP probe at all eight widths.
- Primary/secondary actions: four intents, four only — primary (ink), secondary (outlined), tertiary (text), destructive (red).
- Bottom navigation: none; `detail` mode forbids it.
- Nested screens/sheets/dialogs: not in this slice.
- Keyboard/safe-area/back behavior: `useMobileBack` implements §8.3; `PageHeader` inherits the shell's safe-area top and adds its own left/right insets for landscape.

**Changes made**
- Files added: `components/buttons/Button.{jsx,css,test.jsx}`, `components/buttons/IconButton.{jsx,css,test.jsx}`, `components/navigation/BackButton.{jsx,css,test.jsx}`, `components/app-bars/PageHeader.{jsx,css,test.jsx}`, `hooks/useMobileBack.js`, `dev/PrimitiveGallery.{jsx,css}`.
- Files modified: `theme/tokens.css` (additive: control geometry, press/disabled/focus tokens, `--ckm-on-dark`, `--ckm-accent-strong`, `--ckm-control-border`), `theme/base.css` (`ckm-sr-only`), `theme/cssPrefixRegistry.js` (6 prefixes), `shell/MobileShell.css` (SC 2.4.11 `scroll-padding`), `routes/mobileRouteManifest.js`, `routes/mobileRouteCoverage.test.js`, `routes/MobileRoutes.jsx`, `MobileApp.jsx` (`devScreen`), `client/src/App.jsx` (dev route), and this plan (§7.2, §9.9, §11, §17, §19).
- Shared logic extracted: back-navigation policy (`useMobileBack`) and visually-hidden text (`ckm-sr-only`) each now have exactly one implementation.
- Route/prefix registration: `ckm-button`, `ckm-icon-button`, `ckm-back`, `ckm-page-header`, `ckm-sr-only`, `ckm-gallery` registered in code and mirrored into §7.2.

**Verification**
- Automated: `npx vitest run src/mobile` → 15 files / 68 tests (was 7 / 41). Full `npx vitest run` → 54 files, 610 passed / 2 failed — the same two pre-existing `AppShell.render.test.jsx` `.ck-mobile-nav` failures carried in this ledger since the first Phase 0 session, in desktop-shell code this slice does not touch. ESLint clean on every touched file. `npm run build` → passed, 53 routes prerendered and verified.
- Viewports/devices/browsers: headless Chrome over CDP with `Emulation.setDeviceMetricsOverride` at 320×720, 360×800, 375×812, 390×844, 412×915, 430×932, 480×900, 768×1024. At every width: `documentElement.scrollWidth === innerWidth`, exactly one `<main>`, `data-shell-mode="detail"`, `data-screen-id="primitive-gallery"`, and no element extending past the viewport. Because the shell is `position: fixed`, full-page capture is useless — the harness scrolls `<main>` and captures per screenful.
- Accessibility checks: **32/32 controls measure ≥44×44** including the `sm` icon button's `::after` hit region (measured, not assumed). Real `Input.dispatchKeyEvent` Tab traversal produces `solid 2px rgb(209,77,55)` at 2 px offset on the focused control, and the focused control was inside the viewport (SC 2.4.11). A scripted `.focus()` was tried first and proved nothing — Chrome's `:focus-visible` heuristic ignores it; that false negative is why the harness dispatches real keys. Computed values confirmed: secondary border `rgb(141,135,126)` (the 3:1 token), badge `rgb(201,72,47)`, primary ink on white, label font IBM Plex Sans 14 px, title Spectral with a 2-line clamp.
- Performance checks: no new dependency; the gallery is lazily imported and behind `import.meta.env.DEV` in `App.jsx`, so it cannot reach a production bundle.

**Decisions or deviations**
- Decision: `--ckm-control-border: #8d877e` for the secondary button's boundary instead of the existing `--ckm-line*` hairlines.
- Reason: the hairline measures ~1.53:1 against the page and the border is the only thing identifying that control — SC 1.4.11 wants 3:1. `#8d877e` is the lightest value in the existing ramp that clears it (~3.56:1). The dashboard's legacy `.ckm-btn--ghost` was deliberately left alone so no verified baseline moves.
- Decision: `--ckm-accent-strong: #c9482f` for small white-on-brand text (badges).
- Reason: `--ckm-accent` measures ~4.35:1 with white, which fails AA for 11 px text. This is the same terracotta darkened only as far as 4.5:1 requires (~4.72:1).
- Decision (found by the harness, not by review): `.ckm-button` gained `min-width: var(--ckm-touch-target)`; below 360 px the labelled back button drops its text and the page-header title steps down to the section size.
- Reason: the 320 px measurement caught a single-character button at 43.9 px wide, and a labelled back button starving an 86-character title down to "An Unreason…". Both are exactly what the harness exists to surface.
- User approval, if required: none — covered by the canonical plan.

**Open issues/blockers**
- The two `AppShell.render.test.jsx` failures remain unreconciled desktop-shell test debt (carried, not introduced).
- The safe-area-top change from Phase 0 is still unverified on a physical notched device (§16.4).
- 200 % text zoom (§16.2) was **not** exercised this session; width reflow to 320 px was. It belongs with the form family, where zoom and the virtual keyboard interact.
- No Phase 1 baseline screenshots were committed. The harness changes with every new primitive, so a stored image would be stale within a slice; the measured values above are the evidence instead.

**Exact next action**
- Continue Phase 1 with the form family in `client/src/mobile/components/forms/` — field, textarea, select/combobox, checkbox, radio, switch, file picker — each with a registered prefix, a label tied to its control, errors tied by `aria-describedby` + `aria-invalid`, ≥16 px rendered input text so mobile Safari does not zoom on focus, a 44 px hit region, a render test, and a states row in `dev/PrimitiveGallery.jsx`. Verify with the keyboard open, not only at rest.

---

#### 2026-08-05 14:20 +05:30 — Claude (Claude Code) — Phase 0 (closing)

**Requested continuation:** "continue" (same session, after the shell/boundary/token slice).

**Starting checkpoint:** Phase 0 owed two items — CSS scoping/prefix normalization and mobile analytics behavior.

**Work item claimed:** Both remaining Phase 0 items, then the Phase 0 exit gate.

**Research performed**
- Sources: the repository's own tracking implementation (`tracking/usePageTracking.js`, `useClickTracking.js`, `analyticsClient.js`, `storage.js`), the server contract in `server/controllers/analyticsController.js`, and plan §7.1–7.2. CSS cascade behaviour was verified empirically in the running app rather than assumed.
- Decisions adopted: scoping is enforced by test, not convention; the registry lives in code and mirrors §7.2; mobile adds exactly one analytics behavior (`scroll_depth`) and re-fires nothing.
- Patterns rejected and why: renaming every dashboard section prefix to `ckm-dashboard__*` (large churn, no benefit — registering one prefix per file gives the same isolation guarantee); a mobile-specific `page_enter` (would double-count against the global tracker); polling `window.location` to detect route changes in the scroll hook (the shell is route-level, so Router context is the honest dependency).

**Desktop parity inventory**
- Desktop files inspected: `App.jsx` (bootstrap placement, `ScrollToTopOnRouteChange`), `components/AnalyticsBootstrap.jsx`, the four `tracking/` modules, `server/controllers/analyticsController.js`.
- Data/services/hooks: `sendTrackEvent`, `hasConsent`, `AuthContext`; `getUserContext` extracted to `tracking/userContext.js` and consent extracted to `tracking/useAnalyticsConsent.js`, both used by desktop and mobile.
- Roles/permissions/quotas: unchanged.
- Routes/query/navigation: unchanged. Confirmed `ScrollToTopOnRouteChange` already resets the first `<main>`, which is the shell's scroll surface — mobile route changes open at the top with no new code.
- Page states and child overlays: unchanged.

**Wireframe/design decision**
- No new screen. The shell gained a `screenId` prop that surfaces as `data-screen-id` and `data-track-section`.

**Changes made**
- Files added: `mobile/theme/cssPrefixRegistry.js`, `mobile/theme/mobileCssContract.test.js`, `mobile/analytics/useMobileScrollDepth.js` (+ test), `tracking/userContext.js`, `tracking/useAnalyticsConsent.js`.
- Files modified: all 20 mobile stylesheets with unscoped rules (315 selectors), `screens/Dashboard.css`/`.jsx` (prefix migration + `screenId`), `components/TopBar.jsx`/`.css` (named search label), `shell/MobileShell.jsx` (scroll-node handle, analytics, `screenId`; `scrollRef` became the `onScrollNode` callback), `shell/MobileShell.test.jsx` (router context), `components/AnalyticsBootstrap.jsx`, `tracking/usePageTracking.js`, `tracking/useClickTracking.js`, the Phase 0 baseline set and its README, and this plan (§5.6, §7.1, §7.2).
- Shared logic extracted: identity payload and consent state now have one implementation each.
- Route/prefix registration: 24 prefixes registered in code and mirrored into §7.2; `ckm-dash` retired.

**Verification**
- Automated: `npx vitest run src/mobile` → 7 files / 41 tests. Full `npm test` → 49 files / 583 tests pass with the two known pre-existing `AppShell.render.test.jsx` failures. ESLint clean on every file this session touched (the 4 remaining mobile component errors and 2 tracking warnings exist at HEAD and were confirmed pre-existing with `git show`). `npm run build` → passed with 53 routes prerendered and verified.
- Viewports/devices/browsers: headless Chrome over CDP at 320x720, 360x800, 390x844, 430x932, 768x1024. At every width `scrollWidth === innerWidth`, one `<main>`, `data-shell-mode="standard"`, `data-screen-id="dashboard"`, `.ckm-dashboard` present and `.ckm-dash` gone.
- The decisive check was an **element-by-element computed-style and geometry diff** of the running app before and after the scoping rewrite (114 elements, ~30 properties each). It confirmed the four intentional leak fixes and caught the one regression the rewrite introduced (`.ckm-topbar__search span` overpowering the Material Symbols font rule and breaking the search icon), which was fixed by giving the label its own class. A re-diff after the fix showed only the intended deltas.
- Accessibility checks: two of the four leak fixes are accessibility fixes — the avatar's initials were near-black on a near-black circle, and the inactive tab label rendered at full ink strength, misrepresenting the selected state.
- Performance checks: the scroll listener is passive and rAF-throttled; no new dependency was added.

**Decisions or deviations**
- Decision: the Phase 0 baselines were refreshed and the originals archived under `baselines/phase0-dashboard/pre-css-scoping/`, with every delta enumerated in that README.
- Reason: the post-scoping render is the authored design; keeping a baseline that encodes four style leaks would make future regressions harder to see, and the archive preserves the evidence.
- Decision: `MobileShell`'s `scrollRef` prop became `onScrollNode` (callback only).
- Reason: the shell must own its scroll surface; the lint rule against mutating a prop ref agreed. No consumer used the old prop.
- User approval, if required: none — covered by the canonical plan.

**Open issues/blockers**
- Pre-existing and unrelated: two `AppShell.render.test.jsx` failures (`.ck-mobile-nav`), and lint errors in four mobile components (unused `motion` imports) plus `usePageTracking.js` (`useRef(Date.now())` purity). All present at HEAD; they belong to their own workstreams.
- The safe-area-top change from the previous slice is still unverified on a physical notched device (§16.4).

**Exact next action**
- Open Phase 1: build the first primitives the shell already implies (page header, back button, icon button, primary/secondary/destructive buttons) on the expanded tokens — each with co-located CSS, a prefix registered in `theme/cssPrefixRegistry.js`, and a render test — and stand up the states/theme demo harness early so later primitives can be verified at 320–768 px without a real screen.

---

#### 2026-08-05 11:45 +05:30 — Claude (Claude Code) — Phase 0

**Requested continuation:** "continue in native app implementation".

**Starting checkpoint:** Route-aware resolution landed; Phase 0 still owed shell variants, route-level boundaries, and token expansion.

**Work item claimed:** Shell-mode contract, route-level suspense/error boundary, manifest shell-mode enforcement, and additive token expansion.

**Research performed**
- Sources re-checked from section 17: React Native shell/composition model (§17.1–3), Apple HIG 44 pt targets (§17.8), WCAG 2.2 reflow and target size (§17.6–7), MDN `env()` and dynamic viewport units (§17.9–10), `overscroll-behavior` (§17.11). No guidance changed direction; no new source adopted.
- Comparable interaction patterns: not applicable — this is the shared chrome contract, not a page redesign.
- Decisions adopted: the *route manifest*, not a screen's JSX, decides which chrome a route gets; a mode that forbids a slot drops it even when a screen passes one; overlays are never mode-gated so a dialog stays reachable in every mode; a route-level boundary owns both pending and failure, and clears on pathname change.
- Patterns rejected and why: a polymorphic `as` root (no real need, and it defeated the lint config); per-screen conditional chrome (scatters shell logic and invites a second competing shell); a global error boundary only (a failure would blank the whole app instead of degrading inside the shell).

**Desktop parity inventory**
- Desktop files inspected: none changed. This slice touches only `client/src/mobile/`.
- Data/services/hooks: unchanged; `useDashboardData` and the preview fixture are untouched.
- Roles/permissions/quotas: unchanged; `/dashboard` remains the only production `screen` and stays writer-only.
- Routes/query/navigation: unchanged contract; `MobileRoutes` still refuses to substitute Dashboard for an unmatched URL.
- Page states and child overlays: the dashboard's four overlays now mount through the shell's `overlays` slot with identical props and DOM order.

**Wireframe/design decision**
- Shell: `standard | detail | immersive | flow | public | admin`, each with a declared intent and chrome config in `mobileShellModes.js`.
- Top bar: the app-bar slot is a `flex: 0 0 auto` region carrying `--ckm-safe-top`, so chrome clears the notch (previously the dashboard's TopBar had no safe-area padding of its own).
- Scroll hierarchy: exactly one `<main class="ckm-shell__scroll ckm-scroll">` per screen, asserted by test.
- Primary/secondary actions: unchanged in this slice.
- Bottom navigation: rendered only by modes whose config allows it; when absent, the scroll body absorbs `--ckm-safe-bottom` so the last row never hides under the home indicator.
- Nested screens/sheets/dialogs: overlays render after chrome, outside the scroll surface.
- Keyboard/safe-area/back behavior: scroll body uses `overscroll-behavior: contain`; back behavior unchanged; the boundary resets on pathname change so a failed screen cannot follow the user forward or back.

**Changes made**
- Files added: `mobile/shell/mobileShellModes.js`, `MobileShell.jsx`, `MobileShell.css`, `MobileRouteBoundary.jsx`, `MobileRouteBoundary.css`, `MobileShell.test.jsx`, `MobileRouteBoundary.test.jsx`.
- Files modified: `mobile/routes/MobileRoutes.jsx` (boundary replaces the ad-hoc boot skeleton fallback), `mobile/routes/mobileRouteManifest.js` (shell modes now reference the constant), `mobile/routes/mobileRouteCoverage.test.js` (two new shell-mode contract tests), `mobile/theme/tokens.css` (additive only), `mobile/screens/Dashboard.jsx` (adopts the shell), and this ledger.
- Shared logic extracted: app-shell layout, chrome gating, route pending state, and route failure recovery now live in one place instead of inside the dashboard.
- Route/prefix registration: `ckm-shell` implemented and noted in §7.2. No screen prefix was renamed in this slice.

**Verification**
- Automated commands and results: `npx vitest run src/mobile` → 5 files / 30 tests passed (was 3 / 19). Full `npm test` → 47 files / 572 tests passed, with the same two pre-existing `AppShell.render.test.jsx` `.ck-mobile-nav` failures the previous session recorded — unrelated to mobile code and unchanged by it. ESLint on `src/mobile/shell`, `src/mobile/routes`, `src/mobile/screens/Dashboard.jsx` → clean. `npm run build` → passed, 53 public routes prerendered and verified; only the pre-existing large-chunk warnings.
- Viewports/devices/browsers: Chrome headless (new) driven over CDP with true device metrics at 320x720, 360x800, 390x844, 430x932, 768x1024 against `/__mobile-preview`. At every width `document.documentElement.scrollWidth === window.innerWidth` (no horizontal page scroll), exactly one `<main>`, `data-shell-mode="standard"`, and both `.ckm-shell` and `.ckm-dash` present. The 390 px capture matches `baselines/phase0-dashboard/dashboard-390x844.png`. Note for the next agent: `--window-size` alone is unusable on Windows (Chrome clamps window width near 500 px and crops instead of reflowing) — use `Emulation.setDeviceMetricsOverride`, and await `document.fonts.ready` or Material Symbols ligatures render as literal text and fake an overflow.
- Accessibility checks: failure surface is `role="alert"` with a 44 px retry target and `:focus-visible` ring; pending surface is a `role="status" aria-live="polite"` region with a visually-hidden label; the two elements reporting intrinsic overflow at 320/360 px are `overflow-x: hidden` icon glyph spans, not layout overflow.
- Performance checks: production build unchanged in shape; the mobile route chunk remains separately lazy-loaded.

**Decisions or deviations**
- Decision: `MobileShell` appends `className`/`scrollClassName` instead of owning the class list outright.
- Reason: an existing screen can move onto the shell without touching a single CSS selector, so the Phase 0 dashboard baseline stays valid and shell adoption is not a redesign.
- Decision (behavioral, deliberate): the app-bar slot now applies `--ckm-safe-top`.
- Reason: `.ckm` is `position: fixed; inset: 0`, so the dashboard's TopBar previously sat under the notch on inset devices. Baselines were captured with zero insets and are unaffected; this needs a real notched-device check during Phase 2.
- User approval, if required: none — covered by the canonical plan.

**Open issues/blockers**
- The two `AppShell.render.test.jsx` failures remain unreconciled desktop-shell test debt (carried over, not introduced here).
- The safe-area top change is unverified on a physical notched device; the plan's device pass in §16.4 still owes it.

**Exact next action**
- Finish Phase 0 by (1) migrating the dashboard family from the unregistered `ckm-dash` prefix to the registered `ckm-dashboard`, auditing every mobile selector for `.ckm` scoping, and re-verifying against `client/src/mobile/baselines/phase0-dashboard/`; then (2) defining mobile analytics/page-tracking so a mobile screen fires the same events as its desktop page. Close the Phase 0 exit gate before starting Phase 1 primitives.

---

#### 2026-08-05 10:46 +05:30 — Codex — Phase 0

**Requested continuation:** Continue in Native app implementation.

**Starting checkpoint:** Planning complete; the mobile dashboard exists, but `RootExperience` replaces non-challenge writer routes with that dashboard.

**Work item claimed:** Route manifest, experience policy, route-aware mobile resolution, migration fallback, and coverage/policy tests.

**Research performed**
- Sources: React Router declarative routing and route matching guidance already recorded in section 17; current repository shell policy, route tree, auth context, mobile gate, and test conventions are being audited before implementation.
- Comparable interaction patterns: not applicable to this infrastructure-only slice; no page-level visual redesign is being performed.
- Decisions adopted: retain one `BrowserRouter`; canonical URLs select mobile screens; unimplemented mobile routes render the existing desktop route branch during migration; only implemented mobile routes may replace desktop content.
- Patterns rejected and why: a nested router would split browser history; manual substring routing would be collision-prone; rendering Dashboard for unmatched routes violates deep-link semantics.

**Desktop parity inventory**
- Desktop files inspected: `client/src/App.jsx`, `client/src/layouts/app-shell/shellPolicy.js`, and associated tests.
- Data/services/hooks: `AuthContext`, `useIsMobile`, and existing lazy route imports.
- Roles/permissions/quotas: writer/creator mobile baseline; industry, reader, admin, public, and auth-loading behavior remain on the existing desktop branch until their mobile routes are registered.
- Routes/query/navigation: all 87 declared route patterns are tracked; query, params, browser history, and direct refresh must remain owned by the existing router.
- Page states and child overlays: unchanged in this infrastructure slice.

**Wireframe/design decision**
- Shell: existing mobile shell only for registered implemented mobile routes.
- Top bar: unchanged.
- Scroll hierarchy: unchanged.
- Primary/secondary actions: unchanged.
- Bottom navigation: unchanged.
- Nested screens/sheets/dialogs: unchanged.
- Keyboard/safe-area/back behavior: existing behavior retained; canonical browser history is no longer bypassed by a dashboard-only gate.

**Changes made**
- Files added: `mobile/routes/mobileRouteManifest.js`, `mobileRoutePolicy.js`, `MobileRoutes.jsx`, their policy/coverage/render tests, and five PNG baselines under `mobile/baselines/phase0-dashboard/`.
- Files modified: `client/src/App.jsx`, `mobile/MobileApp.jsx`, `mobile/screens/Dashboard.jsx`, `mobile/hooks/useDashboardData.js`, `mobile/data/dashboardData.js`, `mobile/README.md`, and this ledger.
- Shared logic extracted: route/experience selection is now a pure tested policy; the preview fixture is a deterministic data contract that bypasses authenticated API side effects only when explicitly enabled.
- Route/prefix registration: all 87 unique `App.jsx` route patterns now have a documented disposition; `/dashboard` is the only production `screen` and is limited to the writer audience; `/__mobile-preview` is `dev-only`.

**Verification**
- Automated commands and results: focused route suite passed (3 files, 19 tests); touched-file ESLint passed; production build passed (3,916 modules), 53 public routes prerendered, and prerender verification passed. Full suite result: 45 files/561 tests passed and one unrelated existing file had two failing expectations for the removed `.ck-mobile-nav`; isolated rerun reproduced those two AppShell failures without any mobile-route code involved.
- Viewports/devices/browsers: Chrome local preview verified at 320x720, 360x800, 390x844, 430x932, and 768x1024. Each capture contained one `.ckm-dash` and no boot skeleton; screenshots are stored under `client/src/mobile/baselines/phase0-dashboard/`.
- Accessibility checks: canonical URL routing and no-dashboard substitution are asserted; page-level accessibility work is unchanged in this infrastructure slice.
- Performance checks: production build succeeded; the lazy mobile route chunk remains separate. Existing global large-chunk warnings remain and were not introduced by this slice.

**Decisions or deviations**
- Decision: migration fallback is the existing desktop route branch, not a placeholder screen.
- Reason: it preserves functionality and URL semantics while native-style screens are delivered incrementally.
- User approval, if required: covered by the canonical plan.

**Open issues/blockers**
- No Phase 0 blocker. The repository's existing `AppShell.render.test.jsx` still expects a `.ck-mobile-nav` that the current AppShell no longer renders; this unrelated test debt should be reconciled in the desktop-shell workstream, not hidden by this mobile change.

**Exact next action**
- Design and implement the shell-mode contract (`standard`, `detail`, `immersive`, `flow`, `public`, `admin`) and route-level suspense/error boundaries, then extend spacing/type/touch/chrome/elevation/motion/z-index tokens while comparing against the saved dashboard baselines.

---

Copy this block for every implementation session:

```markdown
#### YYYY-MM-DD HH:MM — Agent/tool name — Phase N

**Requested continuation:**
**Starting checkpoint:**
**Work item claimed:**

**Research performed**
- Sources:
- Comparable interaction patterns:
- Decisions adopted:
- Patterns rejected and why:

**Desktop parity inventory**
- Desktop files inspected:
- Data/services/hooks:
- Roles/permissions/quotas:
- Routes/query/navigation:
- Page states and child overlays:

**Wireframe/design decision**
- Shell:
- Top bar:
- Scroll hierarchy:
- Primary/secondary actions:
- Bottom navigation:
- Nested screens/sheets/dialogs:
- Keyboard/safe-area/back behavior:

**Changes made**
- Files added:
- Files modified:
- Shared logic extracted:
- Route/prefix registration:

**Verification**
- Automated commands and results:
- Viewports/devices/browsers:
- Accessibility checks:
- Performance checks:

**Decisions or deviations**
- Decision:
- Reason:
- User approval, if required:

**Open issues/blockers**
-

**Exact next action**
-
```

### 19.4 Initial audit decision record

#### 2026-08-05 — Codex — Planning

- This document is the canonical mobile implementation plan.
- Existing `client/src/mobile` code is retained as the starting foundation.
- Existing dashboard status is `BASELINE`, not `COMPLETE`, because several actions still use desktop-only notices and local placeholder data.
- Route-aware mobile rendering precedes new screen work because the current gate swallows non-challenge writer routes.
- Canonical desktop URLs remain unchanged on mobile.
- The current codebase remains JSX unless a separate TypeScript migration is approved.
- `.ckm` remains the global isolation scope; every route family receives an additional unique page prefix.
- Every user-facing route, including industry, reader, admin, finance, public, legal, and redirects, is tracked because the product requirement is all pages.
- Current primary-source research is captured in section 17; each page still requires its own current research.
- Unrelated dirty working-tree changes present at planning time were not modified.

---

## 20. Continuation protocol for any AI agent

When the user says **"continue in Native app implementation"** or equivalent:

1. Read this entire file before taking implementation action.
2. Inspect `git status` and preserve unrelated user changes.
3. Read section 19.1 and the newest session log entry.
4. Inspect the listed active files and verify the stated checkpoint against the repository; do not assume a stale ledger is correct.
5. If another work item is already `IN PROGRESS`, continue it. Otherwise claim the first incomplete dependency-safe item from the current phase.
6. Announce the phase and work item being continued.
7. Complete the mandatory research/design gate in section 4 for any new page family. Explicitly tell the user when that research changes the implementation direction.
8. Update section 19 **before** editing code with the claimed item, owner, and start date.
9. Implement a coherent vertical slice; do not scatter unfinished markup across many pages just to change status counts.
10. Verify in proportion to risk and inspect the rendered mobile result at the required widths.
11. Update the route/component ledger, phase checklist, checkpoint YAML, and session log before ending.
12. Set `next_action` to a concrete file-level or test-level action that another agent can execute immediately.
13. Never mark a page/phase complete without the evidence required by section 18.
14. If blocked by a product decision, document the exact options, evidence, and consequences, then ask the user. Continue any independent in-scope work first.

### Required handoff format

Every implementation handoff should state:

- outcome achieved;
- phase and ledger status;
- primary files changed;
- tests and viewports verified;
- known limitations/blockers;
- exact next action recorded in this file.

This allows Codex, Claude, or another capable agent to resume without relying on hidden conversation history.

---

## 21. Immediate next step

> **Superseded as of 2026-08-05.** Phase 0 is COMPLETE and Phase 1 is in progress. The live next step is `next_action` in §19.1; the steps below are kept as the record of how this work was started.

Begin **Phase 0**, not a feature page:

1. render and capture the current mobile dashboard at 320, 360, 390, 430, and 768 px;
2. write tests that demonstrate the present route-swallowing defect;
3. design `mobileRoutePolicy.js` and `mobileRouteManifest.js` around the existing audience/shell policy;
4. implement route-aware `MobileRoutes` inside the existing `BrowserRouter`;
5. preserve the dashboard at `/dashboard` and introduce explicit migration fallbacks for every other route;
6. verify deep links, browser back/forward, auth loading, writer/industry/reader/admin roles, and the 768 px boundary;
7. update section 19 with evidence and the next foundation item.

Only after that exit gate passes should work begin on the shared mobile system and the next route-level screen.
