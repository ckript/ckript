import { useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../../../context/AuthContext";
import { resolvePostAuthPath } from "../../../routing/audienceTransitions";
import { COMPANY } from "../../../constants/company";
import { AUTH_SHELL_MODE, readReturnPath, withReturnPath } from "./authChrome";
import { isRetryable, REFUSAL } from "./authModel";
import AuthSurface, { AuthHead, AuthNav } from "./ios/AuthSurface";
import AuthButton from "./ios/AuthButton";
import AuthGoogleSlot from "./ios/AuthGoogleSlot";
import AuthOtpBoxes from "./ios/AuthOtpBoxes";
import {
  AuthCard,
  AuthFactRow,
  AuthFieldError,
  AuthFieldRow,
  AuthNote,
  AuthNotice,
  AuthPasswordRow,
} from "./ios/AuthControls";
import useMobileOtp from "./useMobileOtp";
import useMobileSignIn, { SIGN_IN_PHASE } from "./useMobileSignIn";

/*
 * SignInMobile — /login (Phase 8, D59; iOS redesign).
 *
 * A real route rather than a modal, which is the whole D59 argument in one
 * screen: the verification step below can outlive a trip to the mail app, and a
 * surface with no URL does not survive that.
 *
 * A signed-in visitor is sent on rather than bounced to "/", because arriving
 * here already signed in almost always means a stale link or a second tab — and
 * `resolvePostAuthPath` knows where that person actually belongs, including
 * honouring a `?redirect=` they may have been carrying.
 *
 * THREE SURFACES, ONE ROUTE. Credentials, the OTP detour, and the halt an
 * account under review gets. The last of those used to be a banner above the
 * form; it is a screen now because a form nobody is allowed to submit is not a
 * form, and the two things that person actually needs — the reason, and a way
 * to reach a human — were the two things the banner had least room for.
 */

const SIGN_IN_TITLE = "ckm-sign-in-title";

const HALTED = Object.freeze({
  [REFUSAL.ACCOUNT_FROZEN]: {
    eyebrow: "Account frozen",
    title: "We've paused this account.",
    lede: "Signing in is blocked until it's reviewed.",
    note: "Your drafts and scripts are untouched.",
    subject: "Frozen account review",
  },
  [REFUSAL.ACCOUNT_DELETED]: {
    eyebrow: "Account closed",
    title: "This account has been closed.",
    lede: "Signing in is no longer possible with these details.",
    note: "If this was a mistake, our team can tell you what can be recovered.",
    subject: "Closed account",
  },
});

export default function SignInMobile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useContext(AuthContext);
  const emailRef = useRef(null);

  const returnPath = useMemo(() => readReturnPath(location.search), [location.search]);

  const land = useCallback((account) => {
    navigate(resolvePostAuthPath({ requestedPath: returnPath, user: account || user }), { replace: true });
  }, [navigate, returnPath, user]);

  const signIn = useMobileSignIn({
    onSignedIn: land,
    /* Google refused because there is no account yet. That is a sign-UP, so
       hand the verified email to the role chooser rather than showing an error
       at the moment someone was trying to join. */
    onNeedsAccount: (email) => {
      navigate(withReturnPath(
        `/join${email ? `?email=${encodeURIComponent(email)}` : ""}`,
        returnPath,
      ));
    },
  });

  const otp = useMobileOtp({
    email: signIn.verification?.email,
    expirySeconds: signIn.verification?.expirySeconds,
    cooldownSeconds: signIn.verification?.cooldownSeconds,
    onVerified: land,
  });

  /* Already signed in — including the moment sign-in succeeds in another tab. */
  useEffect(() => {
    if (!loading && user && signIn.phase !== SIGN_IN_PHASE.DONE) land(user);
  }, [loading, user, signIn.phase, land]);

  useEffect(() => {
    // A short delay so the field is focused after the screen has painted;
    // preventScroll keeps the viewport still under a raised keyboard.
    const timer = setTimeout(() => emailRef.current?.focus({ preventScroll: true }), 80);
    return () => clearTimeout(timer);
  }, []);

  /* ── The OTP detour ─────────────────────────────────────────────────────
     The account exists and simply was never verified, so this is the sign-UP
     flow resuming rather than a failure. */
  if (signIn.phase === SIGN_IN_PHASE.VERIFY) {
    return (
      <AuthSurface
        screenId="sign-in-verify"
        mode={AUTH_SHELL_MODE}
        labelledBy={SIGN_IN_TITLE}
        nav={(
          <AuthNav
            back={{ label: "Sign in", onClick: signIn.backToCredentials }}
            title="Check your mail"
          />
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
          eyebrow="One more step"
          title="Check your mail"
          lede={`Code sent to ${signIn.verification?.email}. It's good for ${otp.expiryLabel}.`}
          titleId={SIGN_IN_TITLE}
        />

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

        <p className="ckm-auth__alt">
          Wrong email?{" "}
          <button type="button" className="ckm-auth__link" onClick={signIn.backToCredentials}>
            Go back
          </button>
        </p>
      </AuthSurface>
    );
  }

  const refusal = signIn.formRefusal;
  const halted = refusal ? HALTED[refusal.code] : null;

  /* ── The halt ───────────────────────────────────────────────────────────
     No control on this screen can change the answer, so it does not show one
     that pretends otherwise. */
  if (halted) {
    return (
      <AuthSurface
        screenId="sign-in-halted"
        mode={AUTH_SHELL_MODE}
        labelledBy={SIGN_IN_TITLE}
        nav={<AuthNav back={{ label: "Sign in", onClick: () => signIn.setRefusal(null) }} />}
        footer={(
          <>
            <AuthButton
              href={`mailto:${COMPANY.supportEmail}?subject=${encodeURIComponent(halted.subject)}`}
            >
              Contact support
            </AuthButton>
            <AuthButton variant="plain" to="/">Back to Ckript</AuthButton>
          </>
        )}
      >
        <AuthHead
          eyebrow={halted.eyebrow}
          title={halted.title}
          lede={halted.lede}
          tone="danger"
          titleId={SIGN_IN_TITLE}
        />

        <AuthCard panel>
          <div className="ckm-auth__row ckm-auth__row--reason">
            <span className="ckm-auth__block-label">Reason given</span>
            <span className="ckm-auth__reason-text">
              {refusal.frozenReason || refusal.message}
            </span>
          </div>
          <AuthFactRow label="Signed in as" value={signIn.email} />
        </AuthCard>

        <AuthNote>{halted.note}</AuthNote>
      </AuthSurface>
    );
  }

  /* ── Credentials ────────────────────────────────────────────────────────
     No docked footer: this screen is short enough that the action belongs in
     the flow of the page, directly under the two fields it acts on. */
  return (
    <AuthSurface
      screenId="sign-in"
      mode={AUTH_SHELL_MODE}
      labelledBy={SIGN_IN_TITLE}
      flush
      nav={(
        <AuthNav
          glass
          back={{ label: "Back", to: "/" }}
          title="Sign in"
        />
      )}
    >
      <AuthHead eyebrow="Sign in" title="Welcome back" titleId={SIGN_IN_TITLE} tight />

      {refusal && (
        <AuthNotice
          tone="error"
          onRetry={isRetryable(refusal.code) ? () => signIn.submit() : null}
        >
          {refusal.message}
        </AuthNotice>
      )}

      <form className="ckm-auth__form" onSubmit={signIn.submit} noValidate>
        <AuthCard invalid={Boolean(signIn.emailError || signIn.passwordError)}>
          <AuthFieldRow
            label="Email"
            hideLabel
            placeholder="Email"
            inputRef={emailRef}
            value={signIn.email}
            error={signIn.emailError}
            onChange={(event) => signIn.setEmail(event.target.value)}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <AuthPasswordRow
            label="Password"
            hideLabel
            placeholder="Password"
            value={signIn.password}
            error={signIn.passwordError}
            onChange={(event) => signIn.setPassword(event.target.value)}
          />
        </AuthCard>

        <AuthFieldError>{signIn.emailError || signIn.passwordError}</AuthFieldError>

        <p className="ckm-auth__forgot">
          <Link className="ckm-auth__link" to={withReturnPath("/forgot-password", returnPath)}>
            Forgot password?
          </Link>
        </p>

        <div className="ckm-auth__actions">
          <AuthButton type="submit" pending={signIn.submitting} pendingLabel="Signing in…">
            Sign in
          </AuthButton>

          <p className="ckm-auth__divider"><span>or</span></p>

          {/* Google's own button, sized to this column. It draws its own chrome
              and cannot be restyled — see AuthGoogleSlot for what that costs
              and why the alternative is a backend change. */}
          <AuthGoogleSlot
            text="continue_with"
            onSuccess={signIn.completeGoogle}
            onError={signIn.failGoogle}
          />
        </div>
      </form>

      <p className="ckm-auth__alt">
        New here?{" "}
        <Link className="ckm-auth__link" to={withReturnPath("/join", returnPath)}>
          Create an account
        </Link>
      </p>
    </AuthSurface>
  );
}
