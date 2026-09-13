import Competition from "../models/Competition.js";
import CompetitionEntry from "../models/CompetitionEntry.js";
import CompetitionJudge from "../models/CompetitionJudge.js";
import JudgeScore from "../models/JudgeScore.js";
import JudgeNomination from "../models/JudgeNomination.js";
import JudgeEntryAssignment from "../models/JudgeEntryAssignment.js";
import { toJudgeEntryView, JUDGEABLE_STATUSES } from "../utils/judgeEntryView.js";
import { getCompetitionPhase } from "../utils/competitionPhase.js";
import { asObjectId, asTrimmedString, asInt } from "../utils/requestValue.js";

/**
 * The judge-facing API.
 *
 * TWO RULES HOLD EVERYWHERE IN THIS FILE, and both are load-bearing:
 *
 * 1. No entry is ever returned except through `toJudgeEntryView`, and `.populate()` is never called
 *    on an entry query here. A populate added for convenience is exactly how the writer's name
 *    reaches a judge's screen with nothing failing.
 *
 * 2. Every score and nomination query is scoped by `judge: req.user._id`, taken from the verified
 *    session and never from the request. A judge sees their own opinions and no one else's — there
 *    is deliberately no endpoint here that could serve an aggregate, a rank, or another judge's
 *    score, so there is nothing to filter and nothing to leak.
 *
 * The per-competition scope is enforced by `requireJudgeAssignment` in the route layer, which also
 * answers 404 rather than 403 so an assigned judge cannot enumerate competitions they are not on.
 */

/**
 * Entries a judge may see: submitted, in this competition, AND assigned to them.
 *
 * Async now, because the last of those three is a lookup. Every judge-facing entry query goes
 * through here, which is what makes assignment a gate rather than a list filter — an entry nobody
 * gave this judge answers 404 whether they browse to it or paste its id.
 *
 * Deliberately strict: no assignments means an EMPTY queue, not the whole competition. A panel of
 * five each reading all forty entries is the situation this exists to end, so falling back to
 * "everything" when the admin has not allocated yet would quietly restore it.
 */
const assignedEntryIds = async (competitionId, judgeId) => {
  const rows = await JudgeEntryAssignment.find({ competition: competitionId, judge: judgeId })
    .select("entry")
    .lean();
  return rows.map((row) => row.entry);
};

/**
 * @param {string|undefined} entryId  when reading ONE entry, the id being asked for. The filter then
 *   pins `_id` to that id — but only if it is assigned; otherwise `_id` becomes a set that matches
 *   nothing, and the caller's findOne/exists comes back empty exactly as it would for a foreign id.
 *
 * WHY THE PIN LIVES HERE AND NOT AT THE CALL SITE. The first version of this returned only the
 * `$in` set, and every single-entry caller did `{ _id: entryId, ...gate }`. Object spread keeps the
 * LAST duplicate key, so the gate's `_id: { $in: [...] }` silently replaced the requested id, and
 * findOne returned the first assigned entry whatever was asked for. Every script in a judge's queue
 * opened as the same script — and, far worse, saveJudgeScore's exists() check passed for ANY entry
 * as long as the judge had one assignment, so the gate on writes was gone. The intersection has to
 * be computed in one place, by the function that knows both sides.
 */
const judgeableFilter = async (competitionId, judgeId, entryId) => {
  const assigned = await assignedEntryIds(competitionId, judgeId);
  const base = {
    competitionId,
    status: { $in: JUDGEABLE_STATUSES },
  };
  if (entryId === undefined) {
    // The queue: everything assigned. Re-scoped by competitionId as well, so an assignment row
    // pointing at another competition's entry (stale denormalised field, hand-edited data) still
    // cannot widen this.
    return { ...base, _id: { $in: assigned } };
  }
  const isAssigned = assigned.some((id) => String(id) === String(entryId));
  // An unassigned id gets a filter that can never match, rather than a thrown error or a 403: to
  // this judge it must look exactly like an entry that does not exist.
  return { ...base, _id: isAssigned ? entryId : { $in: [] } };
};

/**
 * Is the window open for WRITES?
 *
 * Reads stay open for the whole judging phase so a judge can review what they filed. Writes are
 * gated on the derived phase — which reuses competitionPhase.js rather than inventing a second
 * source of truth, and which closes the instant results are declared — narrowed further by the
 * optional judging.opensAt / closesAt the admin may have set.
 */
