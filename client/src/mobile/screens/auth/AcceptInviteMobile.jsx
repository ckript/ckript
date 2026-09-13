import { useCallback, useContext, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../../../services/api";
import { AuthContext } from "../../../context/AuthContext";
import { acceptCollabInvite } from "../../../components/collab/collaborationRequests";
import { SkeletonShape } from "../../components/feedback/Skeletons";
import { AUTH_SHELL_MODE, withReturnPath } from "./authChrome";
import { readRefusal } from "./authModel";
import AuthSurface, { AuthHead, AuthNav } from "./ios/AuthSurface";
import AuthButton from "./ios/AuthButton";
import { AuthCard, AuthFactRow, AuthNote, AuthNotice } from "./ios/AuthControls";
import "./AcceptInviteMobile.css";

/*
 * AcceptInviteMobile — /invite/:token (Phase 8, D59; iOS redesign).
 *
 * The only route in this family that has work to do for both a signed-in and a
 * signed-out viewer, which is why it is a result surface rather than a form.
 *
 * The signed-out case is the one that mattered. `pages/AcceptInvite.jsx` carries
 * a comment explaining why it does NOT route away — "/signup and /login are
 * both `<Navigate to="/">`, and nothing reads the `next` param — sending an
 * invitee there dropped them on the homepage and lost the invite entirely" — so
 * it opens a modal over itself instead. On mobile that is no longer necessary:
 * /login is a real screen and `?redirect=` is honoured, so an invitee can be
 * SENT to sign in and come back to this exact URL, which is the behaviour the
 * desktop comment wanted and could not have.
 *
 * The invite is deliberately not accepted on mount for a signed-out visitor and
 * is stated first for everyone: accepting a collaboration invitation adds a
 * person to someone else's screenplay, and doing that silently because a link
 * was opened is the wrong default for an irreversible-feeling action.
 *
 * WHAT THE PROTOTYPE'S CARD CANNOT SAY. Its mock names the inviter, the project
 * and the expiry. This screen has a token and nothing else until the accept
 * succeeds — there is no endpoint that previews an invitation — so the card
 * carries what is actually known and the details appear once they exist. A
 * plausible-looking name that is not the real inviter's would be worse than a
 * plainer card.
 */

const TITLE_ID = "ckm-invite-title";

const STATUS = Object.freeze({
  LOADING: "loading",
  SIGNED_OUT: "signed-out",
  READY: "ready",
  ACCEPTING: "accepting",
  ACCEPTED: "accepted",
  FAILED: "failed",
  NO_TOKEN: "no-token",
});

/*
 * What this screen is showing, derived rather than stored.
 *
 * Four of the seven states are facts about the props — the session is still
 * restoring, the URL has no token, nobody is signed in — and storing those in
 * state means an effect that copies props into state and a render where the two
 * disagree. Only the acceptance ATTEMPT is genuine local state, so only that is
 * held; everything else is computed from it and the session on every render.
 */
function resolveStatus({ loading, token, user, attempt }) {
  if (attempt === STATUS.ACCEPTED) return STATUS.ACCEPTED;
  if (loading) return STATUS.LOADING;
  if (!token) return STATUS.NO_TOKEN;
  if (!user) return STATUS.SIGNED_OUT;
  if (attempt) return attempt;
  return STATUS.READY;
}

export default function AcceptInviteMobile() {
  const { token } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useContext(AuthContext);

  /* Only the acceptance attempt is state; see resolveStatus above. */
  const [attempt, setAttempt] = useState(null);
  const [refusal, setRefusal] = useState(null);
  const [result, setResult] = useState(null);
  const inFlightRef = useRef(false);

  const status = resolveStatus({ loading, token, user, attempt });

  /* This exact URL is where the invitee must come back to. */
  const returnHere = useMemo(
    () => `${location.pathname}${location.search}`,
    [location.pathname, location.search],
  );

  const accept = useCallback(async () => {
    // A double tap on a slow connection must not send two accepts; the ref
    // guards synchronously, which state set in the same tick would not.
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setAttempt(STATUS.ACCEPTING);
    setRefusal(null);
    try {
      const data = await acceptCollabInvite(token, api);
      setResult(data);
      setAttempt(STATUS.ACCEPTED);
    } catch (error) {
      // Let them try again — the common failures here are a dropped connection
      // and a token someone else already used, and only one of those is final.
      setRefusal(readRefusal(error));
      setAttempt(STATUS.FAILED);
    } finally {
      inFlightRef.current = false;
    }
  }, [token]);

  const head = () => {
    if (status === STATUS.ACCEPTED) {
      return { eyebrow: "Invitation", title: "You're in.", lede: "You now have access to the project." };
    }
    if (status === STATUS.NO_TOKEN) {
      return {
        eyebrow: "Invitation",
        title: "That invitation link is incomplete",
        lede: "The link is missing its invitation code.",
        tone: "danger",
      };
    }
    return {
      eyebrow: "Invitation",
      title: "You've been invited",
      lede: "Someone wants you on their screenplay.",
    };
  };

  const body = () => {
    if (status === STATUS.LOADING) {
      return (
        <div className="ckm-invite__pending">
          <SkeletonShape height={120} radius="var(--ckm-r-lg)" />
        </div>
      );
    }

    if (status === STATUS.NO_TOKEN) {
      return <AuthNote>Ask whoever invited you to send the link again.</AuthNote>;
    }

    if (status === STATUS.SIGNED_OUT) {
      return (
        <AuthNote>
          You&apos;ve been invited to collaborate on a screenplay. Sign in — or create your
          account — and we&apos;ll bring you straight back here.
        </AuthNote>
      );
    }

    if (status === STATUS.ACCEPTED) {
      return (
        <>
          <AuthCard panel>
            <AuthFactRow label="Status" value={result?.message || "You're on the project."} />
            {result?.script?.title && <AuthFactRow label="Project" value={result.script.title} />}
          </AuthCard>
          <AuthNote>The writer has been told you accepted.</AuthNote>
        </>
      );
    }

    return (
      <>
        {status === STATUS.FAILED && refusal && (
          <AuthNotice tone="error">
            {refusal.message || "We couldn't accept that invitation."}
          </AuthNotice>
        )}
        <AuthCard panel>
          <div className="ckm-auth__row">
            <span className="ckm-invite__mark material-symbols-outlined" aria-hidden="true">group_add</span>
            <span className="ckm-auth__row-text">
              <span className="ckm-auth__row-title ckm-auth__row-title--strong">Collaboration invitation</span>
              <span className="ckm-auth__row-detail">Accepting adds you as a collaborator.</span>
            </span>
          </div>
          <AuthFactRow label="Signed in as" value={user?.name || user?.email || "You"} />
        </AuthCard>
        <AuthNote>
          Accepting adds you to this screenplay as a collaborator, and the writer will be told.
        </AuthNote>
      </>
    );
  };

  const footer = () => {
    if (status === STATUS.LOADING || status === STATUS.NO_TOKEN) return null;

    if (status === STATUS.SIGNED_OUT) {
      return (
        <>
          <AuthButton to={withReturnPath("/login", returnHere)}>Sign in to accept</AuthButton>
          <AuthButton variant="outline" to={withReturnPath("/join", returnHere)}>
            Create an account
          </AuthButton>
        </>
      );
    }

    if (status === STATUS.ACCEPTED) {
      return (
        <>
          <AuthButton to={result?.script?.id ? `/script/${result.script.id}` : "/collaborations"}>
            {result?.script?.id ? "Open the project" : "See your collaborations"}
          </AuthButton>
          <AuthButton variant="plain" to="/dashboard">Go to your dashboard</AuthButton>
        </>
      );
    }

    return (
      <>
        <AuthButton
          onClick={accept}
          pending={status === STATUS.ACCEPTING}
          pendingLabel="Accepting…"
        >
          {status === STATUS.FAILED ? "Try again" : "Accept invitation"}
        </AuthButton>
        <AuthButton variant="plain" onClick={() => navigate("/dashboard", { replace: true })}>
          Not now
        </AuthButton>
      </>
    );
  };

  const copy = head();

  return (
    <AuthSurface
      screenId="accept-invite"
      mode={AUTH_SHELL_MODE}
      labelledBy={TITLE_ID}
      className="ckm-invite"
      nav={<AuthNav glass title="Invitation" action={{ close: true, label: "Back to Ckript", to: "/" }} />}
      footer={footer()}
    >
      <AuthHead
        eyebrow={copy.eyebrow}
        title={copy.title}
        lede={copy.lede}
        tone={copy.tone || "accent"}
        titleId={TITLE_ID}
      />
      {body()}
    </AuthSurface>
  );
}
