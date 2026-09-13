import mongoose from "mongoose";

/**
 * The money ledger — one immutable record per money event, across every flow in the product.
 *
 * WHY THIS EXISTS. Before it, revenue could not be answered from the database at all:
 *
 *   • No plan payment wrote a Transaction or an Invoice. The only trace of a ₹1,999 sale was a
 *     Razorpay id in `user.subscription.checkoutReference` — not unique, not indexed, and
 *     OVERWRITTEN by the next renewal, so prior payments left nothing behind.
 *   • Free grants were indistinguishable from sales. The FIP test checkout and the admin
 *     grant-premium path both write `checkoutMode: "live"`, `checkoutProvider: "razorpay"` onto the
 *     user, so a comp and a real ₹1,999 purchase look identical in the data.
 *   • Money was spread across User.subscription, Transaction, Invoice, CompetitionEntry.payment and
 *     ScriptPurchaseRequest, each written by different controllers with different shapes.
 *
 * THE RULES, which the rest of the design depends on:
 *
 *   1. APPEND-ONLY. Entries are never updated or deleted — the hooks at the bottom of this file
 *      refuse both. A refund or correction is a NEW entry with `settlement: "reversed"` pointing at
 *      the original via `reversalOf`. This is what makes the books auditable: a total can always be
 *      recomputed from the entries, and no past figure can change under you.
 *   2. AMOUNTS ARE INTEGER MINOR UNITS. Paise and cents, never rupees and never floats — 0.1 + 0.2
 *      is not 0.3, and money that drifts by rounding is worse than money that is missing.
 *   3. A GRANT IS A RECORD TOO. Comps, admin grants, prize subscriptions and test checkouts all get
 *      an entry with `settlement: "granted"` and `amountMinor: 0`, carrying `listPriceMinor` — the
 *      revenue foregone. Leaving them out is what made free access invisible in the first place.
 */

const ledgerEntrySchema = new mongoose.Schema(
  {
    /** What was bought or granted. Add new flows here rather than overloading an existing kind. */
    kind: {
      type: String,
      required: true,
      index: true,
      enum: [
        "plan_subscription",        // FIP / writer silver / writer gold
        "competition_registration", // challenge entry fee
        "script_purchase",          // investor buys a script
        "script_hold",              // paid option/hold on a script
        "ai_trailer",               // trailer generation
        "cash_prize",               // competition cash prize: owed by Ckript, paid outside the platform
        "credits",                  // credit top-ups and spends
        "other",
      ],
    },

    /**
     * How the entry settled. This is the field that separates revenue from everything else, and the
     * one the whole panel filters on — `paid` alone is the money that actually arrived.
     */
    settlement: {
      type: String,
      required: true,
      index: true,
      enum: [
        "paid",     // real money captured
        "granted",  // free: admin grant, prize, comp, test checkout. amountMinor is 0.
        "reversed", // a refund or correction of an earlier entry; see reversalOf
      ],
    },

    /** Who the entry is about — the payer, or the recipient of a grant. */
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // ── Money ────────────────────────────────────────────────────────────────
    /** Integer MINOR units, in `currency`. Zero for grants. Negative only on reversals. */
    amountMinor: { type: Number, required: true, default: 0 },
    currency: { type: String, required: true, default: "INR", uppercase: true, trim: true },
    /**
     * What the thing costs at list price, in the same currency and minor units. On a grant this is
     * the revenue foregone; on a paid entry it exposes discounts and the USD→INR fallback, where a
     * USD buyer is silently charged the INR amount instead.
     */
    listPriceMinor: { type: Number, default: 0 },

    // ── Provider ─────────────────────────────────────────────────────────────
    provider: {
      type: String,
      enum: ["razorpay", "manual", "none"],
      default: "none",
      index: true,
    },
    providerOrderId: { type: String, default: "" },
    /**
     * Sparse-unique: the idempotency key. Razorpay's checkout callback can fire more than once, and
     * two entries for one payment would double the reported revenue. Grants have no payment id, so
     * the index must be sparse — and `undefined`, not "", or the second grant would collide.
     */
    providerPaymentId: { type: String, index: { unique: true, sparse: true } },

    // ── Subject ──────────────────────────────────────────────────────────────
    /** What the money was for. `subjectType` names the collection; both are optional for plans. */
    subjectType: {
      type: String,
      enum: ["Script", "Competition", "CompetitionEntry", "Plan", "None"],
      default: "None",
    },
    subjectId: { type: mongoose.Schema.Types.ObjectId },
    /** Human-readable at the time of writing, so a report never depends on a join that may 404. */
    label: { type: String, default: "" },

    // ── Bookkeeping ──────────────────────────────────────────────────────────
    occurredAt: { type: Date, required: true, default: Date.now, index: true },
    /** The entry this one reverses. Only ever set when settlement is "reversed". */
    reversalOf: { type: mongoose.Schema.Types.ObjectId, ref: "LedgerEntry", default: null },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", default: null },
    /**
     * The code path that wrote this, e.g. "paymentController.verifyWriterRazorpayPayment". When a
     * figure looks wrong, this is what makes it findable without bisecting the whole server.
     */
    source: { type: String, default: "" },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true },
);

// Reporting reads: revenue over a period, by kind, and one user's history.
ledgerEntrySchema.index({ occurredAt: -1, settlement: 1 });
ledgerEntrySchema.index({ kind: 1, occurredAt: -1 });
ledgerEntrySchema.index({ user: 1, occurredAt: -1 });

/**
 * Append-only enforcement.
 *
 * Mongoose gives no built-in immutability at the document level, so every mutating entry point is
 * closed explicitly. This is the property the whole ledger rests on: without it, "append-only" is a
 * convention that the first `updateOne` in a hurry quietly breaks.
 */
// THROWS rather than calling next(err): Mongoose passes `next` to query middleware only under some
// version/arity combinations, and relying on it made these hooks fail with "next is not a function"
// — which would have silently left the ledger mutable, since a hook that throws a TypeError still
// blocks the write but for the wrong reason and with an unrecognisable message. Throwing is correct
// for both document and query middleware in every version.
const refuse = (verb) => function reject() {
  throw new Error(
    `LedgerEntry is append-only: ${verb} is not permitted. `
    + "Record a new entry with settlement:'reversed' and reversalOf set to the original.",
  );
};

for (const op of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne"]) {
  ledgerEntrySchema.pre(op, refuse(op));
}
for (const op of ["deleteOne", "deleteMany", "findOneAndDelete", "findOneAndRemove"]) {
  ledgerEntrySchema.pre(op, refuse(op));
}
// Catches `entry.field = x; await entry.save()` on an already-persisted document.
ledgerEntrySchema.pre("save", function guardResave() {
  if (!this.isNew) {
    throw new Error("LedgerEntry is append-only: an existing entry cannot be re-saved.");
  }
});

export default mongoose.model("LedgerEntry", ledgerEntrySchema);