const judgingWriteState = (competition, now = new Date()) => {
  if (getCompetitionPhase(competition, now) !== "judging") {
    return {
      open: false,
      reason: competition?.resultsDeclaredAt
        ? "Results have been declared — judging is closed."
        : "Judging opens once the submission window closes.",
    };
  }
  const { opensAt, closesAt } = competition?.judging || {};
  if (opensAt && now < new Date(opensAt)) return { open: false, reason: "Judging has not opened yet." };
  if (closesAt && now > new Date(closesAt)) return { open: false, reason: "The judging window has closed." };
  return { open: true, reason: "" };
};

/** The rubric a judge scores against, shaped for the client. */
const rubricView = (competition) => {
  const judging = competition?.judging || {};
  return {
    scale: Number(judging.scale) > 0 ? Number(judging.scale) : 10,
    criteria: (judging.criteria || [])
      .filter((c) => c?.key)
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((c) => ({ key: c.key, label: c.label || c.key, description: c.description || "", weight: c.weight || 0 })),
    awards: (judging.awards || [])
      .filter((a) => a?.key)
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((a) => ({ key: a.key, label: a.label || a.key, description: a.description || "" })),
  };
};

/** A judge's own score row, as they are allowed to see it. */
const ownScoreView = (score) => {
  if (!score) return null;
  const raw = score.scores;
  const marks = raw
    ? (typeof raw.get === "function" ? Object.fromEntries(raw) : { ...raw })
    : {};
  return {
    marks,
    comment: score.comment || "",
    status: score.status || "draft",
    submittedAt: score.submittedAt || null,
    updatedAt: score.updatedAt || null,
  };
};

/**
 * GET /api/judge/competitions
 * Competitions this judge is actively assigned to, with their own progress against each.
 */
export const listJudgeCompetitions = async (req, res) => {
  try {
    const assignments = await CompetitionJudge.find({ judge: req.user._id, status: "active" })
      .select("competition assignedAt")
      .lean();

    if (!assignments.length) return res.json({ competitions: [] });

    const competitionIds = assignments.map((a) => a.competition);

    const [competitions, entryCounts, myScores] = await Promise.all([
      Competition.find({ _id: { $in: competitionIds } })
        .select("name slug dates resultsDeclaredAt judging bannerUrl cardThumbnailUrl")
        .lean(),
      // Counts what is assigned to THIS judge, not what exists. Counting every entry would show a
      // judge "3 of 40 scored" when they were only ever given three, which reads as being three
      // weeks behind rather than finished.
      JudgeEntryAssignment.aggregate([
        { $match: { competition: { $in: competitionIds }, judge: req.user._id } },
        { $group: { _id: "$competition", count: { $sum: 1 } } },
      ]),
      JudgeScore.find({ competition: { $in: competitionIds }, judge: req.user._id })
        .select("competition status")
        .lean(),
    ]);

    const entryCountBy = new Map(entryCounts.map((c) => [String(c._id), c.count]));
    const scoreStats = new Map();
    for (const s of myScores) {
      const key = String(s.competition);
      const stat = scoreStats.get(key) || { submitted: 0, draft: 0 };
      if (s.status === "submitted") stat.submitted += 1;
      else stat.draft += 1;
      scoreStats.set(key, stat);
    }

    const assignedAtBy = new Map(assignments.map((a) => [String(a.competition), a.assignedAt]));

    return res.json({
      competitions: competitions.map((c) => {
        const key = String(c._id);
        const total = entryCountBy.get(key) || 0;
        const stat = scoreStats.get(key) || { submitted: 0, draft: 0 };
        const rubric = rubricView(c);
        const write = judgingWriteState(c);
        return {
          _id: c._id,
          name: c.name,
          slug: c.slug,
          phase: getCompetitionPhase(c),
          assignedAt: assignedAtBy.get(key) || null,
          judgingOpen: write.open,
          judgingClosedReason: write.reason,
          criteriaCount: rubric.criteria.length,
          awardsCount: rubric.awards.length,
          progress: { total, submitted: stat.submitted, draft: stat.draft, remaining: Math.max(0, total - stat.submitted) },
        };
      }),
    });
  } catch (error) {
    console.error("[judge] listJudgeCompetitions failed:", error?.message || error);
    return res.status(500).json({ message: "Could not load your competitions." });
  }
};

