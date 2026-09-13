import { useContext, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AuthContext } from "../../../context/AuthContext";
import { EXTERNAL_EVENT_PROVIDERS, getProvider } from "../../../data/externalEventProviders";
import {
  CHALLENGE_DETAIL_STATUS,
} from "../../../pages/challenge/challengeDetail";
import useChallengeDetail from "../../../pages/challenge/useChallengeDetail";
import {
  challengeRegistrationMode,
  challengeRegistrationPaths,
  challengeRegistrationPrices,
  MAX_EXTERNAL_SCREENSHOT_BYTES,
  REGISTRATION_COUNTRIES,
  REGISTRATION_EXPERIENCE,
  REGISTRATION_GENRES,
  REGISTRATION_LANGUAGES,
} from "../../../pages/challenge/challengeRegistration";
import useChallengeRegistration from "../../../pages/challenge/useChallengeRegistration";
import { isWriterRole } from "../../../utils/industryAccess";
import Badge from "../../components/badges/Badge";
import Button from "../../components/buttons/Button";
import IconButton from "../../components/buttons/IconButton";
import Card, { CardBody, CardText, CardTitle } from "../../components/cards/Card";
import EmptyState from "../../components/EmptyState";
import InlineMessage from "../../components/feedback/InlineMessage";
import SkeletonGroup, { SkeletonShape } from "../../components/feedback/Skeletons";
import Checkbox from "../../components/forms/Checkbox";
import ChipSelect from "../../components/forms/ChipSelect";
import FilePicker from "../../components/forms/FilePicker";
import RadioGroup from "../../components/forms/RadioGroup";
import SelectField from "../../components/forms/SelectField";
import TextField from "../../components/forms/TextField";
import PageHeader from "../../components/app-bars/PageHeader";
import MobileShell from "../../shell/MobileShell";
import {
  CHALLENGE_REGISTRATION_SHELL_MODE,
  CHALLENGE_REGISTRATION_SHELL_SLOTS,
  saveRegistrationInvoice,
} from "./challengeRegistrationChrome";
import "./ChallengeRegisterMobile.css";

function RegistrationSuccess({ competition, paths, state }) {
  const eventId = state.success?.entry?.eventId || "";
  const invoice = state.success?.invoice || null;
  const takeInvoice = async () => {
    const result = await state.downloadInvoice(invoice);
    if (!result.ok) {
      state.setServerError(result.message);
      return;
    }
    if (!saveRegistrationInvoice(result.data, invoice.invoiceNumber)) {
      state.setServerError("This browser would not save the invoice. It remains available from your dashboard.");
    }
  };
  return (
    <section className="ckm-challenge-register__success" aria-labelledby="challenge-register-success">
      <Badge tone="success">Registration complete</Badge>
      <h2 id="challenge-register-success">You&apos;re in.</h2>
      <p>Your place in <strong>{competition.name}</strong> is confirmed. Keep this Event ID with your records.</p>
      <div className="ckm-challenge-register__event-id"><span>{eventId}</span></div>
      <div className="ckm-challenge-register__success-actions">
        <Button fullWidth to={paths.dashboard}>Open challenge dashboard</Button>
        {invoice?._id ? <Button fullWidth variant="secondary" icon="receipt_long" pending={state.invoiceBusy} pendingLabel="Preparing invoice…" onClick={takeInvoice}>Download invoice {invoice.invoiceNumber}</Button> : null}
      </div>
      {state.serverError ? <InlineMessage tone="warning">{state.serverError}</InlineMessage> : null}
    </section>
  );
}

