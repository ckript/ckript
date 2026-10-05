import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { encryptToken, decryptToken, isTokenCryptoConfigured } from "../utils/tokenCrypto.js";
import {
  getAuthUrl,
  exchangeCode,
  revokeToken,
  isGoogleCalendarConfigured,
} from "../utils/googleCalendar.js";

const STATE_TTL = "10m";

// Only allow same-app relative paths as the post-connect return target (prevents open-redirect).
const sanitizeReturnTo = (value) => {
  const v = String(value || "").trim();
  if (!v.startsWith("/") || v.startsWith("//")) return "/";
  return v;
};

/**
 * Send the browser back to the app with the outcome.
 *
 * `reason` exists because every failure here used to collapse into a bare `calendar=error`. The
 * producer saw one generic sentence, the server logged one generic line, and there was no way to
 * tell a denied consent from a missing refresh token from a redirect_uri mismatch without adding
 * logging and asking them to try again. The reason is a fixed vocabulary, never an exception
 * message: it reaches a URL, so it must not carry anything Google or an error string put in it.
 */
const clientRedirect = (res, returnTo, status, reason = "") => {
  const base = String(process.env.CLIENT_URL || "").replace(/\/$/, "");
  const path = sanitizeReturnTo(returnTo);
  const sep = path.includes("?") ? "&" : "?";
  const suffix = reason ? `&reason=${encodeURIComponent(reason)}` : "";
  return res.redirect(`${base}${path}${sep}calendar=${status}${suffix}`);
};

// POST /api/google-calendar/auth-url (protect) → { url }
// Returns the Google consent URL. `state` is a short-lived signed JWT that correlates the header-less
// browser callback back to this user (auth is stateless bearer, so we cannot rely on a session).
export const getGoogleCalendarAuthUrl = async (req, res) => {
  try {
    if (!isGoogleCalendarConfigured()) {
      return res.status(503).json({ message: "Google Calendar is not configured on the server." });
    }
    // The refresh token is encrypted on the way back from Google. Without a valid key that step throws
    // AFTER consent, so the producer clicks through Google and silently ends up not connected.
    if (!isTokenCryptoConfigured()) {
      console.error("[googleCalendar] TOKEN_ENC_KEY is missing or not 64 hex characters - cannot store calendar tokens");
      return res.status(503).json({ message: "Google Calendar is not configured on the server (token encryption key)." });
    }
    const returnTo = sanitizeReturnTo(req.body?.returnTo);
    const state = jwt.sign({ uid: String(req.user._id), returnTo, purpose: "gcal" }, process.env.JWT_SECRET, {
      expiresIn: STATE_TTL,
    });
    return res.json({ url: getAuthUrl(state) });
  } catch (error) {
    console.error("[googleCalendar] auth-url failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to start Google Calendar connection." });
  }
};