/**
 * GET /api/judge/competitions/:competitionId
 * The rubric and this judge's progress. Loaded separately from the entry list so the score sheet can
 * render its criteria before a long entry list arrives.
 */
export const getJudgeCompetition = async (req, res) => {
  try {
    const competitionId = asObjectId(req.params.competitionId);
    const competition = await Competition.findById(competitionId)
      .select("name slug dates resultsDeclaredAt judging theme")
      .lean();
    if (!competition) return res.status(404).json({ message: "Competition not found." });

    const [total, myScores] = await Promise.all([
      CompetitionEntry.countDocuments(await judgeableFilter(competitionId, req.user._id)),
      JudgeScore.find({ competition: competitionId, judge: req.user._id }).select("status").lean(),
    ]);

    const submitted = myScores.filter((s) => s.status === "submitted").length;
    const write = judgingWriteState(competition);

    return res.json({
      competition: {
        _id: competition._id,
        name: competition.name,
        slug: competition.slug,
        phase: getCompetitionPhase(competition),
        theme: competition.theme || null,
      },
      rubric: rubricView(competition),
      judgingOpen: write.open,
      judgingClosedReason: write.reason,
      progress: { total, submitted, draft: myScores.length - submitted, remaining: Math.max(0, total - submitted) },
    });
  } catch (error) {
    console.error("[judge] getJudgeCompetition failed:", error?.message || error);
    return res.status(500).json({ message: "Could not load this competition." });
  }
};

/**
 * GET /api/judge/competitions/:competitionId/entries
 * The queue. Anonymised, and WITHOUT the script body — a list must not ship forty screenplays.
 */
