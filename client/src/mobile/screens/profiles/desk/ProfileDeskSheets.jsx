import { useId } from "react";
import Sheet from "../../../components/overlays/Sheet";
import { DeskCta } from "./ProfileDesk";
import { DeskMeter } from "./ProfileDeskParts";

/*
 * The desk's three sheets, all of them the prototype's one bottom-sheet shape:
 * grip, editorial title, a body that says what the action costs, one primary
 * action at the foot.
 *
 * They are built on the shared Sheet rather than re-implemented, because what
 * makes a sheet correct is not its corner radius — it is the focus trap, the
 * flick-to-dismiss bound to the grip only, and the footer that lifts clear of
 * the virtual keyboard. ProfileDesk.css re-shapes the surface; nothing here
 * re-implements the behaviour.
 */

const MESSAGE_LIMIT = 500;

/*
 * DeskComposeSheet — "Message Maya".
 *
 * The prototype gates sending on twenty characters. The server gates it on
 * "not empty, not over five hundred", and inventing a longer minimum here
 * would refuse a message the product accepts — "Loved it. Can we talk?" is a
 * perfectly good first contact. So the prototype's counter and hint stay and
 * the rule behind them is the real one.
 */
export function DeskComposeSheet({
  open,
  onClose,
  title,
  hint,
  value,
  onChange,
  onSend,
  pending = false,
  error = "",
  returnFocusTo = null,
  children = null,
  sendLabel = "Send message",
  /* A pitch's required part is the project, not the note, so the caller can
     say what "ready" means rather than the sheet assuming it is always text. */
  requireText = true,
  canSend = true,
}) {
  const fieldId = useId();
  const over = value.length > MESSAGE_LIMIT;
  const valid = canSend && !over && (!requireText || value.trim().length > 0);

  return (
    <Sheet
      open={open}
      onClose={pending ? null : onClose}
      title={title}
      className="ckm-desk__sheet"
      returnFocusTo={returnFocusTo}
      footer={(
        <DeskCta
          label={pending ? "Sending…" : error ? "Try again" : sendLabel}
          tone={valid ? "ink" : "quiet"}
          disabled={!valid}
          pending={pending}
          onClick={onSend}
        />
      )}
    >
      {error ? (
        <div className="ckm-desk__banner ckm-desk__banner--error" role="alert">
          <span className="material-symbols-outlined ckm-desk__banner-icon is-filled" aria-hidden="true">error</span>
          <span className="ckm-desk__banner-text">
            <span className="ckm-desk__banner-title">That didn&apos;t send</span>
            <span className="ckm-desk__banner-body">{error}</span>
          </span>
        </div>
      ) : null}

      {children}

      <label className="ckm-sr-only" htmlFor={fieldId}>{title}</label>
      <textarea
        id={fieldId}
        className={`ckm-desk__compose${over ? " ckm-desk__compose--invalid" : ""}`}
        value={value}
        placeholder={hint}
        maxLength={MESSAGE_LIMIT + 40}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="ckm-desk__compose-foot">
        <span className={`ckm-desk__hint${over ? " ckm-desk__hint--invalid" : ""}`}>
          {over ? `Trim it to ${MESSAGE_LIMIT} characters.` : "Sent as a Ckript message — your email address is never shared."}
        </span>
        <span className="ckm-desk__count">{value.length} / {MESSAGE_LIMIT}</span>
      </span>
    </Sheet>
  );
}

/*
 * DeskPickList — the project picker inside the pitch sheet.
 *
 * Rows rather than a <select>: on a phone a native select is a full-screen
 * wheel that hides the thing it belongs to, and this list is short by
 * definition (a writer's own published projects).
 */
export function DeskPickList({ options = [], value, onChange, emptyLabel = "No projects available" }) {
  if (!options.length) {
    return <p className="ckm-desk__sheet-note">{emptyLabel}</p>;
  }
  return (
    <div className="ckm-desk__picker" role="group" aria-label="Choose a project">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="ckm-desk__pick"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          <span>{option.label}</span>
          {option.value === value
            ? <span className="material-symbols-outlined is-filled" aria-hidden="true">check_circle</span>
            : null}
        </button>
      ))}
    </div>
  );
}

