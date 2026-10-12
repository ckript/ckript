import { useContext, useEffect, useState } from "react";
import { Check, CheckCircle2, Copy } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import { useDarkMode } from "../../context/DarkModeContext";
import PhaseTimeline from "../../components/competition/PhaseTimeline";
import TagSelect from "../../components/TagSelect";
import {
  CHALLENGE_DETAIL_STATUS,
} from "./challengeDetail";
import useChallengeDetail from "./useChallengeDetail";
import {
  challengeRegistrationMode,
  challengeRegistrationPaths,
  challengeRegistrationPrices,
  REGISTRATION_COUNTRIES,
  REGISTRATION_EXPERIENCE,
  REGISTRATION_GENRES,
  REGISTRATION_LANGUAGES,
} from "./challengeRegistration";
import useChallengeRegistration from "./useChallengeRegistration";
import PriceBreakdown from "../../components/checkout/PriceBreakdown";
import { formatSubunits } from "../../utils/currency";
import { payLabel } from "../../utils/taxes";
import ExternalRegistrationPanel from "./ExternalRegistrationPanel";
import "./challenge.css";

const Field = ({ label, htmlFor, required, hint, error, children }) => (
  <div>
    <label htmlFor={htmlFor} className="ckc-meta block">
      {label} {required ? <span style={{ color: "var(--ckc-accent-text)" }}>Required</span> : <span>(optional)</span>}
    </label>
    {hint ? <p style={{ marginTop: 5, fontSize: 13, color: "var(--ckc-muted)" }}>{hint}</p> : null}
    <div className="mt-2.5">{children}</div>
    {error ? <p role="alert" style={{ marginTop: 7, fontSize: 13, color: "var(--ckc-accent-text)" }}>{error}</p> : null}
  </div>
);

const CONTROL = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--ckc-rule)",
  borderRadius: 3,
  background: "var(--ckc-card)",
  color: "var(--ckc-ink)",
  fontFamily: "var(--ckc-sans)",
  fontSize: "0.9375rem",
};
const control = (invalid) => ({ ...CONTROL, borderColor: invalid ? "var(--ckc-accent)" : "var(--ckc-rule)" });

