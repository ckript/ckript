import { OAuth2Client } from "google-auth-library";

// Google Calendar integration for producer-organized meetings. This is the CLASSIC OAuth2
// authorization-code flow (offline access → refresh token), separate from the sign-in ID-token flow in
// authController.js. It reuses the same OAuth client id but additionally needs the client SECRET and a
// registered redirect URI. We call the Calendar REST API directly (one events.insert) rather than
// pulling in the heavy `googleapis` SDK.

export const CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
];

// Thrown when Google rejects the stored refresh token (revoked/expired) — the caller should mark the
// account disconnected and tell the producer to reconnect.
export class ReconnectRequired extends Error {
  constructor(message = "Google Calendar needs to be reconnected") {
    super(message);
    this.name = "ReconnectRequired";
    this.needsCalendar = true;
  }
}

export const isGoogleCalendarConfigured = () =>
  Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_CALENDAR_REDIRECT_URI);

/**
 * Catch the redirect URI pointing at the FRONTEND instead of this API.
 *
 * The callback is a route on this server. Point it at the client origin and Google delivers the code
 * to the single-page app, whose router has no such route — production showed
 * `No routes matched location "/api/google-calendar/callback?..."` and a blank popup, with nothing
 * on the server side to look at because the request never arrived here. The two hosts are separate
 * in production (SPA on the apex domain, API on Cloud Run), so this is easy to get wrong and
 * invisible once wrong.
 *
 * Compared against CLIENT_URL rather than a guess at our own address: a server behind a proxy cannot
 * reliably know its public origin, but it does know the client's, and the callback must never live
 * there.
 *
 * @returns {string} a warning to log, or "" when the pair looks right.
 */
export const getCalendarConfigWarning = () => {
  const redirect = String(process.env.GOOGLE_CALENDAR_REDIRECT_URI || "").trim();
  const client = String(process.env.CLIENT_URL || "").trim();
  if (!redirect || !client) return "";

  let redirectOrigin;
  let clientOrigin;
  try {
    redirectOrigin = new URL(redirect).origin;
    clientOrigin = new URL(client).origin;
  } catch {
    return `GOOGLE_CALENDAR_REDIRECT_URI or CLIENT_URL is not a valid URL (${redirect} / ${client}).`;
  }

  if (redirectOrigin === clientOrigin) {
    return (
      `GOOGLE_CALENDAR_REDIRECT_URI (${redirect}) points at CLIENT_URL's origin. ` +
      "The callback is a route on THIS server, not on the front end — Google will hand the code to " +
      "the SPA, which has no such route, and the connection will fail with a blank popup. Set it to " +
      "this API's public origin + /api/google-calendar/callback, and register that exact URI in the " +
      "Google Cloud Console."
    );
  }

  if (!/\/api\/google-calendar\/callback$/.test(redirect)) {
    return `GOOGLE_CALENDAR_REDIRECT_URI (${redirect}) does not end in /api/google-calendar/callback, which is the route that handles it.`;
  }

  return "";
};

const requireConfig = () => {
  if (!isGoogleCalendarConfigured()) {
    throw new Error(
      "Google Calendar is not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_CALENDAR_REDIRECT_URI."
    );
  }
};

// A fresh client per call (they carry per-user credentials — never share mutable token state).
export const getOAuthClient = () => {
  requireConfig();
  return new OAuth2Client(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_CALENDAR_REDIRECT_URI
  );
};

// Consent URL. `state` is our signed correlation token (see controller). prompt:"consent" forces a
// refresh_token to be returned even on re-consent.
export const getAuthUrl = (state) =>
  getOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: CALENDAR_SCOPES,
    state,
  });

// Exchange the callback code for tokens + the connected account's email.
export const exchangeCode = async (code) => {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  let email = "";
  if (tokens?.access_token) {
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (res.ok) email = (await res.json())?.email || "";
    } catch {
      /* email is best-effort */
    }
  }
  return {
    refreshToken: tokens?.refresh_token || "",
    accessToken: tokens?.access_token || "",
    accessTokenExpiry: tokens?.expiry_date ? new Date(tokens.expiry_date) : null,
    scopes: String(tokens?.scope || "").split(/\s+/).filter(Boolean),
    email,
  };
};

// Trade a stored refresh token for a live access token (google-auth-library auto-refreshes). Throws
// ReconnectRequired if Google rejects the refresh token.
export const getAccessTokenFromRefresh = async (refreshToken) => {
  if (!refreshToken) throw new ReconnectRequired();
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  try {
    const { token } = await client.getAccessToken();
    if (!token) throw new ReconnectRequired();
    const expiry = client.credentials?.expiry_date ? new Date(client.credentials.expiry_date) : null;
    return { accessToken: token, accessTokenExpiry: expiry };
  } catch (err) {
    const msg = String(err?.response?.data?.error || err?.message || "").toLowerCase();
    if (msg.includes("invalid_grant") || msg.includes("token has been expired or revoked")) {
      throw new ReconnectRequired();
    }
    throw err;
  }
};

// Create a Calendar event with a Google Meet link on the organizer's primary calendar. startISO/endISO
// are naive local wall-clock ISO strings (no offset) and `timeZone` is an IANA zone — Google resolves
// the offset + DST and localizes for every attendee. Returns { eventId, meetLink }.
export const createMeetingEvent = async ({
  accessToken,
  summary,
  description = "",
  startISO,
  endISO,
  timeZone,
  attendees = [],
}) => {
  const body = {
    summary,
    description,
    start: { dateTime: startISO, timeZone },
    end: { dateTime: endISO, timeZone },
    attendees: attendees.filter(Boolean).map((email) => ({ email })),
    reminders: { useDefault: true },
    conferenceData: {
      createRequest: {
        requestId: `ckript-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) throw new ReconnectRequired();
    throw new Error(`Google Calendar event creation failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const meetLink =
    data?.hangoutLink ||
    data?.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ||
    "";
  return { eventId: data?.id || "", meetLink };
};

// Best-effort delete of an event on the organizer's primary calendar (used when a meeting is replaced
// on reschedule). sendUpdates=all tells attendees the old slot is cancelled.
export const deleteMeetingEvent = async ({ accessToken, eventId }) => {
  if (!accessToken || !eventId) return;
  try {
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
    );
  } catch {
    /* best effort */
  }
};

// Best-effort revoke at Google (used on disconnect).
export const revokeToken = async (token) => {
  if (!token) return;
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
  } catch {
    /* best effort */
  }
};
