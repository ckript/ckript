import { useCallback, useId, useRef } from "react";
import { Link } from "react-router-dom";
import { resolveMediaUrl } from "../../../../utils/mediaUrl";

/*
 * The pieces the four profile screens are assembled from, in the order the
 * prototype stacks them: identity, actions, stat strip, owner cards, segmented
 * control, panel. Every one is presentational — no fetching, no routing
 * decisions, no role tests. Which pieces a screen shows is the screen's
 * business; how they look is this file's.
 */

/* --- Identity ------------------------------------------------------------ */

/*
 * The screen's ONE <h1> is the profile's name. Not "Profile", not "Workspace":
 * the heading a screen reader reads first should be the thing the screen is
 * about, and on a profile that is a person.
 */
export function DeskIdentity({
  name,
  image = "",
  verified = false,
  role = "",
  status = null,
  onPortrait = null,
  editable = false,
  titleId,
}) {
  const src = image ? resolveMediaUrl(image) : "";
  const portrait = (
    <>
      {src
        ? <img src={src} alt="" />
        : <span className="ckm-desk__portrait-initial" aria-hidden="true">{name.charAt(0)}</span>}
      {editable ? (
        <span className="ckm-desk__portrait-badge" aria-hidden="true">
          <span className="material-symbols-outlined is-filled">photo_camera</span>
        </span>
      ) : null}
    </>
  );

  return (
    <div className="ckm-desk__identity">
      {onPortrait ? (
        <button
          type="button"
          className="ckm-desk__portrait"
          onClick={onPortrait}
          aria-label={editable ? "Change your profile photo" : `View the photograph of ${name}`}
        >
          {portrait}
        </button>
      ) : (
        <span className="ckm-desk__portrait">{portrait}</span>
      )}

      <div className="ckm-desk__who">
        <span className="ckm-desk__name-row">
          <h1 className="ckm-desk__name" id={titleId}>{name}</h1>
          {verified ? (
            <span className="material-symbols-outlined ckm-desk__verified is-filled" title="Verified member">
              verified
              <span className="ckm-sr-only">Verified member</span>
            </span>
          ) : null}
        </span>
        {role ? <span className="ckm-desk__role">{role}</span> : null}
        {/* Owner screens pass a status with no label: 2c and 2d put the
            availability dot on the switch that controls it, and repeating it
            under the name would state the same fact twice — once as a reading
            and once as a control that disagrees with it while it saves. */}
        {status?.label || status?.meta ? (
          <span className="ckm-desk__status">
            {status.label ? (
              <>
                <span className={`ckm-desk__dot${status.on ? " ckm-desk__dot--on" : ""}`} aria-hidden="true" />
                <span className={`ckm-desk__status-label${status.on ? " ckm-desk__status-label--on" : ""}`}>
                  {status.label}
                </span>
              </>
            ) : null}
            {status.meta
              ? <span className="ckm-desk__handle">{status.label ? `· ${status.meta}` : status.meta}</span>
              : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* --- The action row ------------------------------------------------------ */

export const DeskActions = ({ children }) => <div className="ckm-desk__actions">{children}</div>;

export function DeskAct({
  label,
  icon = "",
  solid = false,
  iconOnly = false,
  to = "",
  onClick = null,
  disabled = false,
  pending = false,
  buttonRef = null,
  ...rest
}) {
  const classes = [
    "ckm-desk__act",
    solid ? "ckm-desk__act--solid" : "",
    iconOnly ? "ckm-desk__act--icon" : "",
  ].filter(Boolean).join(" ");

  const content = (
    <>
      {icon ? <span className="material-symbols-outlined" aria-hidden="true">{icon}</span> : null}
      {iconOnly ? null : <span>{pending ? "…" : label}</span>}
    </>
  );

  if (to && !disabled) {
    return <Link className={classes} to={to} aria-label={iconOnly ? label : undefined} {...rest}>{content}</Link>;
  }
  return (
    <button
      ref={buttonRef}
      type="button"
      className={classes}
      onClick={onClick}
      disabled={disabled || pending}
      aria-label={iconOnly ? label : undefined}
      aria-busy={pending || undefined}
      {...rest}
    >
      {content}
    </button>
  );
}

/* --- The stat strip ------------------------------------------------------ */

/*
 * Two or three cells, and a cell is a button only when it has somewhere to go —
 * the prototype's "Scripts" cell selects the Scripts tab, its "Reads" cell does
 * nothing, and dressing the second as tappable would be a lie.
 */
export function DeskStats({ cells = [], onSelect = null, label = "Profile totals" }) {
  if (!cells.length) return null;

  return (
    <div className="ckm-desk__stats" role="group" aria-label={label}>
      {cells.map((cell, index) => (
        <DeskStatCell
          key={cell.key}
          cell={cell}
          first={index === 0}
          onSelect={cell.tab && onSelect ? onSelect : null}
        />
      ))}
    </div>
  );
}

function DeskStatCell({ cell, first, onSelect }) {
  const body = (
    <>
      <span className="ckm-desk__stat-value">{cell.value}</span>
      <span className="ckm-desk__stat-label">{cell.label}</span>
    </>
  );
  const classes = `ckm-desk__stat${cell.accent ? " ckm-desk__stat--accent" : ""}`;

  return (
    <>
      {first ? null : <span className="ckm-desk__stat-rule" aria-hidden="true" />}
      {onSelect ? (
        <button type="button" className={classes} onClick={() => onSelect(cell.tab)}>{body}</button>
      ) : (
        <span className={classes}>{body}</span>
      )}
    </>
  );
}

/* --- Owner cards --------------------------------------------------------- */

/*
 * The visibility switch. `role="switch"` with `aria-checked` rather than a
 * checkbox: it takes effect the moment it is tapped — there is no form to
 * submit — and that is precisely the distinction the role exists to draw.
 */
export function DeskSwitchRow({ label, note, checked, pending = false, onChange, controlLabel }) {
  return (
    <div className="ckm-desk__card">
      <span className="ckm-desk__card-text">
        <span className="ckm-desk__card-lead">
          <span className={`ckm-desk__dot${checked ? " ckm-desk__dot--on" : ""}`} aria-hidden="true" />
          <span className={`ckm-desk__status-label${checked ? " ckm-desk__status-label--on" : ""}`}>{label}</span>
        </span>
        <span className="ckm-desk__card-note">{note}</span>
      </span>
      <button
        type="button"
        role="switch"
        className="ckm-desk__switch"
        aria-checked={checked}
        aria-label={controlLabel || label}
        disabled={pending}
        onClick={() => onChange(!checked)}
      >
        <span className="ckm-desk__switch-knob" />
      </button>
    </div>
  );
}

export function DeskProgress({ percent, label, cta, onClick }) {
  return (
    <button type="button" className="ckm-desk__progress" onClick={onClick}>
      <span className="ckm-desk__progress-row">
        <span className="ckm-desk__progress-label">{label}</span>
        <span className="ckm-desk__progress-cta">
          {cta}
          <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
        </span>
      </span>
      <DeskMeter percent={percent} label={label} />
    </button>
  );
}

export function DeskMeter({ percent, label, full = false }) {
  return (
    <span
      className="ckm-desk__meter"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <span
        className={`ckm-desk__meter-fill${full ? " ckm-desk__meter-fill--full" : ""}`}
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}

/* --- The segmented control ----------------------------------------------- */

/*
 * A real tablist, so left/right arrows move between tabs and a screen reader
 * announces "tab 2 of 3". Roving tabindex keeps the whole control one Tab stop,
 * which is the APG's tabs pattern and the behaviour a phone keyboard user gets
 * from every other segmented control in this app.
 */
export function DeskTabList({ tabs, value, onChange, label = "Profile sections", baseId }) {
  const fallbackId = useId();
  const id = baseId || fallbackId;
  const listRef = useRef(null);

  const onKeyDown = useCallback((event) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.key === value);
    const next = tabs[(index + step + tabs.length) % tabs.length];
    onChange(next.key);
    listRef.current?.querySelector(`#${CSS.escape(`${id}-tab-${next.key}`)}`)?.focus();
  }, [id, onChange, tabs, value]);

  return (
    <div className="ckm-desk__tabs" role="tablist" aria-label={label} ref={listRef} onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
        const selected = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`${id}-tab-${tab.key}`}
            className="ckm-desk__tab"
            aria-selected={selected}
            aria-controls={`${id}-panel-${tab.key}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
          >
            {tab.label}
            {tab.count ? <span className="ckm-desk__tab-count">{tab.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function DeskPanel({ tabKey, baseId, rows = false, children }) {
  return (
    <div
      className={`ckm-desk__panel${rows ? " ckm-desk__panel--rows" : ""}`}
      role="tabpanel"
      id={`${baseId}-panel-${tabKey}`}
      aria-labelledby={`${baseId}-tab-${tabKey}`}
      tabIndex={0}
    >
      {children}
    </div>
  );
}

/* --- Lists --------------------------------------------------------------- */

export const DeskLabel = ({ first = false, children }) => (
  <span className={`ckm-desk__label${first ? " ckm-desk__label--first" : ""}`}>{children}</span>
);

export const DeskList = ({ tall = false, children }) => (
  <div className={`ckm-desk__list${tall ? " ckm-desk__list--tall" : ""}`}>{children}</div>
);

/*
 * A key/value row, optionally tappable — the About panel's "Based in ›" rows
 * and the owner's manage rows are the same shape with a different payload.
 *
 * `to` is an in-app route and `href` is somebody else's website; they are
 * separate props rather than one clever one, because a router Link handed an
 * absolute URL silently produces a relative href and the link quietly breaks.
 */
export function DeskFactRow({ label, value, pill = null, to = null, href = null, onClick = null, chevron = false }) {
  const body = (
    <>
      <span className="ckm-desk__row-key">{label}</span>
      <span className="ckm-desk__row-value">
        {value ? <span className="ckm-desk__row-link">{value}</span> : null}
        {pill ? <span className={`ckm-desk__row-pill${pill.tone ? ` ckm-desk__row-pill--${pill.tone}` : ""}`}>{pill.label}</span> : null}
        {chevron ? <span className="material-symbols-outlined ckm-desk__chevron" aria-hidden="true">chevron_right</span> : null}
      </span>
    </>
  );

  if (to) return <Link className="ckm-desk__row ckm-desk__row--tappable" to={to}>{body}</Link>;
  if (href) {
    return (
      <a className="ckm-desk__row ckm-desk__row--tappable" href={href} target="_blank" rel="noreferrer">
        {body}
      </a>
    );
  }
  if (onClick) return <button type="button" className="ckm-desk__row ckm-desk__row--tappable" onClick={onClick}>{body}</button>;
  return <div className="ckm-desk__row">{body}</div>;
}

/* A stacked row: title over caption, with an optional trailing pill. */
export function DeskStackRow({
  title,
  meta = "",
  score = "",
  pill = null,
  to = null,
  onClick = null,
  chevron = false,
  /* The owner's rows carry a second control. A button inside a link is invalid
     and untappable on iOS, so when `onMore` is present the row becomes a flex
     container holding two separate controls rather than one wrapping the other. */
  onMore = null,
  moreLabel = "Options",
}) {
  const body = (
    <>
      <span className="ckm-desk__row-main">
        <span className="ckm-desk__row-title-line">
          <span className="ckm-desk__row-title">{title}</span>
          {pill ? (
            <span className={`ckm-desk__row-pill${pill.tone ? ` ckm-desk__row-pill--${pill.tone}` : ""}`}>
              {pill.label}
            </span>
          ) : null}
        </span>
        {meta ? <span className="ckm-desk__row-meta">{meta}</span> : null}
      </span>
      {score ? <span className="ckm-desk__row-score">{score}</span> : null}
      {chevron ? <span className="material-symbols-outlined ckm-desk__chevron" aria-hidden="true">chevron_right</span> : null}
    </>
  );

  if (onMore) {
    return (
      <div className="ckm-desk__row ckm-desk__row--split">
        {to
          ? <Link className="ckm-desk__row-open" to={to}>{body}</Link>
          : <button type="button" className="ckm-desk__row-open" onClick={onClick}>{body}</button>}
        <button type="button" className="ckm-desk__row-more" onClick={onMore} aria-label={moreLabel}>
          <span className="material-symbols-outlined" aria-hidden="true">more_horiz</span>
        </button>
      </div>
    );
  }

  if (to) return <Link className="ckm-desk__row ckm-desk__row--tappable" to={to}>{body}</Link>;
  if (onClick) return <button type="button" className="ckm-desk__row ckm-desk__row--tappable" onClick={onClick}>{body}</button>;
  return <div className="ckm-desk__row">{body}</div>;
}

/* --- The owner's inbox --------------------------------------------------- */

/*
 * One card for every kind of ask.
 *
 * A meeting request and a follow request are the same event — somebody asked,
 * you answer, the answer is final — so they are one card rather than two lists
 * the owner has to learn separately. What differs is only what the ask is
 * about, and that is a line of text.
 *
 * A settled ask keeps its place with its outcome on it. Removing it the moment
 * it is answered is the version where a mis-tap is silent and unrecoverable.
 */
export function DeskRequestCard({ item, pending = false, disabled = false, onDecide }) {
  const settled = !item.canDecide;
  return (
    <article className="ckm-desk__ask">
      <div className="ckm-desk__ask-head">
        {item.image || item.kind === "follow" ? (
          <span className="ckm-desk__ask-avatar" aria-hidden="true">
            {item.image
              ? <img src={resolveMediaUrl(item.image)} alt="" loading="lazy" />
              : <span>{item.name.charAt(0)}</span>}
          </span>
        ) : (
          <span className="ckm-desk__ask-glyph" aria-hidden="true">
            <span className="material-symbols-outlined">videocam</span>
          </span>
        )}
        <span className="ckm-desk__ask-who">
          <span className="ckm-desk__ask-name">
            {item.profilePath ? <Link to={item.profilePath}>{item.name}</Link> : item.name}
          </span>
          {item.detail ? <span className="ckm-desk__ask-detail">{item.detail}</span> : null}
        </span>
        {item.when ? <span className="ckm-desk__ask-when">{item.when}</span> : null}
      </div>

      {item.subject ? <p className="ckm-desk__ask-subject">{item.subject}</p> : null}
      {item.message ? <p className="ckm-desk__ask-message">&ldquo;{item.message}&rdquo;</p> : null}

      {settled ? (
        <DeskAskOutcome item={item} />
      ) : (
        <div className="ckm-desk__ask-actions">
          <button
            type="button"
            className="ckm-desk__ask-accept"
            disabled={disabled || pending}
            aria-busy={pending || undefined}
            onClick={() => onDecide(item, true)}
          >
            {pending ? "…" : item.kind === "follow" ? "Accept" : "Accept meeting"}
          </button>
          <button
            type="button"
            className="ckm-desk__ask-decline"
            disabled={disabled || pending}
            onClick={() => onDecide(item, false)}
          >
            Decline
          </button>
        </div>
      )}
    </article>
  );
}

function DeskAskOutcome({ item }) {
  if (item.state === "accepted") {
    return (
      <span className="ckm-desk__ask-outcome ckm-desk__ask-outcome--go">
        <span className="material-symbols-outlined is-filled" aria-hidden="true">check_circle</span>
        Accepted
        {item.joinUrl ? (
          <a className="ckm-desk__ask-join" href={item.joinUrl} target="_blank" rel="noreferrer">Join</a>
        ) : null}
      </span>
    );
  }
  if (item.state === "declined") {
    return (
      <span className="ckm-desk__ask-outcome">
        <span className="material-symbols-outlined is-filled" aria-hidden="true">cancel</span>
        Declined
      </span>
    );
  }
  return (
    <span className="ckm-desk__ask-outcome">
      <span className="material-symbols-outlined is-filled" aria-hidden="true">schedule</span>
      Waiting on them
    </span>
  );
}

export const DeskCaughtUp = ({ children }) => (
  <p className="ckm-desk__caught-up">
    <span className="material-symbols-outlined is-filled" aria-hidden="true">done_all</span>
    {children}
  </p>
);

// A chip is a string, or `{ label, imageUrl }` for a badge that carries the competition's artwork.
export const DeskChips = ({ values = [] }) => (values.length ? (
  <div className="ckm-desk__chips">
    {values.map((value) => {
      const item = typeof value === "string" ? { label: value } : value || {};
      return (
        <span className="ckm-desk__chip" key={item.label}>
          {item.imageUrl ? <img src={item.imageUrl} alt="" style={{ width: 18, height: 18, objectFit: "contain", verticalAlign: "middle", marginRight: 6 }} /> : null}
          {item.label}
        </span>
      );
    })}
  </div>
) : null);

/* --- Project cards ------------------------------------------------------- */

/*
 * The lead card and the two-up grid below it, exactly as 2a draws them. The
 * newest project takes the wide card; everything after it goes in the grid.
 *
 * A project without cover art gets its genre set in the display face rather
 * than a stock photograph: an invented still would be a claim about a script
 * nobody has read.
 */
export function DeskLeadProject({ project, to, flag = "" }) {
  const cover = project.cover ? resolveMediaUrl(project.cover) : "";
  return (
    <Link className="ckm-desk__lead" to={to}>
      <span className="ckm-desk__frame">
        {cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : null}
        <span className="ckm-desk__scrim" />
        {flag ? <span className="ckm-desk__flag">{flag}</span> : null}
        <span className="ckm-desk__caption">
          <span className="ckm-desk__caption-title">{project.title}</span>
          <span className="ckm-desk__caption-meta">{project.meta}</span>
        </span>
      </span>
    </Link>
  );
}

export const DeskProjectGrid = ({ children }) => <div className="ckm-desk__grid">{children}</div>;

export function DeskProjectTile({ project, to }) {
  const cover = project.cover ? resolveMediaUrl(project.cover) : "";
  return (
    <Link className="ckm-desk__tile" to={to}>
      <span className="ckm-desk__tile-frame">
        {cover
          ? <img src={cover} alt="" loading="lazy" decoding="async" />
          : <span className="ckm-desk__tile-fallback" aria-hidden="true">{project.genre}</span>}
        {project.badge ? <span className="ckm-desk__tile-badge">{project.badge}</span> : null}
      </span>
      <span className="ckm-desk__tile-body">
        <span className="ckm-desk__tile-title">{project.title}</span>
        <span className="ckm-desk__tile-meta">{project.genre}</span>
      </span>
    </Link>
  );
}

/* --- Empty, loading ------------------------------------------------------ */

export function DeskEmpty({ icon, title, body, action = null }) {
  return (
    <div className="ckm-desk__empty">
      <span className="material-symbols-outlined ckm-desk__empty-icon" aria-hidden="true">{icon}</span>
      <p className="ckm-desk__empty-title">{title}</p>
      <p className="ckm-desk__empty-body">{body}</p>
      {action ? (
        action.to
          ? <Link className={`ckm-desk__empty-action${action.quiet ? " ckm-desk__empty-action--quiet" : ""}`} to={action.to}>{action.label}</Link>
          : <button type="button" className={`ckm-desk__empty-action${action.quiet ? " ckm-desk__empty-action--quiet" : ""}`} onClick={action.onClick}>{action.label}</button>
      ) : null}
    </div>
  );
}

/*
 * The loading shape mirrors the panel it will become — a lead card over a grid
 * for the writer's shelf, stacked rows for a list — so the layout does not jump
 * when the data lands.
 */
export function DeskLoading({ shape = "rows", label = "Loading…" }) {
  return (
    <div className="ckm-desk__loading">
      {shape === "shelf" ? (
        <>
          <div className="ckm-desk__bone ckm-desk__bone--lead" />
          <div className="ckm-desk__bones-grid">
            <div className="ckm-desk__bone" />
            <div className="ckm-desk__bone" />
          </div>
        </>
      ) : shape === "cards" ? (
        <>
          <div className="ckm-desk__bone ckm-desk__bone--card" />
          <div className="ckm-desk__bone ckm-desk__bone--card" />
        </>
      ) : (
        <>
          <div className="ckm-desk__bone ckm-desk__bone--row" />
          <div className="ckm-desk__bone ckm-desk__bone--row" />
          <div className="ckm-desk__bone ckm-desk__bone--row" />
        </>
      )}
      <p className="ckm-desk__spinner-row" role="status">
        <span className="ckm-desk__spinner" aria-hidden="true" />
        {label}
      </p>
    </div>
  );
}