/*
 * DeskRevealSheet — the metered ask.
 *
 * This is the prototype's script-request sheet doing the job the product
 * actually has for it: a writer's contact details are metered by plan, the
 * meter resets, and the viewer is told what the tap will cost *before* they
 * make it. Once spent, the same sheet becomes the receipt — the details
 * themselves, addressable as mail/tel links.
 */
export function DeskRevealSheet({
  open,
  onClose,
  name,
  quota,
  contact = null,
  pending = false,
  error = "",
  onConfirm,
  returnFocusTo = null,
}) {
  const spent = Boolean(contact);
  const blocked = !spent && quota.full;

  return (
    <Sheet
      open={open}
      onClose={pending ? null : onClose}
      title={spent ? `${name}'s contact details` : `Ask for ${name}'s contact details`}
      className="ckm-desk__sheet"
      returnFocusTo={returnFocusTo}
      footer={spent ? (
        <DeskCta label="Done" tone="ink" onClick={onClose} />
      ) : (
        <DeskCta
          label={blocked ? "See plans" : error ? "Try again" : "Reveal contact · uses 1"}
          tone={blocked ? "accent" : "ink"}
          to={blocked ? "/pricing" : ""}
          pending={pending}
          onClick={blocked ? null : onConfirm}
        />
      )}
    >
      <span className="ckm-desk__eyebrow">
        <span className="ckm-desk__diamond" aria-hidden="true" />
        {spent ? "Revealed" : "Contact credit"}
      </span>

      {error ? (
        <div className="ckm-desk__banner ckm-desk__banner--error" role="alert">
          <span className="material-symbols-outlined ckm-desk__banner-icon is-filled" aria-hidden="true">error</span>
          <span className="ckm-desk__banner-text">
            <span className="ckm-desk__banner-title">Nothing was spent</span>
            <span className="ckm-desk__banner-body">{error}</span>
          </span>
        </div>
      ) : null}

      {spent ? (
        <div className="ckm-desk__contact">
          {contact.email ? (
            <a href={`mailto:${contact.email}`}>
              {contact.email}
              <span className="material-symbols-outlined" aria-hidden="true">mail</span>
            </a>
          ) : null}
          {contact.phone ? (
            <a href={`tel:${contact.phone}`}>
              {contact.phone}
              <span className="material-symbols-outlined" aria-hidden="true">call</span>
            </a>
          ) : null}
          {contact.links.map((link) => (
            <a key={link.key} href={link.url} target="_blank" rel="noreferrer">
              {link.label}
              <span className="material-symbols-outlined" aria-hidden="true">open_in_new</span>
            </a>
          ))}
          {!contact.email && !contact.phone && !contact.links.length ? (
            <p className="ckm-desk__sheet-note">This writer has not published any contact details yet.</p>
          ) : null}
        </div>
      ) : (
        <p className="ckm-desk__sheet-note">
          {blocked
            ? `You have used all ${quota.limit} contact reveals for this period. Nothing is charged and ${name} is not notified.`
            : `${name} is not notified, and nothing is charged to your card. One reveal is deducted from this period's allowance.`}
        </p>
      )}

      {quota.limit ? (
        <div className="ckm-desk__quota">
          <div className="ckm-desk__quota-row">
            <span className="ckm-desk__quota-key">Contact reveals used</span>
            <span className="ckm-desk__quota-value">{quota.label}</span>
          </div>
          <DeskMeter percent={quota.percent} label="Contact reveals used" full={quota.full} />
          <span className="ckm-desk__quota-note">
            {quota.full ? "Allowance spent for this period" : `${quota.remaining} left in this period`}
          </span>
        </div>
      ) : null}
    </Sheet>
  );
}
