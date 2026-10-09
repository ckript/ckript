import { Link } from "react-router-dom";
import Icon from "../Icon";
import { useListContext } from "./listContext";
import "./ListRow.css";

/*
 * ListRow — one line of a list (prefix: ckm-row).
 *
 * The row that a mobile app uses for everything: settings, search results,
 * notifications, threads, collaborators. Three slots and one rule.
 *
 *   leading    icon name, avatar, thumbnail — decorative unless the caller
 *              passes a labelled element
 *   text       title (one line, ellipsised) + optional subtitle (two lines)
 *   trailing   a value, a badge, a chevron — read after the title
 *
 * The rule is about the second interactive thing. A row that navigates *and*
 * carries its own switch/menu cannot be one <a> wrapping both: nesting an
 * interactive control inside a link is invalid, and the link's accessible name
 * would swallow the control's. So the row is a positioned container, the
 * primary target is a link/button whose `::after` covers the whole row, and
 * anything in `action` sits above that overlay on its own (Heydon Pickering's
 * card technique, applied to a row — see the plan's §17 source list).
 *
 * Consequence worth knowing: the overlay masks text selection inside the row.
 * That is the accepted trade for one accessible name per row; a row whose text
 * users need to copy should be non-interactive and put its action in `action`.
 */
export default function ListRow({
  title,
  subtitle = "",
  overline = "",
  leading = null,
  trailing = null,
  action = null,
  chevron = false,
  to = null,
  /*
   * Router state for `to`. Without it `...rest` would put `state` on the <li>,
   * where React Router never sees it — and the one destination that needs it,
   * Create, would quietly resume the last draft instead of starting a new one.
   */
  state = undefined,
  href = null,
  onClick = null,
  current = false,
  disabled = false,
  tone = "default",
  size = "default",
  className = "",
  ...rest
}) {
  const inList = Boolean(useListContext());
  const Item = inList ? "li" : "div";
  const interactive = Boolean(to || href || onClick) && !disabled;

  const classes = [
    "ckm-row",
    size !== "default" ? `ckm-row--${size}` : "",
    tone !== "default" ? `ckm-row--${tone}` : "",
    leading ? "has-leading" : "",
    interactive ? "is-interactive" : "",
    current ? "is-current" : "",
    disabled ? "is-disabled" : "",
    className,
  ].filter(Boolean).join(" ");

  const body = (
    <>
      {leading && (
        <span className="ckm-row__leading" aria-hidden={typeof leading === "string" ? "true" : undefined}>
          {typeof leading === "string" ? <Icon name={leading} size={22} /> : leading}
        </span>
      )}

      <span className="ckm-row__text">
        {overline && <span className="ckm-row__overline">{overline}</span>}
        <span className="ckm-row__title">{title}</span>
        {subtitle && <span className="ckm-row__subtitle">{subtitle}</span>}
      </span>

      {trailing && <span className="ckm-row__trailing">{trailing}</span>}
      {chevron && <Icon className="ckm-row__chevron" name="chevron_right" size={20} />}
    </>
  );

  const mainProps = {
    className: "ckm-row__main",
    // aria-current="page" is the honest value for a navigation row; a row that
    // is merely the chosen one in a set says so with `true`.
    "aria-current": current ? (to || href ? "page" : "true") : undefined,
  };

  let main;
  if (disabled) {
    main = onClick || to || href
      ? <button type="button" {...mainProps} disabled>{body}</button>
      : <span {...mainProps}>{body}</span>;
  } else if (to) {
    main = <Link to={to} state={state} {...mainProps}>{body}</Link>;
  } else if (href) {
    main = <a href={href} {...mainProps}>{body}</a>;
  } else if (onClick) {
    main = <button type="button" onClick={onClick} {...mainProps}>{body}</button>;
  } else {
    main = <span {...mainProps}>{body}</span>;
  }

  return (
    <Item className={classes} {...rest}>
      {main}
      {action && <span className="ckm-row__action">{action}</span>}
    </Item>
  );
}
