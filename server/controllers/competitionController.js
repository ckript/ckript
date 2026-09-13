import mongoose from "mongoose";
import crypto from "crypto";
import Competition from "../models/Competition.js";
import CompetitionEntry from "../models/CompetitionEntry.js";
import CompetitionRegistrationIntent from "../models/CompetitionRegistrationIntent.js";
import ExternalRegistration from "../models/ExternalRegistration.js";
import Script from "../models/Script.js";
import Invoice from "../models/Invoice.js";
import { issueInvoice, totalRow, gatewayRow } from "../utils/invoiceIssue.js";
import { recordPayment } from "../utils/ledger.js";
import User from "../models/User.js";
import { createNotification, resolveClientBaseUrl, sendEmailNotification } from "../utils/notify.js";
import { buildSubmissionMail } from "../utils/competitionMail.js";
import { hasProjectCreatorAccess } from "../utils/projectAccess.js";
import { generateCompetitionCertificate } from "../utils/competitionCertificatePdf.js";
import {
  getReferralProgress,
  ensureReferralCode,
  listCompetitionReferrals,
  referralWindow,
} from "../utils/competitionReferrals.js";
import { countPages } from "../utils/paginate.js";
import { isKnownCountry } from "../utils/countries.js";
import { classifyText } from "../utils/classify.js";
import {
  getCompetitionPhase,
  buildTimeline,
  canSubmitNow,
} from "../utils/competitionPhase.js";
import { badgeImageFor, composePrizeLines } from "../utils/competitionRewards.js";
import {
  COMPETITION_ENTRY_SUMMARY_FIELDS,
  competitionEntrySummary,
} from "../utils/competitionEntrySummary.js";
import {
  COMPETITION_DASHBOARD_ENTRY_FIELDS,
  competitionDashboardEntry,
} from "../utils/competitionDashboardEntry.js";
import {
  competitionPageInfo,
  parseCompetitionCommunityPaging,
} from "../utils/competitionCommunityPaging.js";
import {
  HALL_OF_FAME_DETAIL_FIELDS,
  HALL_OF_FAME_LIST_FIELDS,
  hallOfFamePageInfo,
  parseHallOfFameFeaturedPaging,
  parseHallOfFamePaging,
} from "../utils/competitionHallOfFamePaging.js";
import {
  COMPETITION_REGISTRATION_MODE,
  competitionRegistrationCharge,
  competitionRegistrationMode,
  normalizeCompetitionRegistration,
  registrationOrderStanding,
} from "../utils/competitionRegistration.js";

// ── Shared helpers ──────────────────────────────────────────────────────────

const PHASES_WITH_THEME = new Set(["live", "judging", "results"]);

// Visibility is a DISCOVERY control, never an access one: a competition kept out of the lists stays
// fully usable for anyone holding its direct link. `private` was added to the enum and offered in
// the admin UI as "Private (Invite only)" without being added to any filter, which made it strictly
// MORE public than `hidden` — it still surfaced in every list and in the Hall of Fame. Both values
// mean "not discoverable"; anything that should also be unreadable belongs in `lifecycle`.
const UNDISCOVERABLE = ["hidden", "private"];

/**
 * Shape a competition for the client.
 *
 * The theme is withheld until the competition is live — the reveal is the whole point of the event,
 * so it is stripped SERVER-side. Never rely on the client hiding it.
 *
 * This is the ONLY shaper for three routes — listCompetitions, getActiveCompetition and getMyEntry —
 * two of them unauthenticated. It was once "simplified" to return the raw document so an admin-built
 * page could read the theme, which broke the event in three ways at once: an `announced` competition
 * published its theme to anyone, `?c=<slug>` exposed the theme of competitions deliberately kept out
 * of discovery, and — through getMyEntry — registrants could read the brief before the clock started
 * while the editor still refused to open until `live`, so the only way to use the head start was to
 * write off-platform. If an admin surface needs the theme early, it must read the ADMIN endpoint.
 */
/**
 * The prize lists as the PUBLIC reads them: the platform's grants in words, then the admin's
 * free-text extras — one list per placing, so no page can promise something the declare flow will
 * not grant. A special award folds its grants into the description it already prints; its badge
 * line is dropped there because the title is the badge.
 */
const publicPrizes = (competition) => {
  const composed = composePrizeLines(competition);
  return {
    winner: composed.winner,
    runnerUp: composed.runnerUp,
    secondRunnerUp: composed.secondRunnerUp,
    special: composed.special.map((row) => ({
      title: row.title,
      description: [row.description, ...row.lines.filter((line) => !line.endsWith(" badge"))].filter(Boolean).join(" · "),
      badgeUrl: row.badgeUrl || "",
    })),
  };
};

const publicCompetition = (competition, phase) => {
  const obj = typeof competition.toObject === "function" ? competition.toObject() : { ...competition };
  // Theme is now globally visible as requested, regardless of the phase
  obj.prizes = publicPrizes(competition);
  return obj;
};

// Which of the competitions already under way the public page belongs to, lowest tier first. A
// writing window in progress owns the page outright — that is the one moment the whole event is
// about. Then the ones still open, which is where a visitor can actually do something. A competition
// past its deadline but not yet declared (`judging`) is last: nothing can be entered or submitted in
// it, but it is still in flight, so it beats an edition that has not opened at all.
const ACTIVE_TIER = { live: 0, registration_open: 1, registration_closed: 1, judging: 2 };

/**
 * The one competition the public page shows.
 *
 * "Latest startsAt" alone was wrong: announcing next year's edition while this weekend's is still
 * running would hijack /active, hiding the live theme and the countdown from everyone mid-competition.
 * So prefer a competition whose window has actually opened and not yet been declared — the most
 * urgent one by phase, see ACTIVE_TIER — and only fall back to the soonest upcoming one when nothing
 * is currently in flight.
 */
const findActiveCompetition = async () => {
  const now = new Date();
  // `hidden` competitions are never DISCOVERED — an internal or university-only event must not take
  // over the public landing page. It stays fully usable for anyone holding its direct link.
  const discoverable = { lifecycle: "published", visibility: { $nin: UNDISCOVERABLE } };

  // Everything already under way: registration has opened and results are not declared yet.
  //
  // Sorting this set by startsAt was the very hijack the comment above says it prevents. Announcing
  // next year's edition opens ITS registration, and its later startsAt then outranked the
  // competition running right now — so mid-event /active swapped to the next edition and took the
  // live theme and countdown off the page with it. Rank by the real phase instead: derived here from
  // getCompetitionPhase rather than re-expressed as date comparisons, so this ordering cannot drift
  // away from the phase definitions everything else renders from.
  const openNow = await Competition.find({
    ...discoverable,
    resultsDeclaredAt: null,
    "dates.regOpensAt": { $lte: now },
  });
  if (openNow.length) {
    const ranked = openNow.map((competition) => ({
      competition,
      tier: ACTIVE_TIER[getCompetitionPhase(competition, now)] ?? ACTIVE_TIER.registration_open,
      endsAt: new Date(competition.dates?.endsAt || 0).getTime(),
    }));
    ranked.sort((a, b) => (
      a.tier - b.tier
      // Within a tier, whichever is closest to its own deadline: the soonest still ahead, or for a
      // finished edition the one that ended most recently.
      || (a.tier === ACTIVE_TIER.judging ? b.endsAt - a.endsAt : a.endsAt - b.endsAt)
    ));
    return ranked[0].competition;
  }

  // Nothing open yet — show the next one due to open.
  const upcoming = await Competition.findOne({
    ...discoverable,
    resultsDeclaredAt: null,
    "dates.regOpensAt": { $gt: now },
  }).sort({ "dates.regOpensAt": 1 });
  if (upcoming) return upcoming;

  // Everything is finished: show the most recently declared so results stay reachable.
  return Competition.findOne(discoverable).sort({ "dates.startsAt": -1 });
};

