/**
 * Attach a script to an EXISTING competition entry and submit it, after the window has closed.
 *
 * The sibling of addLateEntry.js, for the other real situation: the writer registered in time (and
 * paid), but the upload failed and the deadline passed with their entry still "writing". There is an
 * entry already — the unique (competitionId, userId) index means a second one is impossible — so the
 * job is to put the script INTO it, exactly as submitCompetitionEntry would have, and freeze the
 * snapshot.
 *
 * What it deliberately does NOT do, and why:
 *   - no new entry, no ledger grant: they registered and paid like everyone else, nothing was granted
 *   - no change to registration, payment, acceptedRulesAt/acceptedCopyrightAt or externalRegistration:
 *     those are the writer's own records from the day they registered, and they are correct
 *   - never overwrites a script that has real content: if the linked script already holds work, this
 *     refuses. It fills a script only when that script is empty or soft-deleted — which is the exact
 *     state a failed upload leaves behind (a claimed shell holding one marker character)
 *
 * DRY RUN BY DEFAULT. Connects, resolves, builds, validates against the real schemas, prints the plan,
 * writes NOTHING. --commit writes, in one transaction.
 *
 *   node scripts/attachLateSubmission.js --email who@example.com --competition <id> \
 *        --pdf-text <file> --title "…" --body-from N --body-to N \
 *        [--logline-from N --logline-to N] [--synopsis-from N --synopsis-to N] [--commit] [--no-ai]
 */

import "dotenv/config";
import fs from "node:fs/promises";
import mongoose from "mongoose";
import User from "../models/User.js";
import Competition from "../models/Competition.js";
import CompetitionEntry from "../models/CompetitionEntry.js";
import Script from "../models/Script.js";
import { classifyText } from "../utils/classify.js";
import { countPages } from "../utils/paginate.js";
import { toJudgeEntryView } from "../utils/judgeEntryView.js";

const arg = (name, fallback = "") => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);
const COMMIT = flag("commit");
const RUN_AI = !flag("no-ai");

// Verbatim from submitCompetitionEntry (module-private there), so the counts match what the app
// would have produced rather than a near-enough reimplementation.
const countWords = (text = "") => String(text).trim().split(/\s+/).filter(Boolean).length;
const countScenes = (text = "") => {
  if (!String(text || "").trim()) return 0;
  return classifyText(text).filter((type) => type === "scene").length;
};

const slice = (lines, from, to) => lines.slice(Number(from), Number(to) + 1);
const joinProse = (lines) => lines.map((l) => l.trim()).filter(Boolean).join(" ");
const optionalRange = (lines, fromKey, toKey) =>
  arg(fromKey) !== "" && arg(toKey) !== "" ? joinProse(slice(lines, arg(fromKey), arg(toKey))) : "";

const fail = (msg) => { throw new Error(msg); };

/** "Real content" means more than the forced-element markers an empty editor leaves behind. */
const hasRealContent = (script) =>
  String(script?.fountainContent || script?.textContent || "").replace(/[@\s]/g, "").length > 0;

