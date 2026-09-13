/*
 * Ckript Mobile — the profile desk's derivations (pure).
 *
 * The four prototype screens are one screen with four fillings, and this is
 * where "which filling?" is answered. Keeping it out of the components means
 * the answer is testable without a DOM, and means the visitor screen and the
 * owner screen cannot quietly disagree about what a writer's tabs are.
 *
 * Nothing here fetches, and nothing here invents a number. Every value is
 * derived from a view already built by the existing profile models
 * (publicProfileModel / visitorProfileModel / ownerProfileModel), so a field
 * the server does not send simply does not appear.
 */

import { describeProjectStatus } from "../../projects/project-detail/projectDetailModel";

export const DESK_AUDIENCE = Object.freeze({ WRITER: "writer", INDUSTRY: "industry" });

export const DESK_TAB = Object.freeze({
  WORK: "work",         /* somebody's scripts */
  MANDATE: "mandate",   /* what an industry account is reading for */
  ABOUT: "about",       /* the facts */
  ACTIVITY: "activity", /* somebody else's posts, read-only */
  INBOX: "inbox",       /* owner only: what is waiting on an answer */
  SAVED: "saved",       /* owner only: their own collections */
});

export const DESK_VIEWER = Object.freeze({
  PUBLIC: "public",     /* signed out, sanitized projection */
  VISITOR: "visitor",   /* signed in, somebody else's profile */
  OWNER: "owner",       /* their own */
});

/* The one primary ask a profile can carry in its docked action. */
export const DESK_ASK = Object.freeze({
  NONE: "none",
  SIGN_IN: "sign-in",
  REVEAL: "reveal",
  REVEALED: "revealed",
  REVEAL_BLOCKED: "reveal-blocked",
  PITCH: "pitch",
  MESSAGE: "message",
});

const int = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

/*
 * 1,204 stays 1,204 and 12,400 becomes 12.4k. The stat strip is three cells
 * wide on a 390px frame, so a five-digit follower count has to give somewhere;
 * it gives above ten thousand, where the exact figure has stopped being the
 * information anyway.
 */
export function deskCount(value) {
  const count = int(value);
  if (count < 10000) return count.toLocaleString("en-US");
  const thousands = count / 1000;
  return `${thousands >= 100 ? Math.round(thousands) : Math.round(thousands * 10) / 10}k`;
}

export const deskAudienceOf = (view = {}) => (view.writer ? DESK_AUDIENCE.WRITER : DESK_AUDIENCE.INDUSTRY);

/*
 * The green-dot line under the name.
 *
 * The prototype writes "Open to work" for a writer and "Reading now" for a
 * producer. We have one field that genuinely means the first — a writer's
 * `allowIndustryContact`, the switch that decides whether a verified
 * professional may ask for their details — and nothing that means the second,
 * so an industry profile reports the thing it does have: whether its
 * professional access is live.
 */
export function deskStatus({ view = {}, profile = {} } = {}) {
  /* The visitor and public views do not carry a username of their own — only
     the owner view does — so the handle is read from the profile the server
     sent, with the owner's already-cleaned value preferred when it is there. */
  const username = String(view.username || profile.writerProfile?.username || profile.username || "").trim();
  const handle = username ? `@${username}` : "";
  if (view.writer) {
    const open = profile.allowIndustryContact !== false;
    return {
      on: open,
      label: open ? "Open to contact" : "Not taking contact",
      meta: handle,
    };
  }
  /* The mono caption sits on one line beside a label; "SINCE JUNE 2019" is
     long enough to push the label into wrapping on a 375px phone, and the month
     was never the point. */
  const joined = String(view.memberSince || "").trim().split(/\s+/).pop();
  return {
    on: Boolean(view.professional),
    label: view.professional ? "Verified access" : "Industry member",
    meta: handle || (joined ? `SINCE ${joined}` : ""),
  };
}

/*
 * The stat strip. Two or three cells, never a placeholder: a writer's project
 * count is worth a cell, an industry profile's is not, so an industry strip is
 * two cells and the divider geometry absorbs it.
 *
 * `tab` is the tab a cell jumps to when tapped, exactly as the prototype's
 * "Scripts" and "Avg score" cells select their panels. A cell with no tab is
 * not a button.
 */