// GET /api/google-calendar/callback (public — Google redirects the browser here with ?code&state)
export const handleGoogleCalendarCallback = async (req, res) => {
  const { code, state, error: googleError } = req.query;
  let returnTo = "/";
  try {
    if (!state) {
      console.error("[googleCalendar] callback had no state");
      return clientRedirect(res, returnTo, "error", "no_state");
    }
    let decoded;
    try {
      decoded = jwt.verify(String(state), process.env.JWT_SECRET);
    } catch {
      // Almost always the 10-minute state TTL expiring while the consent screen sat open.
      console.error("[googleCalendar] state failed to verify (expired or tampered)");
      return clientRedirect(res, returnTo, "error", "bad_state");
    }
    returnTo = sanitizeReturnTo(decoded?.returnTo);
    if (decoded?.purpose !== "gcal" || !decoded?.uid) {
      console.error("[googleCalendar] state was not a calendar state");
      return clientRedirect(res, returnTo, "error", "bad_state");
    }
    if (googleError) {
      // Google's own refusal. `access_denied` is both "user clicked Cancel" and "app is unverified
      // and this account is not a test user" — the two look identical from here.
      console.error("[googleCalendar] Google refused consent:", String(googleError).slice(0, 100));
      return clientRedirect(res, returnTo, "error", "denied");
    }
    if (!code) {
      console.error("[googleCalendar] callback had no code");
      return clientRedirect(res, returnTo, "error", "no_code");
    }

    let tokens;
    try {
      tokens = await exchangeCode(String(code));
    } catch (exchangeError) {
      /* Google says which of these it is, and they have nothing to do with each other — a bad
         secret, an unregistered URI and a stale code need three different fixes. Collapsing them
         into one "exchange failed" cost a round of chasing the redirect URI when the secret was
         wrong, so the code Google returns is mapped through rather than thrown away. */
      const googleCode = String(
        exchangeError?.response?.data?.error || exchangeError?.message || ""
      ).toLowerCase();

      const mapped = googleCode.includes("invalid_client")
        ? "bad_client_secret"
        : googleCode.includes("redirect_uri_mismatch")
        ? "redirect_uri_mismatch"
        : googleCode.includes("invalid_grant")
        ? "stale_code"
        : "exchange_failed";

      console.error(
        "[googleCalendar] token exchange failed (%s):",
        mapped,
        exchangeError?.response?.data?.error_description || exchangeError?.message || exchangeError
      );
      return clientRedirect(res, returnTo, "error", mapped);
    }

    if (!tokens.refreshToken) {
      // Google only returns a refresh token on a FIRST consent for the scope set. A previously
      // granted account re-consenting gets an access token alone unless access is revoked first.
      console.error("[googleCalendar] no refresh token returned — prior consent not revoked");
      return clientRedirect(res, returnTo, "error", "no_refresh_token");
    }

    await User.updateOne(
      { _id: decoded.uid },
      {
        $set: {
          "googleCalendar.connected": true,
          "googleCalendar.connectedAt": new Date(),
          "googleCalendar.calendarEmail": tokens.email || "",
          "googleCalendar.refreshTokenEnc": encryptToken(tokens.refreshToken),
          "googleCalendar.accessToken": tokens.accessToken || "",
          "googleCalendar.accessTokenExpiry": tokens.accessTokenExpiry || null,
          "googleCalendar.scopes": tokens.scopes || [],
        },
      }
    );

    return clientRedirect(res, returnTo, "connected");
  } catch (error) {
    console.error("[googleCalendar] callback failed:", error?.message || error);
    return clientRedirect(res, returnTo, "error", "server_error");
  }
};

// GET /api/google-calendar/status (protect) → { connected, calendarEmail }
export const getGoogleCalendarStatus = async (req, res) => {
  const gc = req.user?.googleCalendar || {};
  return res.json({
    connected: Boolean(gc.connected),
    calendarEmail: gc.calendarEmail || "",
    configured: isGoogleCalendarConfigured(),
  });
};

// DELETE /api/google-calendar (protect) → disconnect + best-effort revoke at Google
export const disconnectGoogleCalendar = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("+googleCalendar.refreshTokenEnc");
    if (user?.googleCalendar?.refreshTokenEnc) {
      try {
        await revokeToken(decryptToken(user.googleCalendar.refreshTokenEnc));
      } catch {
        /* best effort */
      }
    }
    await User.updateOne(
      { _id: req.user._id },
      {
        $set: {
          "googleCalendar.connected": false,
          "googleCalendar.calendarEmail": "",
          "googleCalendar.refreshTokenEnc": "",
          "googleCalendar.accessToken": "",
          "googleCalendar.accessTokenExpiry": null,
          "googleCalendar.scopes": [],
        },
      }
    );
    return res.json({ message: "Google Calendar disconnected.", connected: false });
  } catch (error) {
    console.error("[googleCalendar] disconnect failed:", error?.message || error);
    return res.status(500).json({ message: "Failed to disconnect Google Calendar." });
  }
};