/**
 * Load a competition for a READ path — its record page, an entrant's dashboard, a certificate.
 *
 * Archiving retires a competition from the live surface; it does not erase it. The Hall of Fame
 * already says so (HALL_OF_FAME_FILTER admits everything that is not a draft), but this loader
 * excluded archived, so archiving a finished competition 404'd its own page and every entrant's
 * certificate download — records that are supposed to be permanent. Draft is the one lifecycle
 * nothing public may reach.
 */
const loadCompetitionById = async (id) => {
  if (!mongoose.isValidObjectId(id)) return null;
  return Competition.findOne({ _id: id, lifecycle: { $ne: "draft" } });
};

/**
 * Load a competition for a path that means "this competition is open for business" — registering,
 * writing, submitting. These require `published`: an archived edition is a record, not a venue, and
 * its dates may still read as live.
 */
const loadOpenCompetitionById = async (id) => {
  if (!mongoose.isValidObjectId(id)) return null;
  return Competition.findOne({ _id: id, lifecycle: "published" });
};

const countWords = (text = "") => String(text).trim().split(/\s+/).filter(Boolean).length;

const countScenes = (text = "") => {
  if (!String(text || "").trim()) return 0;
  // Same classifier the editor, paginator and PDF use, so the count matches what the writer saw.
  return classifyText(text).filter((type) => type === "scene").length;
};

// Results shown publicly once declared. Deliberately winners-only: no rankings, no scores for
// anyone else (a competition should not publish a leaderboard of who lost).
const buildPublicResults = async (competitionId) => {
  const entries = await CompetitionEntry.find({
    competitionId,
    "result.award": { $in: ["winner", "runner_up", "second_runner_up", "special"] },
  })
    .populate("userId", "name profileImage writerProfile.username username isPrivate isDeactivated")
    .lean();

  // A writer who has since gone private or deleted their account is omitted entirely — the same rule
  // getCompetitionHistory applies. Their placing is not re-assigned to anyone else.
  // For the badge artwork: the images live on the competition, the award on the entry.
  const competition = await Competition.findById(competitionId).select("badgeImages prizes.special").lean();
  const visible = entries.filter((e) => e.userId && !e.userId.isPrivate && !e.userId.isDeactivated);

  // NOTE: deliberately no scriptId. Competition entries stay private drafts; the Hall of Fame links
  // to the writer's profile, never to their script.
  const shape = (entry) => ({
    userId: String(entry.userId._id),
    name: entry.userId?.name || "Writer",
    username: entry.userId?.writerProfile?.username || entry.userId?.username || "",
    profileImage: entry.userId?.profileImage || "",
    scriptTitle: entry.snapshot?.title || "",
    // The writer's own logline wins; the AI's is only a stand-in for entries that never had one
    // (including everything submitted before snapshot.logline existed). `loglineByAi` travels with
    // it so the client can label the stand-in as machine-written — quoting the platform's words
    // under a winner's name is exactly what this preference exists to prevent.
    logline: entry.snapshot?.logline || entry.ai?.logline || "",
    loglineByAi: !entry.snapshot?.logline && Boolean(entry.ai?.logline),
    synopsis: entry.snapshot?.synopsis || "",
    specialTitle: entry.result?.specialTitle || "",
    rewards: (entry.rewardsGranted || []).map((r) => r.type),
    badgeImage: badgeImageFor(competition, entry.result?.award, entry.result?.specialTitle),
  });

  return {
    winner: visible.filter((e) => e.result.award === "winner").map(shape)[0] || null,
    runnerUp: visible.filter((e) => e.result.award === "runner_up").map(shape)[0] || null,
    secondRunnerUp: visible.filter((e) => e.result.award === "second_runner_up").map(shape)[0] || null,
    special: visible.filter((e) => e.result.award === "special").map(shape),
  };
};

/**
 * Aggregate statistics for one competition.
 *
 * Individual-safe by construction: it returns counts only, never a row that could be traced back to
 * a person. In particular `countries` is a DISTINCT COUNT — registration.country is collected for
 * grouping, and no individual's country is ever published.
 */
const buildCompetitionStats = async (competitionId) => {
  const SUBMITTED = ["submitted", "ai_processed", "judged"];
  const [row] = await CompetitionEntry.aggregate([
    { $match: { competitionId } },
    {
      $group: {
        _id: null,
        totalParticipants: { $sum: 1 },
        scriptsSubmitted: { $sum: { $cond: [{ $in: ["$status", SUBMITTED] }, 1, 0] } },
        // Fold case and whitespace before counting: country is free text, so "USA", "usa " and
        // "Usa" are one country, not three. (Different spellings — "USA" vs "United States" — still
        // count separately; normalising those needs a country list, which is not worth it yet.)
        countries: { $addToSet: { $toLower: { $trim: { input: { $ifNull: ["$registration.country", ""] } } } } },
      },
    },
  ]);

  const totalParticipants = row?.totalParticipants || 0;
  const scriptsSubmitted = row?.scriptsSubmitted || 0;
  return {
    totalParticipants,
    scriptsSubmitted,
    countriesRepresented: (row?.countries || []).filter(Boolean).length,
    // How many of the writers who signed up actually finished. 0 participants ⇒ 0, not NaN.
    completionRate: totalParticipants ? Math.round((scriptsSubmitted / totalParticipants) * 100) : 0,
  };
};

// A competition belongs in the Hall of Fame once its results are declared. Archived editions stay —
// archiving retires a competition from the live page, it does not erase its history. Hidden ones
// never appear.
const HALL_OF_FAME_FILTER = {
  lifecycle: { $ne: "draft" },
  visibility: { $nin: UNDISCOVERABLE },
  resultsDeclaredAt: { $ne: null },
};

/**
 * GET /api/competitions/list  (public) — everything discoverable, bucketed for the Challenge hub.
 *
 * The hub needs to show "live", "upcoming" and "previous" side by side; `/active` deliberately
 * returns exactly ONE competition and cannot answer that.
 *
 * Two things this must not get wrong:
 *  - The THEME is the reveal, so it is only ever included for phases that have earned it. This
 *    reuses publicCompetition rather than spreading the raw document, so a competition that has not
 *    started cannot leak its theme through the list even though it leaks nothing through /active.
 *  - "Previous" is NOT the same as the Hall of Fame. A competition whose deadline has passed but
 *    whose results are not declared yet is finished from a writer's point of view, but has no
 *    winners to show. It belongs in `past` here and in neither list otherwise — without this bucket
 *    those competitions are invisible between the deadline and the announcement.
 */
export const listCompetitions = async (req, res) => {
  try {
    const now = new Date();
    const competitions = await Competition.find({
      lifecycle: "published",
      visibility: { $nin: UNDISCOVERABLE },
    }).sort({ "dates.startsAt": -1 }).lean();

    const buckets = { live: [], upcoming: [], past: [] };

    for (const competition of competitions) {
      const phase = getCompetitionPhase(competition, now);
      const safe = publicCompetition(competition, phase);
      const item = {
        _id: safe._id,
        name: safe.name,
        slug: safe.slug,
        phase,
        overview: safe.overview || "",
        bannerUrl: safe.bannerUrl || "",
        prizePool: safe.prizePool || "",
        dates: safe.dates,
        resultsDeclaredAt: safe.resultsDeclaredAt || null,
        // Present only once the theme has been released; withheld phases have no `theme` at all.
        theme: safe.theme?.title || "",
        year: new Date(safe.dates?.startsAt || safe.createdAt).getUTCFullYear(),
      };

      // `live` means a writer can still DO something — register, or write against the clock.
      // `judging` looks live by the dates but the deadline has passed and nothing can be entered or
      // submitted, so it sits with the finished ones, awaiting its result.
      if (phase === "announced") buckets.upcoming.push(item);
      else if (phase === "results" || phase === "judging") buckets.past.push(item);
      else buckets.live.push(item);   // registration_open | registration_closed | live
    }

    return res.json({ ...buckets, serverNow: now.toISOString() });
  } catch (error) {
    console.error("[competition] list failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to load competitions." });
  }
};