function ExternalClaim({ state, dashboardPath }) {
  const request = state.request;
  const provider = getProvider(state.fields.provider);
  if (state.loading) return <SkeletonShape height={96} radius="var(--ckm-r-lg)" />;
  if (request?.status === "approved") return <InlineMessage tone="success" title="Registration confirmed" action={<Button to={dashboardPath}>Open dashboard</Button>}>We verified your {request.providerName} registration. Your challenge entry is active.</InlineMessage>;
  if (request?.status === "pending") return <InlineMessage tone="info" title="With our team for review">We&apos;re checking your {request.providerName} reference {request.externalRef}. Do not pay again while this is pending; you&apos;ll receive the decision by email.</InlineMessage>;
  return (
    <div className="ckm-challenge-register__external-fields">
      {request?.status === "rejected" ? <InlineMessage tone="warning" title="We could not confirm that">{request.reviewNote || "Correct the details and send the claim again."}</InlineMessage> : null}
      <RadioGroup label="Platform" name="external-platform" required options={EXTERNAL_EVENT_PROVIDERS.map((item) => ({ value: item.slug, label: item.name, description: item.refLabel }))} value={state.fields.provider} onChange={(event) => state.setFields((current) => ({ ...current, provider: event.target.value }))} />
      <TextField label="Name on that registration" required value={state.fields.fullName} onChange={(event) => state.setFields((current) => ({ ...current, fullName: event.target.value }))} />
      <TextField label="Phone number used" required purpose="tel" value={state.fields.phone} onChange={(event) => state.setFields((current) => ({ ...current, phone: event.target.value }))} />
      <TextField label={provider?.refLabel || "Registration or booking ID"} required hint={provider?.hint || "Use the identifier from your ticket or confirmation."} value={state.fields.externalRef} onChange={(event) => state.setFields((current) => ({ ...current, externalRef: event.target.value }))} />
      <FilePicker
        label="Proof screenshot"
        hint="Optional. JPG, PNG, WebP or HEIC, up to 8MB."
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        files={state.screenshot ? [state.screenshot] : []}
        error={state.error}
        disabled={state.submitting}
        onSelect={(files) => {
          const file = files[0] || null;
          if (file?.size > MAX_EXTERNAL_SCREENSHOT_BYTES) {
            state.setError("Screenshot must be 8MB or smaller.");
            state.setScreenshot(null);
            return;
          }
          state.setError("");
          state.setScreenshot(file);
        }}
        onRemove={() => state.setScreenshot(null)}
      />
    </div>
  );
}