export function deskStats(view = {}) {
  const cells = [];
  if (view.writer) {
    cells.push({
      key: "projects",
      label: "Scripts",
      value: deskCount(view.projects?.length),
      tab: DESK_TAB.WORK,
    });
  }
  cells.push({ key: "followers", label: "Followers", value: deskCount(view.followers) });
  cells.push({ key: "following", label: "Following", value: deskCount(view.following), accent: true });
  return cells;
}

/*
 * The owner's strip.
 *
 * The prototype gives the owner three analytics cells rather than the visitor's
 * three social ones, and it is right to: on your own page the useful question
 * is "is anyone reading this?". Profile views leads when the server sends it
 * and quietly steps aside when it does not, so the strip is never three cells
 * one day and a hole the next. Everything it cannot fit — saved, purchased —
 * is listed in full further down the About panel rather than dropped.
 */
export function deskOwnerStats(view = {}) {
  const byKey = Object.fromEntries((view.stats || []).map((stat) => [stat.key, stat]));
  const cells = [];
  if (byKey.views) {
    cells.push({ key: "views", label: "Views", value: deskCount(byKey.views.value), tab: DESK_TAB.ABOUT });
  } else if (view.writer) {
    cells.push({ key: "projects", label: "Published", value: deskCount(byKey.projects?.value), tab: DESK_TAB.WORK });
  }
  cells.push({ key: "followers", label: "Followers", value: deskCount(view.followers) });
  cells.push({ key: "following", label: "Following", value: deskCount(view.following), accent: true });
  return cells;
}

/*
 * THE INFORMATION ARCHITECTURE, as one table.
 *
 * This used to be `deskTabs({ own })` returning near-identical arrays with
 * different labels — "Projects" for you, "Scripts" for everybody else. That
 * encoded a belief the prototype flatly contradicts: that an owner sees the
 * visitor's screen with an Edit button on it. They do not. A visitor asks "who
 * is this and what have they written?"; an owner asks "what needs me, and what
 * am I showing the world?" — different questions, so different tabs.
 *
 * Six cells, written out. Adding a tab means choosing a cell rather than
 * adding a flag, and a wrong answer can no longer look right by inheriting the
 * other audience's shape.
 */
const DESK_IA = Object.freeze({
  [`${DESK_VIEWER.PUBLIC}:writer`]: [DESK_TAB.WORK, DESK_TAB.ABOUT],
  [`${DESK_VIEWER.PUBLIC}:industry`]: [DESK_TAB.MANDATE, DESK_TAB.ABOUT],

  [`${DESK_VIEWER.VISITOR}:writer`]: [DESK_TAB.WORK, DESK_TAB.ABOUT, DESK_TAB.ACTIVITY],
  [`${DESK_VIEWER.VISITOR}:industry`]: [DESK_TAB.MANDATE, DESK_TAB.ABOUT, DESK_TAB.ACTIVITY],

  /* The owner leads with their own work, then with what is waiting. An
     industry account has no shelf, so its queue leads instead — which is
     exactly the order 2c and 2d are drawn in. */
  [`${DESK_VIEWER.OWNER}:writer`]: [DESK_TAB.WORK, DESK_TAB.INBOX, DESK_TAB.SAVED, DESK_TAB.ABOUT],
  [`${DESK_VIEWER.OWNER}:industry`]: [DESK_TAB.INBOX, DESK_TAB.MANDATE, DESK_TAB.SAVED, DESK_TAB.ABOUT],
});

const DESK_TAB_LABEL = Object.freeze({
  [DESK_VIEWER.OWNER]: {
    [DESK_TAB.WORK]: "Scripts",
    [DESK_TAB.MANDATE]: "Mandate",
    [DESK_TAB.INBOX]: "Requests",
    [DESK_TAB.SAVED]: "Saved",
    [DESK_TAB.ABOUT]: "About",
  },
  default: {
    [DESK_TAB.WORK]: "Scripts",
    [DESK_TAB.MANDATE]: "Mandate",
    [DESK_TAB.ABOUT]: "About",
    [DESK_TAB.ACTIVITY]: "Activity",
  },
});

/* The industry owner's queue is a submission pile, not a list of asks about
   their own writing; the prototype calls it "Queue" and so do we. */
const deskTabLabel = (viewer, audience, key) => {
  if (viewer === DESK_VIEWER.OWNER && audience === DESK_AUDIENCE.INDUSTRY && key === DESK_TAB.INBOX) return "Queue";
  return DESK_TAB_LABEL[viewer]?.[key] ?? DESK_TAB_LABEL.default[key] ?? key;
};

