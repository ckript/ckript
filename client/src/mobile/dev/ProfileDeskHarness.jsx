import { useSearchParams } from "react-router-dom";
import { AUTHENTICATED_PROFILE_STATUS } from "../../pages/profile/authenticatedProfile";
import { buildIncomingFollowRequestList, buildOwnerInbox } from "../../pages/profile/ownerInbox";
import { OWNER_INBOX_STATUS } from "../../pages/profile/useOwnerInbox";
import OwnerProfileDesk from "../screens/profiles/desk/OwnerProfileDesk";
import PublicProfileDesk from "../screens/profiles/desk/PublicProfileDesk";
import VisitorProfileDesk from "../screens/profiles/desk/VisitorProfileDesk";

/*
 * The four profile screens over a deterministic payload.
 *
 * A profile is personalized end to end — the follow label, whether Message even
 * exists, whether the contact reveal is offered and what it has left to spend
 * all come from who is looking. The live route therefore cannot be rendered
 * twice and produce the same pixels, which makes it useless for comparing
 * against the prototype. Same argument, same shape, as ProjectDetailHarness.
 *
 *   ?screen=2a  writer, seen by a producer        (prototype 2a "Slate")
 *   ?screen=2b  industry, seen by a writer        (prototype 2b "Deal desk")
 *   ?screen=2c  a writer's own profile            (prototype 2c)
 *   ?screen=2d  an industry account's own profile (prototype 2d)
 *   ?screen=2p  the signed-out share
 *   ?state=     default | loading | empty | error | limit | hidden | private
 *
 * Dev-only: App.jsx mounts it behind `import.meta.env.DEV`, so none of this
 * reaches a production bundle.
 */

/* The app's own art, served by the dev server, addressed absolutely because
   `resolveMediaUrl` sends every relative path at the API origin. A fixture that
   depends on a stock-photo CDN measures the CDN. */
const ORIGIN = typeof window === "undefined" ? "" : window.location.origin;
const IMG = (name) => `${ORIGIN}/landing/ai/${name}.webp`;

const WRITER = {
  _id: "writer-1",
  name: "Maya Iyer",
  role: "writer",
  bio: "Ten years on fishing trawlers and in insurance offices before the first screenplay. "
    + "Two features optioned, one shooting this winter in Ratnagiri. Reads everything twice, "
    + "writes the ending first.",
  profileImage: IMG("avatar-priya"),
  createdAt: "2024-03-04T00:00:00.000Z",
  address: { city: "Mumbai", country: "IN" },
  skills: ["Structure", "Dialogue", "Adaptation"],
  /* The authenticated payload carries the follower ARRAYS; the sanitized public
     projection carries only counts. The fixture supplies both so 2a and 2p can
     be looked at side by side. */
  followers: new Array(1204).fill("f"),
  following: new Array(86).fill("f"),
  followerCount: 1204,
  followingCount: 86,
  allowIndustryContact: true,
  isPrivate: false,
  profileCompletion: { percentage: 80, completedFields: 8, totalFields: 10, isComplete: false },
  pendingFollowRequestCount: 2,
  profileViews: 1204,
  writerProfile: {
    username: "mayawrites",
    representationStatus: "unrepresented",
    genres: ["Drama", "Thriller", "Regional noir"],
    specializedTags: ["Small Town", "Gritty", "Tragic"],
    links: { imdb: "https://www.imdb.com/name/nm0000001", portfolio: "https://mayaiyer.example.com" },
    membershipVerification: { swa: { status: "approved" } },
  },
};

const INDUSTRY = {
  _id: "producer-1",
  name: "Devan Iyer",
  role: "producer",
  bio: "Reading for grounded thrillers with a woman at the centre. Two slots open this quarter — "
    + "send the draft you have, not the one you're planning.",
  profileImage: IMG("avatar-marcus"),
  createdAt: "2019-06-01T00:00:00.000Z",
  address: { city: "Mumbai", country: "IN" },
  followers: new Array(340).fill("f"),
  following: new Array(52).fill("f"),
  followerCount: 340,
  followingCount: 52,
  isPrivate: false,
  profileCompletion: { percentage: 100, isComplete: true },
  /* The field names industryAccess.js actually reads — `plan`/`status` are a
     different pair and would silently make this a free-tier account. */
  subscription: { accessTier: "film_industry_professional", accessStatus: "active", accessExpiresAt: "2027-01-01T00:00:00.000Z" },
  industryProfile: {
    company: "Lightbox Pictures",
    jobTitle: "Head of Development",
    subRole: "development_executive",
    imdbUrl: "https://www.imdb.com/company/co0000001",
    mandates: {
      genres: ["Thriller", "Family drama", "Regional noir"],
      formats: ["Feature Film", "Limited Series"],
    },
  },
};

