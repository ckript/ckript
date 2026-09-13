import { Link } from "react-router-dom";
import "./AuthControls.css";

/*
 * AuthButton — the one action shape this family uses.
 *
 * Four variants and no size prop, because the design has four and one: a 50px
 * primary, the same shape in paper for the dark screens, an outlined one for a
 * secondary choice of equal weight, and a plain text button for "or don't".
 *
 * It renders an <a> when given a destination and a <button> otherwise. That is
 * not a formality: a route rendered as a button cannot be opened in a new tab,
 * long-pressed, or read as a destination, and a state change rendered as a link
 * lies about what will happen.
 *
 * `pending` keeps the button's own width and swaps its label, so a slow network
 * never collapses the footer, and announces itself through aria-busy rather
 * than by the label alone.
 */
export default function AuthButton({
  variant = "primary",
  to = "",
  href = "",
  onClick = null,
  type = "button",
  pending = false,
  pendingLabel = "",
  disabled = false,
  className = "",
  children,
  ...rest
}) {
  const classes = [
    "ckm-auth__btn",
    variant !== "primary" ? `ckm-auth__btn--${variant}` : "",
    className,
  ].filter(Boolean).join(" ");

  const label = pending && pendingLabel ? pendingLabel : children;

  if (to) {
    return (
      <Link className={classes} to={to} {...rest}>{label}</Link>
    );
  }

  if (href) {
    return (
      <a className={classes} href={href} {...rest}>{label}</a>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...rest}
    >
      {label}
    </button>
  );
}