const saveInvoice = (blob, invoiceNumber) => {
  const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${invoiceNumber || "invoice"}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export default function CompetitionRegister() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext) || {};
  const { isDarkMode } = useDarkMode();
  const [searchParams] = useSearchParams();
  const slug = searchParams.get("c") || "";
  const detail = useChallengeDetail({ slug, user, poll: false });
  const competition = detail.public.data?.competition || null;
  const phase = detail.public.data?.phase || null;
  const timeline = detail.public.data?.timeline || [];
  const serverNow = detail.public.data?.serverNow || null;
  const entry = detail.entry.data || null;
  const paths = challengeRegistrationPaths(competition, slug);
  const registration = useChallengeRegistration({ competition, user, enabled: Boolean(competition), onComplete: detail.retryEntry });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (detail.public.status !== CHALLENGE_DETAIL_STATUS.READY || registration.success) return;
    if (!competition) navigate("/challenge", { replace: true });
    else if (entry) navigate(paths.dashboard, { replace: true });
    else if (phase !== "registration_open") navigate(paths.detail, { replace: true });
  }, [competition, detail.public.status, entry, navigate, paths.dashboard, paths.detail, phase, registration.success]);

  const takeInvoice = async () => {
    const result = await registration.downloadInvoice();
    if (!result.ok) {
      registration.setServerError(result.message);
      return;
    }
    saveInvoice(result.data, registration.success?.invoice?.invoiceNumber);
  };

  if (detail.public.status === CHALLENGE_DETAIL_STATUS.FAILED) {
    return <div className="ckc" style={{ minHeight: "100vh" }}><div className="mx-auto max-w-3xl px-4 py-20 text-center"><h1 className="ckc-title ckc-h2">Registration could not be loaded</h1><p className="ckc-lede">{detail.public.failure?.message}</p><button type="button" className="ckc-btn mt-6" onClick={detail.refresh}>Try again</button></div></div>;
  }

  if (detail.public.status === CHALLENGE_DETAIL_STATUS.LOADING || !competition) {
    return <div className="ckc" style={{ minHeight: "100vh" }}><div className="mx-auto max-w-3xl px-4 py-20 text-center"><p className="ckc-meta">Loading…</p></div></div>;
  }

  if (registration.success) {
    const eventId = registration.success.entry?.eventId || "";
    const invoice = registration.success.invoice || null;
    return (
      <div className="ckc" style={{ minHeight: "100vh" }}>
        <div className="mx-auto max-w-3xl px-4 py-12">
          <div className="ckc-card ckc-card-pad text-center" style={{ padding: "40px 32px" }}>
            <CheckCircle2 className="mx-auto h-12 w-12" style={{ color: "var(--ckc-accent)" }} aria-hidden="true" />
            <h1 className="ckc-title ckc-h2" style={{ marginTop: 18 }}>You&apos;re registered!</h1>
            <p className="ckc-lede" style={{ margin: "10px auto 0" }}>You&apos;re in for <strong>{competition.name}</strong>. Keep your Event ID.</p>
            <div className="mx-auto mt-7 inline-flex items-center gap-3 px-5 py-3" style={{ background: "var(--ckc-cream)", border: "1px solid var(--ckc-rule)", borderRadius: 3 }}>
              <span className="ckc-mono" style={{ fontSize: "1.25rem", letterSpacing: "0.14em" }}>{eventId}</span>
              <button type="button" aria-label="Copy Event ID" onClick={() => { navigator.clipboard?.writeText(eventId); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
            {invoice?._id ? <p style={{ marginTop: 18, fontSize: 14 }}>Invoice <span className="ckc-mono">{invoice.invoiceNumber}</span> · <button type="button" className="ckc-link" disabled={registration.invoiceBusy} onClick={takeInvoice}>{registration.invoiceBusy ? "Preparing…" : "Download PDF"}</button></p> : null}
            <div className="mx-auto mt-8 max-w-sm text-left"><PhaseTimeline steps={registration.success.timeline || timeline} serverNow={serverNow} compact /></div>
            {registration.serverError ? <p role="alert" style={{ marginTop: 16, color: "var(--ckc-accent-text)" }}>{registration.serverError}</p> : null}
            <button type="button" onClick={() => navigate(paths.dashboard)} className="ckc-btn mt-8">Go to my dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  const mode = challengeRegistrationMode(competition);
  const prices = challengeRegistrationPrices(competition);
  const externalPending = registration.external.request?.status === "pending";

  return (
    <div className="ckc" style={{ minHeight: "100vh" }}>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <header className="ckc-masthead">
          <span className="ckc-chip ckc-chip-live" style={{ alignSelf: "flex-start" }}><span className="ckc-dot" aria-hidden="true" /> Registration open</span>
          <h1 className="ckc-title ckc-h1">Register for {competition.name}</h1>
          <p className="ckc-lede">A few details so we can group entries and tailor your experience. This takes a minute.</p>
        </header>

        {registration.recovering ? <div className="ckc-card ckc-card-pad mt-7"><strong>Confirming your payment…</strong><p>Checking the captured order directly with Razorpay.</p></div> : null}
        {!registration.recovering && registration.pendingPayment ? <div className="ckc-card ckc-card-pad mt-7"><strong>A payment on this device still needs confirmation</strong><p style={{ marginTop: 6 }}>Confirming it does not charge you again.</p><button type="button" className="ckc-btn-ghost mt-4" onClick={() => registration.recoverPayment()}>Confirm payment</button></div> : null}

        <form onSubmit={(event) => { event.preventDefault(); registration.submit(); }} className="mt-9 space-y-6">
          <div className="ckc-card ckc-card-pad"><h2 className="ckc-title ckc-h3">Your account</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2"><div><dt className="ckc-meta">Name</dt><dd>{user?.name || "—"}</dd></div><div><dt className="ckc-meta">Email</dt><dd className="break-all">{user?.email || "—"}</dd></div></dl></div>
          <div className="ckc-card ckc-card-pad space-y-6">
            <Field label="Country" htmlFor="reg-country" required error={registration.errors.country}><select id="reg-country" value={registration.form.country} onChange={(event) => registration.setField("country", event.target.value)} aria-invalid={Boolean(registration.errors.country)} style={{ ...control(Boolean(registration.errors.country)), colorScheme: isDarkMode ? "dark" : "light" }}><option value="">Select your country…</option>{REGISTRATION_COUNTRIES.map((country) => <option key={country}>{country}</option>)}</select></Field>
            <Field label="Preferred language" htmlFor="reg-language" required error={registration.errors.language}><TagSelect dark={isDarkMode} id="reg-language" options={REGISTRATION_LANGUAGES} value={registration.form.language} onChange={(value) => registration.setField("language", value)} ariaLabel="Preferred language" /></Field>
            <Field label="Preferred genres" htmlFor="reg-genres" required hint="Pick up to three." error={registration.errors.genres}><TagSelect dark={isDarkMode} id="reg-genres" options={REGISTRATION_GENRES} value={registration.form.genres} onChange={(value) => registration.setField("genres", value)} multiple max={3} ariaLabel="Preferred genres" /></Field>
            <Field label="Experience level" htmlFor="reg-experienceLevel" required error={registration.errors.experienceLevel}><TagSelect dark={isDarkMode} id="reg-experienceLevel" options={REGISTRATION_EXPERIENCE} value={registration.form.experienceLevel} onChange={(value) => registration.setField("experienceLevel", value)} ariaLabel="Experience level" /></Field>
            <Field label="Portfolio link" htmlFor="reg-portfolioUrl" error={registration.errors.portfolioUrl}><input id="reg-portfolioUrl" type="url" value={registration.form.portfolioUrl} onChange={(event) => registration.setField("portfolioUrl", event.target.value)} aria-invalid={Boolean(registration.errors.portfolioUrl)} placeholder="https://" style={control(Boolean(registration.errors.portfolioUrl))} /></Field>
          </div>

          <div className="ckc-card ckc-card-pad space-y-4">
            <label className="flex cursor-pointer gap-3"><input type="checkbox" checked={registration.acceptRules} onChange={(event) => registration.setAcceptance("acceptRules", event.target.checked)} /><span>I accept the <Link to={`${paths.detail}#rules`} className="ckc-link">competition rules</Link>.</span></label>{registration.errors.acceptRules ? <p role="alert" style={{ color: "var(--ckc-accent-text)" }}>{registration.errors.acceptRules}</p> : null}
            <label className="flex cursor-pointer gap-3"><input type="checkbox" checked={registration.acceptCopyright} onChange={(event) => registration.setAcceptance("acceptCopyright", event.target.checked)} /><span>I confirm that the work I submit will be my own original writing.</span></label>{registration.errors.acceptCopyright ? <p role="alert" style={{ color: "var(--ckc-accent-text)" }}>{registration.errors.acceptCopyright}</p> : null}
          </div>

          {mode === "paid" ? <fieldset className="ckc-card ckc-card-pad"><legend className="ckc-title ckc-h3">Payment currency</legend><div className="mt-4 grid gap-3 sm:grid-cols-2">{[{ value: "INR", label: `INR (${formatSubunits(prices.INR, "INR")})` }, { value: "USD", label: `USD (${formatSubunits(prices.USD, "USD")})` }].map((option) => <label key={option.value} className="flex min-h-11 items-center gap-3"><input type="radio" name="registration-currency" value={option.value} checked={registration.currency === option.value} onChange={(event) => registration.setCurrency(event.target.value)} />{option.label}</label>)}</div>{registration.breakdown ? <div className="mt-4"><PriceBreakdown breakdown={registration.breakdown} note="Taxes are added to the entry fee at checkout." /></div> : null}</fieldset> : null}

          {registration.serverError ? <div role="alert" className="px-4 py-3" style={{ background: "var(--ckc-blush)", border: "1px solid var(--ckc-accent)", color: "var(--ckc-accent-text)" }}>{registration.serverError}</div> : null}
          {registration.gatewayBlocked && mode === "paid" ? <p>The checkout script is blocked. Pressing pay will try to load it again.</p> : null}
          <div className="flex items-center gap-5"><button type="submit" disabled={registration.processing || externalPending} className="ckc-btn">{registration.processing ? "Processing…" : mode === "free" ? "Register" : registration.breakdown ? `${payLabel(registration.breakdown)} and register` : "Pay to register"}</button><Link to={paths.detail} className="ckc-link">Back to the challenge</Link></div>
        </form>

        {mode === "paid" ? <ExternalRegistrationPanel state={registration.external} /> : null}
      </div>
    </div>
  );
}
