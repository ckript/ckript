import { Link } from "react-router-dom";
import MobileShell from "../../../shell/MobileShell";
import "./ProfileDesk.css";

/*
 * ProfileDesk — the frame all four profile screens are built in.
 *
 * The prototype ("Ckript Profile States.dc.html") draws 2a, 2b, 2c and 2d as
 * one screen with four fillings: the same glass bar, the same identity block,
 * the same stat strip, the same segmented control, the same docked action.
 * Holding that here rather than in each screen is what keeps them one place
 * rather than four that happen to look alike.
 *
 * IT DOES NOT OPEN A SCROLL SURFACE. §8.1 allows one per screen and MobileShell
 * already owns it; the bar and the dock are `position: sticky` inside it, which
 * is also what lets the body scroll *under* the glass the way the prototype
 * shows. The bar is therefore NOT passed to the shell's `appBar` slot — that
 * slot is in layout flow, so nothing could ever pass beneath it.
 */
export default function ProfileDesk({
  mode,
  screenId,
  audience,
  bar = null,
  dock = null,
  bottomNav = null,
  overlays = null,
  onConnectionRestored = null,
  children,
}) {
  return (
    <MobileShell
      mode={mode}
      screenId={screenId}
      scrollClassName="ckm-desk__scroll"
      bottomNav={bottomNav}
      overlays={overlays}
      onConnectionRestored={onConnectionRestored}
    >
      <div
        className={[
          "ckm-desk",
          audience === "industry" ? "ckm-desk--industry" : "",
          dock ? "ckm-desk--docked" : "",
        ].filter(Boolean).join(" ")}
      >
        {bar}
        {children}
        {dock ? <div className="ckm-desk__dock">{dock}</div> : null}
      </div>
    </MobileShell>
  );
}

/*
 * DeskBar — the glass bar.
 *
 * `back` and `action` take either a `to` or an `onClick`, never both: a control
 * that navigates is a link, so it can be long-pressed, opened in a new tab and
 * read as a destination; one that changes state in place is a button. The
 * owner's bar has no back affordance because it is a root destination, and its
 * title moves to the leading edge accordingly — which is exactly what 2c and 2d
 * draw against 2a and 2b.
 */
export function DeskBar({ back = null, title = "", action = null, own = false }) {
  return (
    <div className="ckm-desk__bar">
      <div className={`ckm-desk__bar-row${own ? " ckm-desk__bar-row--own" : ""}`}>
        {back ? <DeskBarBack {...back} /> : null}
        <span className="ckm-desk__bar-title">{title}</span>
        {action ? <DeskBarAction {...action} /> : <span className="ckm-desk__bar-spacer" />}
      </div>
    </div>
  );
}

function DeskBarBack({ label = "Back", to = "", onClick = null }) {
  const content = (
    <>
      <span className="material-symbols-outlined" aria-hidden="true">arrow_back_ios_new</span>
      <span className="ckm-desk__back-label">{label}</span>
    </>
  );
  return to
    ? <Link className="ckm-desk__back" to={to}>{content}</Link>
    : <button type="button" className="ckm-desk__back" onClick={onClick}>{content}</button>;
}

function DeskBarAction({ label, icon = "", to = "", onClick = null, buttonRef = null, ...rest }) {
  const classes = icon ? "ckm-desk__bar-icon" : "ckm-desk__bar-action";
  const content = icon
    ? <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
    : label;
  const aria = icon ? label : undefined;

  return to
    ? <Link className={classes} to={to} aria-label={aria} ref={buttonRef} {...rest}>{content}</Link>
    : <button type="button" className={classes} onClick={onClick} aria-label={aria} ref={buttonRef} {...rest}>{content}</button>;
}

/*
 * DeskBanner — the strip the prototype raises above the identity block when
 * something needs saying before the profile does: a refresh that failed, a
 * hidden profile, a quota that has run out.
 *
 * `role="status"` rather than `alert`: none of these interrupt a task, and an
 * assertive announcement on every profile load would be its own defect.
 */
export function DeskBanner({ tone = "ink", icon, title, body = "", action = null }) {
  return (
    <div className={`ckm-desk__banner ckm-desk__banner--${tone}`} role="status">
      <span className="material-symbols-outlined ckm-desk__banner-icon is-filled" aria-hidden="true">{icon}</span>
      <span className="ckm-desk__banner-text">
        <span className="ckm-desk__banner-title">{title}</span>
        {body ? <span className="ckm-desk__banner-body">{body}</span> : null}
      </span>
      {action ? (
        action.to
          ? <Link className="ckm-desk__banner-action" to={action.to}>{action.label}</Link>
          : (
            <button type="button" className="ckm-desk__banner-action" onClick={action.onClick} disabled={action.pending}>
              {action.pending ? "…" : action.label}
            </button>
          )
      ) : null}
    </div>
  );
}

/*
 * DeskCta — the docked action, and the one control on the screen that is
 * allowed to cost the viewer something.
 */
export function DeskCta({
  label,
  icon = "",
  tone = "ink",
  to = "",
  onClick = null,
  disabled = false,
  pending = false,
}) {
  const classes = ["ckm-desk__cta", tone !== "ink" ? `ckm-desk__cta--${tone}` : ""]
    .filter(Boolean).join(" ");
  const content = (
    <>
      {pending
        ? <span className="ckm-desk__spinner ckm-desk__spinner--onDark" aria-hidden="true" />
        : icon
          ? <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
          : null}
      {label}
    </>
  );

  if (to && !disabled && !pending) return <Link className={classes} to={to}>{content}</Link>;

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    >
      {content}
    </button>
  );
}

/*
 * DeskState — the whole-screen refusals: private, restricted, blocked, missing,
 * unreachable. A form nobody is allowed to submit is not a form, and a profile
 * nobody is allowed to read is not a profile — so these replace the screen
 * rather than banner across the top of an empty one.
 *
 * It carries the screen's only <h1>, because in these states there is no name
 * to be the heading.
 */
export function DeskState({ icon, title, body = "", children = null }) {
  return (
    <div className="ckm-desk__state">
      <span className="material-symbols-outlined ckm-desk__state-icon" aria-hidden="true">{icon}</span>
      <h1 className="ckm-desk__state-title">{title}</h1>
      {body ? <p className="ckm-desk__state-body">{body}</p> : null}
      {children ? <div className="ckm-desk__state-actions">{children}</div> : null}
    </div>
  );
}

/*
 * DeskPortraitViewer — tapping the portrait opens it full-bleed.
 *
 * Not a Dialog: there is nothing in it to focus, nothing to fill in and nothing
 * to lose, and a focus trap around a single close button is ceremony. It is a
 * button covering the frame, so Escape is not the only way out and a tap
 * anywhere dismisses it — which is what every photo viewer on the phone does.
 */
export function DeskPortraitViewer({ open, src, name, caption = "", onClose }) {
  if (!open || !src) return null;
  return (
    <button type="button" className="ckm-desk__viewer" onClick={onClose} aria-label={`Close the photograph of ${name}`}>
      <img src={src} alt={`${name}, full size`} />
      <span className="ckm-desk__viewer-close" aria-hidden="true">
        <span className="material-symbols-outlined">close</span>
      </span>
      {caption ? <span className="ckm-desk__viewer-caption">{caption}</span> : null}
    </button>
  );
}