// GET /api/competitions/completed  (public) — the Hall of Fame index
export const getCompletedCompetitions = async (req, res) => {
  try {
    const paging = parseHallOfFamePaging(req.query);
    const filter = { ...HALL_OF_FAME_FILTER };
    if (paging.competition) filter.name = paging.competition;
    if (paging.year) {
      filter.$expr = {
        $eq: [
          { $year: { $ifNull: ["$dates.startsAt", "$resultsDeclaredAt"] } },
          paging.year,
        ],
      };
    }

    const [competitions, total, yearRows, competitionNames] = await Promise.all([
      Competition.find(filter)
        .select(HALL_OF_FAME_LIST_FIELDS)
        .sort({ resultsDeclaredAt: -1, _id: -1 })
        .skip((paging.page - 1) * paging.limit)
        .limit(paging.limit)
        .lean(),
      Competition.countDocuments(filter),
      Competition.aggregate([
        { $match: HALL_OF_FAME_FILTER },
        { $project: { year: { $year: { $ifNull: ["$dates.startsAt", "$resultsDeclaredAt"] } } } },
        { $group: { _id: "$year" } },
        { $sort: { _id: -1 } },
      ]),
      Competition.distinct("name", HALL_OF_FAME_FILTER),
    ]);

    const items = await Promise.all(competitions.map(async (competition) => {
      const [results, stats] = await Promise.all([
        buildPublicResults(competition._id),
        buildCompetitionStats(competition._id),
      ]);
      return {
        _id: competition._id,
        name: competition.name,
        slug: competition.slug,
        year: new Date(competition.dates?.startsAt || competition.resultsDeclaredAt).getUTCFullYear(),
        theme: competition.theme?.title || "",
        bannerUrl: competition.bannerUrl || "",
        prizePool: competition.prizePool || "",
        dates: competition.dates,
        resultsDeclaredAt: competition.resultsDeclaredAt,
        winner: results.winner,
        runnerUp: results.runnerUp,
        secondRunnerUp: results.secondRunnerUp || null,
        // Category winners (Best Dialogue and the like). The Hall of Fame is about the PEOPLE, so
        // it needs every award, not just the top two — omitting these silently erased a whole class
        // of winner from the record.
        special: results.special || [],
        ...stats,
      };
    }));

    return res.json({
      items,
      years: yearRows.map((row) => row._id).filter(Boolean),
      competitions: competitionNames.filter(Boolean).sort((a, b) => a.localeCompare(b)),
      pageInfo: hallOfFamePageInfo({ ...paging, total }),
    });
  } catch (error) {
    console.error("[competition] completed list failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to load the Hall of Fame." });
  }
};

// GET /api/competitions/hall-of-fame/:slug  (public) — one competition's permanent record
export const getHallOfFameEntry = async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    const competition = await Competition.findOne({ ...HALL_OF_FAME_FILTER, slug })
      .select(HALL_OF_FAME_DETAIL_FIELDS)
      .lean();
    if (!competition) return res.status(404).json({ message: "Competition not found." });
    const featuredPaging = parseHallOfFameFeaturedPaging(req.query);

    const [results, stats] = await Promise.all([
      buildPublicResults(competition._id),
      buildCompetitionStats(competition._id),
    ]);

    // Scripts from this competition that the writer has since chosen to publish. Empty until then —
    // winning entries are NOT auto-published, so this section simply stays hidden.
    const featuredFilter = {
      competitionId: competition._id,
      isFeatured: true,
      status: { $in: ["published", "approved"] },
      isDeleted: { $ne: true },
    };
    const [featuredScripts, featuredTotal] = await Promise.all([
      Script.find(featuredFilter)
      .select("title coverImage genre primaryGenre logline creator")
      .populate("creator", "name profileImage writerProfile.username")
      .sort({ _id: -1 })
      .skip((featuredPaging.page - 1) * featuredPaging.limit)
      .limit(featuredPaging.limit)
      .lean(),
      Script.countDocuments(featuredFilter),
    ]);

    return res.json({
      competition: {
        _id: competition._id,
        name: competition.name,
        slug: competition.slug,
        year: new Date(competition.dates?.startsAt || competition.resultsDeclaredAt).getUTCFullYear(),
        theme: competition.theme,          // fully public once results are declared
        bannerUrl: competition.bannerUrl || "",
        prizePool: competition.prizePool || "",
        overview: competition.overview || "",
        dates: competition.dates,
        resultsDeclaredAt: competition.resultsDeclaredAt,
        prizes: publicPrizes(competition),
        badgeImages: competition.badgeImages || {},
        judges: competition.judges || [],
        sponsors: competition.sponsors || [],
      },
      results,
      stats,
      featuredScripts: featuredScripts.map((script) => ({
        _id: script._id,
        title: script.title,
        coverImage: script.coverImage || "",
        genre: script.primaryGenre || script.genre || "",
        logline: script.logline || "",
        writer: {
          _id: script.creator?._id,
          name: script.creator?.name || "Writer",
          username: script.creator?.writerProfile?.username || "",
          profileImage: script.creator?.profileImage || "",
        },
      })),
      featuredScriptsPageInfo: hallOfFamePageInfo({ ...featuredPaging, total: featuredTotal }),
    });
  } catch (error) {
    console.error("[competition] hall of fame entry failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to load the competition." });
  }
};

// ── Participant endpoints ───────────────────────────────────────────────────

// GET /api/competitions/active  (public)
export const getActiveCompetition = async (req, res) => {
  try {
    // `?c=<slug>` targets one competition explicitly. This is how a hidden (internal / university /
    // sponsor-exclusive) competition is reached: it is excluded from discovery, so without this its
    // own entrants could never load it. Draft competitions stay unreachable either way.
    // Archived is admitted here for the same reason it is admitted by id: `?c=<slug>` is how a
    // FINISHED competition's own page is opened, and retiring it from discovery must not turn its
    // permanent record into a 404.
    const requestedSlug = String(req.query.c || "").trim().toLowerCase();
    const competition = requestedSlug
      ? await Competition.findOne({ slug: requestedSlug, lifecycle: { $ne: "draft" } })
      : await findActiveCompetition();
    if (!competition) return res.status(404).json({ message: "No active competition" });

    const now = new Date();
    const phase = getCompetitionPhase(competition, now);
    // The detail hero states participation as a fact. The previous raw document has no such field,
    // so both desktop and native silently rendered zero even with real entrants in the collection.
    const stats = await buildCompetitionStats(competition._id);
    const payload = {
      competition: { ...publicCompetition(competition, phase), ...stats },
      phase,
      timeline: buildTimeline(competition, null, now),
      // Lets the client correct for a skewed device clock so countdowns are honest.
      serverNow: now.toISOString(),
    };
    if (phase === "results") payload.results = await buildPublicResults(competition._id);
    return res.json(payload);
  } catch (error) {
    console.error("[competition] getActive failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to load the competition." });
  }
};

