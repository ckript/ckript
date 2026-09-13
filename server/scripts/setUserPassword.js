/**
 * Set a user's password from a masked terminal prompt.
 *
 * The password never appears in a command line, a shell history, a process list, a chat transcript
 * or a log: it is typed at a prompt that echoes nothing, hashed by the User model's own pre-save hook
 * (bcrypt, the same path sign-up uses), and verified with matchPassword before this reports success.
 *
 * Why this exists: the platform has no admin "set password" surface, and the self-service reset
 * needs outgoing mail. When an account is handed to a new person (updateEntrantIdentity.js) they
 * need a first password, and the admin is the one who has to set it.
 *
 * Rules:
 *   - the password is NEVER accepted as an argument — --password is refused on purpose
 *   - it is read twice from a hidden prompt and must match
 *   - it must pass the rules a user faces at sign-up (authController.js): 8+ characters, an
 *     uppercase letter, a lowercase letter, a number, a special character
 *   - any pending password-reset token on the account is voided
 *
 *   node scripts/setUserPassword.js --email who@example.com
 *
 * Non-interactive use (a harness, CI): put the password in NEW_PASSWORD and pass --yes. Set the
 * variable with `read -s NEW_PASSWORD` (bash) so it stays out of history.
 */

import "dotenv/config";
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import User from "../models/User.js";

const arg = (name, fallback = "") => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);
const fail = (msg) => { throw new Error(msg); };

// The sign-up rules, verbatim from authController.js so an admin-set password is never weaker than
// one a user could choose for themselves.
const RULES = [
  [(p) => p.length >= 8, "at least 8 characters"],
  [(p) => /[A-Z]/.test(p), "an uppercase letter"],
  [(p) => /[a-z]/.test(p), "a lowercase letter"],
  [(p) => /[0-9]/.test(p), "a number"],
  [(p) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p), "a special character"],
];
const failingRules = (p) => RULES.filter(([ok]) => !ok(p)).map(([, label]) => label);

/**
 * Reads one line with nothing echoed — not even asterisks, which give away the length.
 *
 * Raw mode rather than readline's terminal mode: readline redraws the whole line on every keystroke,
 * and on Windows that redraw fought the suppressed output — the prompt never showed and every key
 * scrolled a blank line. Raw mode reads keys and writes nothing but the prompt and a final newline.
 * `input`/`output` are injectable so the parsing can be tested on a fake terminal.
 */
export const askHidden = (prompt, { input = process.stdin, output = process.stdout } = {}) =>
  new Promise((resolve, reject) => {
    output.write(prompt);
    if (typeof input.setRawMode === "function") input.setRawMode(true);
    input.setEncoding("utf8");
    input.resume();
    let value = "";
    const finish = (settle) => {
      input.off("data", onData);
      if (typeof input.setRawMode === "function") input.setRawMode(false);
      input.pause();
      output.write("\n");
      settle();
    };
    const onData = (chunk) => {
      for (const ch of String(chunk)) {
        if (ch === "\u0003") return finish(() => reject(new Error("cancelled (Ctrl+C) — nothing written")));
        if (ch === "\r" || ch === "\n") return finish(() => resolve(value));
        if (ch === "\u007f" || ch === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (ch < " ") continue; // any other control character
        value += ch;
      }
    };
    input.on("data", onData);
  });

const run = async () => {
  if (flag("password")) {
    fail("--password is refused on purpose: a password on the command line lands in shell history and process lists. Run without it and type it at the prompt.");
  }
  const email = String(arg("email") || "").trim().toLowerCase() || fail("--email <address> is required");

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || fail("MONGO_URI is not set");
  await mongoose.connect(uri);
  console.log(`Connected to ${mongoose.connection.name}\n`);

  const user = await User.findOne({ email });
  if (!user) fail(`no account for ${email}`);
  console.log(
    "ACCOUNT :", String(user._id),
    `| ${user.name} <${user.email}> | role ${user.role} | authProvider ${user.authProvider || "password"}`,
    `| password ${user.password ? "set — will be replaced" : "none"}`
  );
  if (user.googleId) console.log("NOTE    : the account also has a Google sign-in; this sets the password without touching it");
  if (user.isFrozen || user.isDeactivated) console.log("NOTE    : account is frozen/deactivated — the password will be set but sign-in stays blocked");
  console.log();

  let candidate;
  if (process.stdin.isTTY) {
    candidate = await askHidden("New password (nothing is echoed): ");
    const again = await askHidden("Type it again: ");
    if (candidate !== again) fail("the two entries differ — nothing written");
  } else {
    if (!flag("yes")) fail("stdin is not a terminal. For non-interactive use put the password in NEW_PASSWORD and pass --yes.");
    candidate = process.env.NEW_PASSWORD || "";
    if (!candidate) fail("NEW_PASSWORD is empty — nothing written");
  }

  const missing = failingRules(candidate);
  if (missing.length) fail(`password rejected — the sign-up rules require ${missing.join(", ")}. Nothing written.`);

  // The model's pre-save hook hashes it: same bcrypt path and cost as sign-up.
  user.password = candidate;
  await user.save();

  // Void any pending reset so a stale OTP cannot replace what was just set (the schema's own
  // fields, back to their defaults).
  await User.updateOne(
    { _id: user._id },
    { $set: { passwordResetToken: null, passwordResetExpires: null, passwordResetResendAvailableAt: null, passwordResetAttempts: 0 } }
  );

  const fresh = await User.findById(user._id);
  const verified = await fresh.matchPassword(candidate);
  candidate = null;
  if (!verified) fail("written, but bcrypt verification FAILED — check the User pre-save hook before trying again");

  console.log(`✓ password set for ${fresh.email} and verified (bcrypt compare OK)`);
  console.info("[AUDIT] Password set manually", { userId: String(fresh._id), email: fresh.email, at: new Date().toISOString() });
};

// Only run when executed directly, so the prompt reader can be imported and tested on its own.
const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  run()
    .catch((error) => { console.error(`\n✗ ${error.message}`); process.exitCode = 1; })
    .finally(async () => { if (mongoose.connection.readyState === 1) await mongoose.disconnect(); });
}
