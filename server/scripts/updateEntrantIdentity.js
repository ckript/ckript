/**
 * Correct — or hand over — the identity behind a competition entry.
 *
 * The situation this exists for: someone registered for a challenge under their own account and
 * address on another writer's behalf, and the admin has decided the entry belongs to the named
 * writer. The entry, its payment and its acceptance timestamps stay exactly where they are; what
 * changes is WHO the account says it is (name, email) and, optionally, the entry's declared
 * experience level. Nothing is created and nothing is deleted.
 *
 * What it deliberately does NOT do:
 *   - touch the password, role, bio, or any flag on the account — an email change here is an
 *     admin-vouched handover, not a self-service change, so no verification state is reset
 *   - touch the entry's payment, registration answers other than experience, or its script — the
 *     script is attached by attachLateSubmission.js, whose new title replaces any old one that
 *     carried the previous name
 *
 * DRY RUN BY DEFAULT. --commit writes both documents in one transaction, each guarded on the value
 * it was read with, so a concurrent change aborts the whole thing rather than half-applying.
 *
 *   node scripts/updateEntrantIdentity.js --email <current> [--new-email <address>] [--new-name "…"]
 *        [--competition <id> --experience <level>] [--unlink-google] [--commit]
 *
 * --unlink-google drops the OLD holder's Google sign-in. Without it, a Google-linked account still
 * opens for the old holder after the handover, whatever the email now says.
 */

import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";
import Competition from "../models/Competition.js";
import CompetitionEntry from "../models/CompetitionEntry.js";
import Script from "../models/Script.js";

const arg = (name, fallback = "") => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);
const COMMIT = flag("commit");
const UNLINK_GOOGLE = flag("unlink-google");
const fail = (msg) => { throw new Error(msg); };
const normaliseEmail = (value) => String(value || "").trim().toLowerCase();

