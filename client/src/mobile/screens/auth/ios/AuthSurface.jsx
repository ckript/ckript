import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import useInputModality from "../../../hooks/useInputModality";
import MobileShell from "../../../shell/MobileShell";
import "./AuthSurface.css";

/*
 * AuthSurface — the frame every account-entry screen is built in.
 *
 * The five screens share a shape, and holding it here rather than in each of
 * them is what keeps the family reading as one place rather than five that
 * happen to look similar:
 *
 *   • the bar: a back affordance, a title that fades in only once the display
 *     heading has scrolled away, and one trailing action;
 *   • the editorial lockup (rule + eyebrow, Spectral display, italic lede);
 *   • ONE <h1> per screen, focused when the screen changes so a screen reader
 *     is told the surface moved and a keyboard user is not left behind;
 *   • a docked footer holding the ONE primary action, sticky at the bottom of
 *     the shell's own scroll surface.
 *
 * IT DOES NOT OPEN A SCROLL SURFACE. §8.1 allows one per screen, and the shell
 * already owns it. The bar and the footer are `position: sticky` inside it —
 * see AuthSurface.css. `scrollProps.onScroll` is how the bar learns it has
 * content above it, and it is the shell's surface reporting, not a second one.
 */

/* Whether the screen's body has scrolled under the bar. Context rather than a
   prop because the bar is passed to the surface as a node, so the surface
   cannot hand it a value directly. Not exported: the bar is the only reader,
   and a second one would mean the state belongs somewhere else. */
const ScrolledContext = createContext(false);
const useAuthScrolled = () => useContext(ScrolledContext);

/* The scroll offset at which the compact title appears. Small enough to feel
   immediate, large enough that a rubber-band bounce at the top does not flash
   the title on and off. */
const TITLE_REVEAL_AT = 10;

export default function AuthSurface({
  screenId,
  mode,
  tone = "light",
  nav = null,
  overlays = null,
  footer = null,
  footerStyle = undefined,
  flush = false,
  labelledBy = "",
  bodyClassName = "",
  className = "",
  children,
}) {
  const [scrolled, setScrolled] = useState(false);
  /* Published on the surface so the stylesheet can spend the focus ring on the
     person who needs it — see useInputModality and `[data-input]` in
     AuthControls.css. */
  const inputModality = useInputModality();

  const onScroll = useCallback((event) => {
    const next = event.target.scrollTop > TITLE_REVEAL_AT;
    setScrolled((current) => (current === next ? current : next));
  }, []);

  const scrollProps = useMemo(() => ({ onScroll }), [onScroll]);

  return (
    <MobileShell
      mode={mode}
      screenId={screenId}
      scrollClassName="ckm-auth__scroll"
      scrollProps={scrollProps}
      overlays={overlays}
    >
      <ScrolledContext.Provider value={scrolled}>
        <section
          className={["ckm-auth", tone === "dark" ? "ckm-auth--dark" : "", className]
            .filter(Boolean).join(" ")}
          aria-labelledby={labelledBy || undefined}
          data-input={inputModality}
        >
          {nav}
          <div
            className={["ckm-auth__body", flush ? "ckm-auth__body--flush" : "", bodyClassName]
              .filter(Boolean).join(" ")}
          >
            {children}
          </div>
          {footer && <div className="ckm-auth__foot" style={footerStyle}>{footer}</div>}
        </section>
      </ScrolledContext.Provider>
    </MobileShell>
  );
}

/*
 * AuthNav — the bar.
 *
 * `back` and `action` each take either a `to` (a route) or an `onClick`, never
 * both: an affordance that navigates should be a link so it can be opened in a
 * new tab, long-pressed and read as a destination, and one that changes state
 * in place should be a button. Deciding per call site rather than rendering a
 * button that calls navigate() is what keeps that honest.
 *
 * `glass` is the translucent bar: correct over a body that scrolls beneath it,
 * wrong under the stepper's progress rail, which needs an opaque ground.
 */
export function AuthNav({
  back = null,
  title = "",
  caption = "",
  action = null,
  glass = false,
  children = null,
}) {
  const scrolled = useAuthScrolled();

  return (
    <div
      className={["ckm-auth__nav", glass ? "ckm-auth__nav--glass" : "", scrolled ? "is-scrolled" : ""]
        .filter(Boolean).join(" ")}
    >
      <div className="ckm-auth__nav-row">
        <div className="ckm-auth__nav-slot">
          {back ? <AuthNavControl className="ckm-auth__back" {...back} icon="arrow_back_ios_new" /> : null}
        </div>

        {caption
          ? <span className="ckm-auth__nav-caption">{caption}</span>
          : <span className="ckm-auth__nav-title" aria-hidden={!scrolled}>{title}</span>}

        <div className="ckm-auth__nav-slot ckm-auth__nav-slot--end">
          {action ? <AuthNavControl {...action} /> : null}
        </div>
      </div>

      {/* Anything that belongs to the bar rather than the body — today, the
          stepper's progress rail, which must not scroll away from the step
          number it measures. */}
      {children}
    </div>
  );
}

/*
 * One control, rendered as whichever element its destination makes it. The
 * `close` variant is a glyph, so it carries an aria-label instead of a name
 * from its contents.
 */
function AuthNavControl({
  label,
  to = "",
  onClick = null,
  icon = "",
  close = false,
  className = "",
  replace = false,
}) {
  const classes = [className || (close ? "ckm-auth__close" : "ckm-auth__nav-action")]
    .filter(Boolean).join(" ");

  const content = close
    ? <span className="material-symbols-outlined" aria-hidden="true">close</span>
    : (
      <>
        {icon && <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>}
        <span>{label}</span>
      </>
    );

  if (to) {
    return (
      <Link className={classes} to={to} replace={replace} aria-label={close ? label : undefined}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} onClick={onClick} aria-label={close ? label : undefined}>
      {content}
    </button>
  );
}

/*
 * AuthHead — the lockup.
 *
 * The heading takes focus whenever `title` changes. These screens replace each
 * other inside one route (sign in -> verify) and one route replaces another
 * with the same chrome (sign in -> role chooser), so without this a screen
 * reader is never told the surface changed and a keyboard user stays wherever
 * the last control was. `preventScroll` keeps the viewport still under a raised
 * keyboard; `tabIndex={-1}` makes the heading focusable without adding a tab
 * stop nobody wants.
 */
export function AuthHead({
  eyebrow = "",
  eyebrowLive = false,
  title,
  lede = "",
  tone = "accent",
  tight = false,
  titleId = "",
  children = null,
}) {
  const generatedId = useId();
  const id = titleId || generatedId;
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [title]);

  return (
    <header className={["ckm-auth__head", tight ? "ckm-auth__head--tight" : ""].filter(Boolean).join(" ")}>
      {eyebrow && (
        /* `eyebrowLive` is for the eyebrow that carries the step count. The
           step has to be announced when it changes, and this is where it is
           stated — polite, so it does not interrupt the heading focus that
           follows it. */
        <p
          className={["ckm-auth__eyebrow", tone === "danger" ? "ckm-auth__eyebrow--danger" : ""]
            .filter(Boolean).join(" ")}
          aria-live={eyebrowLive ? "polite" : undefined}
        >
          {eyebrow}
        </p>
      )}
      <h1 className="ckm-auth__title" id={id} ref={headingRef} tabIndex={-1}>{title}</h1>
      {lede && <p className="ckm-auth__lede">{lede}</p>}
      {children}
    </header>
  );
}
