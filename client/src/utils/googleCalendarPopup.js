/**
 * Talking to the Google Calendar consent popup, given that we cannot hold a reference to it.
 *
 * Google's OAuth pages send Cross-Origin-Opener-Policy. The moment the popup navigates there the
 * browser severs the opener relationship: `window.opener` is null on their side, and on ours
 * `popup.closed` is blocked — Chrome logs "Cross-Origin-Opener-Policy policy would block the
 * window.closed call" and the read comes back TRUE. Believing it, as this code first did, reports a
 * cancellation about a second after the popup opens, while the producer is still reading the consent
 * screen. There is no way to poll a window handle through COOP; the signal has to travel some other
 * way.
 *
 * It travels through storage, which COOP does not touch. Our own OAuth callback redirects the popup
 * back to this app, so the popup ends up running this code on our origin — where it can announce the
 * outcome and close itself.
 *
 * Recognising the popup is its own problem. The first version used `window.name` — set at open,
 * normally survives navigation — but the same COOP swap that severs the opener ALSO resets
 * `window.name`. The popup came back nameless, failed to recognise itself, and loaded the entire
 * app inside the consent window. So the marker travels in the URL instead: the modal requests a
 * `returnTo` carrying `gcalPopup=1`, and the callback hands it back to us. A URL param cannot be
 * stripped by a context-group swap. The name check is kept only as a belt alongside that.
 *
 * The marker must NEVER be on the full-page fallback's returnTo: a main tab landing on a
 * marker URL would try to close itself.
 */

export const POPUP_NAME = "ckript-google-calendar";
export const POPUP_MARKER = "gcalPopup";
const CHANNEL = "ckript:google-calendar";
const STORAGE_PING = "ckript:google-calendar:result";

/** Both paths, because BroadcastChannel is the clean one and `storage` is the one that always works. */
const broadcast = (status, reason = "") => {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ status, reason });
    channel.close();
  } catch {
    /* not supported — the storage write below still gets through */
  }
  try {
    // A changing value matters: `storage` only fires when the value actually differs.
    localStorage.setItem(STORAGE_PING, `${status}:${Date.now()}:${reason}`);
  } catch {
    /* private mode — the opener falls back to polling the API */
  }
};

/**
 * Run on app boot. If this window IS the consent popup returning from Google, announce the result to
 * the opener and close. Returns true when it recognised itself, so the caller can skip rendering an
 * app nobody will see.
 */
export const announceIfCalendarPopup = () => {
  if (typeof window === "undefined") return false;

  const params = new URLSearchParams(window.location.search);
  const status = params.get("calendar");
  if (!status) return false;
  // The server names WHY it failed; carry it so the opener can say something specific.
  const reason = params.get("reason") || "";

  // Either signal identifies the popup. The URL marker is the reliable one — COOP resets
  // window.name, so the name alone missed and the whole app rendered inside the consent window.
  // A plain ?calendar=connected with NEITHER signal is the full-page fallback landing in the main
  // tab, which must be left alone.
  const isPopup = params.get(POPUP_MARKER) === "1" || window.name === POPUP_NAME;
  if (!isPopup) return false;

  broadcast(status, reason);
  try {
    window.close();
  } catch {
    /* if the close is refused the opener still got the message */
  }
  // Whether or not the close was honoured, this window must not boot the app: a refused close would
  // otherwise show the full product inside a 520px consent popup. The caller renders nothing and the
  // window shows a one-line notice instead.
  try {
    document.body.innerHTML =
      '<p style="font-family:sans-serif;padding:24px;text-align:center">Google Calendar ' +
      (status === "connected" ? "connected" : "connection failed") +
      ". You can close this window.</p>";
  } catch {
    /* cosmetic only */
  }
  return true;
};

/**
 * Listen for that announcement. Returns an unsubscribe function.
 * @param {(status: string, reason: string) => void} onResult status is "connected" | "error"
 */
export const onCalendarPopupResult = (onResult) => {
  const handlers = [];

  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event) => {
      if (event?.data?.status) onResult(String(event.data.status), String(event.data.reason || ""));
    };
    handlers.push(() => channel.close());
  } catch {
    /* fall through to storage */
  }

  const onStorage = (event) => {
    if (event.key !== STORAGE_PING || !event.newValue) return;
    const [status, , reason = ""] = String(event.newValue).split(":");
    onResult(status, reason);
  };
  window.addEventListener("storage", onStorage);
  handlers.push(() => window.removeEventListener("storage", onStorage));

  return () => handlers.forEach((off) => off());
};

/* What actually went wrong, in the producer's words.
   Every failure used to read "Google could not complete the connection", which is true of all of
   them and useful for none — it cost several rounds of guessing to find out which one was firing. */
export const describeCalendarFailure = (reason) => {
  switch (reason) {
    case "denied":
      return "Google refused the connection. If this account is not on the app's Google test-user list, ask an admin to add it — an unverified app blocks everyone else.";
    case "no_refresh_token":
      return "Google did not return a reusable connection, which happens when this account already granted access. Remove Ckript at myaccount.google.com/permissions, then connect again.";
    case "bad_client_secret":
      return "The server's Google client secret was rejected. GOOGLE_OAUTH_CLIENT_SECRET does not belong to the configured client ID — an admin needs to copy the current secret from the Google Cloud Console.";
    case "redirect_uri_mismatch":
      return "Google rejected the callback URL. The redirect URI registered in the Google Cloud Console does not match the server's — check them character for character.";
    case "stale_code":
      return "That sign-in had already been used. Please connect again.";
    case "exchange_failed":
      return "Google rejected the connection and did not say why. The server log has the detail.";
    case "bad_state":
      return "That took too long and the request expired. Please try connecting again.";
    case "no_code":
    case "no_state":
      return "Google sent an incomplete response. Please try connecting again.";
    case "server_error":
      return "The server could not finish the connection. The server log has the detail.";
    default:
      return "Google could not complete the connection. Please try again.";
  }
};
