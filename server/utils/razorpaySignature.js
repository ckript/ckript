import crypto from "crypto";

/**
 * Verify a Razorpay payment signature.
 *
 * Razorpay signs `order_id|payment_id` with the key secret. Checking it is what proves the callback
 * came from Razorpay and not from someone POSTing plausible ids at the verify endpoint.
 *
 * This exists because the same eight lines were written out six times — twice in paymentController,
 * three times in scriptController, once in competitionController — and had already drifted apart in
 * their error messages. Six copies of a security check is six chances for one to be edited wrongly,
 * and nothing would fail loudly if it were.
 *
 * All six compared with `!==`, which returns as soon as two bytes differ. That leaks, through timing,
 * how much of a guessed signature was correct, which is the standard way to walk an HMAC one byte at
 * a time. `timingSafeEqual` always reads both buffers to the end.
 *
 * The secret is read at CALL time, never at module load: dotenv.config() runs inside server.js's
 * body, after every import has been evaluated, so a module-level read captures undefined and every
 * verification silently fails. That trap is documented in companyContacts.js and has bitten this
 * codebase before.
 *
 * @returns {boolean} true only if the signature is genuine.
 */
/**
 * Constant-time HMAC-SHA256 comparison shared by every Razorpay check below.
 *
 * timingSafeEqual throws on a length mismatch, so the lengths are compared first. That comparison
 * leaks only the LENGTH, which is a fixed 64 hex characters for SHA-256 and therefore tells an
 * attacker nothing they did not already know.
 */
const hmacMatches = (secret, message, signature) => {
  const expected = crypto.createHmac("sha256", secret).update(message).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(String(signature), "utf8");
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
};

export const verifyRazorpaySignature = ({ orderId, paymentId, signature, secret: secretOverride } = {}) => {
  // `secret` is accepted only so pure tests can verify without touching process.env; production
  // callers never pass it and get the key secret, read at call time.
  const secret = secretOverride || process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    console.error("[razorpay] RAZORPAY_KEY_SECRET is not set — cannot verify any payment");
    return false;
  }
  if (!orderId || !paymentId || !signature) return false;

  return hmacMatches(secret, `${orderId}|${paymentId}`, signature);
};

/**
 * Verify the checkout callback of a Razorpay SUBSCRIPTION.
 *
 * Note the order is reversed from an order payment: Razorpay signs `payment_id|subscription_id`.
 * The subscription id must be the one the SERVER created (read back from Razorpay and bound to this
 * user), not merely the one the browser echoes — the caller is responsible for that binding.
 */
export const verifyRazorpaySubscriptionSignature = ({ subscriptionId, paymentId, signature } = {}) => {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    console.error("[razorpay] RAZORPAY_KEY_SECRET is not set — cannot verify any payment");
    return false;
  }
  if (!subscriptionId || !paymentId || !signature) return false;

  return hmacMatches(secret, `${paymentId}|${subscriptionId}`, signature);
};

/**
 * Verify a webhook delivery: HMAC-SHA256 of the RAW request body with the webhook secret.
 *
 * It must be the raw bytes Razorpay sent — re-serialising parsed JSON changes whitespace and key
 * order and the signature no longer matches. The webhook secret is a separate value configured in
 * the Razorpay dashboard, not the API key secret.
 */
export const verifyRazorpayWebhookSignature = ({ rawBody, signature } = {}) => {
  const secret = String(process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    console.error("[razorpay] RAZORPAY_WEBHOOK_SECRET is not set — refusing every webhook delivery");
    return false;
  }
  if (!rawBody || !signature) return false;

  return hmacMatches(secret, rawBody, signature);
};

export default verifyRazorpaySignature;
