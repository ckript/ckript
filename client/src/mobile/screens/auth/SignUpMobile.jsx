import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AuthContext } from "../../../context/AuthContext";
import { resolvePostAuthPath } from "../../../routing/audienceTransitions";
import useKeyboardInset from "../../hooks/useKeyboardInset";
import { readReturnPath, SIGNUP_SHELL_MODE, withReturnPath } from "./authChrome";
import { clampStep, isRetryable, refusalField, resolveRole } from "./authModel";
import AuthSurface, { AuthHead, AuthNav } from "./ios/AuthSurface";
import AuthButton from "./ios/AuthButton";
import AuthOtpBoxes from "./ios/AuthOtpBoxes";
import AuthPickerSheet from "./ios/AuthPickerSheet";
import { AuthCard, AuthFactRow, AuthNote, AuthNotice } from "./ios/AuthControls";
import { AUTH_STILL, onImageMissing } from "./ios/authArt";
import SignUpPanels from "./ios/SignUpPanels";
import useMobileOtp from "./useMobileOtp";
import useMobileSignUp, { PRIVACY_ROUTE, TERMS_ROUTE } from "./useMobileSignUp";
import "./SignUpMobile.css";

/*
 * SignUpMobile — /signup?as=<role>&step=<n> (Phase 8, D59; iOS redesign).
 *
 * One screen for all three sign-up flows. The role picks the step list, the
 * step picks the panel, and everything else on this surface — the rail, the
 * docked action, the OTP detour, the resume prompt, the finish, the exit — is
 * the same for every role, which is the point.
 *
 * THE STEP IS IN THE URL, AND THAT IS THE WHOLE ARCHITECTURE. Each advance is a
 * history push, so:
 *   • the hardware/browser back button means "previous step", which is what a
 *     native app does and what a phone user's thumb already expects;
 *   • a reload — including the one the OS performs when it evicts a backgrounded
 *     tab, which is exactly what happens while someone is in their mail app
 *     copying a verification code — resumes on the same step;
 *   • a step can be linked to, which is how /writer-onboarding resolves here.
 *
 * The docked footer holds the ONE primary action for every step, and rides the
 * keyboard via useKeyboardInset. A phone keyboard covers the bottom third of
 * the screen; a "Continue" underneath it is a form with no way forward.
 */

const TITLE_ID = "ckm-signup-title";

/* Where each finished account is most likely to want to go first. A real route
   per role rather than one generic landing: the writer's next act is uploading,
   and the two buyers' is looking. "Look around first" keeps the audience
   default for anyone who does not want to be sent anywhere. */
const FIRST_ACT = {
  writer: { to: "/upload", label: "Upload a script" },
  producer: { to: "/top-script", label: "Browse the top list" },
  industry: { to: "/writers", label: "Browse writers" },
};

/* Approximate, and deliberately so: the draft is capped at six hours, and
   "2 hours ago" is the answer to "is this still the thing I was doing?". */