const run = async () => {
  const currentEmail = normaliseEmail(arg("email")) || fail("--email <current address> is required");
  const newEmail = normaliseEmail(arg("new-email"));
  const newName = String(arg("new-name") || "").trim();
  const competitionId = arg("competition");
  const experience = String(arg("experience") || "").trim().toLowerCase();
  if (!newEmail && !newName && !experience) fail("nothing to change — pass --new-email, --new-name and/or --experience");
  if (experience && !competitionId) fail("--experience needs --competition <id>");

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || fail("MONGO_URI is not set");
  await mongoose.connect(uri);
  console.log(`Connected to ${mongoose.connection.name}${COMMIT ? "  *** COMMIT MODE ***" : "  (dry run — nothing will be written)"}\n`);

  // ── Resolve, read-only ──────────────────────────────────────────────────
  const user = await User.findOne({ email: currentEmail }).lean();
  if (!user) fail(`no account for ${currentEmail}`);

  if (newEmail && newEmail !== user.email) {
    const taken = await User.findOne({ email: newEmail }).select("_id name role createdAt").lean();
    if (taken) fail(`${newEmail} already belongs to another account (${taken.name}, ${taken.role}, since ${taken.createdAt?.toISOString?.()}) — the email index is unique; merging accounts is a different job`);
  }

  let entry = null;
  let competition = null;
  if (competitionId) {
    competition = await Competition.findById(competitionId).select("name lifecycle").lean();
    if (!competition) fail("competition not found");
    entry = await CompetitionEntry.findOne({ competitionId, userId: user._id }).lean();
    if (!entry) fail(`${user.email} has no entry in ${competition.name}`);
  }

  // ── Build the after-state and validate it against the real schemas ──────
  const userAfter = { ...user, name: newName || user.name, email: newEmail || user.email };
  if (UNLINK_GOOGLE && user.googleId) {
    if (!user.password) fail("cannot unlink Google: the account has no password, so the new holder would be locked out");
    delete userAfter.googleId;
    userAfter.authProvider = "password";
  }
  const entryAfter = entry && experience
    ? { ...entry, registration: { ...entry.registration, experienceLevel: experience } }
    : entry;

  const userErr = new User(userAfter).validateSync();
  if (userErr) fail(`User fails validation: ${Object.entries(userErr.errors).map(([p, e]) => `${p}: ${e.message}`).join("; ")}`);
  if (entryAfter) {
    const entryErr = new CompetitionEntry(entryAfter).validateSync();
    if (entryErr) fail(`CompetitionEntry fails validation: ${Object.entries(entryErr.errors).map(([p, e]) => `${p}: ${e.message}`).join("; ")}`);
  }

  const userChanges = ["name", "email", "googleId", "authProvider"].filter((k) => userAfter[k] !== user[k]);
  const entryChanges = entryAfter && entryAfter.registration.experienceLevel !== entry.registration?.experienceLevel ? ["registration.experienceLevel"] : [];
  if (userChanges.length === 0 && entryChanges.length === 0) fail("every requested value already matches — nothing to do");

  // Where else the old identity is written down, so the admin knows what still says the old name.
  const scriptsWithOldName = await Script.find({ creator: user._id, title: new RegExp(user.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") })
    .select("_id title competitionId isDeleted").lean();

  // ── Show the plan ───────────────────────────────────────────────────────
  console.log("ACCOUNT     :", String(user._id), `| role ${user.role} | created ${user.createdAt?.toISOString?.()}`);
  for (const k of ["name", "email"]) {
    console.log(`  ${k.padEnd(10)}:`, userChanges.includes(k) ? `${JSON.stringify(user[k])}  →  ${JSON.stringify(userAfter[k])}` : `${JSON.stringify(user[k])}  (unchanged)`);
  }
  console.log("  untouched : password, role, bio, verification state, notification preferences");
  // How the NEW person will get in. A password account keeps the OLD holder's password, so the new
  // holder must use "forgot password" at the new address; a Google account is bound to the old
  // holder's Google identity and the new holder cannot use Google sign-in at all.
  console.log(`  login     : authProvider=${user.authProvider || "password"}, googleId=${user.googleId ? "set" : "none"}, password=${user.password ? "set" : "none"}, emailVerified=${user.emailVerified === true}`);
  if (userChanges.includes("googleId")) console.log("  google    : UNLINKED — the old holder's Google sign-in no longer opens this account (--unlink-google)");
  if (userChanges.includes("email")) {
    console.log(userAfter.googleId
      ? "  NOTE      : Google-linked account — the new holder cannot sign in with Google; they need a password reset at the new address"
      : "  NOTE      : the new holder signs in by resetting the password at the new address (OTP mail must be working)");
  }
  if (entry) {
    console.log("\nENTRY       :", entry.eventId, `in ${competition.name} (${competition.lifecycle}) | status ${entry.status} | paid ₹${entry.payment?.amount ?? 0}`);
    console.log("  experience:", entryChanges.length
      ? `${JSON.stringify(entry.registration?.experienceLevel)}  →  ${JSON.stringify(experience)}`
      : `${JSON.stringify(entry.registration?.experienceLevel)}  (unchanged)`);
    console.log("  untouched : payment, acceptedRulesAt, acceptedCopyrightAt, genres, country, language, script link");
  }
  if (scriptsWithOldName.length) {
    console.log("\nSTILL CARRY THE OLD NAME (not changed here):");
    for (const s of scriptsWithOldName) console.log(`  script ${s._id} "${s.title}"${s.isDeleted ? " (deleted)" : ""}${s.competitionId ? " [competition script — attachLateSubmission retitles it]" : ""}`);
  }

  if (!COMMIT) {
    console.log("\n─────────────────────────────────────────────────────────────");
    console.log("Dry run. Nothing was written. Re-run with --commit to apply exactly the above.");
    return;
  }

  // ── Write, atomically, guarded on what was read ────────────────────────
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (userChanges.length) {
        const update = { $set: { name: userAfter.name, email: userAfter.email, ...(userChanges.includes("googleId") ? { authProvider: "password" } : {}) } };
        if (userChanges.includes("googleId")) update.$unset = { googleId: "" };
        const res = await User.updateOne({ _id: user._id, email: user.email }, update, { session });
        if (res.matchedCount !== 1) throw new Error("account changed underneath us — nothing written");
      }
      if (entryChanges.length) {
        const res = await CompetitionEntry.updateOne(
          { _id: entry._id, "registration.experienceLevel": entry.registration?.experienceLevel },
          { $set: { "registration.experienceLevel": experience } },
          { session }
        );
        if (res.matchedCount !== 1) throw new Error("entry changed underneath us — nothing written");
      }
    });
  } finally {
    await session.endSession();
  }

  const written = await User.findById(user._id).select("name email").lean();
  console.log(`\n✓ written — account ${user._id} is now ${JSON.stringify(written.name)} <${written.email}>`);
  console.info("[AUDIT] Entrant identity updated manually", {
    userId: String(user._id), from: { name: user.name, email: user.email }, to: { name: written.name, email: written.email },
    unlinkedGoogle: userChanges.includes("googleId"),
    entryId: entry ? String(entry._id) : null, eventId: entry?.eventId || null,
    experience: entryChanges.length ? { from: entry.registration?.experienceLevel, to: experience } : null,
    at: new Date().toISOString(),
  });
};

run()
  .catch((error) => { console.error(`\n✗ ${error.message}`); process.exitCode = 1; })
  .finally(async () => { if (mongoose.connection.readyState === 1) await mongoose.disconnect(); });
