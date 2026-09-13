import crypto from "crypto";

/**
 * The token in an unsubscribe link.
 *
 * SIGNED, NOT STORED. Someone unsubscribing is holding an email we sent — possibly months ago — and
 * has no session, no password, and no patience. A database token would mean either keeping a row per
 * recipient per send forever, or expiring links and telling people who clicked one that it is too
 * old, which is exactly the moment they mark the mail as spam instead.
 *
 * An HMAC over (userId, category) needs no storage, never expires, and cannot be forged. The
 * trade-off is that it cannot be revoked individually — which does not matter, because the only
 * thing it authorises is turning OFF mail to an address we were already emailing.
 *
 * Deliberately NOT a JWT: this goes in a URL that lands in mail clients, spam filters and server
 * logs, and it wants to be short and opaque rather than a decodable envelope announcing a user id.
 */

/**
 * Categories a recipient can opt out of.
 *
 * `marketing` is the one that matters and the one bulk sends use. `system` and `messages` exist on
 * User.notificationPrefs.emailPreferences already, so they are honoured here rather than inventing a
 * second vocabulary beside them.
 *
 * There is deliberately no category for transactional mail — a password reset, a judge invite, a
 * payment receipt. Those are not marketing, a recipient asked for each one by taking an action, and
 * suppressing them would break the account rather than quiet it.
 */
export const UNSUBSCRIBE_CATEGORIES = Object.freeze(["marketing", "system", "messages"]);

/**
 * Read lazily, never at module load.
 *
 * dotenv.config() runs in server.js's body — after every import has already evaluated — so a
 * module-level `process.env.X` in a server file always captures the fallback, whatever .env says.
 * This codebase has been bitten by that before; the function shape is what avoids it.
 */
const getSecret = () => process.env.UNSUBSCRIBE_SECRET || process.env.JWT_SECRET || "";

const sign = (payload) => crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");

/**
 * @returns {string} `<userId>.<category>.<signature>`, safe in a URL without further encoding.
 */
export const createUnsubscribeToken = (userId, category = "marketing") => {
  const secret = getSecret();
  if (!secret) {
    console.error("[unsubscribe] no UNSUBSCRIBE_SECRET or JWT_SECRET — cannot sign an unsubscribe link");
    return "";
  }
  if (!userId || !UNSUBSCRIBE_CATEGORIES.includes(category)) return "";

  const payload = `${userId}.${category}`;
  return `${payload}.${sign(payload)}`;
};

/**
 * @returns {{ userId: string, category: string } | null} null for anything that does not verify.
 */
export const readUnsubscribeToken = (token) => {
  const secret = getSecret();
  if (!secret || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [userId, category, signature] = parts;
  if (!/^[a-f0-9]{24}$/i.test(userId)) return null;
  if (!UNSUBSCRIBE_CATEGORIES.includes(category)) return null;

  const expected = sign(`${userId}.${category}`);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature), "utf8");
  // Length first: timingSafeEqual throws on a mismatch rather than returning false, so a token with
  // a short signature would be a 500 instead of a refusal.
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  return { userId, category };
};

/**
 * Where the unsubscribe link points: THIS server, not the client app.
 *
 * /api/unsubscribe is a route on the API. In production the SPA and the API are separate origins
 * (the client reaches the API through VITE_API_URL), so a link built from the client's origin —
 * which is what the broadcast used to do — lands on the SPA's router and renders a blank page. It is
 * the same mistake as the Google Calendar redirect URI that pointed at the front end, and it was
 * invisible for the same reason: the request never reached a server that could log it.
 *
 * PUBLIC_API_URL wins when set, for the day the API sits behind a different public hostname than
 * the one it sees. Otherwise the request's own protocol and host — server.js sets `trust proxy`, so
 * behind Cloud Run these are the public values, not the proxy's.
 *
 * Read lazily, never at module load — dotenv runs after imports in this codebase.
 */
export const resolveUnsubscribeBaseUrl = (req) => {
  const configured = String(process.env.PUBLIC_API_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  const host = req?.get?.("host") || "";
  if (!host) return "";
  return `${req.protocol || "https"}://${host}`;
};

/**
 * The absolute link that goes in the email.
 *
 * Refuses to build a relative URL. An empty base used to yield "/api/unsubscribe?token=…", which is
 * a working path on a web page and a dead link in an inbox — and because it was non-empty, the
 * List-Unsubscribe headers still went out pointing at it.
 */
export const buildUnsubscribeUrl = (baseUrl, userId, category = "marketing") => {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) {
    console.error("[unsubscribe] refusing to build a link without an absolute base URL");
    return "";
  }
  const token = createUnsubscribeToken(userId, category);
  if (!token) return "";
  return `${base}/api/unsubscribe?token=${token}`;
};

export default createUnsubscribeToken;
