/**
 * Add a late, admin-accepted submission to a competition that has already closed.
 *
 * Built for one case and written to be reusable: a writer the organiser wants in, after the window
 * shut, whose script arrived as a PDF outside the app. Every gate in the product keys off
 * `dates.endsAt`, and the only lever that reopens them reopens them for EVERY entrant — so the
 * honest way to admit one person is to write exactly what the app would have written had they
 * submitted in time, and to record plainly that it was a late entry accepted by an admin.
 *
 * DRY RUN BY DEFAULT. It connects, resolves the user / competition / admin, builds both documents,
 * validates them against the real schemas, prints the whole plan, and writes NOTHING. Only --commit
 * writes, and it does so inside one transaction so a failure part-way leaves no half-entry behind.
 *
 *   node scripts/addLateEntry.js --user <id> --competition <id> --pdf-text <file> \
 *        --title "The Lullaby" --level professional --country India --language English \
 *        --genres "Thriller,Horror" --body-from 21 --body-to 570 --logline-from 6 --logline-to 8 \
 *        --synopsis-from 10 --synopsis-to 16 [--commit] [--no-ai]
 *
 * Line numbers are 0-based indexes into the extracted text, chosen by a human who has looked at it.
 * They are not guessed here, because what counts as "the screenplay" versus front matter, a
 * writer's note, or a bio is a judgement — and the wrong cut puts the author's name in front of a
 * blind judge.
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
import { recordGrant } from "../utils/ledger.js";
import { competitionRegistrationCharge } from "../utils/competitionRegistration.js";
import { toJudgeEntryView } from "../utils/judgeEntryView.js";

const arg = (name, fallback = "") => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);
const COMMIT = flag("commit");
const RUN_AI = !flag("no-ai");

// Same two helpers submitCompetitionEntry uses. They are module-private there, so they are
// duplicated here VERBATIM rather than imported — the point is that the counts match what the app
// would have computed, and a "close enough" reimplementation would not.
const countWords = (text = "") => String(text).trim().split(/\s+/).filter(Boolean).length;
const countScenes = (text = "") => {
  if (!String(text || "").trim()) return 0;
  return classifyText(text).filter((type) => type === "scene").length;
};

const slice = (lines, from, to) => lines.slice(Number(from), Number(to) + 1);
const joinProse = (lines) => lines.map((l) => l.trim()).filter(Boolean).join(" ");

const fail = (msg) => { throw new Error(msg); };

const run = async () => {
  const userId = arg("user") || fail("--user <id> is required");
  const competitionId = arg("competition") || fail("--competition <id> is required");
  const pdfTextPath = arg("pdf-text") || fail("--pdf-text <file> is required");
  const title = arg("title") || fail("--title is required");
  const experienceLevel = arg("level") || fail("--level beginner|intermediate|professional is required");
  const country = arg("country", "India");
  const language = arg("language", "English");
  const genres = arg("genres", "").split(",").map((g) => g.trim()).filter(Boolean);

  for (const k of ["body-from", "body-to", "logline-from", "logline-to", "synopsis-from", "synopsis-to"]) {
    if (arg(k) === "") fail(`--${k} is required`);
  }

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || fail("MONGO_URI is not set");
  await mongoose.connect(uri);
  console.log(`Connected to ${mongoose.connection.name}${COMMIT ? "  *** COMMIT MODE ***" : "  (dry run — nothing will be written)"}\n`);

  // ── Resolve everything, read-only ──────────────────────────────────────
  const [user, competition, admin, existing] = await Promise.all([
    User.findById(userId).select("name email role isFrozen isDeactivated").lean(),
    Competition.findById(competitionId).select("name slug dates resultsDeclaredAt entryFee lifecycle").lean(),
    // The admin is recorded as verifiedBy / grantedBy. Any admin account will do for attribution;
    // it is printed so the operator can see who the record will name.
    User.findOne({ role: "admin" }).sort({ createdAt: 1 }).select("name email").lean(),
    CompetitionEntry.findOne({ competitionId, userId }).select("eventId status").lean(),
  ]);

  if (!user) fail("user not found");
  if (user.role !== "creator" && user.role !== "writer") fail(`user role is "${user.role}" — only writers can hold an entry`);
  if (user.isFrozen || user.isDeactivated) fail("user account is frozen or deactivated");
  if (!competition) fail("competition not found");
  if (competition.resultsDeclaredAt) fail("results are already declared — a late entry now would be unjudged");
  if (!admin) fail("no admin account found to attribute this to");
  if (existing) fail(`user already has entry ${existing.eventId} (${existing.status}) in this competition`);

  // ── Build the content exactly as submit would freeze it ─────────────────
  const fullText = await fs.readFile(pdfTextPath, "utf8");
  const lines = fullText.split("\n");
  const body = slice(lines, arg("body-from"), arg("body-to")).join("\n").trim();
  const logline = joinProse(slice(lines, arg("logline-from"), arg("logline-to")));
  const synopsis = joinProse(slice(lines, arg("synopsis-from"), arg("synopsis-to")));

  if (body.length < 100) fail("body is under 100 characters — check the --body-from/--body-to lines");

  const now = new Date();
  const scriptId = new mongoose.Types.ObjectId();
  const entryId = new mongoose.Types.ObjectId();

  // Mirrors the claim path's Script.create, plus the fields submit sets afterwards. fountainContent
  // is the screenplay proper — it is what the snapshot freezes and what a judge is shown.
  // textContent keeps the FULL extraction as the writer's own record; the judge projection prefers
  // fountainContent and never falls through to textContent while it is non-empty.
  const scriptDoc = {
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
  };

  const source = body;
  const entryDoc = {
    _id: entryId,
    competitionId: competition._id,
    userId: user._id,
    registration: { country, language, experienceLevel, genres, portfolioUrl: "" },
    // The writer's declaration in the PDF is the nearest thing to these; the operator supplies the
    // date it carries. It is deliberately not the competition's deadline — that would fabricate a
    // timely submission the record then contradicts.
    acceptedRulesAt: new Date(arg("accepted-at") || now),
    acceptedCopyrightAt: new Date(arg("accepted-at") || now),
    scriptId,
    status: "submitted",
    // The real time. The externalRegistration reference below says why it is late.
    submittedAt: now,
    payment: { amount: 0, currency: "", paidAt: null },
    externalRegistration: {
      provider: "admin-manual",
      reference: "late entry accepted by admin after the window closed; script supplied as PDF",
      verifiedBy: admin._id,
      verifiedAt: now,
    },
    snapshot: {
      fountainContent: body,
      textContent: fullText,
      title,
      logline,
      synopsis,
      wordCount: countWords(source),
      charCount: source.length,
      pageCount: countPages(source),
      sceneCount: countScenes(source),
    },
  };

  // ── Validate against the real schemas before saying anything ────────────
  for (const [label, Model, doc] of [["Script", Script, scriptDoc], ["CompetitionEntry", CompetitionEntry, entryDoc]]) {
    const err = new Model(doc).validateSync();
    if (err) fail(`${label} fails validation: ${Object.entries(err.errors).map(([p, e]) => `${p}: ${e.message}`).join("; ")}`);
  }

  // ── Show the plan ───────────────────────────────────────────────────────
  const judgeSees = toJudgeEntryView(entryDoc);
  const identityLeaks = [user.name, user.email, "+91"].filter((s) => judgeSees.body.includes(s));

  console.log("WRITER      :", user.name, `<${user.email}>`);
  console.log("COMPETITION :", competition.name, `(${competition.lifecycle}) — ended ${competition.dates?.endsAt}`);
  console.log("ATTRIBUTED  :", admin.name, `<${admin.email}>`, "as verifiedBy / grantedBy");
  console.log("\nSCRIPT");
  console.log("  title        :", title);
  console.log("  body         : lines", arg("body-from"), "→", arg("body-to"), `(${body.length} chars)`);
  console.log("  first line   :", JSON.stringify(lines[Number(arg("body-from"))]));
  console.log("  last line    :", JSON.stringify(lines[Number(arg("body-to"))]));
  console.log("  logline      :", logline.slice(0, 110) + (logline.length > 110 ? "…" : ""));
  console.log("  synopsis     :", synopsis.slice(0, 110) + "…");
  console.log("  locked       : true");
  console.log("\nENTRY");
  console.log("  registration :", JSON.stringify(entryDoc.registration));
  console.log("  status       : submitted   submittedAt:", now.toISOString());
  console.log("  acceptedAt   :", entryDoc.acceptedRulesAt.toISOString());
  console.log("  payment      : none (admin grant, ₹" + competitionRegistrationCharge(competition, "INR").amountMajor + " recorded on the ledger)");
  console.log("  externalReg  :", JSON.stringify({ ...entryDoc.externalRegistration, verifiedBy: String(admin._id) }));
  console.log("  snapshot     :", JSON.stringify({ wordCount: entryDoc.snapshot.wordCount, charCount: entryDoc.snapshot.charCount, pageCount: entryDoc.snapshot.pageCount, sceneCount: entryDoc.snapshot.sceneCount }));
  console.log("\nBLIND-JUDGE CHECK (what a judge would see)");
  console.log("  keys         :", Object.keys(judgeSees).join(", "));
  console.log("  body starts  :", JSON.stringify(judgeSees.body.slice(0, 60)));
  console.log("  body ends    :", JSON.stringify(judgeSees.body.slice(-40)));
  console.log("  identity leak:", identityLeaks.length ? `YES — ${identityLeaks.join(", ")}  <<< STOP` : "none of name / email / phone present");
  if (identityLeaks.length && COMMIT) fail("refusing to commit: the blind-judge body contains the writer's identity");

  console.log("\nAFTER WRITE  :", RUN_AI ? "run the same AI evaluation the other submitted entries received" : "skip AI (--no-ai)");

  if (!COMMIT) {
    console.log("\n─────────────────────────────────────────────────────────────");
    console.log("Dry run. Nothing was written. Re-run with --commit to write exactly the above.");
    return;
  }

  // ── Write, atomically ───────────────────────────────────────────────────
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Script.create([scriptDoc], { session });
      await CompetitionEntry.create([entryDoc], { session });
    });
  } finally {
    await session.endSession();
  }
  const written = await CompetitionEntry.findById(entryId).select("eventId status").lean();
  console.log(`\n✓ written — entry ${written.eventId} (${written.status}), script ${scriptId}`);

  // Outside the transaction on purpose: a missing ledger row is a reporting gap that can be added
  // later; a half-created entry is not.
  await recordGrant({
    kind: "competition_registration",
    user: user._id,
    listPriceMinor: competitionRegistrationCharge(competition, "INR").amountMinor,
    currency: "INR",
    grantedBy: admin._id,
    reason: "late entry accepted by admin after the window closed",
    subjectType: "Competition",
    subjectId: competition._id,
    label: competition.name,
    source: "scripts/addLateEntry.js",
    metadata: { eventId: written.eventId, scriptId: String(scriptId), manual: true },
  });
  console.log("✓ ledger grant recorded");

  console.info("[AUDIT] Late competition entry added manually", {
    entryId: String(entryId), eventId: written.eventId, scriptId: String(scriptId),
    userId: String(user._id), competitionId: String(competition._id), by: String(admin._id), at: now.toISOString(),
  });

  if (RUN_AI) {
    console.log("\nRunning AI evaluation (same as every other submitted entry)…");
    const { processEntryAI } = await import("../controllers/competitionController.js");
    try {
      await processEntryAI(entryId);
      const after = await CompetitionEntry.findById(entryId).select("status ai.processedAt ai.error").lean();
      console.log(after.ai?.processedAt ? `✓ AI done — status ${after.status}` : `AI did not complete: ${after.ai?.error || "unknown"} (retry from admin → Entries → Retry AI)`);
    } catch (e) {
      console.log("AI run threw:", e.message, "— the entry is intact; retry from admin → Entries → Retry AI");
    }
  }
};

run()
  .catch((error) => { console.error(`\n✗ ${error.message}`); process.exitCode = 1; })
  .finally(async () => { if (mongoose.connection.readyState === 1) await mongoose.disconnect(); });
