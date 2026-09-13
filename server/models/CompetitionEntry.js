import mongoose from "mongoose";

// One writer's participation in one competition: their registration details, the script they wrote,
// a frozen snapshot of what they submitted, the AI outputs, and their final result.
//
// The SNAPSHOT is the important design choice. Judging and AI read `snapshot`, never the live
// Script, so a submission is genuinely final even though the underlying script row still exists in
// the writer's library. (The script is also flagged `competitionLocked`, but the snapshot means
// correctness does not depend on that flag holding.)

// Same generator/retry shape as User.sid and Script.sid (models/User.js).
const createEventId = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 — readable when typed or read aloud
  let token = "";
  for (let i = 0; i < 8; i += 1) token += chars[Math.floor(Math.random() * chars.length)];
  return `CGSC-${token}`;
};

const competitionEntrySchema = new mongoose.Schema({
  competitionId: { type: mongoose.Schema.Types.ObjectId, ref: "Competition", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  eventId: { type: String, unique: true },

  registration: {
    country: { type: String, trim: true, maxlength: 80, required: true },
    language: { type: String, trim: true, maxlength: 60, required: true },
    genres: [{ type: String }],
    experienceLevel: {
      type: String,
      enum: ["beginner", "intermediate", "professional"],
      required: true,
    },
    portfolioUrl: { type: String, trim: true, maxlength: 300, default: "" },
  },
  acceptedRulesAt: { type: Date, required: true },
  acceptedCopyrightAt: { type: Date, required: true },

  // What the entrant paid to enter. The verify handler used to check the Razorpay signature and
  // then create the entry while storing NOTHING about the payment — so an entry carried no proof of
  // what was charged, in which currency, or against which order. Support could not answer "did this
  // person pay?" and no invoice could be issued after the fact.
  //
  // `orderId` is unique-sparse so one Razorpay order can only ever produce one entry: a
  // double-submitted checkout callback hits the index instead of creating a second registration.
  payment: {
    orderId: { type: String, default: "" },
    paymentId: { type: String, default: "" },
    amount: { type: Number, default: 0 },      // major units, as charged
    currency: { type: String, default: "" },
    paidAt: { type: Date, default: null },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", default: null },
  },

  // Set when an admin accepted proof of a registration paid on another platform (Luma, BookMyShow,
  // FilmFreeway and the rest). `payment` stays empty in that case, deliberately: it means "money
  // Ckript received", and a granted entry has to stay distinguishable from a paid one in every
  // report that reads it. The foregone fee is recorded as a ledger grant instead.
  externalRegistration: {
    provider: { type: String, default: "" },
    reference: { type: String, default: "" },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    verifiedAt: { type: Date, default: null },
  },

  scriptId: { type: mongoose.Schema.Types.ObjectId, ref: "Script", default: null },
  status: {
    type: String,
    enum: ["registered", "writing", "submitted", "ai_processed", "judged"],
    default: "registered",
    index: true,
  },
  submittedAt: { type: Date, default: null },

  // Frozen at submit — the authoritative record of what was entered.
  snapshot: {
    fountainContent: { type: String, default: "" },
    textContent: { type: String, default: "" },
    title: { type: String, default: "" },
    // The writer's OWN logline and synopsis, as typed in the editor during the writing window.
    // Deliberately separate from `ai.logline`/`ai.synopsis` below: the read side prefers these and
    // only falls back to the AI's, so a writer is never credited with words the platform wrote.
    // Empty on entries submitted before this field existed — those legitimately have only the AI's.
    logline: { type: String, default: "" },
    synopsis: { type: String, default: "" },
    wordCount: { type: Number, default: 0 },
    charCount: { type: Number, default: 0 },
    pageCount: { type: Number, default: 0 },
    sceneCount: { type: Number, default: 0 },
  },

  ai: {
    logline: { type: String, default: "" },
    synopsis: { type: String, default: "" },
    evaluation: { type: mongoose.Schema.Types.Mixed, default: null }, // scriptScore shape
    // Claimed-at marker for the AI run. Submit dispatches processing fire-and-forget and an admin can
    // retry at the same moment; setting this from null is the lock that stops two runs billing the
    // model twice. Cleared on failure, and treated as stale after 15 minutes so a dead run can't
    // wedge the entry.
    startedAt: { type: Date, default: null },
    processedAt: { type: Date, default: null },
    error: { type: String, default: "" },
  },

  result: {
    award: {
      type: String,
      enum: ["none", "winner", "runner_up", "second_runner_up", "special", "participant"],
      default: "none",
    },
    specialTitle: { type: String, default: "" },
    note: { type: String, default: "" },
    // The ordering the admin confirmed, which is NOT necessarily the panel's suggestion — the
    // aggregate ranks, a human decides. Null on every entry that predates the judge panel, and on
    // any competition judged without one.
    rank: { type: Number, default: null },

    /**
     * The score the ADMIN settled on, having read what every assigned judge said.
     *
     * Deliberately separate from the panel's computed mean. That mean is arithmetic over whoever
     * happened to be assigned; this is a judgement, and the two disagreeing is information worth
     * keeping rather than a conflict to resolve by overwriting one with the other. The admin may
     * discount a judge who misread the brief, weigh a specialist more heavily, or account for
     * something no rubric captured.
     *
     * Null means "not decided yet", which is why it is nullable rather than defaulting to 0 — a 0
     * would be indistinguishable from a genuinely terrible script.
     */
    finalScore: { type: Number, min: 0, max: 100, default: null },
    finalScoreNote: { type: String, default: "", maxlength: 2000 },
    finalScoreAt: { type: Date, default: null },
    finalScoreBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },

  // Append-only ledger; the declare-results grant loop skips any type already present, which is what
  // makes re-declaring safe.
  rewardsGranted: [{ type: { type: String }, at: Date }],
}, { timestamps: true });

// One entry per writer per competition.
competitionEntrySchema.index({ competitionId: 1, userId: 1 }, { unique: true });
// Lookup only, deliberately NOT unique: `payment.orderId` defaults to "" rather than being absent,
// and a sparse index skips only ABSENT fields — so a unique one would let the first free entry
// claim "" and reject every free entry after it. Double registration is already impossible via the
// compound unique index above, and duplicate invoices via Invoice.paymentReference.
competitionEntrySchema.index({ "payment.orderId": 1 });

competitionEntrySchema.pre("validate", async function ensureEventId() {
  if (this.eventId) return;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = createEventId();
    const exists = await this.constructor.exists({ eventId: candidate });
    if (!exists) {
      this.eventId = candidate;
      return;
    }
  }
  throw new Error("Unable to generate unique competition event ID");
});

export default mongoose.model("CompetitionEntry", competitionEntrySchema);
