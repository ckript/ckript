import { useId } from "react";
import "./AuthControls.css";

/*
 * AuthOtpBoxes — six boxes for a six-digit code.
 *
 * Why six inputs rather than one: on a phone this is the control that decides
 * whether verification feels like a step or a chore. Separate boxes give an
 * unambiguous 58px target per digit, show progress without a counter, and let
 * a wrong digit be fixed without retyping the rest.
 *
 * What that shape usually costs, and what is paid here:
 *
 *   ANNOUNCEMENT. Six unlabelled boxes are six unnamed inputs to a screen
 *   reader. Each carries its own position label ("Digit 3 of 6") and the group
 *   carries the instruction, so the field is comprehensible without sight of
 *   the layout.
 *
 *   AUTOFILL. `autoComplete="one-time-code"` on the FIRST box only. Browsers
 *   fill the field they are given and iOS offers its keyboard suggestion from
 *   it; repeating it on all six invites six separate fills of the same code.
 *
 *   PASTE. Bound to every box, because pasting into the fourth means the same
 *   thing as pasting into the first — see useMobileOtp.handlePaste.
 *
 * `inputMode="numeric"` rather than `type="number"`: a spinner is a poor phone
 * control, and type="number" silently drops values it dislikes.
 */
export default function AuthOtpBoxes({
  digits,
  onDigit,
  onKeyDown,
  onPaste,
  inputsRef,
  label = "Verification code",
  hint = "",
  error = "",
  disabled = false,
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={["ckm-auth__otp", error ? "is-invalid" : ""].filter(Boolean).join(" ")}>
      <div className="ckm-auth__otp-boxes" role="group" aria-label={label} aria-describedby={describedBy}>
        {digits.map((digit, index) => (
          <input
            // Index is the identity here: these are six fixed positions, not a
            // reorderable list.
            key={index}
            ref={(node) => { inputsRef.current[index] = node; }}
            className="ckm-auth__otp-box"
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={1}
            value={digit}
            disabled={disabled}
            aria-label={`Digit ${index + 1} of ${digits.length}`}
            aria-invalid={error ? true : undefined}
            onChange={(event) => onDigit(index, event.target.value)}
            onKeyDown={(event) => onKeyDown(index, event)}
            onPaste={onPaste}
            // Selecting on focus means typing over a filled box replaces it
            // rather than being refused by maxLength.
            onFocus={(event) => event.target.select()}
          />
        ))}
      </div>

      {/* The error replaces the hint rather than stacking below it, so the
          space under the boxes says one thing at a time. */}
      {error ? (
        <p className="ckm-auth__otp-error" id={errorId} role="alert">
          <span className="material-symbols-outlined" aria-hidden="true">error</span>
          <span>{error}</span>
        </p>
      ) : hint && <p className="ckm-auth__otp-hint" id={hintId}>{hint}</p>}
    </div>
  );
}
