import { useId, useState } from "react";
import { passwordChecklist } from "../authModel";
import "./AuthControls.css";

/*
 * AuthControls — the grouped inset list the account-entry screens are built
 * from, and the small pieces that hang off it.
 *
 * WHY NOT THE SHARED FORM PRIMITIVES. `components/forms/Field` draws a labelled
 * box per control. That is right for the product's forms and wrong for this
 * family, whose rows put a label and a value on one line inside a shared card
 * with hairline separators. Reskinning the primitive to do that would have
 * changed every other form in the app — the case §6 describes for a dedicated
 * component rather than a compromised shared one.
 *
 * WHAT THE ROWS STILL OWE. A row is not a <div> with a tap handler:
 *   • every input has a real <label> or an aria-label, never a placeholder
 *     doing the job of one;
 *   • a toggle row is a real toggle — role="checkbox" for consent,
 *     aria-pressed for a selection out of many, role="switch" for a setting;
 *   • an error is bound to the control it belongs to with aria-describedby and
 *     marks it aria-invalid, so it is reachable from the field rather than only
 *     visible near it.
 */

/* --- Card and block ----------------------------------------------------- */

export function AuthCard({ panel = false, invalid = false, className = "", children, ...rest }) {
  return (
    <div
      className={[
        "ckm-auth__card",
        panel ? "ckm-auth__card--panel" : "",
        invalid ? "is-invalid" : "",
        className,
      ].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}

/** A labelled group: the small rule-and-caps label, the card, and its caption. */
export function AuthBlock({ label = "", className = "", children }) {
  return (
    <div className={["ckm-auth__block", className].filter(Boolean).join(" ")}>
      {label && <p className="ckm-auth__block-label">{label}</p>}
      {children}
    </div>
  );
}

/* --- Captions and refusals ---------------------------------------------- */

export function AuthNote({ id = "", children }) {
  if (!children) return null;
  return <p className="ckm-auth__note" id={id || undefined}>{children}</p>;
}

export function AuthFieldError({ id = "", children }) {
  if (!children) return null;
  return (
    <p className="ckm-auth__error" id={id || undefined} role="alert">
      <span className="material-symbols-outlined" aria-hidden="true">error</span>
      <span>{children}</span>
    </p>
  );
}

/*
 * A live status line — username availability, referral validation. Polite
 * rather than assertive: it updates while someone is typing, and an assertive
 * region would interrupt them on every keystroke.
 */
export function AuthStatus({ state = "idle", children }) {
  if (!children) return null;
  const tone = { available: "ok", valid: "ok", unavailable: "bad", invalid: "bad" }[state] || "";
  const glyph = { available: "check_circle", valid: "check_circle", unavailable: "error", invalid: "error" }[state];
  return (
    <p
      className={["ckm-auth__status", tone ? `ckm-auth__status--${tone}` : ""].filter(Boolean).join(" ")}
      aria-live="polite"
    >
      {glyph && <span className="material-symbols-outlined" aria-hidden="true">{glyph}</span>}
      <span>{children}</span>
    </p>
  );
}

/*
 * A refusal or an aside that belongs to the whole screen rather than to one
 * control. `onRetry` is offered only for the failures a second tap could
 * actually fix — see authModel.isRetryable.
 */
export function AuthNotice({ tone = "info", title = "", onRetry = null, retryLabel = "Try again", children }) {
  return (
    <div
      className={["ckm-auth__notice", tone === "error" ? "ckm-auth__notice--error" : ""]
        .filter(Boolean).join(" ")}
      role={tone === "error" ? "alert" : undefined}
    >
      {title && <p className="ckm-auth__notice-title">{title}</p>}
      <p className="ckm-auth__notice-body">{children}</p>
      {onRetry && (
        <button type="button" className="ckm-auth__notice-retry" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}

/* --- Rows --------------------------------------------------------------- */

/**
 * A text row: an optional 88px label, an optional static prefix, the input,
 * and an optional trailing mark or control.
 */
export function AuthFieldRow({
  label = "",
  hideLabel = false,
  prefix = "",
  value,
  onChange,
  placeholder = "",
  type = "text",
  inputMode,
  autoComplete = "off",
  autoCapitalize,
  autoCorrect,
  spellCheck,
  maxLength,
  error = "",
  describedBy = "",
  inputRef = null,
  trailing = null,
  ariaLabel = "",
  ...rest
}) {
  const id = useId();
  const errorId = error ? `${id}-error` : "";
  const described = [describedBy, errorId].filter(Boolean).join(" ");

  return (
    <div className="ckm-auth__row">
      {label && !hideLabel && (
        <label className="ckm-auth__row-label" htmlFor={id}>{label}</label>
      )}
      {prefix && <span className="ckm-auth__row-prefix" aria-hidden="true">{prefix}</span>}
      <input
        id={id}
        ref={inputRef}
        className="ckm-auth__input"
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        spellCheck={spellCheck}
        maxLength={maxLength}
        aria-label={hideLabel || !label ? (ariaLabel || label || placeholder) : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={described || undefined}
        {...rest}
      />
      {trailing}
    </div>
  );
}

/**
 * The same row with a reveal toggle. The reveal is not a nicety on a phone: a
 * strong password on a soft keyboard means several layout switches typed blind,
 * and seeing what was typed is the difference between one attempt and three.
 */
export function AuthPasswordRow({
  label = "Password",
  hideLabel = false,
  value,
  onChange,
  placeholder = "",
  autoComplete = "current-password",
  error = "",
  describedBy = "",
  inputRef = null,
  ...rest
}) {
  const [visible, setVisible] = useState(false);

  return (
    <AuthFieldRow
      label={label}
      hideLabel={hideLabel}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type={visible ? "text" : "password"}
      autoComplete={autoComplete}
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      error={error}
      describedBy={describedBy}
      inputRef={inputRef}
      trailing={(
        <button
          type="button"
          className="ckm-auth__reveal"
          onClick={() => setVisible((current) => !current)}
          aria-pressed={visible}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? "Hide" : "Show"}
        </button>
      )}
      {...rest}
    />
  );
}

/** A multi-line field. Its own card rather than a row: it is taller than one. */
export function AuthTextArea({
  label,
  hideLabel = false,
  value,
  onChange,
  placeholder = "",
  rows = 4,
  maxLength,
  error = "",
}) {
  const id = useId();
  const errorId = error ? `${id}-error` : "";

  return (
    <>
      <div className={["ckm-auth__field", error ? "is-invalid" : ""].filter(Boolean).join(" ")}>
        {label && !hideLabel && <label className="ckm-sr-only" htmlFor={id}>{label}</label>}
        <textarea
          id={id}
          className="ckm-auth__textarea"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          aria-label={hideLabel || !label ? label || placeholder : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId || undefined}
        />
      </div>
      {maxLength ? (
        <p className="ckm-auth__count" aria-live="off">{`${(value || "").length}/${maxLength}`}</p>
      ) : null}
      <AuthFieldError id={errorId}>{error}</AuthFieldError>
    </>
  );
}

/**
 * A row that opens the picker sheet. The value is shown in place, so the card
 * still reads as a summary of the answers given.
 */
export function AuthPickRow({ label, value = "", placeholder = "Choose", onOpen, error = "" }) {
  return (
    <button
      type="button"
      className="ckm-auth__row ckm-auth__row--action ckm-auth__row--lead"
      onClick={onOpen}
      aria-invalid={error ? true : undefined}
    >
      <span className="ckm-auth__row-title">{label}</span>
      <span className="ckm-auth__row-value">
        <span className={["ckm-auth__row-value-text", value ? "" : "is-empty"].filter(Boolean).join(" ")}>
          {value || placeholder}
        </span>
        <span className="ckm-auth__chevron material-symbols-outlined" aria-hidden="true">chevron_right</span>
      </span>
    </button>
  );
}

/** A setting, as a switch. */
export function AuthSwitchRow({ label, checked, onChange }) {
  const id = useId();
  return (
    <div className="ckm-auth__row ckm-auth__row--split ckm-auth__row--lead">
      <span className="ckm-auth__row-title" id={id}>{label}</span>
      <button
        type="button"
        className="ckm-auth__switch"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        onClick={() => onChange(!checked)}
      >
        <span className="ckm-auth__switch-knob" />
      </button>
    </div>
  );
}

/** A consent row: a real checkbox, filled when accepted. */
export function AuthMarkRow({ label, detail = "", checked, onToggle, error = "" }) {
  return (
    <button
      type="button"
      className="ckm-auth__row ckm-auth__row--action"
      role="checkbox"
      aria-checked={checked}
      aria-invalid={error ? true : undefined}
      onClick={() => onToggle(!checked)}
    >
      <span className="ckm-auth__row-text">
        <span className="ckm-auth__row-title">{label}</span>
        {detail && <span className="ckm-auth__row-detail">{detail}</span>}
      </span>
      <span
        className={["ckm-auth__mark", "material-symbols-outlined", checked ? "is-on" : ""]
          .filter(Boolean).join(" ")}
        aria-hidden="true"
      >
        check
      </span>
    </button>
  );
}

/** One of many: a tick in the margin, no box. */
export function AuthTickRow({ label, detail = "", selected, onToggle, disabled = false }) {
  return (
    <button
      type="button"
      className="ckm-auth__row ckm-auth__row--action"
      aria-pressed={selected}
      aria-disabled={disabled && !selected ? true : undefined}
      onClick={() => onToggle(!selected)}
    >
      <span className="ckm-auth__row-text">
        <span className="ckm-auth__row-title">{label}</span>
        {detail && <span className="ckm-auth__row-detail">{detail}</span>}
      </span>
      <span
        className={["ckm-auth__tick", "material-symbols-outlined", selected ? "is-on" : ""]
          .filter(Boolean).join(" ")}
        aria-hidden="true"
      >
        check
      </span>
    </button>
  );
}

/** A read-only summary row: label on the left, fact on the right. */
export function AuthFactRow({ label, value }) {
  return (
    <div className="ckm-auth__row ckm-auth__row--split">
      <span className="ckm-auth__fact-label">{label}</span>
      <span className="ckm-auth__fact-value">{value}</span>
    </div>
  );
}

/* --- Password strength -------------------------------------------------- */

/*
 * The bar says how far along; the list says what is missing. Both, because the
 * server refuses naming one rule at a time — a bar alone leaves someone
 * guessing which of five they have not met.
 */
export function AuthPasswordStrength({ value = "", showRules = true }) {
  const rules = passwordChecklist(value);
  const met = rules.filter((rule) => rule.met).length;
  const score = Math.min(4, Math.round((met / rules.length) * 4));
  const tone = met === rules.length ? "strong" : met >= 3 ? "" : "weak";

  return (
    <>
      <div
        className={["ckm-auth__meter", tone ? `ckm-auth__meter--${tone}` : ""].filter(Boolean).join(" ")}
        aria-hidden="true"
      >
        {[1, 2, 3, 4].map((step) => (
          <span key={step} className={["ckm-auth__meter-seg", score >= step ? "is-on" : ""].filter(Boolean).join(" ")} />
        ))}
      </div>

      {showRules && (
        <ul className="ckm-auth__rules">
          {rules.map((rule) => (
            <li key={rule.id} className={rule.met ? "is-met" : ""}>
              <span className="material-symbols-outlined" aria-hidden="true">
                {rule.met ? "check_circle" : "radio_button_unchecked"}
              </span>
              <span>{rule.label}</span>
              <span className="ckm-sr-only">{rule.met ? " — done" : " — still needed"}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
