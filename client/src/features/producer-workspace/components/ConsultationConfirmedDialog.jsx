import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/*
 * Shown after a professional accepts (or reschedules) a consultation. The server has already created
 * the Google Calendar event and emailed the Meet link to both sides — this is the moment to say so,
 * and to hand over the link itself so nobody has to go digging through their inbox.
 */
const COPY = {
  accepted: {
    eyebrow: "Consultation confirmed",
    title: "It's on the calendar.",
    body: (writer) =>
      `Your session with ${writer} is locked in. We've emailed the Google Meet link to you and ${writer}, and sent a calendar invite to both of you.`,
  },
  rescheduled: {
    eyebrow: "Consultation rescheduled",
    title: "New time, all set.",
    body: (writer) =>
      `${writer} has been notified. The updated time and a fresh Google Meet link are in both of your inboxes, and the calendar invite has been updated.`,
  },
};

const formatWhen = (iso) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const ConsultationConfirmedDialog = ({ open, variant = "accepted", consultation, onClose }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setCopied(false);
    const onKeyDown = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !consultation) return null;

  const copy = COPY[variant] || COPY.accepted;
  const writerName = consultation.writer?.name || "the writer";
  const meetUrl = consultation.googleMeetUrl || "";
  const meetLabel = meetUrl.replace(/^https?:\/\//, "");

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(meetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link is still visible and selectable */
    }
  };

  return createPortal(
    <div className="ck-ledger-portal ck-ledger-portal--dialog">
      <button type="button" className="ck-ledger-portal__scrim" aria-label="Close dialog" onClick={onClose} />

      <div className="ck-ledger-dialog ck-consult-ok" role="dialog" aria-modal="true" aria-label={copy.title}>
        <div className="ck-consult-ok__badge" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path className="ck-consult-ok__tick" d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>

        <div className="ck-ledger-dialog__head ck-consult-ok__head">
          <p className="ck-ledger-dialog__eyebrow ck-consult-ok__eyebrow">{copy.eyebrow}</p>
          <h2 className="ck-ledger-dialog__title">{copy.title}</h2>
          <p className="ck-ledger-dialog__body">{copy.body(writerName)}</p>
        </div>

        <dl className="ck-consult-ok__details">
          {consultation.topic && (
            <div><dt>Topic</dt><dd>{consultation.topic}</dd></div>
          )}
          {consultation.scheduledStart && (
            <div><dt>When</dt><dd>{formatWhen(consultation.scheduledStart)}</dd></div>
          )}
          {consultation.duration && (
            <div><dt>Duration</dt><dd>{consultation.duration} minutes</dd></div>
          )}
          <div><dt>With</dt><dd>{writerName}</dd></div>
        </dl>

        {meetUrl && (
          <div className="ck-consult-ok__meet">
            <span className="ck-consult-ok__meet-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="6" width="13" height="12" rx="2.5" />
                <path d="M16 10.5l5-3v9l-5-3" />
              </svg>
            </span>
            <a href={meetUrl} target="_blank" rel="noreferrer" className="ck-consult-ok__meet-link">{meetLabel}</a>
            <button type="button" onClick={copyLink} className="ck-consult-ok__copy">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}

        <div className="ck-ledger-dialog__foot">
          <button type="button" onClick={onClose}>Done</button>
          {meetUrl && (
            <a href={meetUrl} target="_blank" rel="noreferrer" className="ck-consult-ok__join">
              Join Google Meet
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ConsultationConfirmedDialog;