// POST /api/competitions/:id/register  (protect)
export const registerForCompetition = async (req, res) => {
  try {
    const competition = await loadOpenCompetitionById(req.params.id);
    if (!competition) return res.status(404).json({ message: "Competition not found." });

    // Entering means writing a script, so the same rule that governs authoring applies here. Caught
    // at registration rather than at the first keystroke: letting a reader or investor register and
    // then refusing their writing would strand them with an entry they can never fulfil.
    if (!hasProjectCreatorAccess(req.user)) {
      return res.status(403).json({ message: "Only writer accounts can enter the competition." });
    }

    const now = new Date();
    const phase = getCompetitionPhase(competition, now);

    // An existing entry short-circuits BEFORE the phase check: someone returning to the page after
    // registration closes should be let through to their dashboard, not told registration is shut.
    const existing = await CompetitionEntry.findOne({ competitionId: competition._id, userId: req.user._id });
    if (existing) {
      return res.json({
        entry: existing,
        alreadyRegistered: true,
        phase,
        timeline: buildTimeline(competition, existing, now),
      });
    }

    if (phase !== "registration_open") {
      return res.status(409).json({ message: "Registration is not open." });
    }

    // This endpoint predates checkout. Once paid registration shipped it remained callable and
    // silently admitted anybody who posted the form by hand. Paid is the schema default; only an
    // explicitly free competition may use this path.
    if (competitionRegistrationMode(competition) !== COMPETITION_REGISTRATION_MODE.FREE) {
      return res.status(402).json({
        message: "This challenge requires payment. Start registration from the challenge page.",
        paymentRequired: true,
      });
    }

    const normalized = normalizeCompetitionRegistration(req.body, { isKnownCountry });
    if (!normalized.ok) return res.status(400).json({ message: normalized.message });

    const entry = new CompetitionEntry({
      competitionId: competition._id,
      userId: req.user._id,
      registration: normalized.registration,
      acceptedRulesAt: now,
      acceptedCopyrightAt: now,
      status: "registered",
    });

    await entry.save();
    
    // We try to link the referral if they have one.
    await ensureReferralCode(req.user._id);

    return res.json({
      entry,
      timeline: buildTimeline(competition, entry, now),
    });
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await CompetitionEntry.findOne({
        competitionId: req.params.id,
        userId: req.user._id,
      });
      if (existing) return res.json({ entry: existing, alreadyRegistered: true, registrationComplete: true });
    }
    console.error("[competition] register failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to register for the competition." });
  }
};

// ── Registration fee ────────────────────────────────────────────────────────
//
// ONE definition, read by both the order and its verification. They were previously unrelated: the
// order charged a literal 9800 paise / 200 cents, and the verifier checked only that the Razorpay
// signature was valid — never what was paid, in which currency, or against which order. A signature
// is only proof that SOME payment on this merchant account succeeded, so any captured payment in
// the app satisfied it, and the amount an invoice would have to state was never established at all.
const REGISTRATION_RECEIPT_PREFIX = "reg_";


/**
 * Issue the tax invoice for a paid competition entry.
 *
 * IDEMPOTENT on `paymentReference`, which carries a unique index: Razorpay's checkout callback can
 * fire more than once, and a buyer must never end up with two invoice numbers for one payment.
 *
 * Deliberately NON-FATAL. The money is already captured and the entry already exists by the time
 * this runs — failing the request because a PDF could not be uploaded would tell the entrant their
 * payment did not work, and they would pay twice. A missing invoice is recoverable later; a lost
 * registration is not.
 */
const issueRegistrationInvoice = async ({ user, competition, entry, paymentId, amountMajor, currency }) => {
  const paymentReference = String(paymentId || "").trim();
  if (!paymentReference) return null;

  const existing = await Invoice.findOne({ paymentReference }).select("_id invoiceNumber pdfPath");
  if (existing) return existing;

  // The ledger entry is idempotent on the payment id, so a retried checkout callback that finds no
  // invoice yet still cannot produce two revenue rows.
  await recordPayment({
    kind: "competition_registration",
    user: user._id,
    amountMinor: Math.round(Number(amountMajor) * 100),
    currency,
    listPriceMinor: competitionRegistrationCharge(competition, currency).amountMinor,
    providerPaymentId: paymentReference,
    subjectType: "Competition",
    subjectId: competition._id,
    label: competition.name,
    source: "competitionController.issueRegistrationInvoice",
    metadata: { eventId: entry?.eventId || "" },
  });

  return issueInvoice({
    kind: "competition_registration",
    user,
    paymentReference,
    currency,
    amountCharged: amountMajor,
    competition: competition._id,
    detailLines: [
      competition.name,
      `Competition ID: ${competition._id}`,
      `Entry Fee: ${currency} ${Number(amountMajor).toFixed(2)}`,
      entry?.eventId ? `Entry ID: ${entry.eventId}` : "",
      `Payment Ref: ${paymentReference}`,
    ],
    rows: [
      {
        item: "Competition Entry Fee",
        type: "Registration",
        detail: `${competition.name}${entry?.eventId ? ` · Entry ${entry.eventId}` : ""}`,
        amountLabel: `${currency} ${Number(amountMajor).toFixed(2)}`,
        amountValue: amountMajor,
      },
      totalRow(amountMajor, currency),
      gatewayRow(paymentReference),
    ],
    source: "competitionController.issueRegistrationInvoice",
  });
};

