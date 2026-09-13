import { useEffect, useState } from "react";

/*
 * useInputModality — how the person is driving the app right now: "pointer"
 * (touch or mouse) or "keyboard".
 *
 * WHY THIS EXISTS, WHEN `:focus-visible` ALREADY SOUNDS LIKE THE ANSWER.
 *
 * `:focus-visible` is meant to be exactly this distinction, and for buttons and
 * links it is. For TEXT INPUTS it is not: every engine deliberately matches it
 * on any focus, including a tap, because the browser cannot know whether a
 * keyboard is about to be used. That rule is right for a desktop form and wrong
 * for a phone — tapping a field is simply how you type, and the answer to
 * "which field am I in?" is already on screen twice: the caret is blinking in
 * it and the keyboard has just slid up under it. A ring drawn on top of that is
 * a third answer nobody asked for, and at 2px it is the heaviest thing on the
 * screen.
 *
 * So the modality is tracked once and the ring is spent where it is the ONLY
 * answer: on the person who arrived by Tab and can see neither a caret they
 * placed nor a keyboard they raised.
 *
 * This is the well-worn "what-input" pattern, kept deliberately small:
 *
 *   • listeners are capturing and passive, so nothing downstream can swallow
 *     them and nothing here can delay a scroll;
 *   • only navigation keys count as keyboard intent. Typing into a field is not
 *     "navigating by keyboard" — it is the ordinary consequence of a tap, and
 *     counting it would flip the mode on the first character of every field;
 *   • state changes only on an actual switch, so the common case (tap, type,
 *     tap) re-renders nothing.
 *
 * Accessibility note: this REMOVES a focus ring only for the pointer case,
 * where WCAG's visible-focus requirement is already met by the caret — the same
 * reasoning every native text field on iOS and Android relies on. Keyboard
 * users keep the full indicator, and it is the app's own 2px ring.
 */

const POINTER = "pointer";
const KEYBOARD = "keyboard";

/* Tab and the arrows move focus. Everything else is someone typing. */
const NAVIGATION_KEYS = new Set([
  "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown",
]);

export default function useInputModality() {
  // Pointer is the honest default on a phone: the overwhelming majority of
  // sessions never press a key that moves focus, and starting in "keyboard"
  // would flash a ring on the first tap of every visit.
  const [modality, setModality] = useState(POINTER);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const onPointer = () => setModality((current) => (current === POINTER ? current : POINTER));
    const onKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!NAVIGATION_KEYS.has(event.key)) return;
      setModality((current) => (current === KEYBOARD ? current : KEYBOARD));
    };

    window.addEventListener("pointerdown", onPointer, { capture: true, passive: true });
    window.addEventListener("keydown", onKeyDown, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", onPointer, { capture: true });
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, []);

  return modality;
}
