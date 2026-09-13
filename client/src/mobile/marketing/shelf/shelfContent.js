/*
 * shelfContent — what The Shelf says, and which of it changes with the audience.
 *
 * The prototype's whole organising idea is a segmented control at the top that
 * re-aims the page: a producer must never read writer pricing first. Three
 * things move with it — the hero (image, kicker, call), the problem card, and
 * the plans teaser — and everything else is shared.
 *
 * Holding that here rather than in the sections means the answer to "what
 * changes when you switch audience?" is one object, not a hunt through nine
 * components. The sections read `content[audience]` and render.
 *
 * The long-form copy is NOT restated here. Tools, formats, problem rows and
 * partners already live in `pages/landing/sections/*` and are shared with the
 * desktop page; re-typing them would be two copies of the same marketing text
 * drifting apart on the first edit. This file holds only what is genuinely the
 * mobile Shelf's own: the audience split, and the shelf-specific labels.
 */

export const AUDIENCE = Object.freeze({ WRITER: "writer", INDUSTRY: "industry" });

export const AUDIENCE_TABS = Object.freeze([
  Object.freeze({ value: AUDIENCE.WRITER, label: "I write" }),
  Object.freeze({ value: AUDIENCE.INDUSTRY, label: "I'm in the industry" }),
]);

/* The phrases in the ticker under the hero. Four, doubled in the DOM so the
   marquee can loop without a seam. */
export const MARQUEE_PHRASES = Object.freeze([
  "Now casting untold stories",
  "From the page to the screen",
  "Every great film began as a script",
  "Your story deserves an audience",
]);

/* "Find it. Watch it. Own it." — the three-card snap shelf. */
export const STEPS = Object.freeze([
  Object.freeze({
    num: "01",
    title: "Discover a script.",
    desc: "Explore original stories across every genre.",
    art: "/landing/ai/feature-match.webp",
  }),
  Object.freeze({
    num: "02",
    title: "Watch the trailer.",
    desc: "Experience AI-generated trailers that bring the story to life.",
    art: "/landing/ai/feature-trailer.webp",
  }),
  Object.freeze({
    num: "03",
    title: "Own the story.",
    desc: "Secure exclusive rights to make it yours.",
    art: "/landing/ai/feature-hold.webp",
  }),
]);

/*
 * The audience split.
 *
 * `problemKind` names which of the shared PROBLEM_CARDS this audience sees, so
 * the copy still comes from the desktop data file and only the CHOICE lives
 * here. `teaseTitle`/`teaseSub` are the plans card, which is the one place the
 * two audiences are quoted different prices — the reason the switch exists.
 */
export const SHELF_AUDIENCE = Object.freeze({
  [AUDIENCE.WRITER]: Object.freeze({
    heroKicker: "For screenwriters",
    heroArt: "/landing/ai/trailer-cinema.webp",
    problemKind: "writer",
    flip: "In the industry instead? See the producer's side.",
    teaseTitle: "Free, Silver and Gold.",
    teaseSub: "Start free with 5 scripts. Upgrade when you want the top sections, AI evaluation and the writer studio.",
  }),
  [AUDIENCE.INDUSTRY]: Object.freeze({
    heroKicker: "For producers & industry",
    heroArt: "/landing/ai/format-film.webp",
    problemKind: "producer",
    flip: "Writing instead? See the writer's side.",
    teaseTitle: "Free Tier and Diamond.",
    teaseSub: "Browse and preview for free. Diamond unlocks full scripts, verified contacts, direct messages and meetings.",
  }),
});

/* The chips in the footer. Mirrors FOOTER_COLS' destinations without its
   three-column desktop shape, which does not survive a 390pt screen. */
export const FOOTER_CHIPS = Object.freeze([
  Object.freeze({ label: "Scripts", action: "writer" }),
  Object.freeze({ label: "Challenge", to: "/challenges" }),
  Object.freeze({ label: "For Producers", action: "producer" }),
  Object.freeze({ label: "Pricing", action: "pricing" }),
  Object.freeze({ label: "About", action: "about" }),
  Object.freeze({ label: "Contact", to: "/contact" }),
  Object.freeze({ label: "Privacy Policy", to: "/privacy-policy" }),
  Object.freeze({ label: "Terms of Service", to: "/terms-of-service" }),
]);

export const resolveAudience = (value) => (
  value === AUDIENCE.INDUSTRY ? AUDIENCE.INDUSTRY : AUDIENCE.WRITER
);
