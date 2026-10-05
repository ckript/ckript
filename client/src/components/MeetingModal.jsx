import { useContext, useEffect, useRef, useState } from "react";
import api from "../services/api";
import { AuthContext } from "../context/AuthContext";
import { POPUP_NAME, POPUP_MARKER, onCalendarPopupResult, describeCalendarFailure } from "../utils/googleCalendarPopup";

// Producer's IANA timezone (e.g. "Asia/Kolkata"). Google localizes the event per-attendee from this.
const detectTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const MeetingModal = ({ isOpen, onClose, writerId, scriptId, writerName, scriptName, onMeetingScheduled }) => {
  const { user, setUser } = useContext(AuthContext);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("30");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  // Server can also report a dead connection at submit time (428) — flip to the connect view then.
  const [needsCalendar, setNeedsCalendar] = useState(false);

  // The server's answer, which outranks the AuthContext user. null = not asked yet.
  const [liveConnected, setLiveConnected] = useState(null);
  const pollRef = useRef(null);
  const stopListeningRef = useRef(null);

  const timeZone = detectTimeZone();
  const prettyTz = timeZone.replace(/_/g, " ");

  /* Ask the SERVER whether the calendar is connected, every time the modal opens.
     The AuthContext user is hydrated from localStorage, written at login — it cannot know about a
     calendar connected afterwards. Trusting it meant a producer who had just connected reopened this
     modal and was asked to connect again, forever: connect, come back, connect, nothing. */
  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const { data } = await api.get("/google-calendar/status");
        if (cancelled) return;
        const connected = Boolean(data?.connected);
        setLiveConnected(connected);
        setNeedsCalendar(false);
        if (data?.configured === false) {
          setErrorMsg("Google Calendar is not configured on the server.");
        }
        // Keep the rest of the app in step, so other surfaces stop disagreeing with this one.
        if (user && Boolean(user?.googleCalendar?.connected) !== connected) {
          setUser({
            ...user,
            googleCalendar: { connected, calendarEmail: data?.calendarEmail || "" },
          });
        }
      } catch {
        // Offline or the endpoint failed: fall back to what we last knew rather than blocking.
        if (!cancelled) setLiveConnected(Boolean(user?.googleCalendar?.connected));
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Stop polling if the modal goes away mid-connect.
  useEffect(() => () => {
    clearInterval(pollRef.current);
    stopListeningRef.current?.();
  }, []);

  const resolvedConnected = liveConnected === null ? Boolean(user?.googleCalendar?.connected) : liveConnected;
  const calendarConnected = resolvedConnected && !needsCalendar;

  if (!isOpen) return null;

  /* Consent runs in a POPUP, not a full-page redirect.
     Redirecting navigated away from this modal, and a modal is React state — it does not survive the
     round trip. The producer consented at Google, was returned to the page, and found the scheduling
     form gone with nothing to say why. A popup leaves the modal mounted, so when consent lands we can
     drop straight into the form. Falls back to the old redirect if the popup is blocked. */
  const startConnect = async () => {
    setErrorMsg("");
    try {
      setConnecting(true);
      const plainReturnTo = `${window.location.pathname}${window.location.search}`;
      // The POPUP's return URL carries the marker that lets it recognise itself — window.name does
      // not survive Google's COOP context-group swap, so the URL is the only reliable carrier.
      const sep = plainReturnTo.includes("?") ? "&" : "?";
      const { data } = await api.post("/google-calendar/auth-url", {
        returnTo: `${plainReturnTo}${sep}${POPUP_MARKER}=1`,
      });
      if (!data?.url) {
        setErrorMsg("Google Calendar is not available right now.");
        setConnecting(false);
        return;
      }

      const popup = window.open(data.url, POPUP_NAME, "width=520,height=680");
      if (!popup) {
        // Popup blocked — fall back to the old full-page redirect, with a URL whose returnTo does
        // NOT carry the marker: this navigation is the MAIN tab, and a main tab landing on a marker
        // URL would try to close itself.
        try {
          const { data: fallback } = await api.post("/google-calendar/auth-url", { returnTo: plainReturnTo });
          window.location.href = fallback?.url || data.url;
        } catch {
          window.location.href = data.url;
        }
        return;
      }

      const finish = (connected) => {
        clearInterval(pollRef.current);
        stopListeningRef.current?.();
        stopListeningRef.current = null;
        setConnecting(false);
        if (!connected) return;
        try { popup.close(); } catch { /* already gone */ }
        setLiveConnected(true);
        setNeedsCalendar(false);
        if (user) setUser({ ...user, googleCalendar: { ...(user.googleCalendar || {}), connected: true } });
      };

      // The popup announces itself through storage on the way back — see utils/googleCalendarPopup.
      stopListeningRef.current?.();
      stopListeningRef.current = onCalendarPopupResult((status, reason) => {
        if (status === "connected") return finish(true);
        finish(false);
        setErrorMsg(describeCalendarFailure(reason));
      });

      /* Polling is the backstop, and asks OUR server rather than the popup.
         `popup.closed` is deliberately never read: Google's consent pages send
         Cross-Origin-Opener-Policy, which severs the opener link and makes that property report
         `true` from the moment it opens. Reading it announced a cancellation about a second in,
         while the producer was still looking at the consent screen. There is no reliable way to see
         a cancellation through COOP, so an abandoned popup simply times out. */
      const startedAt = Date.now();
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        let connected = false;
        try {
          const { data: s } = await api.get("/google-calendar/status");
          connected = Boolean(s?.connected);
        } catch {
          /* transient — keep polling */
        }

        if (connected) return finish(true);

        if (Date.now() - startedAt > 2 * 60 * 1000) {
          finish(false);
          setErrorMsg("Still not connected. Finish the Google window, or try again.");
        }
      }, 1500);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || "Couldn't start Google Calendar connection.");
      setConnecting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!title || !date || !time || !duration) {
      setErrorMsg("Please fill in all required fields.");
      return;
    }

    try {
      setLoading(true);
      const response = await api.post(`/meetings`, {
        writerId,
        scriptId,
        title,
        scheduledDate: date,
        scheduledTime: time,
        duration: parseInt(duration, 10),
        timeZone,
        message,
      });

      setSuccessMsg("Meeting requested successfully!");
      if (onMeetingScheduled) onMeetingScheduled(response.data);
      setTimeout(() => {
        onClose();
        setSuccessMsg("");
      }, 1500);
    } catch (err) {
      console.error(err);
      if (err.response?.status === 428 || err.response?.data?.needsCalendar) {
        setNeedsCalendar(true); // connection expired/missing → show connect view
      } else if (err.response?.data?.limitReached) {
        setErrorMsg("You have reached your scheduled meetings limit.");
      } else {
        setErrorMsg(err.response?.data?.message || "Failed to request meeting.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div
        className="w-full max-w-md bg-white dark:bg-[#0B0A06] border border-[#e4e2dc] dark:border-[#1A1813] rounded-2xl shadow-xl overflow-hidden animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[#e4e2dc] dark:border-[#1A1813]">
          <h2 className="text-xl font-bold font-serif text-[#0B0A06] dark:text-[#f3f2ee]">Schedule Meeting</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:!text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!calendarConnected ? (
          // ── Connect gate: meetings are Google Calendar events, so require a connection first ──
          <div className="p-6 space-y-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-[#D14D37]/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-[#D14D37]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B0A06] dark:text-[#f3f2ee]">Connect Google Calendar</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Meetings are created as Google Calendar events with a Meet link, so both you and the writer get
                the invite in your own timezone. Connect your calendar once to start scheduling.
              </p>
            </div>
            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm font-medium">
                {errorMsg}
              </div>
            )}
            <button
              type="button"
              onClick={startConnect}
              disabled={connecting}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#D14D37] hover:bg-[#b53c29] !text-white font-semibold rounded-lg transition-all shadow-md disabled:opacity-70"
            >
              {connecting ? "Redirecting to Google…" : "Connect Google Calendar"}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Meeting with <strong className="text-[#0B0A06] dark:text-[#f3f2ee]">{writerName}</strong> about <strong>{scriptName}</strong>.
            </p>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm font-medium">
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
                {successMsg}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-[#0B0A06] dark:text-[#f3f2ee] mb-1">
                Meeting Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-[#11100C] border border-[#e4e2dc] dark:border-[#2C2A26] rounded-lg text-gray-900 dark:!text-white dark:[color-scheme:dark] placeholder-gray-500 dark:!placeholder-white focus:ring-2 focus:ring-[#D14D37] focus:border-transparent outline-none transition-all"
                placeholder="e.g. Script Review & Deal Discussion"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-[#0B0A06] dark:text-[#f3f2ee] mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  required
                  min={new Date().toISOString().split("T")[0]}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-[#11100C] border border-[#e4e2dc] dark:border-[#2C2A26] rounded-lg text-gray-900 dark:!text-white dark:[color-scheme:dark] placeholder-gray-500 dark:!placeholder-white focus:ring-2 focus:ring-[#D14D37] outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#0B0A06] dark:text-[#f3f2ee] mb-1">
                  Time *
                </label>
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-[#11100C] border border-[#e4e2dc] dark:border-[#2C2A26] rounded-lg text-gray-900 dark:!text-white dark:[color-scheme:dark] placeholder-gray-500 dark:!placeholder-white focus:ring-2 focus:ring-[#D14D37] outline-none transition-all"
                />
              </div>
            </div>

            {/* Timezone the meeting is being booked in — Google converts to each attendee's zone. */}
            <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">
              Scheduling in your timezone: <strong className="text-gray-700 dark:text-gray-300">{prettyTz}</strong>. The writer will see it in theirs.
            </p>

            <div>
              <label className="block text-sm font-semibold text-[#0B0A06] dark:text-[#f3f2ee] mb-1">
                Duration *
              </label>
              <select
                required
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-[#11100C] border border-[#e4e2dc] dark:border-[#2C2A26] rounded-lg text-gray-900 dark:!text-white dark:[color-scheme:dark] placeholder-gray-500 dark:!placeholder-white focus:ring-2 focus:ring-[#D14D37] outline-none transition-all"
              >
                <option value="30">30 Minutes</option>
                <option value="60">1 Hour</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#0B0A06] dark:text-[#f3f2ee] mb-1">
                Optional Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-[#11100C] border border-[#e4e2dc] dark:border-[#2C2A26] rounded-lg text-gray-900 dark:!text-white dark:[color-scheme:dark] placeholder-gray-500 dark:!placeholder-white focus:ring-2 focus:ring-[#D14D37] outline-none transition-all resize-none"
                placeholder="Any details to share beforehand?"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#D14D37] hover:bg-[#b53c29] !text-white font-semibold rounded-lg transition-all shadow-md disabled:opacity-70"
              >
                {loading ? (
                  <svg className="w-5 h-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  "Send Meeting Request"
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default MeetingModal;