const SCRIPTS = [
  {
    _id: "script-1", title: "Salt of the Deccan", primaryGenre: "Drama", contentType: "feature",
    pageCount: 112, coverImage: IMG("trailer-cinema"), views: 412,
    platformScore: { overall: 8.9 }, status: "published", holdStatus: "on_hold",
    logline: "A claims adjuster on the Konkan coast finds her brother's name on a drowning she is paid to close.",
  },
  {
    _id: "script-2", title: "Night Shift at Rohini", primaryGenre: "Thriller", contentType: "feature",
    pageCount: 104, coverImage: IMG("format-film"), platformScore: { overall: 8.4 },
    views: 288, status: "published",
  },
  {
    _id: "script-3", title: "The Tiffin Route", primaryGenre: "Comedy", contentType: "feature",
    pageCount: 58, coverImage: IMG("format-series"), platformScore: { overall: 7.8 },
    views: 96, status: "pending_approval",
  },
  {
    _id: "script-4", title: "Ashes of Panipat", primaryGenre: "Historical", contentType: "limited_series",
    pageCount: 126, coverImage: IMG("format-television"), status: "draft",
  },
];

const PRODUCER_VIEWER = {
  _id: "viewer-1",
  name: "Ravi Menon",
  role: "producer",
  email: "ravi@lightbox.example",
  subscription: {
    accessTier: "film_industry_professional", accessStatus: "active",
    accessExpiresAt: "2027-01-01T00:00:00.000Z", accessActivatedAt: "2026-08-01T00:00:00.000Z",
    contactsLimit: 25, revealedContacts: [],
  },
};

const WRITER_VIEWER = { _id: "viewer-2", name: "Anaya Bose", role: "writer", email: "anaya@example.com" };

const COLLECTION = {
  status: "ready",
  data: {
    items: [
      { _id: "post-1", content: "Locked the third act. Ratnagiri in January.", counts: { likes: 42, comments: 6, saves: 3 }, createdAt: "2026-08-30T00:00:00.000Z" },
      { _id: "post-2", content: "Reader report back on Night Shift — 8.4.", counts: { likes: 18, comments: 2, saves: 1 }, createdAt: "2026-08-14T00:00:00.000Z" },
    ],
    counts: { activity: 2, bookmarks: 5 },
    savedSource: "favorites",
    pagination: { section: "activity", page: 1, limit: 12, total: 2, totalPages: 1, hasPrevious: false, hasNext: false },
  },
  failure: null,
  removingId: "",
  actionError: "",
  reload: () => {},
  removeSaved: async () => ({ ok: true }),
  clearActionError: () => {},
};

/* The inbox is fed through the real `buildOwnerInbox`, so the fixture exercises
   the derivation rather than a hand-written result that could disagree with it. */
const MEETINGS = [
  {
    _id: "meet-1", title: "Ckript meeting: Salt of the Deccan",
    producer: "producer-1", writer: "writer-1",
    producer_name: "Devan Iyer", writer_name: "Maya Iyer", script_name: "Salt of the Deccan",
    startAt: new Date(Date.now() + 3 * 86400000).toISOString(), duration: 30,
    message: "Read it twice. The third act earns its silence — can we talk Thursday?",
    status: "pending",
  },
  {
    _id: "meet-2", title: "Ckript meeting: Night Shift at Rohini",
    producer: "producer-2", writer: "writer-1",
    producer_name: "Sadhana Kulkarni", writer_name: "Maya Iyer", script_name: "Night Shift at Rohini",
    startAt: new Date(Date.now() + 6 * 86400000).toISOString(), duration: 45,
    status: "accepted", meetingLink: "https://meet.example/ckript-0412",
  },
  {
    _id: "meet-3", title: "Ckript meeting: The Tiffin Route",
    producer: "producer-3", writer: "writer-1",
    producer_name: "Farhan Sheikh", writer_name: "Maya Iyer", script_name: "The Tiffin Route",
    startAt: new Date(Date.now() - 4 * 86400000).toISOString(), duration: 30,
    status: "rejected",
  },
];

const FOLLOW_REQUESTS = buildIncomingFollowRequestList([
  {
    _id: "fr-1", createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    from: { _id: "user-9", name: "Rehan Qureshi", role: "writer", profileImage: IMG("avatar-james"), writerProfile: { username: "rehanq" } },
  },
]);