const getRazorpayClient = async () => {
  const { default: Razorpay } = await import("razorpay");
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

const invoiceShape = (invoice) => (
  invoice?._id ? { _id: invoice._id, invoiceNumber: invoice.invoiceNumber } : null
);

const findCapturedOrderPayment = async (razorpay, orderId, paymentId = "") => {
  const response = await razorpay.orders.fetchPayments(orderId);
  const payments = Array.isArray(response?.items) ? response.items : [];
  if (paymentId) {
    const exact = payments.find((payment) => String(payment?.id) === String(paymentId));
    return exact?.status === "captured" ? exact : null;
  }
  return payments.find((payment) => payment?.status === "captured") || null;
};

/** Finish a provider-paid registration from either Checkout's callback or a later S2S recovery. */
const finalizeRegistrationPayment = async ({ competition, user, intent, order, razorpay, paymentId = "" }) => {
  const standing = registrationOrderStanding({
    order,
    intent,
    competitionId: competition._id,
    userId: user._id,
  });
  if (!standing.ok) return standing;

  const captured = await findCapturedOrderPayment(razorpay, order.id, paymentId);
  if (!captured) {
    return { ok: false, pending: true, message: "The payment has not been captured yet." };
  }

  let entry = await CompetitionEntry.findOne({ competitionId: competition._id, userId: user._id });
  if (entry && String(entry.payment?.orderId || "") !== String(intent.orderId)) {
    // This can only happen if a free/external admission won a race with an already-open checkout.
    // Do not rewrite its audit trail or issue a second kind of admission; support must reconcile the
    // captured charge explicitly.
    return {
      ok: false,
      conflict: true,
      message: `Your entry already exists through another registration path. Contact support with payment ${captured.id}.`,
    };
  }

  const now = new Date();
  if (!entry) {
    entry = new CompetitionEntry({
      competitionId: competition._id,
      userId: user._id,
      registration: intent.registration,
      acceptedRulesAt: intent.acceptedRulesAt,
      acceptedCopyrightAt: intent.acceptedCopyrightAt,
      status: "registered",
      payment: {
        orderId: intent.orderId,
        paymentId: captured.id,
        amount: standing.amountMajor,
        currency: standing.currency,
        paidAt: now,
      },
    });
    try {
      await entry.save();
      await ensureReferralCode(user._id);
    } catch (error) {
      if (error?.code !== 11000) throw error;
      entry = await CompetitionEntry.findOne({ competitionId: competition._id, userId: user._id });
      if (!entry || String(entry.payment?.orderId || "") !== String(intent.orderId)) throw error;
    }
  }

  const invoice = await issueRegistrationInvoice({
    user,
    competition,
    entry,
    paymentId: captured.id,
    amountMajor: standing.amountMajor,
    currency: standing.currency,
  });
  if (invoice?._id && String(entry.payment?.invoice || "") !== String(invoice._id)) {
    entry.payment.invoice = invoice._id;
    await entry.save();
  }

  await CompetitionRegistrationIntent.updateOne(
    { _id: intent._id },
    {
      $set: {
        state: "verified",
        paymentId: captured.id,
        entry: entry._id,
        verifiedAt: now,
        lockToken: "",
        lockExpiresAt: null,
      },
    },
  );

  return {
    ok: true,
    data: {
      entry,
      timeline: buildTimeline(competition, entry, now),
      invoice: invoiceShape(invoice),
      registrationComplete: true,
    },
  };
};

export const createRegistrationOrder = async (req, res) => {
  let claimedIntent = null;
  try {
    const competition = await loadOpenCompetitionById(req.params.id);
    if (!competition) return res.status(404).json({ message: "Competition not found." });

    if (!hasProjectCreatorAccess(req.user)) {
      return res.status(403).json({ message: "Only writer accounts can enter the competition." });
    }

    const now = new Date();
    const phase = getCompetitionPhase(competition, now);

    const existing = await CompetitionEntry.findOne({ competitionId: competition._id, userId: req.user._id });
    if (existing) {
      return res.json({
        entry: existing,
        alreadyRegistered: true,
        registrationComplete: true,
        timeline: buildTimeline(competition, existing, now),
      });
    }

    if (phase !== "registration_open") {
      return res.status(409).json({ message: "Registration is not open." });
    }

    if (competitionRegistrationMode(competition) !== COMPETITION_REGISTRATION_MODE.PAID) {
      return res.status(409).json({ message: "This challenge is free to enter. No payment order is needed.", freeRegistration: true });
    }

    const normalized = normalizeCompetitionRegistration(req.body, { isKnownCountry });
    if (!normalized.ok) return res.status(400).json({ message: normalized.message });

    const pendingClaim = await ExternalRegistration.findOne({
      competition: competition._id,
      user: req.user._id,
      status: "pending",
    }).select("_id");
    if (pendingClaim) {
      return res.status(409).json({
        message: "Your third-party registration is already with our team. Wait for that decision before paying here.",
        externalPending: true,
      });
    }

    const razorpay = await getRazorpayClient();

    const { resolveCurrency } = await import("../utils/currencyFx.js");
    const { createOrderWithUsdFallback } = await import("../utils/razorpayOrder.js");

    const requestedCurrency = resolveCurrency(req.body?.currency, req.user.preferredCurrency);
    const requestedCharge = competitionRegistrationCharge(competition, requestedCurrency);
    const nowAccepted = new Date();

    let intent;
    try {
      intent = await CompetitionRegistrationIntent.findOneAndUpdate(
        { competition: competition._id, user: req.user._id },
        {
          $setOnInsert: {
            registration: normalized.registration,
            acceptedRulesAt: nowAccepted,
            acceptedCopyrightAt: nowAccepted,
            currency: requestedCharge.currency,
            amountMinor: requestedCharge.amountMinor,
            state: "draft",
          },
        },
        { upsert: true, new: true },
      );
    } catch (error) {
      // Two first taps can race the unique (competition,user) upsert. The other request owns the
      // intent; join it instead of turning an expected retry into a 500.
      if (error?.code !== 11000) throw error;
      intent = await CompetitionRegistrationIntent.findOne({
        competition: competition._id,
        user: req.user._id,
      });
      if (!intent) throw error;
    }

    if (intent.state === "verified" && intent.entry) {
      const entry = await CompetitionEntry.findById(intent.entry);
      if (entry) {
        const invoice = intent.paymentId
          ? await Invoice.findOne({ paymentReference: intent.paymentId }).select("_id invoiceNumber")
          : null;
        return res.json({
          entry,
          timeline: buildTimeline(competition, entry, new Date()),
          invoice: invoiceShape(invoice),
          registrationComplete: true,
        });
      }
    }

    if (intent.orderId) {
      // One order owns all attempts. The form answers may be corrected before payment, but currency
      // and amount remain those printed on that already-created order.
      intent.registration = normalized.registration;
      intent.acceptedRulesAt = nowAccepted;
      intent.acceptedCopyrightAt = nowAccepted;
      await intent.save();

      const order = await razorpay.orders.fetch(intent.orderId);
      if (order?.status === "paid") {
        const completed = await finalizeRegistrationPayment({ competition, user: req.user, intent, order, razorpay });
        if (completed.ok) return res.json(completed.data);
        return res.status(completed.pending ? 409 : 400).json({ message: completed.message });
      }
      return res.json({
        orderId: intent.orderId,
        amount: intent.amountMinor,
        currency: intent.currency,
        key: process.env.RAZORPAY_KEY_ID,
        reusedOrder: true,
      });
    }

    const lockToken = crypto.randomUUID();
    const lockNow = new Date();
    claimedIntent = await CompetitionRegistrationIntent.findOneAndUpdate(
      {
        _id: intent._id,
        $or: [{ orderId: { $exists: false } }, { orderId: "" }],
        $and: [{ $or: [
          { state: { $in: ["draft", "failed"] } },
          { state: "creating", lockExpiresAt: { $lte: lockNow } },
        ] }],
      },
      {
        $set: {
          registration: normalized.registration,
          acceptedRulesAt: nowAccepted,
          acceptedCopyrightAt: nowAccepted,
          currency: requestedCharge.currency,
          amountMinor: requestedCharge.amountMinor,
          state: "creating",
          lockToken,
          lockExpiresAt: new Date(lockNow.getTime() + 60_000),
        },
      },
      { new: true },
    );
    if (!claimedIntent) {
      return res.status(409).json({ message: "Your payment order is already being prepared. Try again in a moment." });
    }

    const inrAmount = competitionRegistrationCharge(competition, "INR").amountMinor;

    const { order, fellBackToINR } = await createOrderWithUsdFallback(razorpay, {
      amount: requestedCharge.amountMinor,
      currency: requestedCharge.currency,
      inrAmount,
      receipt: `${REGISTRATION_RECEIPT_PREFIX}${req.user._id.toString().substring(18)}_${Date.now()}`,
      // Stamped so verification can prove this order was created HERE, for THIS competition, by
      // THIS user. Razorpay returns notes on orders.fetch, so it needs no storage of our own — and
      // without it, any captured payment from anywhere in the app satisfies the signature check.
      notes: {
        purpose: "competition_registration",
        competitionId: String(competition._id),
        userId: String(req.user._id),
      },
    });

    if (!order) return res.status(500).json({ message: "Failed to create Razorpay order" });

    intent = await CompetitionRegistrationIntent.findOneAndUpdate(
      { _id: claimedIntent._id, lockToken },
      {
        $set: {
          orderId: order.id,
          amountMinor: Number(order.amount),
          currency: String(order.currency).toUpperCase(),
          state: "created",
          lockToken: "",
          lockExpiresAt: null,
        },
      },
      { new: true },
    );
    if (!intent) return res.status(409).json({ message: "The payment order was created but could not be attached. Contact support before paying." });

    return res.status(200).json({
      orderId: intent.orderId,
      amount: intent.amountMinor,
      currency: intent.currency,
      key: process.env.RAZORPAY_KEY_ID,
      fellBackToINR,
    });
  } catch (error) {
    if (claimedIntent?._id) {
      await CompetitionRegistrationIntent.updateOne(
        { _id: claimedIntent._id, state: "creating" },
        { $set: { state: "failed", lockToken: "", lockExpiresAt: null } },
      ).catch(() => {});
    }
    console.error("[competition] createRegistrationOrder failed:", error);
    return res.status(500).json({ message: "Failed to create payment order." });
  }
};

export const verifyRegistrationPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing required payment details" });
    }

    const competition = await loadOpenCompetitionById(req.params.id);
    if (!competition) return res.status(404).json({ message: "Competition not found." });

    const intent = await CompetitionRegistrationIntent.findOne({
      competition: competition._id,
      user: req.user._id,
    });
    if (!intent?.orderId || String(intent.orderId) !== String(razorpay_order_id)) {
      return res.status(400).json({ message: "This payment does not belong to this registration." });
    }

    // Razorpay requires the SERVER'S order id for verification. Compare fixed-size buffers so a
    // bad signature does not leak a prefix through timing.
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${intent.orderId}|${razorpay_payment_id}`)
      .digest();
    const receivedSignature = Buffer.from(String(razorpay_signature), "hex");
    if (receivedSignature.length !== generatedSignature.length
      || !crypto.timingSafeEqual(generatedSignature, receivedSignature)) {
      return res.status(400).json({ message: "Payment verification failed: Invalid signature" });
    }

    // Read back what was ACTUALLY charged, rather than trusting the client or re-deriving it from
    // our own price table. Two things depend on this being real: the entry fee we claim to have
    // collected, and the amount printed on a tax document the buyer keeps.
    let order = null;
    let razorpay = null;
    try {
      razorpay = await getRazorpayClient();
      order = await razorpay.orders.fetch(razorpay_order_id);
    } catch (fetchError) {
      console.error("[competition] order fetch failed:", fetchError?.message || fetchError);
      return res.status(502).json({ message: "Could not confirm the payment with Razorpay. Please contact support." });
    }
    if (!order) return res.status(400).json({ message: "Payment order could not be found." });

    const completed = await finalizeRegistrationPayment({
      competition,
      user: req.user,
      intent,
      order,
      razorpay,
      paymentId: razorpay_payment_id,
    });
    if (!completed.ok) {
      const status = completed.pending ? 409 : (completed.conflict ? 409 : 400);
      return res.status(status).json({ message: completed.message, paymentPending: Boolean(completed.pending) });
    }
    return res.json(completed.data);
  } catch (error) {
    console.error("[competition] verifyRegistrationPayment failed:", error);
    return res.status(500).json({ message: "Registration payment verification failed." });
  }
};

// POST /api/competitions/:id/reconcile-registration-payment (protect)
// A successful Checkout callback can be lost to a reload, browser kill or dead connection. This
// route asks Razorpay directly and finishes a captured order without trusting browser-held fields.
export const reconcileRegistrationPayment = async (req, res) => {
  try {
    const competition = await loadOpenCompetitionById(req.params.id);
    if (!competition) return res.status(404).json({ message: "Competition not found." });

    const intent = await CompetitionRegistrationIntent.findOne({
      competition: competition._id,
      user: req.user._id,
    });
    if (!intent?.orderId) return res.status(404).json({ message: "No payment is waiting to be confirmed." });

    const razorpay = await getRazorpayClient();
    const order = await razorpay.orders.fetch(intent.orderId);
    const completed = await finalizeRegistrationPayment({ competition, user: req.user, intent, order, razorpay });
    if (!completed.ok) {
      const status = completed.pending ? 409 : (completed.conflict ? 409 : 400);
      return res.status(status).json({ message: completed.message, paymentPending: Boolean(completed.pending) });
    }
    return res.json(completed.data);
  } catch (error) {
    console.error("[competition] reconcileRegistrationPayment failed:", error);
    return res.status(500).json({ message: "Could not confirm the registration payment yet." });
  }
};




// GET /api/competitions/:id/me  (protect) — the single payload the dashboard renders from
export const getMyEntry = async (req, res) => {
  try {
    const competition = await loadCompetitionById(req.params.id);
    if (!competition) return res.status(404).json({ message: "Competition not found." });

    // Challenge detail and dashboard are explicit projections. Only the editor retains the complete
    // owner record: it needs the script id but is also the one place whose save/submit contract owns
    // the full entry. Neither read-only route may pull bodies, answers or payment evidence into memory.
    const summaryView = req.query.view === "summary";
    const dashboardView = req.query.view === "dashboard";
    const entryQuery = CompetitionEntry.findOne({ competitionId: competition._id, userId: req.user._id });
    if (summaryView) entryQuery.select(COMPETITION_ENTRY_SUMMARY_FIELDS);
    if (dashboardView) entryQuery.select(COMPETITION_DASHBOARD_ENTRY_FIELDS);
    const entry = await entryQuery;
    if (!entry) return res.status(404).json({ message: "You are not registered for this competition." });

    const now = new Date();
    const phase = getCompetitionPhase(competition, now);
    const payload = {
      competition: publicCompetition(competition, phase),
      entry: summaryView
        ? competitionEntrySummary(entry)
        : dashboardView
          ? competitionDashboardEntry(entry)
          : entry,
      phase,
      timeline: buildTimeline(competition, entry, now),
      serverNow: now.toISOString(),
    };
    if (!summaryView) {
      payload.referrals = await getReferralProgress(req.user._id, competition);
      payload.referralCode = await ensureReferralCode(req.user);
    }
    if (phase === "results") payload.results = await buildPublicResults(competition._id);
    return res.json(payload);
  } catch (error) {
    console.error("[competition] getMyEntry failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to load your competition entry." });
  }
};

// POST /api/competitions/:id/open-editor  (protect)
export const openCompetitionEditor = async (req, res) => {
  try {
    const competition = await loadOpenCompetitionById(req.params.id);
    if (!competition) return res.status(404).json({ message: "Competition not found." });

    // Belt-and-braces: this endpoint creates a Script directly, so it must not be a way around the
    // authoring rule even if an entry somehow predates the check in register.
    if (!hasProjectCreatorAccess(req.user)) {
      return res.status(403).json({ message: "Only writer accounts can write a competition entry." });
    }

    const phase = getCompetitionPhase(competition);
    if (phase !== "live") {
      return res.status(409).json({ message: "The writing window is not open." });
    }

    const entry = await CompetitionEntry.findOne({ competitionId: competition._id, userId: req.user._id });
    if (!entry) return res.status(404).json({ message: "You are not registered for this competition." });
    if (["submitted", "ai_processed", "judged"].includes(entry.status)) {
      return res.status(409).json({ message: "You have already submitted your script." });
    }

    // Idempotent: reopening the editor must return the SAME script, never start a fresh one.
    if (entry.scriptId) return res.json({ scriptId: String(entry.scriptId) });

    const script = await Script.create({
      creator: req.user._id,
      title: "",
      status: "draft",
      projectSource: "editor",
      competitionId: competition._id,
      format: "feature_film",
      fountainContent: "",
      textContent: "",
    });

    // Claim the entry ATOMICALLY. A plain assign-and-save would let two concurrent calls (a
    // double-click, or the dashboard open in two tabs) each create a script and race their writes:
    // the loser's script stays orphaned, but its id was already returned to that tab, so the writer
    // could spend the whole window writing into a script the entry no longer points at — and then be
    // told their submission is empty. The filter makes exactly one caller the winner.
    const claimFilter = { _id: entry._id, $or: [{ scriptId: null }, { scriptId: { $exists: false } }] };
    const claimUpdate = { $set: { scriptId: script._id, status: "writing" } };
    let claimed = await CompetitionEntry.findOneAndUpdate(claimFilter, claimUpdate, { new: true });

    // A missed claim is not automatically "someone else won" — the filter also misses if the entry
    // has gone. The obvious handling (bin the script we just made, then read `.scriptId` off the
    // re-read entry) assumes the race every time, and throws a TypeError on a null entry that
    // surfaces as a 500, with the writer's only script already destroyed in the middle of the live
    // window. Work out which case this actually is, and never bin ours unless a real one replaces it.
    for (let attempt = 0; !claimed && attempt < 2; attempt += 1) {
      const current = await CompetitionEntry.findById(entry._id).select("scriptId");
      if (!current) {
        // The entry itself is gone, so nothing will ever point at the script we made.
        await Script.deleteOne({ _id: script._id });
        return res.status(404).json({ message: "You are not registered for this competition." });
      }
      if (current.scriptId) {
        // The race the atomic claim exists for: hand back the winner's script and bin ours.
        await Script.deleteOne({ _id: script._id });
        return res.json({ scriptId: String(current.scriptId) });
      }
      // Still unclaimed, so nobody beat us to it. Try again with the script we already have rather
      // than leaving the writer with nothing to write in.
      claimed = await CompetitionEntry.findOneAndUpdate(claimFilter, claimUpdate, { new: true });
    }

    if (!claimed) {
      await Script.deleteOne({ _id: script._id });
      return res.status(500).json({ message: "Failed to open the competition editor." });
    }

    return res.json({ scriptId: String(script._id) });
  } catch (error) {
    console.error("[competition] openEditor failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to open the competition editor." });
  }
};

// POST /api/competitions/:id/submit  (protect)
export const submitCompetitionEntry = async (req, res) => {
  try {
    const competition = await loadOpenCompetitionById(req.params.id);
    if (!competition) return res.status(404).json({ message: "Competition not found." });

    const entry = await CompetitionEntry.findOne({ competitionId: competition._id, userId: req.user._id });
    if (!entry) return res.status(404).json({ message: "You are not registered for this competition." });
    if (["submitted", "ai_processed", "judged"].includes(entry.status)) {
      return res.status(409).json({ message: "Already submitted." });
    }
    if (!canSubmitNow(competition)) {
      return res.status(409).json({ message: "The submission window has closed." });
    }

    const { confirmOriginal, confirmFinal } = req.body || {};
    if (confirmOriginal !== true || confirmFinal !== true) {
      return res.status(400).json({ message: "Please confirm both checklist items before submitting." });
    }

    if (!entry.scriptId) {
      return res.status(400).json({ message: "Your script looks empty — write your script before submitting." });
    }
    const script = await Script.findById(entry.scriptId);
    if (!script) return res.status(404).json({ message: "Your competition script could not be found." });

    const fountain = String(script.fountainContent || "");
    const text = String(script.textContent || "");
    const source = fountain.trim() || text.trim();
    if (source.length < 100) {
      return res.status(400).json({ message: "Your script looks empty — write your script before submitting." });
    }

    const now = new Date();
    // Lock the script BEFORE the entry flips, so a concurrent autosave can't land between the read
    // above and the freeze below and put content into the script that the snapshot never captured.
    await Script.updateOne({ _id: script._id }, { $set: { competitionLocked: true } });

    // Claim the submission atomically — the status check above is a read, so two simultaneous submits
    // would both pass it and each write a snapshot, send an email, and kick off an AI run.
    const submitted = await CompetitionEntry.findOneAndUpdate(
      { _id: entry._id, status: { $in: ["registered", "writing"] } },
      {
        $set: {
          status: "submitted",
          submittedAt: now,
          snapshot: {
            fountainContent: fountain,
            textContent: text,
            title: script.title || "",
            // The writer's own story materials, frozen with everything else. They belong INSIDE this
            // claim: written later they would no longer be part of the written-once snapshot, and a
            // post-submit edit to the (locked) script could rewrite what the Hall of Fame quotes.
            logline: script.logline || "",
            synopsis: script.synopsis || "",
            wordCount: countWords(source),
            charCount: source.length,
            pageCount: countPages(source),
            sceneCount: countScenes(source),
          },
        },
      },
      { new: true },
    );
    if (!submitted) {
      // Someone else got there first; the script is locked either way.
      return res.status(409).json({ message: "Already submitted." });
    }
    Object.assign(entry, submitted.toObject());

    await createNotification({
      userId: req.user._id,
      type: "competition",
      message: `Submission received for ${competition.name} at ${now.toUTCString()}.`,
    });
    // The receipt: the script, the entry ID, the exact time and the script's numbers, in the
    // platform's own document. Everything typed by the writer is escaped inside the builder.
    const receipt = buildSubmissionMail({
      competition,
      entry,
      writerName: req.user.name,
      scriptTitle: script.title || "Untitled",
      submittedAt: now,
      baseUrl: resolveClientBaseUrl(),
    });
    sendEmailNotification({
      to: req.user.email,
      subject: `Submission received — ${competition.name}`,
      html: receipt.html,
      text: receipt.text,
      preheader: receipt.preheader,
    }).catch(() => { /* best effort */ });

    // Respond before the AI work — the writer should never wait on a model call to learn they made
    // the deadline.
    res.json({ entry, timeline: buildTimeline(competition, entry, now) });

    processEntryAI(entry._id).catch((err) => {
      console.warn("[competition] AI processing failed:", err?.message || err);
    });
    return undefined;
  } catch (error) {
    console.error("[competition] submit failed:", error?.message || error);
    if (!res.headersSent) return res.status(500).json({ message: "Failed to submit your script." });
    return undefined;
  }
};

// GET /api/competitions/:id/participants  (protect)
//
// The writers taking part, so entrants can find each other. Deliberately participant-only: you must
// have an entry yourself to see the room. It exposes who is competing, never what they wrote — no
// entry status, no snapshot, no scores, so nobody can infer who has already submitted or how their
// work was rated.
export const getCompetitionParticipants = async (req, res) => {
  try {
    const competition = await loadCompetitionById(req.params.id);
    if (!competition) return res.status(404).json({ message: "Competition not found." });

    const mine = await CompetitionEntry.findOne({ competitionId: competition._id, userId: req.user._id }).select("_id").lean();
    if (!mine) return res.status(403).json({ message: "Only entrants can see who else is competing." });
    const paging = parseCompetitionCommunityPaging(req.query);
    const meId = String(req.user._id);
    // Join only the requested page and facet the filtered total in the database. The old populate
    // loaded every entrant plus every follower/request id for every account into application memory.
    const [result = {}] = await CompetitionEntry.aggregate([
      { $match: { competitionId: competition._id } },
      { $lookup: { from: User.collection.name, localField: "userId", foreignField: "_id", as: "user" } },
      { $unwind: "$user" },
      { $match: { "user.isDeactivated": { $ne: true }, "user.isFrozen": { $ne: true } } },
      { $addFields: { isSelf: { $eq: [{ $toString: "$user._id" }, meId] } } },
      { $sort: { isSelf: -1, "user.name": 1, "user._id": 1 } },
      { $facet: {
        rows: [
          { $skip: (paging.page - 1) * paging.limit },
          { $limit: paging.limit },
          { $project: {
            _id: "$user._id",
            name: "$user.name",
            username: "$user.writerProfile.username",
            profileImage: "$user.profileImage",
            role: "$user.role",
            bio: "$user.bio",
            genres: "$user.writerProfile.genres",
            isPrivate: "$user.isPrivate",
            isSelf: 1,
          } },
        ],
        meta: [{ $count: "total" }],
      } },
    ]);
    const rows = result.rows || [];
    const ids = rows.map((user) => user._id);
    const [followed, pending] = ids.length ? await Promise.all([
      User.find({ _id: { $in: ids }, followers: req.user._id }).select("_id").lean(),
      User.find({ _id: { $in: ids }, "followRequests.from": req.user._id }).select("_id").lean(),
    ]) : [[], []];
    const followedIds = new Set(followed.map((user) => String(user._id)));
    const pendingIds = new Set(pending.map((user) => String(user._id)));
    const participants = rows.map((user) => ({
      _id: user._id,
      name: user.name || "Writer",
      username: user.username || "",
      profileImage: user.profileImage || "",
      role: user.role,
      bio: user.isPrivate ? "" : String(user.bio || "").slice(0, 240),
      genres: user.isPrivate ? [] : (user.genres || []).slice(0, 5),
      isPrivate: Boolean(user.isPrivate),
      isSelf: Boolean(user.isSelf),
      isFollowing: followedIds.has(String(user._id)),
      followRequestPending: pendingIds.has(String(user._id)),
    }));
    const total = Number(result.meta?.[0]?.total || 0);
    return res.json({ participants, ...competitionPageInfo({ ...paging, total }) });
  } catch (error) {
    console.error("[competition] participants failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to load participants." });
  }
};

// Filenames go straight into a response header, so strip anything that could break or inject there.
const sanitizePdfFileName = (value = "certificate") => {
  const base = String(value).replace(/[\\/]/g, "-").replace(/[^a-zA-Z0-9._ -]/g, "_").trim() || "certificate";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
};

// GET /api/competitions/:id/certificate  (protect)
//
// Only the entrant can download their own, and only once the competition has been judged — a
// certificate issued before results would be a claim about an outcome that does not exist yet.
export const getCompetitionCertificate = async (req, res) => {
  try {
    const competition = await loadCompetitionById(req.params.id);
    if (!competition) return res.status(404).json({ message: "Competition not found." });

    const entry = await CompetitionEntry.findOne({ competitionId: competition._id, userId: req.user._id });
    if (!entry) return res.status(404).json({ message: "You are not registered for this competition." });
    if (entry.status !== "judged") {
      return res.status(409).json({ message: "Your certificate will be available once results are announced." });
    }

    const pdf = await generateCompetitionCertificate({
      writerName: req.user.name,
      competitionName: competition.name,
      scriptTitle: entry.snapshot?.title || "",
      award: entry.result?.award || "participant",
      specialTitle: entry.result?.specialTitle || "",
      eventId: entry.eventId,
      declaredAt: competition.resultsDeclaredAt,
      stats: {
        pageCount: entry.snapshot?.pageCount,
        wordCount: entry.snapshot?.wordCount,
        sceneCount: entry.snapshot?.sceneCount,
      },
    });

    const disposition = String(req.query.download || "") === "1" ? "attachment" : "inline";
    const filename = sanitizePdfFileName(`${competition.name} certificate ${entry.eventId}`);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
    return res.send(pdf);
  } catch (error) {
    console.error("[competition] certificate failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to generate your certificate." });
  }
};

// GET /api/competitions/:id/referrals  (protect) — the signed-in user's own referral history
export const getMyCompetitionReferrals = async (req, res) => {
  try {
    const competition = await loadCompetitionById(req.params.id);
    if (!competition) return res.status(404).json({ message: "Competition not found." });

    const paging = parseCompetitionCommunityPaging(req.query);
    const [progress, history] = await Promise.all([
      getReferralProgress(req.user._id, competition),
      listCompetitionReferrals(req.user._id, competition, paging),
    ]);

    return res.json({
      progress,
      referrals: history.items,
      pageInfo: competitionPageInfo({ ...paging, total: history.total }),
      referralCode: await ensureReferralCode(req.user),
      window: referralWindow(competition),
    });
  } catch (error) {
    console.error("[competition] referral history failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to load your referrals." });
  }
};

// GET /api/competitions/mine  (protect)
export const getMyCompetitions = async (req, res) => {
  try {
    const entries = await CompetitionEntry.find({ userId: req.user._id })
      .select(COMPETITION_ENTRY_SUMMARY_FIELDS)
      .populate("competitionId", "name slug theme.title dates resultsDeclaredAt lifecycle")
      .sort({ createdAt: -1 })
      .lean();

    const now = new Date();
    const items = entries
      .filter((entry) => entry.competitionId)
      .map((entry) => {
        const phase = getCompetitionPhase(entry.competitionId, now);
        return {
          entry: competitionEntrySummary(entry),
          // Through publicCompetition like every other read path. `theme.title` is populated for the
          // record card, and returning the competition raw would have handed a registrant the theme
          // the moment they signed up — the seal has to hold on THIS door too, not just the
          // unauthenticated ones. Entrants are exactly who it protects: everyone gets it at once.
          competition: publicCompetition(entry.competitionId, phase),
          phase,
          timeline: buildTimeline(entry.competitionId, entry, now),
        };
      });

    return res.json({ items, serverNow: now.toISOString() });
  } catch (error) {
    console.error("[competition] getMine failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to load your competitions." });
  }
};

// GET /api/competitions/history/:userId  (public) — profile competition history
export const getCompetitionHistory = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) return res.json({ history: [] });

    // This endpoint is unauthenticated, so it must respect the same visibility rules the rest of the
    // profile does. A private or deleted account's competition record is not public just because it
    // lives in a different collection.
    const owner = await User.findById(req.params.userId).select("isPrivate isDeactivated").lean();
    if (!owner || owner.isDeactivated || owner.isPrivate) return res.json({ history: [] });

    // Only judged entries are public: nothing about an in-flight competition leaks, and there are no
    // rankings — just the achievement.
    const entries = await CompetitionEntry.find({ userId: req.params.userId, status: "judged" })
      // slug + visibility so the profile can link to the Hall of Fame entry — and refrain from
      // linking for a hidden competition, which has no public record.
      .populate("competitionId", "name slug dates resultsDeclaredAt visibility")
      .sort({ submittedAt: -1 })
      .lean();

    const AWARD_LABELS = {
      winner: "Winner",
      runner_up: "Runner-Up",
      second_runner_up: "Second Runner-Up",
      special: "Special Award",
      participant: "Participant",
      none: "Participant",
    };

    const history = entries
      .filter((entry) => entry.competitionId)
      .map((entry) => ({
        competitionName: entry.competitionId.name,
        // Only a competition with a public Hall of Fame record is linkable.
        competitionSlug: UNDISCOVERABLE.includes(entry.competitionId.visibility) || !entry.competitionId.resultsDeclaredAt
          ? ""
          : entry.competitionId.slug || "",
        year: new Date(entry.competitionId.dates?.startsAt || entry.createdAt).getUTCFullYear(),
        scriptTitle: entry.snapshot?.title || "",
        achievement: entry.result?.specialTitle || AWARD_LABELS[entry.result?.award] || "Participant",
        award: entry.result?.award || "participant",
      }));

    return res.json({ history });
  } catch (error) {
    console.error("[competition] history failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to load competition history." });
  }
};

// AI processing lives in a separate module-level function so both submit and the admin "Retry AI"
// action call exactly the same code path. Implemented in the next task.
export const processEntryAI = async (entryId) => {
  const { runEntryAIProcessing } = await import("./competitionAI.js");
  return runEntryAIProcessing(entryId);
};
