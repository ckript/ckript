import IconButton from "../buttons/IconButton";
import Icon from "../Icon";
import { useMobileBack } from "../../hooks/useMobileBack";
import "./BackButton.css";

/*
 * BackButton — the one way a mobile screen goes back (prefix: ckm-back).
 *
 * Screens must not call `navigate(-1)` themselves: `useMobileBack` is what
 * knows the difference between "the user walked here" and "the user landed
 * here from a link", and only one of those may use history (see the hook).
 *
 * `to` is the parent route for the deep-link case and is therefore required in
 * spirit — a back button with no declared parent is a dead end on a shared URL.
 * `label` renders a visible parent name beside the chevron (iOS-style); with no
 * label the control is a plain icon button whose accessible name stays "Back".
 */
export default function BackButton({
  to = "/",
  label = "",
  accessibleLabel = "Back",
  onBack = null,
  className = "",
  ...rest
}) {
  const { goBack } = useMobileBack(to);
  const handle = onBack || goBack;

  return (
    <IconButton
      icon="arrow_back_ios_new"
      label={label ? `${accessibleLabel}: ${label}` : accessibleLabel}
      onClick={handle}
      className={`ckm-back ${className}`.trim()}
      {...rest}
    />
  );
}