export default function ChallengeRegisterMobile({ user: userProp = undefined, previewState = null, previewSlug = "" }) {
  const auth = useContext(AuthContext) || {};
  const user = userProp === undefined ? auth.user : userProp;
  const [searchParams] = useSearchParams();
  const slug = previewSlug || searchParams.get("c") || "";
  const liveDetail = useChallengeDetail({ slug, user, poll: false, enabled: !previewState });
  const detail = previewState?.detail || liveDetail;
  const competition = detail.public.data?.competition || null;
  const phase = detail.public.data?.phase || null;
  const liveRegistration = useChallengeRegistration({ competition, user, enabled: !previewState, onComplete: detail.retryEntry });
  const registration = previewState?.registration || liveRegistration;
  const paths = challengeRegistrationPaths(competition, slug);
  const mode = challengeRegistrationMode(competition);
  const prices = challengeRegistrationPrices(competition);
  const [selectedAdmission, setSelectedAdmission] = useState("ckript");
  const externalStatus = registration.external?.request?.status || "";
  const admission = externalStatus ? "external" : selectedAdmission;

  const header = <PageHeader title={competition?.name || "Challenge registration"} subtitle="Registration" backTo={paths.detail} backLabel="Back to challenge" />;
  const footer = useMemo(() => {
    if (!competition || registration.success || detail.entry.data || phase !== "registration_open" || !isWriterRole(user)) return null;
    if (admission === "external" && ["pending", "approved"].includes(externalStatus)) return null;
    const external = admission === "external";
    return (
      <div className="ckm-challenge-register__footer">
        {(registration.serverError || (external && registration.external.error)) ? <p>{registration.serverError || registration.external.error}</p> : null}
        <Button type="submit" form="ckm-challenge-register-form" fullWidth pending={external ? registration.external.submitting : registration.processing} pendingLabel={external ? "Sending…" : "Processing…"}>{external ? (externalStatus === "rejected" ? "Send corrected claim" : "Send for verification") : mode === "free" ? "Register for free" : "Continue to payment"}</Button>
      </div>
    );
  }, [admission, competition, detail.entry.data, externalStatus, mode, phase, registration, user]);

  const shell = (children, bottom = footer) => (
    <MobileShell mode={CHALLENGE_REGISTRATION_SHELL_MODE} slots={bottom ? CHALLENGE_REGISTRATION_SHELL_SLOTS : null} screenId="challenge-register" className="ckm-challenge-register" scrollClassName="ckm-challenge-register__scroll" appBar={header} bottomNav={bottom} onConnectionRestored={detail.refresh}>{children}</MobileShell>
  );

  if (detail.public.status === CHALLENGE_DETAIL_STATUS.LOADING) return shell(<SkeletonGroup label="Loading registration"><SkeletonShape height={100} radius="var(--ckm-r-lg)" /><SkeletonShape height={280} radius="var(--ckm-r-lg)" /></SkeletonGroup>, null);
  if (detail.public.status === CHALLENGE_DETAIL_STATUS.FAILED) return shell(<InlineMessage variant="panel" title="Registration could not be loaded" onRetry={detail.refresh}>{detail.public.failure?.message}</InlineMessage>, null);
  if (!competition) return shell(<EmptyState titleAs="h2" icon="event_busy" title="Challenge not found" body="The challenge may be unavailable or the link may be incorrect." actions={<Button to="/challenge">Browse challenges</Button>} />, null);
  if (!isWriterRole(user)) return shell(<EmptyState titleAs="h2" icon="edit_off" title="A writer account is required" body="Only writer and creator accounts can enter a screenwriting challenge." actions={<Button variant="secondary" to={paths.detail}>Return to challenge</Button>} />, null);
  if (detail.entry.status === CHALLENGE_DETAIL_STATUS.LOADING) return shell(<SkeletonGroup label="Checking your entry"><SkeletonShape height={120} radius="var(--ckm-r-lg)" /></SkeletonGroup>, null);
  if (registration.success) return shell(<RegistrationSuccess competition={competition} paths={paths} state={registration} />, null);
  if (detail.entry.data) return shell(<EmptyState titleAs="h2" icon="check_circle" title="You are already registered" body={`Your Event ID is ${detail.entry.data.eventId}. Open the dashboard to continue.`} actions={<Button to={paths.dashboard}>Open dashboard</Button>} />, null);
  if (phase !== "registration_open") return shell(<EmptyState titleAs="h2" icon="event_busy" title="Registration is not open" body="The challenge record has the current schedule and next available action." actions={<Button variant="secondary" to={paths.detail}>View challenge</Button>} />, null);

  const submit = (event) => {
    event.preventDefault();
    if (admission === "external") registration.external.submit();
    else registration.submit();
  };

  return shell(
    <form id="ckm-challenge-register-form" onSubmit={submit} className="ckm-challenge-register__form" noValidate>
      <section className="ckm-challenge-register__intro"><Badge tone="accent">Registration open</Badge><h2>Enter {competition.name}</h2><p>One profile form, then either pay Ckript or verify a registration you already paid for elsewhere.</p></section>

      {registration.recovering ? <InlineMessage tone="info" title="Confirming your captured payment">Checking the persisted order directly with Razorpay. This does not charge you again.</InlineMessage> : null}
      {!registration.recovering && registration.pendingPayment ? <InlineMessage tone="warning" title="A payment still needs confirmation" action={<Button variant="secondary" onClick={() => registration.recoverPayment()}>Confirm payment</Button>}>The charge is saved on this device. Confirm it before opening another checkout.</InlineMessage> : null}

      <Card><CardBody><CardTitle as="h2">Your account</CardTitle><dl className="ckm-challenge-register__account"><div><dt>Name</dt><dd>{user?.name || "—"}</dd></div><div><dt>Email</dt><dd>{user?.email || "—"}</dd></div></dl></CardBody></Card>

      <section className="ckm-challenge-register__section" aria-labelledby="registration-profile"><h2 id="registration-profile">Entry profile</h2>
        <SelectField label="Country" required placeholder="Select your country" options={REGISTRATION_COUNTRIES} value={registration.form.country} error={registration.errors.country} onChange={(event) => registration.setField("country", event.target.value)} />
        <SelectField label="Preferred language" required placeholder="Choose a language" options={REGISTRATION_LANGUAGES} value={registration.form.language} error={registration.errors.language} onChange={(event) => registration.setField("language", event.target.value)} />
        <ChipSelect label="Preferred genres" required multiple max={3} options={REGISTRATION_GENRES} value={registration.form.genres} error={registration.errors.genres} hint="Choose up to three." onChange={(value) => registration.setField("genres", value)} />
        <RadioGroup label="Experience level" required name="experience-level" options={REGISTRATION_EXPERIENCE} value={registration.form.experienceLevel} error={registration.errors.experienceLevel} onChange={(event) => registration.setField("experienceLevel", event.target.value)} />
        <TextField label="Portfolio link" optional purpose="url" placeholder="https://" value={registration.form.portfolioUrl} error={registration.errors.portfolioUrl} onChange={(event) => registration.setField("portfolioUrl", event.target.value)} />
      </section>

      <section className="ckm-challenge-register__section" aria-labelledby="registration-legal"><h2 id="registration-legal">Before you enter</h2><Checkbox id="challenge-rules" label="I accept the competition rules" description="The rules on the challenge record govern eligibility, conduct and judging." checked={registration.acceptRules} error={registration.errors.acceptRules} onChange={(event) => registration.setAcceptance("acceptRules", event.target.checked)} /><Button variant="tertiary" to={`${paths.detail}#rules`}>Read competition rules</Button><Checkbox id="challenge-copyright" label="I confirm this will be my original work" description="The script I submit will be my own writing produced for this challenge." checked={registration.acceptCopyright} error={registration.errors.acceptCopyright} onChange={(event) => registration.setAcceptance("acceptCopyright", event.target.checked)} /></section>

      {mode === "paid" ? <section className="ckm-challenge-register__section" aria-labelledby="admission-path"><h2 id="admission-path">How are you entering?</h2><RadioGroup label="Admission path" name="admission-path" value={admission} onChange={(event) => setSelectedAdmission(event.target.value)} options={[{ value: "ckript", label: "Pay with Ckript", description: "Use Razorpay and receive a Ckript invoice." }, { value: "external", label: "I already paid elsewhere", description: "Send a ticket or booking reference for manual verification." }]} />{admission === "ckript" ? <><RadioGroup label="Payment currency" name="payment-currency" value={registration.currency} onChange={(event) => registration.setCurrency(event.target.value)} options={[{ value: "INR", label: `INR · ₹${prices.INR / 100}`, description: "Charged in Indian rupees." }, { value: "USD", label: `USD · $${prices.USD / 100}`, description: "Charged in US dollars; Razorpay may fall back to INR." }]} />{registration.gatewayBlocked ? <InlineMessage tone="warning">Checkout is blocked or not loaded. Continuing will try the provider script again.</InlineMessage> : null}</> : <ExternalClaim state={registration.external} dashboardPath={paths.dashboard} />}</section> : <InlineMessage tone="info" title="Free registration">No payment is required for this challenge.</InlineMessage>}

      {registration.serverError ? <InlineMessage>{registration.serverError}</InlineMessage> : null}
      <Card><CardBody><CardTitle as="h2">What happens next</CardTitle><CardText>Paid entries are confirmed immediately after capture. Third-party claims are reviewed by a person and confirmed by email. Your exact challenge dashboard opens from the receipt.</CardText></CardBody></Card>
    </form>,
  );
}
