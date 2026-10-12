import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AuthContext } from "../../../../context/AuthContext";
import { useCurrency } from "../../../../context/CurrencyContext";
import { AUTHENTICATED_PROFILE_STATUS } from "../../../../pages/profile/authenticatedProfile";
import {
  ACCOUNT_LANGUAGE_OPTIONS,
  ACCOUNT_NOTIFICATION_OPTIONS,
  ACCOUNT_TIMEZONE_OPTIONS,
  changeAccountEmail,
  changeAccountPassword,
  deleteOwnAccount,
  disconnectGoogleCalendar,
  loadAccountSessions,
  loadGoogleCalendarStatus,
  revokeAccountSession,
  revokeOtherAccountSessions,
  sendAccountEmailVerification,
  startGoogleCalendarConnection,
  unblockAccountUser,
  updateAccountSettings,
  verifyAccountEmail,
} from "../../../../pages/profile/accountSecurity";
import { mergeOwnProfileUpdate } from "../../../../pages/profile/profileEditor";
import { useAuthenticatedProfile } from "../../../../pages/profile/useAuthenticatedProfile";
import { applyLanguagePreference, getBackendLanguageValue, getProfileLanguageValue } from "../../../../utils/languagePreference";
import PageHeader from "../../../components/app-bars/PageHeader";
import Button from "../../../components/buttons/Button";
import InlineMessage from "../../../components/feedback/InlineMessage";
import SkeletonGroup, { SkeletonShape } from "../../../components/feedback/Skeletons";
import { useToast } from "../../../components/feedback/toastContext";
import SelectField from "../../../components/forms/SelectField";
import Switch from "../../../components/forms/Switch";
import TextArea from "../../../components/forms/TextArea";
import TextField from "../../../components/forms/TextField";
import NavBar from "../../../components/navigation/NavBar";
import ConfirmDialog from "../../../components/overlays/ConfirmDialog";
import SegmentedControl from "../../../components/tabs/SegmentedControl";
import MobileShell from "../../../shell/MobileShell";
import { MOBILE_SHELL_MODE } from "../../../shell/mobileShellModes";
import { buildAccountSettingsView } from "./accountSettingsModel";
import { MembershipCredentialSettings, PayoutCredentialSettings } from "./AccountCredentialsMobile";
import PlanBillingSettingsMobile from "./PlanBillingSettingsMobile";
import BillingInvoicesCard from "../../../../components/BillingInvoicesCard";
import "./AccountSettingsMobile.css";

const EMPTY_EMAIL = { newEmail: "", password: "" };
const EMPTY_PASSWORD = { currentPassword: "", newPassword: "", confirmPassword: "" };

const Section = ({ title, description = "", children, tone = "" }) => (
  <section className={["ckm-account-settings__section", tone ? `ckm-account-settings__section--${tone}` : ""].filter(Boolean).join(" ")}>
    <header><h2>{title}</h2>{description ? <p>{description}</p> : null}</header>
    <div className="ckm-account-settings__section-body">{children}</div>
  </section>
);