const inboxFixture = (viewerId, { empty = false, status = OWNER_INBOX_STATUS.READY } = {}) => ({
  ...buildOwnerInbox({
    meetings: empty ? [] : MEETINGS,
    followRequests: empty ? [] : FOLLOW_REQUESTS,
    viewerId,
  }),
  status,
  error: "",
  actingKey: "",
  reload: () => {},
  decide: async () => ({ ok: true }),
});

const NO_OP = {
  pending: { follow: false, block: false, message: false, contact: false, pitch: false },
  actionError: "",
  contact: null,
  contactStats: null,
  reload: () => {},
  clearActionError: () => {},
  applyProfileUpdate: () => {},
  follow: async () => true,
  toggleBlock: async () => true,
  sendMessage: async () => true,
  revealContact: async () => true,
  loadPitchScripts: async () => ({ ok: true, data: SCRIPTS.map((s) => ({ _id: s._id, title: s.title })) }),
  sendPitch: async () => true,
  purchasedScripts: [],
  bookmarkedScripts: [],
  deletedScripts: [],
};

/* Each state is a whole screen rather than a variation on one: the empty shelf
   and the loading shelf share a layout and share nothing else. */
const visitorState = (profile, scripts, state, extra = {}) => {
  if (state === "loading") return { ...NO_OP, status: AUTHENTICATED_PROFILE_STATUS.LOADING, profile: null, scripts: [] };
  if (state === "error") {
    return { ...NO_OP, status: AUTHENTICATED_PROFILE_STATUS.FAILED, profile: null, scripts: [], failure: { message: "We could not reach the server." } };
  }
  if (state === "private") {
    return { ...NO_OP, status: AUTHENTICATED_PROFILE_STATUS.PRIVATE, profile: null, scripts: [], failure: { profileId: profile._id, message: "This account is private." }, relationship: {} };
  }
  return {
    ...NO_OP,
    status: AUTHENTICATED_PROFILE_STATUS.READY,
    profile,
    scripts: state === "empty" ? [] : scripts,
    relationship: {},
    ...extra,
  };
};

const ownerState = (profile, scripts, state) => {
  if (state === "loading") return { ...NO_OP, status: AUTHENTICATED_PROFILE_STATUS.LOADING, profile: null, scripts: [] };
  if (state === "error") return { ...NO_OP, status: AUTHENTICATED_PROFILE_STATUS.FAILED, profile: null, scripts: [], failure: { message: "We could not reach the server." } };
  return {
    ...NO_OP,
    status: AUTHENTICATED_PROFILE_STATUS.READY,
    profile: state === "hidden" ? { ...profile, isPrivate: true } : profile,
    scripts: state === "empty" ? [] : scripts,
    relationship: {},
  };
};

export default function ProfileDeskHarness() {
  const [params] = useSearchParams();
  const screen = String(params.get("screen") || "2a");
  const state = String(params.get("state") || "default");

  if (screen === "2b") {
    return (
      <VisitorProfileDesk
        user={WRITER_VIEWER}
        previewData={visitorState(INDUSTRY, [], state)}
        previewCollection={COLLECTION}
      />
    );
  }

  if (screen === "2c") {
    return (
      <OwnerProfileDesk
        user={WRITER}
        previewData={ownerState(WRITER, SCRIPTS, state)}
        previewCollection={COLLECTION}
        previewInbox={inboxFixture(WRITER._id, {
          empty: state === "empty",
          status: state === "loading" ? OWNER_INBOX_STATUS.LOADING : OWNER_INBOX_STATUS.READY,
        })}
      />
    );
  }

  if (screen === "2d") {
    return (
      <OwnerProfileDesk
        user={INDUSTRY}
        previewData={ownerState(INDUSTRY, [], state)}
        previewCollection={COLLECTION}
        previewInbox={inboxFixture(INDUSTRY._id, {
          empty: state === "empty",
          status: state === "loading" ? OWNER_INBOX_STATUS.LOADING : OWNER_INBOX_STATUS.READY,
        })}
      />
    );
  }

  if (screen === "2p") {
    return (
      <PublicProfileDesk
        previewData={
          state === "empty"
            ? { user: WRITER, scripts: [] }
            : { user: WRITER, scripts: SCRIPTS }
        }
      />
    );
  }

  return (
    <VisitorProfileDesk
      user={PRODUCER_VIEWER}
      previewData={visitorState(
        WRITER,
        SCRIPTS,
        state,
        state === "limit"
          ? { contactStats: { contactsUsed: 25, contactsLimit: 25, remainingContacts: 0 } }
          : { contactStats: { contactsUsed: 6, contactsLimit: 25, remainingContacts: 19 } },
      )}
      previewCollection={COLLECTION}
    />
  );
}