function savedAgo(savedAt) {
  if (!Number.isFinite(savedAt)) return "recently";
  const minutes = Math.max(0, Math.round((Date.now() - savedAt) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

export default function SignUpMobile() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { user, loading } = useContext(AuthContext);
  const keyboardInset = useKeyboardInset();
  const doneRef = useRef(null);

  /* The wheel sheet a "picks" row opens. It lives here rather than in the panel
     because it is an overlay on the shell, and the shell is this screen's. */
  const [picker, setPicker] = useState(null);
  const [finished, setFinished] = useState(false);

  const role = useMemo(() => resolveRole(params.get("as")), [params]);
  const step = useMemo(() => clampStep(params.get("step"), role.key), [params, role.key]);
  const returnPath = useMemo(() => readReturnPath(location.search), [location.search]);

  /* Every navigation inside the flow keeps the whole query, so the role, the
     referral and the return path survive a step change, a back, and a reload. */
  const goToStep = useCallback((next) => {
    const query = new URLSearchParams(params);
    query.set("as", role.key);
    query.set("step", String(clampStep(next, role.key)));
    navigate(`/signup?${query.toString()}`);
  }, [params, role.key, navigate]);

  const flow = useMobileSignUp({
    roleKey: role.key,
    step,
    goToStep,
    onComplete: () => setFinished(true),
  });

  const otp = useMobileOtp({
    email: flow.verification?.email,
    expirySeconds: flow.verification?.expirySeconds,
    cooldownSeconds: flow.verification?.cooldownSeconds,
    startCooldownOnMount: true,
    onVerified: flow.onVerified,
  });

  /* A referral in the URL is adopted once, and stored, so the detour through
     the mail app cannot lose it. */
  useEffect(() => {
    const referral = params.get("ref") || params.get("referral") || params.get("referralCode");
    if (referral) flow.adoptReferral(referral);
    // Only when the URL's referral changes — re-running on every flow render
    // would fight the person typing in the referral field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  /* An email handed over by the role chooser (Google had no account for it). */
  const prefillEmail = params.get("email");
  useEffect(() => {
    if (!prefillEmail) return;
    flow.setAccount((prev) => (prev.email ? prev : { ...prev, email: prefillEmail }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillEmail]);

  /*
   * Someone already signed in who lands on step 1 is not mid-flow — they are on
   * a stale link, or they bookmarked it. Send them to their workspace.
   *
   * The `accountCreated` guard is what makes this safe: from step 3 onward the
   * flow's own account exists, so `user` being set is the SUCCESS state, not a
   * reason to leave. This is why the manifest entry is deliberately not
   * `signedOutOnly` — the policy cannot tell these two apart, and this can.
   */
  useEffect(() => {
    if (loading || !user || finished) return;
    if (flow.accountCreated && step > 1) return;
    navigate(resolvePostAuthPath({ requestedPath: returnPath, user }), { replace: true });
  }, [loading, user, finished, flow.accountCreated, step, returnPath, navigate]);

  /* The finish is the one screen whose heading is not AuthHead's, so it moves
     focus itself — for the same reason every other screen does. */
  useEffect(() => {
    if (finished) doneRef.current?.focus({ preventScroll: true });
  }, [finished]);

  const exit = () => navigate(withReturnPath("/join", returnPath), { replace: true });

  const onward = useCallback(() => {
    navigate(resolvePostAuthPath({ requestedPath: returnPath, user }), { replace: true });
  }, [navigate, returnPath, user]);

  /* iOS keeps the layout viewport at full height under a raised keyboard, so a
     docked footer would sit beneath it. The measured inset becomes the footer's
     own bottom padding — the same variable the safe-area floor uses, so the two
     cannot both apply. */
  const footerStyle = keyboardInset ? { "--ckma-foot-bottom": `${keyboardInset}px` } : undefined;

  const sheet = picker ? (
    <AuthPickerSheet
      open
      title={picker.title}
      options={picker.options}
      value={picker.value}
      onPick={(value) => { picker.onPick(value); setPicker(null); }}
      onClose={() => setPicker(null)}
    />
  ) : null;

  /* ── The finish ─────────────────────────────────────────────────────────
     The account is made and the profile is written. Landing straight in the
     app would be correct and silent; this says which account now exists, and
     offers the one thing that role most likely came to do. */
  if (finished) {
    const firstAct = FIRST_ACT[role.key] || FIRST_ACT.writer;
    const firstName = String(flow.account.name || user?.name || "").trim().split(/\s+/)[0];

    return (
      <AuthSurface
        screenId="sign-up-done"
        mode={SIGNUP_SHELL_MODE}
        tone="dark"
        labelledBy={TITLE_ID}
        bodyClassName="ckm-signup__done-body"
        footer={(
          <>
            <AuthButton variant="light" to={firstAct.to}>{firstAct.label}</AuthButton>
            <AuthButton variant="plain" onClick={onward}>Look around first</AuthButton>
          </>
        )}
      >
        <img
          className="ckm-signup__done-art"
          src={AUTH_STILL.screeningRoom}
          alt=""
          onError={onImageMissing}
          draggable={false}
        />
        <span className="ckm-signup__done-scrim" aria-hidden="true" />
        <div className="ckm-signup__done-copy">
          <span className="ckm-signup__badge">
            <span className="ckm-signup__badge-mark material-symbols-outlined" aria-hidden="true">check</span>
            {`${role.title} account created`}
          </span>
          <h1 className="ckm-signup__done-title" id={TITLE_ID} ref={doneRef} tabIndex={-1}>
            {firstName ? `You're in, ${firstName}.` : "You're in."}
          </h1>
        </div>
      </AuthSurface>
    );
  }

  /* ── The OTP detour ───────────────────────────────────────────────────────
     Rendered in place of the panel rather than as its own route: the account
     exists at this point, so this is not a step someone can go "back" past —
     only forward, or away to read their email and return. */
  if (flow.verification) {
    return (
      <AuthSurface
        screenId="sign-up-verify"
        mode={SIGNUP_SHELL_MODE}
        labelledBy={TITLE_ID}
        footerStyle={footerStyle}
        nav={(
          <AuthNav
            back={{ label: "Back", onClick: flow.back }}
            caption={`Joining as ${role.title}`}
            action={{ label: "Later", onClick: onward }}
          >
            <StepRail step={flow.accountStep} total={flow.total} />
          </AuthNav>
        )}
        footer={(
          <AuthButton
            onClick={() => otp.verify()}
            pending={otp.verifying}
            pendingLabel="Verifying…"
            disabled={!otp.complete}
          >
            Verify
          </AuthButton>
        )}
      >
        <AuthHead
          eyebrow={`Step ${flow.accountStep} of ${flow.total}`}
          eyebrowLive
          title="Check your mail"
          lede={`Code sent to ${flow.verification.email}. It's good for ${otp.expiryLabel}.`}
          titleId={TITLE_ID}
        />

        <AuthNote>
          Your account is created. Verifying unlocks the rest of your setup — if you leave now, you
          can finish it from your profile.
        </AuthNote>

        <AuthOtpBoxes
          digits={otp.digits}
          onDigit={otp.setDigit}
          onKeyDown={otp.handleKeyDown}
          onPaste={otp.handlePaste}
          inputsRef={otp.inputsRef}
          hint="Paste the code and every box fills."
          error={otp.refusal?.message || ""}
          disabled={otp.verifying}
        />

        <div className="ckm-auth__resend">
          {otp.cooldown > 0 ? (
            <span aria-live="polite">{`New code in ${otp.cooldown}s`}</span>
          ) : (
            <button
              type="button"
              className="ckm-auth__link"
              onClick={otp.resend}
              disabled={otp.resending}
            >
              {otp.resending ? "Sending…" : "Send a new code"}
            </button>
          )}
        </div>
      </AuthSurface>
    );
  }

  /* ── The resume prompt ────────────────────────────────────────────────────
     Offered rather than applied silently. Restoring four screens of someone's
     typing without telling them is disorienting, and "start again" has to be
     one tap away when the draft is from a different intention. */
  if (flow.resumeOffered) {
    return (
      <AuthSurface
        screenId="sign-up-resume"
        mode={SIGNUP_SHELL_MODE}
        labelledBy={TITLE_ID}
        nav={<AuthNav action={{ close: true, label: "Leave sign-up", onClick: exit }} />}
        footer={(
          <>
            <AuthButton onClick={flow.keepDraft}>Continue where I stopped</AuthButton>
            <AuthButton variant="plain" onClick={flow.discardDraft}>Start again</AuthButton>
          </>
        )}
      >
        <AuthHead
          eyebrow="Welcome back"
          title="Pick up where you stopped?"
          lede={`We kept your ${role.title.toLowerCase()} draft. Your password isn't saved — you'll set that when you get there.`}
          titleId={TITLE_ID}
        />

        {flow.resumePoint && (
          <AuthCard panel>
            <AuthFactRow
              label="Reached"
              value={`Step ${flow.resumePoint.step} — ${flow.resumePoint.title}`}
            />
            <AuthFactRow label="Saved" value={savedAgo(flow.resumePoint.savedAt)} />
          </AuthCard>
        )}
      </AuthSurface>
    );
  }

  const primaryLabel = flow.current.createsAccount && !flow.accountCreated
    ? "Create my account"
    : flow.isLast ? "Finish and enter Ckript" : "Continue";

  return (
    <AuthSurface
      screenId="sign-up"
      mode={SIGNUP_SHELL_MODE}
      labelledBy={TITLE_ID}
      overlays={sheet}
      footerStyle={footerStyle}
      nav={(
        <AuthNav
          back={step > 1 ? { label: "Back", onClick: flow.back } : null}
          caption={`Joining as ${role.title}`}
          action={flow.canFinishLater
            ? { label: "Later", onClick: onward }
            : { close: true, label: "Leave sign-up", onClick: exit }}
        >
          <StepRail step={step} total={flow.total} />
        </AuthNav>
      )}
      footer={(
        <>
          <AuthButton
            onClick={flow.advance}
            pending={flow.submitting}
            pendingLabel={flow.current.createsAccount ? "Creating your account…" : "Saving…"}
          >
            {primaryLabel}
          </AuthButton>

          {flow.current.createsAccount && (
            <p className="ckm-auth__legal">
              By continuing you accept the <Link to={TERMS_ROUTE[role.key]}>Terms</Link> and{" "}
              <Link to={PRIVACY_ROUTE}>Privacy Policy</Link>.
            </p>
          )}

          {flow.canFinishLater ? (
            <button type="button" className="ckm-signup__later" onClick={onward}>
              Finish this later
            </button>
          ) : step === 1 ? (
            <p className="ckm-signup__alt">
              Already have an account?{" "}
              <Link to={withReturnPath("/login", returnPath)}>Sign in</Link>
            </p>
          ) : null}
        </>
      )}
    >
      <AuthHead
        eyebrow={`Step ${step} of ${flow.total}`}
        eyebrowLive
        title={flow.current.title}
        lede={flow.current.sub}
        titleId={TITLE_ID}
      />

      {/*
        * A refusal that belongs to no single field. Field-bound ones are
        * rendered by the control they concern (authModel.refusalField), the
        * same split SignInMobile uses.
        *
        * The condition is "not bound to a field" rather than "no field errors
        * at all": some refusals set both, and they are the ones that most need
        * both. Being sent back to About because a resumed draft could not keep
        * the demographics marks two fields AND needs a sentence saying why the
        * step reopened — without it, the return reads as a bug.
        */}
      {flow.refusal && !refusalField(flow.refusal.code) && (
        <AuthNotice
          tone="error"
          onRetry={isRetryable(flow.refusal.code) ? flow.advance : null}
        >
          {flow.refusal.message}
        </AuthNotice>
      )}

      <form onSubmit={(event) => { event.preventDefault(); flow.advance(); }} noValidate>
        <SignUpPanels flow={flow} openPicker={setPicker} />
        {/* A submit input the keyboard's "go" key can reach, without a second
            visible button competing with the docked one. */}
        <button type="submit" className="ckm-sr-only" tabIndex={-1} aria-hidden="true">
          {primaryLabel}
        </button>
      </form>
    </AuthSurface>
  );
}

/*
 * The rail. `aria-hidden` because the step is already stated in words by the
 * eyebrow above the panel, which is the announced version — a bar and a
 * sentence saying the same thing is the announcement made twice.
 */
function StepRail({ step, total }) {
  const safe = Math.min(Math.max(step, 1), total);
  return (
    <div className="ckm-signup__rail" aria-hidden="true">
      <div className="ckm-signup__rail-fill" style={{ width: `${(safe / total) * 100}%` }} />
    </div>
  );
}
