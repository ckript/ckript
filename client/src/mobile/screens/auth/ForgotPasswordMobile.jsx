import { useContext, useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../../../context/AuthContext";
import useForgotPasswordFlow from "../../../hooks/useForgotPasswordFlow";
import { useToast } from "../../components/feedback/toastContext";
import { AUTH_SHELL_MODE, readReturnPath, withReturnPath } from "./authChrome";
import AuthSurface, { AuthHead, AuthNav } from "./ios/AuthSurface";
import AuthButton from "./ios/AuthButton";
import AuthOtpBoxes from "./ios/AuthOtpBoxes";
import {
  AuthCard,
  AuthFieldError,
  AuthFieldRow,
  AuthPasswordRow,
  AuthPasswordStrength,
} from "./ios/AuthControls";

/*
 * ForgotPasswordMobile — /forgot-password (Phase 8, D59; iOS redesign).
 *
 * The one screen in this family with no logic of its own: `useForgotPasswordFlow`
 * was already extracted and headless, precisely so the surface rendering it
 * could be swapped without the contract moving. This is that swap, twice over
 * now, and the reason it is a hundred lines rather than three hundred.
 *
 * WHY THIS IS A ROUTE AND NOT THE PROTOTYPE'S SHEET. The prototype answers
 * "forgot password?" with a bottom sheet that takes an email and sends a link.
 * This product does not send a link — it sends a six-digit code, then takes the
 * code and a new password twice. That is three more controls and a second step
 * than a sheet can hold without becoming a screen, and the OTP leg here has the
 * same reason to own a URL that the sign-up one does: it outlives a trip to the
 * mail app. So the sheet's language is kept and its container is not.
 *
 * Two things this does add over the shared flow, both mobile-specific:
 *   • the code boxes are the family's own control, so recovery and verification
 *     feel like the same step rather than two implementations of one idea;
 *   • the hook's `notify` is wired to the MOBILE toast host, not the desktop
 *     one — the mobile app mounts its own ToastProvider inside `.ckm`, and a
 *     desktop toast would render outside the phone frame entirely.
 */

const TITLE_ID = "ckm-recovery-title";

export default function ForgotPasswordMobile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useContext(AuthContext);
  const toast = useToast();

  const returnPath = useMemo(() => readReturnPath(location.search), [location.search]);
  const signInPath = withReturnPath("/login", returnPath);

  const flow = useForgotPasswordFlow({
    notify: toast,
    onComplete: () => navigate(signInPath, { replace: true }),
  });

  /* Someone signed in does not need recovery — they need account settings, and
     sending them to a "who are you?" form would be the wrong answer to a
     question they did not ask. */
  useEffect(() => {
    if (!loading && user) navigate("/profile?tab=settings", { replace: true });
  }, [loading, user, navigate]);

  const isEmailStep = flow.step === "email";
  const mismatch = flow.confirmPassword && flow.confirmPassword !== flow.newPassword
    ? "Both passwords need to match."
    : "";

  return (
    <AuthSurface
      screenId="forgot-password"
      mode={AUTH_SHELL_MODE}
      labelledBy={TITLE_ID}
      nav={(
        <AuthNav
          glass
          back={{ label: "Sign in", to: signInPath }}
          title={isEmailStep ? "Reset password" : "Enter your code"}
        />
      )}
      footer={isEmailStep ? (
        <AuthButton
          onClick={flow.submitEmail}
          pending={flow.loading}
          pendingLabel="Sending…"
        >
          Send reset code
        </AuthButton>
      ) : (
        <AuthButton
          onClick={flow.submitReset}
          pending={flow.loading}
          pendingLabel="Updating…"
        >
          Set new password
        </AuthButton>
      )}
    >
      <AuthHead
        eyebrow="Account recovery"
        title={isEmailStep ? "Reset your password" : "Enter your code"}
        lede={isEmailStep
          ? "Tell us the email on your account and we'll send a 6-digit code."
          : `We sent a code to ${flow.email}. Enter it and choose a new password.`}
        titleId={TITLE_ID}
      />

      {isEmailStep ? (
        <form onSubmit={flow.submitEmail} noValidate>
          <AuthCard>
            <AuthFieldRow
              label="Email"
              hideLabel
              placeholder="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={flow.email}
              onChange={(event) => flow.setEmail(event.target.value)}
            />
          </AuthCard>
          <button type="submit" className="ckm-sr-only" tabIndex={-1} aria-hidden="true">
            Send reset code
          </button>
        </form>
      ) : (
        <form onSubmit={flow.submitReset} noValidate>
          <AuthOtpBoxes
            digits={flow.otpDigits}
            onDigit={flow.handleOtpChange}
            onKeyDown={flow.handleOtpKeyDown}
            onPaste={flow.handleOtpPaste}
            inputsRef={flow.otpInputsRef}
            label="Reset code"
            hint="Paste the code and every box fills."
            disabled={flow.loading}
          />

          <div className="ckm-auth__resend">
            {flow.resendCooldown > 0 ? (
              <span aria-live="polite">{`New code in ${flow.resendCooldown}s`}</span>
            ) : (
              <button
                type="button"
                className="ckm-auth__link"
                onClick={flow.handleResend}
                disabled={flow.resendLoading}
              >
                {flow.resendLoading ? "Sending…" : "Send a new code"}
              </button>
            )}
          </div>

          <div className="ckm-auth__block">
            <p className="ckm-auth__block-label">New password</p>
            <AuthCard invalid={Boolean(mismatch)}>
              <AuthPasswordRow
                label="New password"
                hideLabel
                placeholder="New password"
                autoComplete="new-password"
                value={flow.newPassword}
                onChange={(event) => flow.setNewPassword(event.target.value)}
              />
              <AuthPasswordRow
                label="Confirm new password"
                hideLabel
                placeholder="Confirm new password"
                autoComplete="new-password"
                value={flow.confirmPassword}
                error={mismatch}
                onChange={(event) => flow.setConfirmPassword(event.target.value)}
              />
            </AuthCard>
            <AuthPasswordStrength value={flow.newPassword} />
            <AuthFieldError>{mismatch}</AuthFieldError>
          </div>

          <p className="ckm-auth__alt">
            <button type="button" className="ckm-auth__link" onClick={flow.backToEmail}>
              Use a different email
            </button>
          </p>

          <button type="submit" className="ckm-sr-only" tabIndex={-1} aria-hidden="true">
            Set new password
          </button>
        </form>
      )}

      <p className="ckm-auth__alt">
        Remembered it?{" "}
        <Link className="ckm-auth__link" to={signInPath}>Sign in</Link>
      </p>
    </AuthSurface>
  );
}