export function deskTabs({ view = {}, viewer = DESK_VIEWER.VISITOR, counts = {} } = {}) {
  const audience = deskAudienceOf(view);
  const keys = DESK_IA[`${viewer}:${audience}`] || DESK_IA[`${DESK_VIEWER.VISITOR}:${audience}`];
  return keys.map((key) => ({
    key,
    label: deskTabLabel(viewer, audience, key),
    count: Number(counts[key]) > 0 ? Number(counts[key]) : 0,
  }));
}

export const deskDefaultTab = (tabs = []) => tabs[0]?.key || DESK_TAB.ABOUT;

/*
 * Which tab is open lives in the URL, not in component state.
 *
 * That is not tidiness: the collections panel already pages through `?page`,
 * and a page-2 link that reopened on tab 1 would be a broken link. Sharing the
 * one `tab` parameter with `profileCollections` is deliberate — its
 * "activity" and "bookmarks" both mean the Activity tab here, and the section
 * control inside the panel keeps owning which of the two is showing.
 */
/* The collections panel owns `?tab=activity|bookmarks` for its own section
   control, so both values select whichever collections tab this audience has —
   `activity` for a visitor reading somebody's posts, `saved` for an owner
   looking at their own shelf and bookmarks. */
const COLLECTION_TAB_VALUES = ["activity", "bookmarks", "saved"];

export function readDeskTab(search, tabs = []) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  const raw = String(params.get("tab") || "").trim().toLowerCase();
  const has = (key) => tabs.some((tab) => tab.key === key);
  if (COLLECTION_TAB_VALUES.includes(raw)) {
    if (has(DESK_TAB.SAVED)) return DESK_TAB.SAVED;
    if (has(DESK_TAB.ACTIVITY)) return DESK_TAB.ACTIVITY;
  }
  return has(raw) ? raw : deskDefaultTab(tabs);
}

export function writeDeskTab(search, key) {
  const params = new URLSearchParams(search);
  /* Selecting the owner's collections tab lands on the half only they have.
     `profileCollections` reads this same parameter, so writing "saved" would
     leave it defaulting to activity and the tab would open on the wrong half. */
  params.set("tab", key === DESK_TAB.SAVED ? "bookmarks" : key);
  params.delete("page");
  return params;
}

/*
 * The docked action.
 *
 * The prototype docks exactly one thing per screen and it is always the ask
 * that costs something: a script request on 2a, a meeting booking on 2b. Ours
 * are the two metered asks the product actually has — a writer's contact
 * details, and a pitch to an investor — and the ask is the only thing allowed
 * in the dock, so "Message" never moves in and out of the row above it.
 */
export function deskAsk({ view = {}, signedIn = true } = {}) {
  if (!signedIn) return { kind: DESK_ASK.SIGN_IN, label: "Sign in to connect", tone: "ink" };
  if (view.blockedByCurrent || view.blockedByProfile) return { kind: DESK_ASK.NONE };

  if (view.canReveal) {
    if (view.contactAlreadyRevealed) {
      return { kind: DESK_ASK.REVEALED, label: "Contact revealed", tone: "done", icon: "check_circle" };
    }
    if (view.contactLimitReached) {
      return { kind: DESK_ASK.REVEAL_BLOCKED, label: "Contact limit reached", tone: "quiet", icon: "lock_clock" };
    }
    return { kind: DESK_ASK.REVEAL, label: "Reveal contact", tone: "ink", icon: "lock" };
  }
  if (view.canPitch) return { kind: DESK_ASK.PITCH, label: "Pitch a project", tone: "accent" };
  if (view.canMessage) return { kind: DESK_ASK.MESSAGE, label: `Message ${view.name}`, tone: "ink", icon: "mail" };
  return { kind: DESK_ASK.NONE };
}

/*
 * The contact-reveal meter, in the shape the prototype's request sheet draws.
 * `used / limit` with a bar and a plan line — the same three facts, from
 * `contactStats` when the server has spoken and from the viewer's subscription
 * until it has.
 */
export function deskQuota(view = {}) {
  const limit = int(view.contactLimit);
  const used = Math.min(int(view.contactUsed), limit || Number.MAX_SAFE_INTEGER);
  return {
    used,
    limit,
    label: limit ? `${used} / ${limit}` : `${used}`,
    percent: limit ? Math.min(100, Math.round((used / limit) * 100)) : 0,
    full: Boolean(limit) && used >= limit,
    remaining: Math.max(0, int(view.contactRemaining)),
  };
}

