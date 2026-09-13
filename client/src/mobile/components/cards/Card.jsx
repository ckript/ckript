import { Link } from "react-router-dom";
import "./Card.css";

/*
 * Card — the surface a project, challenge or profile is summarised on
 * (prefix: ckm-card).
 *
 * Composed rather than configured. A single <Card image={} title={} tags={}
 * price={} …> prop-list looks tidy until the fourth screen needs a fifth
 * arrangement, so this exports parts and lets the screen assemble them:
 *
 *   <Card>
 *     <CardMedia src=… alt="" badge={<Badge/>} />
 *     <CardBody>
 *       <CardTitle to="/project/1">The Last Scene</CardTitle>
 *       …
 *     </CardBody>
 *     <CardFooter>…</CardFooter>
 *   </Card>
 *
 * Whole-card tapping is the part worth reading. Wrapping everything in one <a>
 * makes the link's accessible name the entire card — "The Last Scene, drama,
 * 118 pages, 4.6 stars, ₹2,400, link" — and forbids any second control inside
 * it. Instead `CardTitle` is the only link, and its `::after` stretches over
 * the card. The card is fully tappable, the link is named by its title alone,
 * and `CardActions` sits above the overlay with `position: relative`.
 *
 * Text selection inside a linked card is lost to the overlay; that is the
 * accepted trade (see ListRow, same technique, same note).
 */

export default function Card({
  as = "article",
  elevated = false,
  flush = false,
  className = "",
  children,
  ...rest
}) {
  const Surface = as;
  const classes = [
    "ckm-card",
    elevated ? "ckm-card--elevated" : "",
    flush ? "ckm-card--flush" : "",
    className,
  ].filter(Boolean).join(" ");

  return <Surface className={classes} {...rest}>{children}</Surface>;
}

/* Media sits above the body and is decorative by default: a cover image that
   repeats the title adds nothing but noise to a screen reader, so `alt` is ""
   unless the caller says otherwise. `ratio` reserves the box before the image
   arrives, which is what stops a list of cards reflowing as it loads. */
export function CardMedia({
  src = "",
  alt = "",
  ratio = "16 / 9",
  overlay = null,
  placeholderIcon = "movie",
  className = "",
  children,
  ...rest
}) {
  return (
    <div
      className={["ckm-card__media", className].filter(Boolean).join(" ")}
      style={{ aspectRatio: ratio }}
      {...rest}
    >
      {src ? (
        <img className="ckm-card__image" src={src} alt={alt} loading="lazy" decoding="async" />
      ) : (
        <img className="ckm-card__image" src="/common-thumbnail.png" alt="Placeholder" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      )}
      {overlay && <div className="ckm-card__media-overlay">{overlay}</div>}
      {children}
    </div>
  );
}

export function CardBody({ className = "", children, ...rest }) {
  return (
    <div className={["ckm-card__body", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}

export function CardEyebrow({ className = "", children, ...rest }) {
  return (
    <p className={["ckm-card__eyebrow", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </p>
  );
}

/*
 * CardTitle — the heading, and the card's one link.
 *
 * `as` defaults to h3 because a card almost always sits under a section h2,
 * which sits under the screen's single h1. Pass `as="h2"` when the card is the
 * section itself; do not pass `as="div"` — a card with no heading is invisible
 * to anyone navigating by heading.
 */
export function CardTitle({
  as = "h3",
  to = null,
  href = null,
  state = undefined,
  onClick = null,
  className = "",
  children,
  ...rest
}) {
  const Heading = as;
  const classes = ["ckm-card__title", className].filter(Boolean).join(" ");
  const linkClass = "ckm-card__link";

  if (to) {
    return (
      <Heading className={classes} {...rest}>
        {/* `state` rather than an onClick+navigate: some destinations read
            location.state as part of their contract (plan §5.2 — /create-project
            treats `startFresh` as an entry mode), and swapping the link for a
            handler would cost long-press, middle-click and open-in-new-tab to
            carry one field. */}
        <Link className={linkClass} to={to} state={state}>{children}</Link>
      </Heading>
    );
  }

  if (href) {
    return (
      <Heading className={classes} {...rest}>
        <a className={linkClass} href={href}>{children}</a>
      </Heading>
    );
  }

  if (onClick) {
    return (
      <Heading className={classes} {...rest}>
        <button className={linkClass} type="button" onClick={onClick}>{children}</button>
      </Heading>
    );
  }

  return <Heading className={classes} {...rest}>{children}</Heading>;
}

export function CardText({ className = "", children, ...rest }) {
  return (
    <p className={["ckm-card__text", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </p>
  );
}

/* A row of chips/badges under the body text. */
export function CardTags({ className = "", children, ...rest }) {
  return (
    <div className={["ckm-card__tags", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className = "", children, ...rest }) {
  return (
    <div className={["ckm-card__footer", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}

/* Every interactive thing that is not the title link goes in here, so it keeps
   its own accessible name and its own tap target above the card overlay. */
export function CardActions({ className = "", children, ...rest }) {
  return (
    <div className={["ckm-card__actions", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}
