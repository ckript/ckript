import { useEffect, useRef } from "react";
import Overlay from "../../../components/overlays/Overlay";
import "./AuthSheet.css";

/*
 * AuthPickerSheet — the sheet a "picks" row opens.
 *
 * WHY NOT A <select>. A native select on iOS does open the system wheel, and
 * that was the cheap answer. It is not this one, for two reasons: the row it
 * replaces has to show its chosen value in the card (a select cannot be styled
 * to), and the sheet carries the field's own name in its header, which a system
 * picker attached to an unlabelled row does not.
 *
 * WHY NOT THE SHARED Sheet. `components/overlays/Sheet` is a titled sheet with
 * a grip, a close button and a scrolling body — a different object. What both
 * want is the same four guarantees, so this builds on the same `Overlay` they
 * both do: inert background, focus trap, scroll lock, Escape. Those are not
 * re-implemented here, which is the point of building on it.
 *
 * The list is a listbox of options rather than a set of buttons: this is one
 * choice out of many, `aria-selected` is what says which, and arrow keys move
 * between them the way the pattern expects.
 */
export default function AuthPickerSheet({
  open,
  title,
  options,
  value,
  onPick,
  onClose,
  returnFocusTo = null,
}) {
  const listRef = useRef(null);
  const selectedRef = useRef(null);

  /* Open on the current answer rather than at the top: a picker that starts on
     "Australia" when the answer is "United States" is a scroll, not a choice. */
  useEffect(() => {
    if (!open) return;
    const node = selectedRef.current;
    if (node && listRef.current) {
      listRef.current.scrollTop = node.offsetTop - listRef.current.clientHeight / 2 + node.clientHeight / 2;
    }
  }, [open, value]);

  const move = (event, index) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const next = event.key === "ArrowDown"
      ? Math.min(index + 1, options.length - 1)
      : Math.max(index - 1, 0);
    listRef.current?.querySelectorAll("[role='option']")[next]?.focus();
  };

  return (
    <Overlay
      open={open}
      onClose={onClose}
      placement="bottom"
      label={title}
      returnFocusTo={returnFocusTo}
      surfaceClassName="ckm-auth__sheet"
    >
      <div className="ckm-auth__sheet-bar">
        <button type="button" className="ckm-auth__sheet-cancel" onClick={onClose}>Cancel</button>
        <span className="ckm-auth__sheet-title">{title}</span>
        <button type="button" className="ckm-auth__sheet-done" onClick={onClose}>Done</button>
      </div>

      <div className="ckm-auth__wheel">
        <span className="ckm-auth__wheel-band" aria-hidden="true" />
        <div className="ckm-auth__wheel-list" ref={listRef} role="listbox" aria-label={title}>
          {options.map((option, index) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value || option.label}
                ref={selected ? selectedRef : null}
                type="button"
                role="option"
                aria-selected={selected}
                className="ckm-auth__wheel-option"
                onClick={() => onPick(option.value)}
                onKeyDown={(event) => move(event, index)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="ckm-auth__sheet-foot" />
    </Overlay>
  );
}