/*
 * The About panel's fact card.
 *
 * The prototype opens it with where the writer is and closes it with how long
 * they have been here — two facts the profile endpoint already sends and that
 * `buildPublicProfileView` leaves out of `facts` because they are not
 * *professional* facts. Adding them here rather than widening that model keeps
 * the projection's contract untouched.
 */
export function deskAbout(view = {}) {
  return [
    view.location ? ["Based in", view.location] : null,
    ...(Array.isArray(view.facts) ? view.facts : []),
    view.memberSince ? ["On Ckript since", view.memberSince] : null,
  ].filter(Boolean);
}

/*
 * The shelf.
 *
 * The prototype's cards carry a still, a genre, a page count and a score.
 * `buildPublicProfileView` deliberately projects only what a *public* profile
 * may say about a project, so the cards are built from the raw scripts the
 * profile endpoint already returns — that is where the cover, the format and
 * the length live — and each field simply drops out of the meta line when the
 * server did not send it. Nothing is invented to fill a card.
 */
const scoreOf = (script) => {
  const platform = typeof script?.platformScore === "object" ? script.platformScore?.overall : script?.platformScore;
  const raw = platform ?? script?.scriptScore?.overall ?? script?.rating;
  const score = Number(raw);
  return Number.isFinite(score) && score > 0 ? Math.round(score * 10) / 10 : null;
};

const clean = (value) => (["string", "number"].includes(typeof value) ? String(value).trim() : "");

export function deskProjects(scripts = []) {
  return (Array.isArray(scripts) ? scripts : []).map((script) => {
    const id = clean(script?._id || script?.id);
    const genre = clean(script?.primaryGenre || script?.genre) || "Project";
    /* "limited_series" is a storage value, not a label; the card's mono caption
       shouts it in caps and the list row wants it sentence-cased. */
    const rawFormat = clean(script?.contentType || script?.format).replace(/_/g, " ");
    const format = rawFormat ? rawFormat.charAt(0).toUpperCase() + rawFormat.slice(1) : "";
    const pages = int(script?.pageCount);
    const score = scoreOf(script);
    /* One vocabulary for "what state is this project in", shared with the
       project page — the owner's row shows all of it, and a visitor's card
       shows only the part that changes what the project IS. "Published" on a
       public shelf is noise; "Sold" is the whole story. */
    const state = describeProjectStatus(script || {});
    const notable = state.id === "sold" || state.id === "held";
    return {
      id,
      title: clean(script?.title) || "Untitled project",
      genre,
      summary: clean(script?.logline || script?.synopsis),
      cover: clean(script?.coverImage || script?.trailerThumbnail),
      badge: score == null ? "" : String(score),
      views: int(script?.views),
      statusId: state.id,
      statusLabel: state.label,
      statusTone: state.tone,
      statusDetail: state.detail,
      flag: notable ? state.label : "",
      /* The card sets its meta in the prototype's mono caption, where the score
         is part of the line. A list row shows the score in its own column, so
         repeating it there would read as a mistake — hence two strings, not one
         with a flag. */
      meta: [format, genre, pages ? `${pages} pp` : "", score == null ? "" : `score ${score}`]
        .filter(Boolean).join(" · ").toUpperCase(),
      metaPlain: [genre, pages ? `${pages} pp` : ""].filter(Boolean).join(" · "),
    };
  }).filter(({ id }) => id);
}

/*
 * The refusals, as the prototype draws its empty states: a glyph, a sentence
 * that says what happened, and a sentence that says what to do about it.
 */
export const DESK_REFUSALS = Object.freeze({
  private: {
    icon: "lock_person",
    title: "This profile is private",
    body: "Only approved followers can see it. Send a follow request and they can let you in.",
  },
  restricted: {
    icon: "workspace_premium",
    title: "Profile access is restricted",
    body: "Full member profiles are part of the industry plans.",
  },
  blocked: {
    icon: "block",
    title: "Profile unavailable",
    body: "You cannot view this member's profile.",
  },
  "not-found": {
    icon: "person_search",
    title: "Member not found",
    body: "This link may be out of date, or the account may have been closed.",
  },
  failed: {
    icon: "cloud_off",
    title: "Could not load this profile",
    body: "Check your connection and try again.",
  },
});

export const deskRefusal = (status) => DESK_REFUSALS[status] || DESK_REFUSALS.failed;