export default function AccountSettingsMobile({ user }) {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { setUser, logout } = useContext(AuthContext);
  const { currency = "INR", setCurrency } = useCurrency() || {};
  const toast = useToast();
  const profileState = useAuthenticatedProfile({ profileKey: id || user?._id, viewer: user });
  const [sessions, setSessions] = useState([]);
  const [sessionsState, setSessionsState] = useState("loading");
  const [calendar, setCalendar] = useState({ connected: false, calendarEmail: "", configured: true });
  const [calendarState, setCalendarState] = useState("idle");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [emailForm, setEmailForm] = useState(EMPTY_EMAIL);
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD);
  const [otp, setOtp] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [verificationSent, setVerificationSent] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [deleteReason, setDeleteReason] = useState("");

  const profile = useMemo(() => profileState.profile || {}, [profileState.profile]);
  const view = useMemo(() => buildAccountSettingsView({
    profile,
    sessions,
    deletedScripts: profileState.deletedScripts,
  }), [profile, profileState.deletedScripts, sessions]);

  const syncProfile = useCallback((update) => {
    profileState.applyProfileUpdate(update);
    const next = mergeOwnProfileUpdate(user || {}, update || {});
    setUser(next);
    try { localStorage.setItem("user", JSON.stringify(next)); } catch { /* in-memory auth remains authoritative */ }
  }, [profileState, setUser, user]);

  const run = useCallback(async (key, operation, successMessage = "") => {
    if (busy) return { ok: false, message: "Another account update is still in progress." };
    setBusy(key);
    setError("");
    try {
      const result = await operation();
      if (!result.ok) setError(result.message);
      else if (successMessage) toast.success(successMessage);
      return result;
    } finally {
      setBusy("");
    }
  }, [busy, toast]);

  const reloadSessions = useCallback(async () => {
    setSessionsState("loading");
    const result = await loadAccountSessions();
    if (result.ok) {
      setSessions(result.data);
      setSessionsState("ready");
    } else {
      setSessionsState("error");
      setError(result.message);
    }
  }, []);

  useEffect(() => { reloadSessions(); }, [reloadSessions]);

  useEffect(() => {
    if (!view.industry) return undefined;
    let active = true;
    setCalendarState("loading");
    loadGoogleCalendarStatus().then((result) => {
      if (!active) return;
      if (result.ok) {
        setCalendar(result.data || {});
        setCalendarState("ready");
      } else {
        setCalendarState("error");
      }
    });
    return () => { active = false; };
  }, [view.industry]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const result = params.get("calendar");
    if (!result) return;
    if (result === "connected") toast.success("Google Calendar connected");
    if (result === "error") setError("Could not connect Google Calendar. Please try again.");
    params.delete("calendar");
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  }, [location.pathname, location.search, navigate, toast]);

  const updateSetting = async (key, payload, successMessage) => {
    const result = await run(key, () => updateAccountSettings(payload), successMessage);
    if (result.ok) syncProfile(result.data?.user || payload);
  };

  const sendCode = async () => {
    const result = await run("send-code", sendAccountEmailVerification, "Verification code sent");
    if (result.ok) setVerificationSent(true);
  };

  const verifyCode = async () => {
    const result = await run("verify-code", () => verifyAccountEmail(otp), "Email verified");
    if (!result.ok) {
      setFieldErrors(result.fieldErrors || {});
      return;
    }
    syncProfile({ email: result.data.email, emailVerified: true, pendingEmail: undefined });
    setOtp("");
    setVerificationSent(false);
    setFieldErrors({});
  };

  const submitEmail = async (event) => {
    event.preventDefault();
    const result = await run("change-email", () => changeAccountEmail(emailForm, profile.email));
    if (!result.ok) {
      setFieldErrors(result.fieldErrors || {});
      return;
    }
    syncProfile({ email: result.data.email, pendingEmail: result.data.pendingEmail, emailVerified: profile.emailVerified });
    setEmailForm(EMPTY_EMAIL);
    setOtp("");
    setVerificationSent(true);
    setFieldErrors({});
    toast.success("Verification code sent", `Check ${result.data.pendingEmail}. Your current email remains active until verification.`);
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    const result = await run("change-password", () => changeAccountPassword(passwordForm));
    if (!result.ok) {
      setFieldErrors(result.fieldErrors || {});
      return;
    }
    setPasswordForm(EMPTY_PASSWORD);
    setFieldErrors({});
    toast.success("Password changed");
  };

  const confirmSessionAction = async () => {
    if (confirmation?.type === "session") {
      const result = await run("session", () => revokeAccountSession(confirmation.sessionId), "Session removed");
      if (result.ok) { setConfirmation(null); await reloadSessions(); }
    } else if (confirmation?.type === "all-sessions") {
      const result = await run("all-sessions", revokeOtherAccountSessions, "Other devices signed out");
      if (result.ok) { setConfirmation(null); await reloadSessions(); }
    } else if (confirmation?.type === "delete") {
      const result = await run("delete", () => deleteOwnAccount(deleteReason));
      if (result.ok) {
        setConfirmation(null);
        await logout();
        navigate("/login", { replace: true });
      }
    }
  };

  const connectCalendar = async () => {
    const returnTo = `${location.pathname}${location.search}`;
    const result = await run("calendar-connect", () => startGoogleCalendarConnection(returnTo));
    if (result.ok && result.data?.url) window.location.assign(result.data.url);
    else if (result.ok) setError("Google Calendar is not available right now.");
  };

  const disconnectCalendar = async () => {
    const result = await run("calendar-disconnect", disconnectGoogleCalendar, "Google Calendar disconnected");
    if (result.ok) {
      const next = { connected: false, calendarEmail: "" };
      setCalendar((current) => ({ ...current, ...next }));
      syncProfile({ googleCalendar: next });
    }
  };

  const header = <PageHeader title="Account & security" eyebrow="Your profile" backTo="/profile" />;
  const shell = (children, overlays = null) => (
    <MobileShell mode={MOBILE_SHELL_MODE.STANDARD} screenId="account-settings" className="ckm-account-settings" appBar={header} bottomNav={<NavBar user={user} />} overlays={overlays}>
      {children}
    </MobileShell>
  );

  if (profileState.status === AUTHENTICATED_PROFILE_STATUS.LOADING) {
    return shell(<SkeletonGroup label="Loading account settings" className="ckm-account-settings__loading"><SkeletonShape height={180} /><SkeletonShape height={260} /></SkeletonGroup>);
  }
  if (profileState.status !== AUTHENTICATED_PROFILE_STATUS.READY) {
    return shell(<div className="ckm-account-settings__state"><InlineMessage variant="panel" title="Could not load account settings" onRetry={profileState.reload}>{profileState.failure?.message}</InlineMessage></div>);
  }

  const overlays = confirmation ? (
    <ConfirmDialog
      open
      destructive
      pending={Boolean(busy)}
      title={confirmation.type === "delete" ? "Delete your account?" : confirmation.type === "all-sessions" ? "Sign out other devices?" : "Remove this session?"}
      message={confirmation.type === "delete" ? "Your profile will be deactivated and removed across Ckript. This cannot be undone from the app." : confirmation.type === "all-sessions" ? "Every device except this one will need to sign in again." : "This device will need to sign in again."}
      confirmLabel={confirmation.type === "delete" ? "Delete account" : confirmation.type === "all-sessions" ? "Sign out devices" : "Remove session"}
      error={error}
      onCancel={() => { if (!busy) { setConfirmation(null); setError(""); } }}
      onConfirm={confirmSessionAction}
    >
      {confirmation.type === "delete" ? <TextArea label="Reason" optional rows={4} value={deleteReason} maxLength={500} onChange={(event) => setDeleteReason(event.target.value)} /> : null}
    </ConfirmDialog>
  ) : null;

  return shell(
    <div className="ckm-account-settings__page">
      {error && !confirmation ? <InlineMessage>{error}</InlineMessage> : null}

      <Section title="Account" description="Visibility, contact, and display preferences take effect immediately.">
        <div className="ckm-account-settings__currency"><span><strong>Display currency</strong><small>Prices and checkout</small></span><SegmentedControl label="Display currency" name="account-currency" value={currency} options={[{ value: "INR", label: "₹ INR" }, { value: "USD", label: "$ USD" }]} onChange={setCurrency} /></div>
        <Switch label="Private account" description="Only approved followers can see your profile" checked={Boolean(profile.isPrivate)} disabled={Boolean(busy)} onChange={(isPrivate) => updateSetting("privacy", { isPrivate }, "Privacy updated")} />
        {view.writer ? <Switch label="Allow industry contact" description="Verified professionals may request your contact details" checked={profile.allowIndustryContact !== false} disabled={Boolean(busy)} onChange={(allowIndustryContact) => updateSetting("contact", { allowIndustryContact }, "Contact preference updated")} /> : null}
      </Section>

      <Section title="Plan & billing" description="Paid plans renew automatically until you turn renewal off. Access you've paid for is never cut short."><PlanBillingSettingsMobile onSuccess={(message) => toast.success(message)} /></Section>

      <Section title="Billing & invoices" description="The details your tax invoices carry, and every invoice and credit note you have been issued."><BillingInvoicesCard /></Section>

      {view.writer ? <Section title="Payout account" description="Masked account details used for withdrawals. Every change is reviewed before it becomes active."><PayoutCredentialSettings onSuccess={(message) => toast.success(message)} /></Section> : null}

      {view.writer ? <Section title="Guild membership" description="Submit WGA and SWA credentials separately. Proof files remain private to you and authorized reviewers."><MembershipCredentialSettings writerProfile={profile.writerProfile} onUpdate={(writerProfile) => syncProfile({ writerProfile })} onSuccess={(message) => toast.success(message)} /></Section> : null}

      <Section title="Email" description={view.pendingEmail ? `Current: ${view.email} · Pending: ${view.pendingEmail}` : view.email}>
        <InlineMessage tone={view.emailVerified ? "success" : "warning"}>{view.emailVerified ? "Your email is verified." : `Verification is required for ${view.pendingEmail || view.email}.`}</InlineMessage>
        {!view.emailVerified ? <div className="ckm-account-settings__verify"><TextField label="Verification code" purpose="otp" value={otp} maxLength={6} error={fieldErrors.otp} onChange={(event) => { setOtp(event.target.value.replace(/\D/g, "").slice(0, 6)); setFieldErrors((current) => ({ ...current, otp: "" })); }} /><div><Button pending={busy === "verify-code"} onClick={verifyCode}>Verify code</Button><Button variant="secondary" pending={busy === "send-code"} onClick={sendCode}>{verificationSent ? "Resend code" : "Send code"}</Button></div></div> : null}
        <form className="ckm-account-settings__form" onSubmit={submitEmail}>
          <TextField label="New email" purpose="email" value={emailForm.newEmail} error={fieldErrors.newEmail} onChange={(event) => setEmailForm((current) => ({ ...current, newEmail: event.target.value }))} />
          <TextField label="Current password" purpose="password" value={emailForm.password} error={fieldErrors.password} onChange={(event) => setEmailForm((current) => ({ ...current, password: event.target.value }))} />
          <Button type="submit" fullWidth pending={busy === "change-email"}>Update email</Button>
        </form>
      </Section>

      <Section title="Password" description="Use at least 6 characters and keep it unique to Ckript.">
        <form className="ckm-account-settings__form" onSubmit={submitPassword}>
          <TextField label="Current password" purpose="password" value={passwordForm.currentPassword} error={fieldErrors.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} />
          <TextField label="New password" purpose="newPassword" value={passwordForm.newPassword} error={fieldErrors.newPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} />
          <TextField label="Confirm new password" purpose="newPassword" value={passwordForm.confirmPassword} error={fieldErrors.confirmPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))} />
          <Button type="submit" fullWidth pending={busy === "change-password"}>Change password</Button>
        </form>
      </Section>

      <Section title="Notifications">
        {ACCOUNT_NOTIFICATION_OPTIONS.map((option) => <Switch key={option.key} label={option.label} description={option.description} checked={Boolean(profile.notificationPrefs?.[option.key])} disabled={Boolean(busy)} onChange={(value) => updateSetting(`notification-${option.key}`, { notificationPrefs: { [option.key]: value } })} />)}
      </Section>

      <Section title="Devices & sessions" description="Review where your account is signed in.">
        {sessionsState === "loading" ? <SkeletonGroup label="Loading sessions"><SkeletonShape height={84} /></SkeletonGroup> : null}
        {sessionsState === "error" ? <InlineMessage onRetry={reloadSessions}>Active sessions could not be loaded.</InlineMessage> : null}
        {sessionsState === "ready" && !view.sessions.length ? <p className="ckm-account-settings__empty">No active sessions found.</p> : null}
        {view.sessions.map((session) => <article className="ckm-account-settings__session" key={session.sessionId}><div><strong>{session.title}</strong>{session.isCurrent ? <span>Active now</span> : null}<p>{session.meta}</p>{!session.isCurrent && session.lastSeen ? <small>Last seen {new Date(session.lastSeen).toLocaleString()}</small> : null}</div>{!session.isCurrent ? <Button variant="tertiary" onClick={() => setConfirmation({ type: "session", sessionId: session.sessionId })}>Remove</Button> : null}</article>)}
        {view.sessions.length > 1 ? <Button variant="secondary" fullWidth onClick={() => setConfirmation({ type: "all-sessions" })}>Sign out all other devices</Button> : null}
      </Section>

      <Section title="Localization">
        <SelectField label="Language" value={getProfileLanguageValue(profile.language)} options={ACCOUNT_LANGUAGE_OPTIONS} onChange={async (event) => { const language = getBackendLanguageValue(event.target.value); const result = await run("language", () => updateAccountSettings({ language }), "Language updated"); if (result.ok) { syncProfile({ language }); await applyLanguagePreference(language, { forceReload: true }); } }} />
        <SelectField label="Timezone" value={profile.timezone || "Asia/Kolkata"} options={ACCOUNT_TIMEZONE_OPTIONS} onChange={(event) => updateSetting("timezone", { timezone: event.target.value }, "Timezone updated")} />
      </Section>

      {view.industry ? <Section title="Google Calendar" description="Create Google Meet events when scheduling with writers.">{calendarState === "loading" ? <p className="ckm-account-settings__empty">Checking connection…</p> : calendarState === "error" ? <InlineMessage>Calendar status is unavailable.</InlineMessage> : <div className="ckm-account-settings__integration"><span><strong>{calendar.connected ? "Connected" : "Not connected"}</strong><small>{calendar.calendarEmail || (calendar.configured === false ? "Not configured on the server" : "Connect your calendar")}</small></span><Button variant={calendar.connected ? "secondary" : "primary"} disabled={calendar.configured === false} pending={busy.startsWith("calendar-")} onClick={calendar.connected ? disconnectCalendar : connectCalendar}>{calendar.connected ? "Disconnect" : "Connect"}</Button></div>}</Section> : null}

      <Section title="Blocked users">
        {!view.blockedUsers.length ? <p className="ckm-account-settings__empty">No blocked users.</p> : view.blockedUsers.map((member) => <div className="ckm-account-settings__member" key={member.id}><span><strong>{member.name}</strong><small>{member.role}</small></span><Button variant="tertiary" onClick={async () => { const result = await run(`unblock-${member.id}`, () => unblockAccountUser(member.id), "Member unblocked"); if (result.ok) syncProfile({ blockedUsers: (profile.blockedUsers || []).filter((entry) => String(entry?._id || entry) !== member.id) }); }}>Unblock</Button></div>)}
      </Section>

      {view.writer ? <Section title={`Deleted projects (${view.deletedProjects.length})`}>{!view.deletedProjects.length ? <p className="ckm-account-settings__empty">No deleted projects yet.</p> : view.deletedProjects.map((project) => <div className="ckm-account-settings__deleted" key={project.id}><span><strong>{project.title}</strong><small>{project.detail || "Project"}</small></span><time dateTime={project.deletedAt || undefined}>{project.deletedAt ? new Date(project.deletedAt).toLocaleDateString() : "Deleted"}</time></div>)}</Section> : null}

      <Section title="Danger zone" tone="danger">
        {view.canDelete ? <div className="ckm-account-settings__danger"><span><strong>Delete account</strong><small>Deactivate your profile and remove it across Ckript.</small></span><Button variant="destructive" onClick={() => { setDeleteReason(""); setConfirmation({ type: "delete" }); }}>Delete</Button></div> : <InlineMessage tone="warning">Admin accounts cannot be deleted from profile settings.</InlineMessage>}
      </Section>
    </div>,
    overlays,
  );
}