export const listJudgeEntries = async (req, res) => {
  try {
    const competitionId = asObjectId(req.params.competitionId);
    const page = asInt(req.query.page, { min: 1, max: 10_000, fallback: 1 });
    const limit = asInt(req.query.limit, { min: 1, max: 100, fallback: 50 });

    const [entries, total, myScores, myNominations] = await Promise.all([
      CompetitionEntry.find(await judgeableFilter(competitionId, req.user._id))
        // Sorted by the entry code, NOT by submission time: submission order maps back to the
        // registration list, and reading in a stable arbitrary order is what a blind queue means.
        .sort({ eventId: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      CompetitionEntry.countDocuments(await judgeableFilter(competitionId, req.user._id)),
      JudgeScore.find({ competition: competitionId, judge: req.user._id }).lean(),
      JudgeNomination.find({ competition: competitionId, judge: req.user._id }).select("entry awardKey").lean(),
    ]);

    const scoreBy = new Map(myScores.map((s) => [String(s.entry), s]));
    const nomsBy = new Map();
    for (const n of myNominations) {
      const key = String(n.entry);
      nomsBy.set(key, [...(nomsBy.get(key) || []), n.awardKey]);
    }

    return res.json({
      entries: entries.map((entry) => {
        // The list view drops the body; everything else about the projection is identical, so there
        // is exactly one place that decides what a judge may see.
        const { body, ...summary } = toJudgeEntryView(entry);
        return {
          ...summary,
          myScore: ownScoreView(scoreBy.get(String(entry._id))),
          myNominations: nomsBy.get(String(entry._id)) || [],
        };
      }),
      pageInfo: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error("[judge] listJudgeEntries failed:", error?.message || error);
    return res.status(500).json({ message: "Could not load entries." });
  }
};

/**
 * GET /api/judge/competitions/:competitionId/entries/:entryId
 * The only route that ships a screenplay.
 */
export const getJudgeEntry = async (req, res) => {
  try {
    const competitionId = asObjectId(req.params.competitionId);
    const entryId = asObjectId(req.params.entryId);
    if (!entryId) return res.status(404).json({ message: "Entry not found." });

    // Always queried by BOTH ids. `findById(entryId)` would let a judge on competition A read an
    // entry from competition B by pasting its id — the assignment gate only checked competition A.
    const entry = await CompetitionEntry.findOne(await judgeableFilter(competitionId, req.user._id, entryId)).lean();
    if (!entry) return res.status(404).json({ message: "Entry not found." });

    const [score, nominations] = await Promise.all([
      JudgeScore.findOne({ entry: entryId, judge: req.user._id }).lean(),
      JudgeNomination.find({ entry: entryId, judge: req.user._id }).select("awardKey reason").lean(),
    ]);

    return res.json({
      entry: toJudgeEntryView(entry),
      myScore: ownScoreView(score),
      myNominations: nominations.map((n) => ({ awardKey: n.awardKey, reason: n.reason || "" })),
    });
  } catch (error) {
    console.error("[judge] getJudgeEntry failed:", error?.message || error);
    return res.status(500).json({ message: "Could not load this entry." });
  }
};

/**
 * PUT /api/judge/competitions/:competitionId/entries/:entryId/score
 * Save a draft, or submit. Upsert on (entry, judge) — the unique index makes a double-click safe.
 */
export const saveJudgeScore = async (req, res) => {
  try {
    const competitionId = asObjectId(req.params.competitionId);
    const entryId = asObjectId(req.params.entryId);
    if (!entryId) return res.status(404).json({ message: "Entry not found." });

    const competition = await Competition.findById(competitionId).select("dates resultsDeclaredAt judging").lean();
    if (!competition) return res.status(404).json({ message: "Competition not found." });

    const write = judgingWriteState(competition);
    if (!write.open) return res.status(409).json({ message: write.reason });

    const entryExists = await CompetitionEntry.exists(await judgeableFilter(competitionId, req.user._id, entryId));
    if (!entryExists) return res.status(404).json({ message: "Entry not found." });

    const rubric = rubricView(competition);
    if (!rubric.criteria.length) {
      return res.status(409).json({ message: "This competition has no scoring criteria yet. Ask the organiser to set them." });
    }

    const allowed = new Set(rubric.criteria.map((c) => c.key));
    const incoming = req.body?.marks && typeof req.body.marks === "object" ? req.body.marks : {};

    // Unknown criterion keys are DROPPED, not rejected. A judge with a tab open from before the
    // admin renamed a criterion should still be able to save their work; the score is simply marked
    // incomplete rather than lost to a 400 they cannot act on.
    const marks = {};
    for (const [key, value] of Object.entries(incoming)) {
      if (!allowed.has(key)) continue;
      const n = asInt(value, { min: 0, max: rubric.scale, fallback: -1 });
      if (n >= 0) marks[key] = n;
    }

    const submit = req.body?.submit === true;
    if (submit && Object.keys(marks).length !== rubric.criteria.length) {
      const missing = rubric.criteria.filter((c) => marks[c.key] === undefined).map((c) => c.label);
      return res.status(400).json({ message: `Score every criterion before submitting. Missing: ${missing.join(", ")}.` });
    }

    const update = {
      competition: competitionId,
      entry: entryId,
      judge: req.user._id,
      scores: marks,
      comment: asTrimmedString(req.body?.comment, 2000),
      status: submit ? "submitted" : "draft",
      ...(submit ? { submittedAt: new Date() } : {}),
    };

    const score = await JudgeScore.findOneAndUpdate(
      { entry: entryId, judge: req.user._id },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();

    // The first submitted score freezes the rubric. Conditional on lockedAt still being null so two
    // judges submitting at the same moment set it once, with the earlier timestamp winning.
    if (submit && !competition.judging?.lockedAt) {
      await Competition.updateOne(
        { _id: competitionId, "judging.lockedAt": null },
        { $set: { "judging.lockedAt": new Date() } }
      );
    }

    return res.json({ score: ownScoreView(score) });
  } catch (error) {
    // The unique index turning a double-submit into a duplicate-key error is not a failure — the
    // row it collided with is this judge's own, so read it back and answer with the truth.
    if (error?.code === 11000) {
      const existing = await JudgeScore.findOne({ entry: asObjectId(req.params.entryId), judge: req.user._id }).lean();
      return res.json({ score: ownScoreView(existing) });
    }
    console.error("[judge] saveJudgeScore failed:", error?.message || error);
    return res.status(500).json({ message: "Could not save your score." });
  }
};

/**
 * GET /api/judge/competitions/:competitionId/nominations
 * This judge's own nominations, one per award category at most.
 */
export const listJudgeNominations = async (req, res) => {
  try {
    const competitionId = asObjectId(req.params.competitionId);
    const competition = await Competition.findById(competitionId).select("judging").lean();
    if (!competition) return res.status(404).json({ message: "Competition not found." });

    const nominations = await JudgeNomination.find({ competition: competitionId, judge: req.user._id }).lean();
    if (!nominations.length) return res.json({ awards: rubricView(competition).awards, nominations: [] });

    // Resolve the entries so the judge sees which script they nominated — through the same
    // projection, so a nomination list cannot become the one place a name slips out.
    /*
     * Through the gate, like every other entry read — not straight to the nominated ids.
     *
     * The nominations are already scoped to this judge, so it looks safe: they can only have
     * nominated something they were given. But assignments can be REVOKED, and a nomination outlives
     * the assignment that made it possible. Resolving the ids directly would leave an old nomination
     * as a window onto an entry that is no longer theirs.
     *
     * The $in from the gate and the nominated ids intersect, so a withdrawn assignment drops the row
     * to its id alone and the title simply stops resolving.
     */
    const gate = await judgeableFilter(competitionId, req.user._id);
    const nominatedIds = nominations.map((n) => String(n.entry));
    const entries = await CompetitionEntry.find({
      ...gate,
      _id: { $in: gate._id.$in.filter((id) => nominatedIds.includes(String(id))) },
    }).lean();
    const entryBy = new Map(entries.map((e) => [String(e._id), toJudgeEntryView(e)]));

    return res.json({
      awards: rubricView(competition).awards,
      nominations: nominations.map((n) => {
        const view = entryBy.get(String(n.entry));
        return {
          awardKey: n.awardKey,
          reason: n.reason || "",
          entryId: String(n.entry),
          eventId: view?.eventId || "",
          title: view?.title || "",
        };
      }),
    });
  } catch (error) {
    console.error("[judge] listJudgeNominations failed:", error?.message || error);
    return res.status(500).json({ message: "Could not load your nominations." });
  }
};

/**
 * PUT /api/judge/competitions/:competitionId/nominations/:awardKey
 * Nominate an entry for one award. Replaces this judge's previous pick in that category.
 */
export const saveJudgeNomination = async (req, res) => {
  try {
    const competitionId = asObjectId(req.params.competitionId);
    const awardKey = asTrimmedString(req.params.awardKey, 60);
    const entryId = asObjectId(req.body?.entryId);
    if (!entryId) return res.status(400).json({ message: "Choose an entry to nominate." });

    const competition = await Competition.findById(competitionId).select("dates resultsDeclaredAt judging").lean();
    if (!competition) return res.status(404).json({ message: "Competition not found." });

    const write = judgingWriteState(competition);
    if (!write.open) return res.status(409).json({ message: write.reason });

    const award = rubricView(competition).awards.find((a) => a.key === awardKey);
    if (!award) return res.status(404).json({ message: "That award category does not exist." });

    // Re-checked against the competition, so an entry id from a different competition cannot be
    // nominated here even though the judge is legitimately on this panel.
    const entryExists = await CompetitionEntry.exists(await judgeableFilter(competitionId, req.user._id, entryId));
    if (!entryExists) return res.status(404).json({ message: "Entry not found." });

    const reason = asTrimmedString(req.body?.reason, 500);
    if (!reason) return res.status(400).json({ message: "Say why you are nominating this entry — the organiser reads it." });

    const nomination = await JudgeNomination.findOneAndUpdate(
      { competition: competitionId, judge: req.user._id, awardKey },
      { $set: { entry: entryId, reason } },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();

    return res.json({
      nomination: { awardKey, entryId: String(nomination.entry), reason: nomination.reason || "" },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "You have already nominated an entry for this award." });
    }
    console.error("[judge] saveJudgeNomination failed:", error?.message || error);
    return res.status(500).json({ message: "Could not save your nomination." });
  }
};

/** DELETE /api/judge/competitions/:competitionId/nominations/:awardKey */
export const deleteJudgeNomination = async (req, res) => {
  try {
    const competitionId = asObjectId(req.params.competitionId);
    const awardKey = asTrimmedString(req.params.awardKey, 60);

    const competition = await Competition.findById(competitionId).select("dates resultsDeclaredAt judging").lean();
    if (!competition) return res.status(404).json({ message: "Competition not found." });

    const write = judgingWriteState(competition);
    if (!write.open) return res.status(409).json({ message: write.reason });

    await JudgeNomination.deleteOne({ competition: competitionId, judge: req.user._id, awardKey });
    return res.json({ withdrawn: true, awardKey });
  } catch (error) {
    console.error("[judge] deleteJudgeNomination failed:", error?.message || error);
    return res.status(500).json({ message: "Could not withdraw your nomination." });
  }
};
