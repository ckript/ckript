import LedgerEntry from "../models/LedgerEntry.js";

/**
 * The one way anything writes to the money ledger.
 *
 * Every caller goes through `recordPayment` or `recordGrant` so the shape of an entry is decided in
 * exactly one place. The flows that write money are spread across five controllers; letting each
 * construct its own entry is how the existing data ended up in five different shapes.
 *
 * ── TWO PROPERTIES THESE FUNCTIONS GUARANTEE ────────────────────────────────────────────────────
 *
 * IDEMPOTENT. Razorpay's checkout handler can fire more than once for a single payment, and the
 * verify endpoint is a plain POST a client can retry. `providerPaymentId` carries a sparse-unique
 * index, so the second write loses the race and returns the first entry instead of doubling the
 * reported revenue.
 *
 * NON-FATAL. By the time these are called the money is already captured and the entitlement already
 * granted. Throwing here would return an error to a user who has genuinely paid — and they would
 * reasonably pay again. A missing ledger row is recoverable from the Razorpay dashboard; a double
 * charge is not. So every failure is logged loudly and swallowed, and the caller gets null.
 *
 * That trade-off is only safe because the ledger is not the source of entitlement — it is the
 * record OF it. Nothing downstream should ever gate access on an entry existing.
 */

const toMinor = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

const write = async (doc, context) => {
  try {
    return await LedgerEntry.create(doc);
  } catch (error) {
    // A duplicate key means a concurrent callback already recorded this payment — the desired
    // outcome, not a failure. Return the entry that won.
    //
    // Coerced to a string before it becomes a query. The id originates in a payment callback body,
    // and an object arriving here would make this "find any ledger entry" rather than "find the one
    // with this payment id" — returning someone else's entry to the caller. The request sanitiser
    // strips operators globally; this is the second lock on a query that decides who a payment
    // belongs to.
    if (error?.code === 11000 && doc.providerPaymentId) {
      return LedgerEntry.findOne({ providerPaymentId: String(doc.providerPaymentId) });
    }
    console.error(`[ledger] failed to record ${context}:`, error?.message || error);
    return null;
  }
};

/**
 * Money actually captured.
 *
 * `amountMinor` must be what the PROVIDER says was captured, never what the price table says it
 * should have been — the two diverge whenever a USD order falls back to INR, and the ledger's job
 * is to record what happened.
 */
export const recordPayment = async ({
  kind,
  user,
  amountMinor,
  currency = "INR",
  listPriceMinor = 0,
  provider = "razorpay",
  providerOrderId = "",
  providerPaymentId,
  subjectType = "None",
  subjectId,
  label = "",
  invoice = null,
  occurredAt,
  source = "",
  metadata = {},
  tax = null,
  creatorPayoutMinor = 0,
  gatewayFeeMinor = 0,
  gatewayTaxMinor = 0,
}) => {
  if (!kind || !user) return null;
  return write({
    kind,
    settlement: "paid",
    // Taxes are part of what was captured; the snapshot says exactly how much (none when absent).
    ...(tax ? { tax, taxMinor: toMinor(tax?.totals?.taxMinor) } : {}),
    creatorPayoutMinor: toMinor(creatorPayoutMinor),
    gatewayFeeMinor: toMinor(gatewayFeeMinor),
    gatewayTaxMinor: toMinor(gatewayTaxMinor),
    user,
    amountMinor: toMinor(amountMinor),
    currency: String(currency || "INR").toUpperCase(),
    listPriceMinor: toMinor(listPriceMinor),
    provider,
    providerOrderId,
    // undefined rather than "", so the sparse unique index skips entries without one.
    providerPaymentId: providerPaymentId || undefined,
    subjectType,
    subjectId,
    label,
    invoice,
    occurredAt: occurredAt || new Date(),
    source,
    metadata,
  }, `${kind} payment`);
};

/**
 * Access given away: admin grants, competition prizes, test checkouts, comps.
 *
 * Recorded because it was previously invisible — a granted Diamond plan and a paid one were the
 * same row in the database. `listPriceMinor` is the revenue foregone, which is the number an
 * accountant will ask for and the reason these belong in the ledger at all rather than in a log.
 */
export const recordGrant = async ({
  kind,
  user,
  listPriceMinor = 0,
  currency = "INR",
  grantedBy = null,
  reason = "",
  subjectType = "None",
  subjectId,
  label = "",
  occurredAt,
  source = "",
  metadata = {},
}) => {
  if (!kind || !user) return null;
  return write({
    kind,
    settlement: "granted",
    user,
    amountMinor: 0,
    currency: String(currency || "INR").toUpperCase(),
    listPriceMinor: toMinor(listPriceMinor),
    provider: "none",
    subjectType,
    subjectId,
    label,
    occurredAt: occurredAt || new Date(),
    source,
    metadata: { ...metadata, ...(grantedBy ? { grantedBy: String(grantedBy) } : {}), ...(reason ? { reason } : {}) },
  }, `${kind} grant`);
};

/**
 * Reverse an earlier entry — a refund, or a correction.
 *
 * A NEW entry carrying the negative amount, never an edit of the original. Both rows survive, so
 * the history shows that a refund happened rather than a sale quietly disappearing.
 */
export const recordReversal = async ({
  original,
  amountMinor,
  reason = "",
  providerPaymentId,
  source = "",
  occurredAt,
  taxMinor = null,
  creatorPayoutMinor = 0,
}) => {
  if (!original?._id) return null;
  const magnitude = Math.abs(toMinor(amountMinor ?? original.amountMinor));
  // The taxes reversed: given by the credit note when there is one, otherwise pro rata of the original.
  const reversedTax = taxMinor !== null
    ? Math.abs(toMinor(taxMinor))
    : (original.amountMinor ? Math.round(Math.abs(toMinor(original.taxMinor)) * magnitude / Math.abs(original.amountMinor)) : 0);
  return write({
    kind: original.kind,
    settlement: "reversed",
    user: original.user,
    amountMinor: -magnitude,
    currency: original.currency,
    listPriceMinor: 0,
    provider: original.provider,
    providerOrderId: original.providerOrderId,
    providerPaymentId: providerPaymentId || undefined,
    subjectType: original.subjectType,
    subjectId: original.subjectId,
    label: original.label,
    reversalOf: original._id,
    taxMinor: -reversedTax,
    creatorPayoutMinor: -Math.abs(toMinor(creatorPayoutMinor)),
    occurredAt: occurredAt || new Date(),
    source,
    metadata: reason ? { reason } : {},
  }, `${original.kind} reversal`);
};

export default { recordPayment, recordGrant, recordReversal };