const run = async () => {
  const email = arg("email").trim().toLowerCase() || fail("--email is required");
  const competitionId = arg("competition") || fail("--competition <id> is required");
  const pdfTextPath = arg("pdf-text") || fail("--pdf-text <file> is required");
  const title = arg("title") || fail("--title is required");
  if (arg("body-from") === "" || arg("body-to") === "") fail("--body-from and --body-to are required");

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || fail("MONGO_URI is not set");
  await mongoose.connect(uri);
  console.log(`Connected to ${mongoose.connection.name}${COMMIT ? "  *** COMMIT MODE ***" : "  (dry run — nothing will be written)"}\n`);

  // ── Resolve, read-only ──────────────────────────────────────────────────
  const user = await User.findOne({ email }).select("name email role isFrozen isDeactivated").lean();
  if (!user) fail(`no account for ${email}`);
  if (user.isFrozen || user.isDeactivated) fail("account is frozen or deactivated");

  const competition = await Competition.findById(competitionId).select("name dates resultsDeclaredAt lifecycle").lean();
  if (!competition) fail("competition not found");
  if (competition.resultsDeclaredAt) fail("results are already declared — a submission now would be unjudged");

  const entry = await CompetitionEntry.findOne({ competitionId, userId: user._id }).lean();
  if (!entry) fail(`${email} has NO entry in this competition — use addLateEntry.js, which creates one`);
  if (!["registered", "writing"].includes(entry.status)) {
    fail(`entry ${entry.eventId} is already "${entry.status}" — nothing to attach`);
  }

  const linked = entry.scriptId ? await Script.findById(entry.scriptId).lean() : null;
  const REPLACE = flag("replace-content");
  const existingText = linked ? String(linked.fountainContent || linked.textContent || "").trim() : "";
  if (linked && hasRealContent(linked) && !REPLACE) {
    fail(`entry ${entry.eventId} already links a script with content ("${linked.title}", ${existingText.length} chars) — refusing to overwrite the writer's work. `
      + `If the admin has decided the uploaded file supersedes it, re-run with --replace-content; the dry run then shows what is replaced.`);
  }

  // ── Build exactly what submit would freeze ──────────────────────────────
  const fullText = await fs.readFile(pdfTextPath, "utf8");
  const lines = fullText.split("\n");
  const body = slice(lines, arg("body-from"), arg("body-to")).join("\n").trim();
  if (body.length < 100) fail("body is under 100 characters — check --body-from/--body-to");
  const logline = optionalRange(lines, "logline-from", "logline-to");
  const synopsis = optionalRange(lines, "synopsis-from", "synopsis-to");

  const now = new Date();
  const reuse = Boolean(linked);
  const scriptId = reuse ? linked._id : new mongoose.Types.ObjectId();

  // The script as it will exist afterwards. When reusing, this is the shell restored and filled in
  // place — same _id, so the entry's existing scriptId keeps pointing at something real.
  const scriptAfter = {
    _id: scriptId,
    creator: user._id,
    title,
    status: "draft",
    projectSource: "editor",
    competitionId: competition._id,
    format: "feature_film",
    fountainContent: body,
    textContent: fullText,
    logline,
    synopsis,
    competitionLocked: true,
    isDeleted: false,
    deletedAt: null,
  };

  const snapshot = {
    fountainContent: body,
    textContent: fullText,
    title,
    logline,
    synopsis,
    wordCount: countWords(body),
    charCount: body.length,
    pageCount: countPages(body),
    sceneCount: countScenes(body),
  };

  // What the entry becomes — everything the writer set at registration is left exactly as it is.
  // The AI step only fills EMPTY fields (runEntryAIProcessing skips a stored evaluation, logline or
  // synopsis), so anything left from an earlier submission of placeholder text would be kept and
  // passed off as the evaluation of this script. Reset it: new content, fresh evaluation.
  const aiReset = { logline: "", synopsis: "", evaluation: null, startedAt: null, processedAt: null, error: "" };
  const entryAfter = { ...entry, scriptId, status: "submitted", submittedAt: now, snapshot, ai: aiReset };

  for (const [label, Model, doc] of [["Script", Script, scriptAfter], ["CompetitionEntry", CompetitionEntry, entryAfter]]) {
    const err = new Model(doc).validateSync();
    if (err) fail(`${label} fails validation: ${Object.entries(err.errors).map(([p, e]) => `${p}: ${e.message}`).join("; ")}`);
  }

  // ── Show the plan ───────────────────────────────────────────────────────
  const judgeSees = toJudgeEntryView(entryAfter);
  const leaks = [user.name, user.email].filter((s) => s && judgeSees.body.includes(s));

  console.log("WRITER      :", user.name, `<${user.email}>`);
  console.log("COMPETITION :", competition.name, `(${competition.lifecycle}) — ended ${competition.dates?.endsAt}`);
  console.log("ENTRY       :", entry.eventId, `| currently "${entry.status}" | registered ${entry.createdAt?.toISOString?.() || entry.createdAt}`);
  console.log("  kept as-is : registration, payment (₹" + (entry.payment?.amount ?? 0) + "), acceptedRulesAt, acceptedCopyrightAt");
  console.log("\nSCRIPT      :", reuse
    ? `REUSE ${scriptId} — currently ${linked.isDeleted ? "soft-deleted, " : ""}${hasRealContent(linked) ? "with content" : "empty"}; restored and filled in place`
    : `CREATE ${scriptId} (entry had no scriptId)`);
  if (linked && hasRealContent(linked)) {
    console.log(`  REPLACES   : "${linked.title}" — ${existingText.length} chars of existing text (--replace-content):`);
    console.log("               ", JSON.stringify(existingText.slice(0, 240)) + (existingText.length > 240 ? " …" : ""));
  }
  console.log("  title      :", title);
  console.log("  body       : lines", arg("body-from"), "→", arg("body-to"), `(${body.length} chars)`);
  console.log("  first line :", JSON.stringify(lines[Number(arg("body-from"))]));
  console.log("  last line  :", JSON.stringify(lines[Number(arg("body-to"))]));
  console.log("  logline    :", logline ? logline.slice(0, 100) : "(none in the PDF — left empty; the AI step generates one)");
  console.log("  synopsis   :", synopsis ? synopsis.slice(0, 100) + "…" : "(none in the PDF — left empty)");
  console.log("  locked     : true");
  console.log("\nENTRY AFTER : status submitted | submittedAt", now.toISOString());
  console.log("  snapshot   :", JSON.stringify({ wordCount: snapshot.wordCount, charCount: snapshot.charCount, pageCount: snapshot.pageCount, sceneCount: snapshot.sceneCount }));
  console.log("  ledger     : none — the writer registered and paid; nothing is being granted");
  console.log("  ai         :", entry.ai?.evaluation || entry.ai?.logline
    ? `RESET — a previous run left ${entry.ai?.evaluation ? `an evaluation (${entry.ai.evaluation.source}, ${entry.ai.evaluation.overall})` : "a logline"}; the AI step would otherwise keep it`
    : "clean — nothing from a previous run");
  console.log("\nBLIND-JUDGE CHECK");
  console.log("  keys       :", Object.keys(judgeSees).join(", "));
  console.log("  body starts:", JSON.stringify(judgeSees.body.slice(0, 60)));
  console.log("  body ends  :", JSON.stringify(judgeSees.body.slice(-30)));
  console.log("  identity   :", leaks.length ? `LEAK — ${leaks.join(", ")}  <<< STOP` : "name and email absent");
  if (leaks.length && COMMIT) fail("refusing to commit: the blind-judge body contains the writer's identity");
  console.log("\nAFTER WRITE :", RUN_AI ? "run the same AI evaluation the other submitted entries received" : "skip AI (--no-ai)");

  if (!COMMIT) {
    console.log("\n─────────────────────────────────────────────────────────────");
    console.log("Dry run. Nothing was written. Re-run with --commit to apply exactly the above.");
    return;
  }

  // ── Write, atomically ───────────────────────────────────────────────────
  const { _id: _scriptOmit, ...scriptSet } = scriptAfter;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (reuse) {
        await Script.updateOne({ _id: scriptId }, { $set: scriptSet }, { session });
      } else {
        await Script.create([scriptAfter], { session });
      }
      // Guarded on the status it had when we looked, the way submit's own claim is — if anything
      // else moved this entry meanwhile, the update matches nothing and the transaction is abandoned.
      const res = await CompetitionEntry.updateOne(
        { _id: entry._id, status: { $in: ["registered", "writing"] } },
        { $set: { scriptId, status: "submitted", submittedAt: now, snapshot, ai: aiReset } },
        { session }
      );
      if (res.matchedCount !== 1) throw new Error("entry changed underneath us — nothing written");
    });
  } finally {
    await session.endSession();
  }

  const written = await CompetitionEntry.findById(entry._id).select("eventId status scriptId").lean();
  console.log(`\n✓ written — entry ${written.eventId} is now ${written.status}, script ${written.scriptId}`);
  console.info("[AUDIT] Late submission attached manually", {
    entryId: String(entry._id), eventId: written.eventId, scriptId: String(scriptId), reusedScript: reuse,
    userId: String(user._id), competitionId: String(competition._id), at: now.toISOString(),
  });

  if (RUN_AI) {
    console.log("\nRunning AI evaluation…");
    const { processEntryAI } = await import("../controllers/competitionController.js");
    try {
      await processEntryAI(entry._id);
      const after = await CompetitionEntry.findById(entry._id).select("status ai.processedAt ai.error").lean();
      console.log(after.ai?.processedAt ? `✓ AI done — status ${after.status}` : `AI did not complete: ${after.ai?.error || "unknown"} (retry from admin → Entries → Retry AI)`);
    } catch (e) {
      console.log("AI run threw:", e.message, "— the entry is intact; retry from admin → Entries → Retry AI");
    }
  }
};

run()
  .catch((error) => { console.error(`\n✗ ${error.message}`); process.exitCode = 1; })
  .finally(async () => { if (mongoose.connection.readyState === 1) await mongoose.disconnect(); });
