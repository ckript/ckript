import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Film,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Play,
  Printer,
  Users,
  X,
} from "lucide-react";
import SocialShareButton from "../../components/SocialShareButton";
import ProducerRatingCard from "../../components/ProducerRatingCard";
import ScreenplayPdfViewer from "../../components/ScreenplayPdfViewer";
import ScreenplayReadOnly from "../../components/ScreenplayReadOnly";
import MeetingModal from "../../components/MeetingModal";
import ProjectCard from "../../components/ProjectCard";
import { formatCurrency } from "../../utils/currency";
import { getScriptWriters, formatWriterNames, getCreditTypeLabel as creditLabel } from "../../utils/writerCredits";
import { useScrollLock } from "../../hooks/useScrollLock";
import {
  MODIFICATION_LABELS,
  NEGOTIATION_LABELS,
  PAYMENT_LABELS,
  RIGHTS_TYPE_SHORT_LABELS,
} from "../../pages/script-detail/scriptDealLabels";
import "./ScriptWorkbenchPage.css";

/* ── Rights / deal label maps ──
 * DEF-28: these were four private copies of a closed schema enum, and this one had drifted — its
 * negotiation map was missing `ckript_not_involved`, so a writer who chose that term had it shown
 * to buyers as "Not specified". One shared vocabulary now; see scriptDealLabels.js. */
const RIGHTS_LABELS = RIGHTS_TYPE_SHORT_LABELS;

const money = (value) => formatCurrency(Number(value || 0), "INR");
const initials = (name = "") =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CK";
const text = (value, fallback = "Not provided") => String(value || "").trim() || fallback;
const gradeFor = (v = 0) => (v >= 85 ? "Grade A" : v >= 70 ? "Grade B" : v >= 55 ? "Grade C" : "Under review");
// Evaluation fields arrive as either arrays or delimited strings depending on the
// scorer version — normalise to a clean array of non-empty items.
const toList = (value) => {
  if (Array.isArray(value)) return value.filter((item) => String(item ?? "").trim());
  const str = String(value ?? "").trim();
  if (!str) return [];
  return str.split(/\s*[\n•;·]\s*|\s*,\s*/).map((item) => item.trim()).filter(Boolean);
};

/* ── Portalled overlay with focus trap + scroll lock ── */
function WbOverlay({ open, onClose, title, eyebrow, wide = false, children }) {
  const titleId = useId();
  const surfaceRef = useRef(null);
  const triggerRef = useRef(null);
  useScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;
    triggerRef.current = document.activeElement;
    const surface = surfaceRef.current;
    const sel = "button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex='0']";
    surface?.querySelector(sel)?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !surface) return;
      const nodes = [...surface.querySelectorAll(sel)];
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.setTimeout(() => triggerRef.current?.focus?.(), 0);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="script-workbench-page-overlay" role="presentation">
      <button type="button" className="script-workbench-page-overlay__backdrop" aria-label={`Close ${title}`} onClick={onClose} />
      <section ref={surfaceRef} className={`script-workbench-page-overlay__surface${wide ? " is-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="script-workbench-page-overlay__head">
          <div>
            {eyebrow && <p className="script-workbench-page-overlay__eyebrow">{eyebrow}</p>}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button type="button" className="swb-iconbtn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="script-workbench-page-overlay__body">{children}</div>
      </section>
    </div>,
    document.body
  );
}

function ScoreBars({ score = {} }) {
  const rows = [
    ["Plot", score.plot],
    ["Characters", score.characters],
    ["Dialogue", score.dialogue],
    ["Pacing", score.pacing],
    ["Marketability", score.marketability],
  ];
  return (
    <div className="swb-bars">
      {rows.map(([label, value]) => {
        const v = Math.max(0, Math.min(100, Number(value || 0)));
        return (
          <div className="swb-bar" key={label}>
            <span>{label}</span>
            <i className="track"><b className={v < 60 ? "warn" : ""} style={{ width: `${v}%` }} /></i>
            <strong>{Number(value || 0) || "—"}</strong>
          </div>
        );
      })}
    </div>
  );
}

/* ── Modals (wired to real vm handlers) ── */
function TrailerDialog({ vm, open, onClose }) {
  const choices = {
    duration: [["30", "30 sec"], ["60", "60 sec"], ["90", "90 sec"]],
    quality: [["480", "480p"], ["720", "720p"]],
    format: [["landscape", "Landscape · 16:9"], ["portrait", "Portrait · 9:16"]],
    currency: [["inr", "INR · ₹"], ["usd", "USD · $"]],
  };
  const getters = { duration: vm.trailerDurationChoice, quality: vm.trailerQualityChoice, format: vm.trailerFormatChoice, currency: vm.trailerCurrencyChoice };
  const setters = { duration: vm.setTrailerDurationChoice, quality: vm.setTrailerQualityChoice, format: vm.setTrailerFormatChoice, currency: vm.setTrailerCurrencyChoice };
  return (
    <WbOverlay open={open} onClose={onClose} title="Configure your trailer" eyebrow="Promotional asset · creator only" wide>
      <p className="swb-prose" style={{ marginBottom: 14 }}>Choose the production package. Pricing and payment remain server-authoritative through the existing Razorpay workflow.</p>
      {Object.entries(choices).map(([group, items]) => (
        <fieldset className="swb-choice" key={group}>
          <legend>{group}</legend>
          <div className="swb-choice__opts">
            {items.map(([value, label]) => (
              <button type="button" key={value} className={getters[group] === value ? "is-selected" : ""} onClick={() => setters[group](value)}>{label}</button>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="swb-order">
        <div><small>Selected package</small><b>{vm.trailerDurationChoice}s · {vm.trailerQualityChoice}p · {vm.trailerFormatChoice}</b></div>
        <strong>{vm.selectedTrailerPrefix} {vm.formatTrailerAmount(vm.selectedTrailerAmount)}</strong>
      </div>
      <button type="button" className="swb-btn swb-btn--accent swb-btn--full" disabled={!vm.trailerCurrencyChoice || vm.trailerLoading} onClick={async () => { await vm.handleGenerateTrailer(); onClose(); }}>
        {vm.trailerLoading ? "Opening payment…" : "Continue to secure payment"}
      </button>
    </WbOverlay>
  );
}

function PurchaseDialog({ vm, open, onClose }) {
  const [step, setStep] = useState(1);
  const [note, setNote] = useState("");
  const rights = vm.script?.rightsLicensing || {};
  const close = () => { setStep(1); setNote(""); onClose(); };
  return (
    <WbOverlay open={open} onClose={close} title={step === 1 ? "Request to purchase" : "Review rights and conditions"} eyebrow={`Step ${step} of 2`} wide={step === 2}>
      {step === 1 ? (
        <>
          <p className="swb-prose">You are asking {text(vm.script?.creator?.name, "the writer")} to approve purchase access to “{text(vm.script?.title)}”. No payment is taken now.</p>
          <div className="swb-purchase-amt"><small>Script price</small><strong>{money(vm.script?.price)}</strong><span>Plus a 5% platform fee and taxes, shown in full at checkout after the writer approves</span></div>
          <dl className="swb-kv"><div><dt>Rights</dt><dd>{RIGHTS_LABELS[rights?.rightsType] || "Not specified"}</dd></div><div><dt>Payment window</dt><dd>72 hours</dd></div><div><dt>Full access</dt><dd>After verified payment</dd></div></dl>
          <div className="swb-modal-actions"><button type="button" className="swb-btn" onClick={close}>Cancel</button><button type="button" className="swb-btn swb-btn--primary" onClick={() => setStep(2)}>Review conditions <ChevronRight size={14} /></button></div>
        </>
      ) : (
        <>
          <div className="swb-terms">
            <h3>Rights summary</h3>
            <ul>
              <li><strong>Rights:</strong> {RIGHTS_LABELS[rights?.rightsType] || "Not specified"}</li>
              {rights?.rightsType === "exclusive_license" && rights?.timeBound?.licenseDurationMonths && <li><strong>License duration:</strong> {rights.timeBound.licenseDurationMonths} months</li>}
              <li><strong>Modification:</strong> {MODIFICATION_LABELS[rights?.modificationRights] || "Not specified"}</li>
              <li><strong>Payment:</strong> {PAYMENT_LABELS[rights?.paymentStructure] || "Not specified"}</li>
              <li><strong>Negotiation:</strong> {NEGOTIATION_LABELS[rights?.negotiationMode] || "Not specified"}</li>
            </ul>
            <h3>Writer conditions</h3>
            <p>{text(vm.writerCustomConditions, "No additional writer conditions.")}</p>
            <h3>Payment terms</h3>
            <p>The secure payment page collects the binding platform, writer, custom-condition, and rights acknowledgements after owner approval.</p>
          </div>
          <label className="swb-field" htmlFor="swb-purchase-note"><span>Message to the writer <span>Optional</span></span><textarea id="swb-purchase-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Why is this project a fit for you?" /></label>
          <div className="swb-modal-actions"><button type="button" className="swb-btn" onClick={() => setStep(1)}>Back</button><button type="button" className="swb-btn swb-btn--primary" disabled={vm.requestLoading} onClick={async () => { const ok = await vm.handleRequestPurchase(note); if (ok) close(); }}>{vm.requestLoading ? "Sending…" : "Send request"}</button></div>
        </>
      )}
    </WbOverlay>
  );
}

function ConfirmDialog({ open, onClose, title, description, confirmLabel, busy, danger, onConfirm, children }) {
  return (
    <WbOverlay open={open} onClose={onClose} title={title} eyebrow="Confirmation">
      <p className="swb-prose">{description}</p>
      {children}
      <div className="swb-modal-actions">
        <button type="button" className="swb-btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={`swb-btn ${danger ? "swb-btn--danger" : "swb-btn--primary"}`} onClick={onConfirm} disabled={busy}>{busy ? "Working…" : confirmLabel}</button>
      </div>
    </WbOverlay>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
export default function ScriptWorkbenchPage({ vm }) {
  const { script, capabilities, journey } = vm;
  const creator = script?.creator || {};
  const classification = script?.classification || {};
  const film = script?.filmDetails || {};
  const roles = Array.isArray(script?.roles) ? script.roles : [];
  const scoreObj = script?.scriptScore || {};
  const platform = script?.platformScore || {};
  const rights = script?.rightsLicensing || {};
  const tags = toList(script?.tags);
  const tones = toList(classification?.tones);
  const themes = toList(classification?.themes);
  const settings = toList(classification?.settings);
  const scriptStyle = toList(film?.scriptStyle);
  const credits = getScriptWriters(script);
  const scriptCredit = formatWriterNames(credits.map((w) => w.name));
  const producer = Number(script?.producerRating?.average || 0);
  const ai = Number(scoreObj?.overall || 0);
  const hasClassification = Boolean(
    (classification.tones?.length || classification.themes?.length || classification.settings?.length) ||
    classification.primaryGenre || script?.primaryGenre || script?.genre
  );

  /* Section index — dynamic on capability so we never expose empty/forbidden areas */
  const sections = useMemo(() => {
    const list = [
      { group: "Project", items: [
        { id: "summary", label: "Summary" },
        { id: "classification", label: "Classification" },
        { id: "roles", label: "Roles", count: roles.length || undefined },
      ] },
    ];
    const read = [];
    if (script?.viewableScript || journey.hasPreviewSource) read.push({ id: "preview", label: "Viewable Script", count: script?.scriptPreviewAccess?.start ? `${script.scriptPreviewAccess.start}–${script.scriptPreviewAccess.end}` : undefined });
    if (capabilities.fullScript && journey.hasFullSource) read.push({ id: "full", label: capabilities.owner ? "My Script" : "Full Script", count: script?.pageCount || undefined });
    read.push({ id: "evaluation", label: "Evaluation", count: ai || undefined });
    read.push({ id: "ratings", label: "Ratings", count: producer ? producer.toFixed(1) : undefined });
    list.push({ group: "Read & assess", items: read });
    const operate = [{ id: "deal", label: "Deal Terms" }];
    operate.push({ id: "contact", label: "Writer Contact" });
    if (capabilities.owner || capabilities.collaborator) operate.push({ id: "history", label: "Status & History" });
    list.push({ group: "Operate", items: operate });
    return list;
  }, [roles.length, script, journey, capabilities, ai, producer, vm.pendingRequestBadgeCount]);

  const firstId = sections[0].items[0].id;
  const [section, setSection] = useState(firstId);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [declineRequest, setDeclineRequest] = useState(null);
  const [declineNote, setDeclineNote] = useState("");
  const canvasRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const go = (id) => {
    if (id === "read") { setSection(capabilities.fullScript && journey.hasFullSource ? "full" : "preview"); vm.recordPreviewOpen?.(); }
    else setSection(id);
    setInspectorOpen(false);
    if (canvasRef.current) canvasRef.current.scrollTop = 0;
  };

  const pending = (vm.pendingRequests || []).filter((r) => r?.status === "pending");

  return (
    <main className={`script-workbench-page${vm.dark ? " is-dark" : ""}`} id="main-content">
      {vm.notice && (
        <div className={`swb-notice${vm.notice.type === "error" ? " swb-notice--error" : ""}`} role={vm.notice.type === "error" ? "alert" : "status"}>
          <span className="swb-notice__badge">{vm.notice.type === "error" ? "!" : "✓"}</span>
          <p>{vm.notice.message}</p>
          <button type="button" onClick={() => vm.setNotice(null)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}

      {/* Header */}
      <header className="swb-header">
        <button type="button" className="swb-thumb" onClick={() => (vm.canPlayTrailer ? setMediaOpen(true) : setSection("preview"))} aria-label={vm.canPlayTrailer ? "Play trailer" : "Open project media"}>
          {vm.resolvedHeroImage && !vm.showCoverPlaceholder ? (
            <img src={vm.resolvedHeroImage} alt="" onError={() => vm.setCoverError(true)} />
          ) : (
            <span className="swb-thumb__init" aria-hidden="true">{initials(script?.title)}</span>
          )}
          {vm.canPlayTrailer && <span className="swb-thumb__play"><Play size={16} /></span>}
        </button>

        <div>
          <div className="swb-crumb">
            <button type="button" onClick={vm.openProfile}><ArrowLeft size={13} />{creator?.name ? `${creator.name}'s profile` : "Writer profile"}</button>
            <span>/</span><span>{text(script?.title, "Untitled project")}</span>
          </div>
          <h1>{text(script?.title, "Untitled project")}</h1>
          <p className="swb-sub">
            {text(script?.logline || script?.synopsis, "No logline yet.")}
            {"  "}
            <b>{text(scriptCredit || creator?.name, "Writer")}</b> · {vm.fmtFormat(script?.format)} · {text(classification?.primaryGenre || script?.primaryGenre || script?.genre, "Unclassified")}
            {" · "}
            <span className={`swb-status swb-status--sm ${script?.status === "published" ? "swb-status--live" : "swb-status--warn"}`} style={{ verticalAlign: "middle" }}>{text(script?.status, "Draft")}</span>
          </p>
        </div>

        <div className="swb-actions">
          {capabilities.canEdit && <button type="button" className="swb-btn swb-btn--primary" onClick={vm.openEdit}><Pencil size={14} />{capabilities.owner ? "Edit Project" : "Co-write"}</button>}
          <SocialShareButton share={vm.scriptShare} className="swb-btn" buttonLabel="Share" />
          <button type="button" className="swb-btn" onClick={() => setInspectorOpen(true)}>Actions{vm.pendingRequestBadgeCount ? <b className="swb-btn__count">{vm.pendingRequestBadgeCount}</b> : null}</button>
          <div ref={menuRef} style={{ position: "relative" }}>
            <button type="button" className="swb-btn swb-btn--ghost" aria-label="More tools" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}><MoreHorizontal size={16} /></button>
            {menuOpen && (
              <div className="swb-menu" role="menu" style={{ top: "calc(100% + 6px)", right: 0 }}>

                <button type="button" onClick={() => { setMenuOpen(false); go("read"); }}><FileText size={15} /><span>Script access<small>Preview, copy, print and download.</small></span></button>
                {capabilities.buyer && vm.script?.myPendingRequest?.invoice && <button type="button" onClick={() => { setMenuOpen(false); vm.handleInvoicePdfAction(vm.script.myPendingRequest.invoice, "open"); }}><Download size={15} /><span>Open invoice<small>View the verified purchase invoice.</small></span></button>}
                <button type="button" onClick={() => { setMenuOpen(false); setSection("history"); }}><Film size={15} /><span>Metadata & publication<small>SID, completion, classification, roles.</small></span></button>
                {capabilities.owner && <><div className="swb-menu__sep" /><button type="button" className="is-danger" onClick={() => { setMenuOpen(false); vm.setShowDeleteModal(true); }}><X size={15} /><span>Delete project…</span></button></>}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="swb-body">
        <nav className="swb-nav" aria-label="Project sections">
          {sections.map((grp) => (
            <div key={grp.group}>
              <div className="swb-nav__grp">{grp.group}</div>
              {grp.items.map((it) => (
                <button type="button" key={it.id} className={section === it.id ? "is-active" : ""} aria-current={section === it.id ? "page" : undefined} onClick={() => setSection(it.id)}>
                  {it.label}{it.count != null && <span className="swb-nav__c">{it.count}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="swb-canvas" ref={canvasRef}>
          <div className="swb-metrics">
            <div className="swb-metric"><small>Price</small><strong>{money(script?.price)}</strong></div>
            <div className="swb-metric"><small>Pages</small><strong>{script?.pageCount || "—"}</strong></div>
            <div className="swb-metric"><small>Views</small><strong>{Number(script?.views || 0).toLocaleString("en-IN")}</strong></div>
            <div className="swb-metric"><small>AI score</small><strong>{ai || "—"}</strong>{ai ? <span className="swb-status swb-status--live swb-status--sm" style={{ marginTop: 2 }}>{gradeFor(ai)}</span> : <span className="swb-metric__sub">No evaluation</span>}</div>
            <div className="swb-metric"><small>Producer</small><strong>★ {producer ? producer.toFixed(1) : "—"}</strong><span className="swb-metric__sub">{script?.producerRating?.count || 0} ratings</span></div>
          </div>

          {/* SUMMARY */}
          <section className={`swb-panel${section === "summary" ? " is-active" : ""}`} aria-hidden={section !== "summary"}>
            <h3 className="swb-sect-title">Summary</h3>
            <div className="swb-grid2">
              <article className="swb-card swb-pad"><p className="swb-label">Logline</p><p className="swb-quote">{text(script?.logline, "The writer has not added a logline yet.")}</p></article>
              <article className="swb-card swb-pad">
                <p className="swb-label">Completion</p>
                <p className="swb-status swb-status--live" style={{ marginBottom: 8 }}>{text(vm.completionLabel, "Status pending")}{vm.completionProgress ? ` · ${vm.completionProgress}` : ""}</p>
                {vm.completionFuturePlans && <p className="swb-muted" style={{ fontSize: 12.5, lineHeight: 1.55 }}>{vm.completionFuturePlans}</p>}
              </article>
              <article className="swb-card swb-pad swb-full"><p className="swb-label">Synopsis</p><p className="swb-prose">{text(script?.synopsis || script?.description, "The writer has not added a synopsis yet.")}</p></article>
              <article className="swb-card swb-pad">
                <p className="swb-label">Production fit</p>
                <div className="swb-spec"><span className="swb-spec__k">Language</span><span className="swb-spec__v">{text(film?.filmLanguage)}</span></div>
                <div className="swb-spec"><span className="swb-spec__k">Dialogue</span><span className="swb-spec__v">{film?.dialoguesPresent === "yes" ? "Full dialogues" : text(film?.dialoguesPresent)}</span></div>
                {scriptStyle.length > 0 && <div className="swb-spec"><span className="swb-spec__k">Script style</span><span className="swb-spec__v swb-taxa">{scriptStyle.map((s, i) => <span key={`${s}-${i}`}>{s}</span>)}</span></div>}
                <div className="swb-spec"><span className="swb-spec__k">Writer role</span><span className="swb-spec__v swb-spec__v--strong">{film?.wantToDirect ? "Writer–Director" : film?.wantToProduce ? "Writer–Producer" : "Writer"}</span></div>
              </article>
              <article className="swb-card swb-pad">
                <p className="swb-label">Metadata</p>
                {tags.length > 0 ? <p className="swb-tags">{tags.map((tag) => <a key={tag} href="#" onClick={(e) => e.preventDefault()}>#{String(tag).replace(/^#/, "")}</a>)}</p> : <p className="swb-muted" style={{ fontSize: 12 }}>No tags added.</p>}
                <div className="swb-divider" />
                <div className="swb-spec swb-spec--flush"><span className="swb-spec__k">Published</span><span className="swb-spec__v">{vm.formatDate(script?.publishedAt || script?.createdAt)}{script?.sid ? <> &nbsp;·&nbsp; <b>SID</b> {script.sid}</> : null}</span></div>
              </article>
            </div>
          </section>

          {/* CLASSIFICATION */}
          <section className={`swb-panel${section === "classification" ? " is-active" : ""}`} aria-hidden={section !== "classification"}>
            <h3 className="swb-sect-title">Classification &amp; production fit</h3>
            {hasClassification ? (
              <div className="swb-grid2">
                <article className="swb-card swb-pad">
                  <p className="swb-label">Taxonomy</p>
                  {tones.length > 0 && <div className="swb-spec"><span className="swb-spec__k">Tones</span><span className="swb-spec__v swb-taxa">{tones.map((x, i) => <span key={`${x}-${i}`}>{x}</span>)}</span></div>}
                  {themes.length > 0 && <div className="swb-spec"><span className="swb-spec__k">Themes</span><span className="swb-spec__v swb-taxa swb-taxa--accent">{themes.map((x, i) => <span key={`${x}-${i}`}>{x}</span>)}</span></div>}
                  {settings.length > 0 && <div className="swb-spec"><span className="swb-spec__k">Settings</span><span className="swb-spec__v swb-taxa">{settings.map((x, i) => <span key={`${x}-${i}`}>{x}</span>)}</span></div>}
                  {!(tones.length || themes.length || settings.length) && <p className="swb-muted" style={{ fontSize: 12 }}>No tones, themes or settings supplied.</p>}
                </article>
                <article className="swb-card swb-pad">
                  <p className="swb-label">Film production details</p>
                  <div className="swb-spec"><span className="swb-spec__k">Primary genre</span><span className="swb-spec__v swb-spec__v--strong">{text(classification?.primaryGenre || script?.primaryGenre || script?.genre)}</span></div>
                  {classification?.secondaryGenre && <div className="swb-spec"><span className="swb-spec__k">Secondary genre</span><span className="swb-spec__v">{classification.secondaryGenre}</span></div>}
                  <div className="swb-spec"><span className="swb-spec__k">Language</span><span className="swb-spec__v">{text(film?.filmLanguage)}</span></div>
                  <div className="swb-spec"><span className="swb-spec__k">Dialogues</span><span className="swb-spec__v">{film?.dialoguesPresent === "yes" ? "Full dialogues" : text(film?.dialoguesPresent)}</span></div>
                  <div className="swb-spec"><span className="swb-spec__k">Wants to produce</span><span className="swb-spec__v">{film?.wantToProduce ? "Yes" : "No"}</span></div>
                  <div className="swb-spec"><span className="swb-spec__k">Wants to direct</span><span className="swb-spec__v">{film?.wantToDirect ? "Yes" : "No"}</span></div>
                </article>
              </div>
            ) : (
              <div className="swb-empty"><CircleAlert size={26} /><h3>No classification data</h3><p>{capabilities.owner ? "Add tones, themes, settings and production details in the project editor." : "The writer has not classified this project yet."}</p></div>
            )}
          </section>

          {/* ROLES */}
          <section className={`swb-panel${section === "roles" ? " is-active" : ""}`} aria-hidden={section !== "roles"}>
            <h3 className="swb-sect-title">Character roles</h3>
            {roles.length ? (
              <div className="swb-grid3">
                {roles.map((role) => (
                  <article className="swb-role" key={role?._id || role?.characterName}>
                    <h4>{text(role?.characterName)}</h4>
                    <p className="swb-meta-inline">{text(role?.type, "Role")} · <b>{text(role?.gender, "Any")}</b> · Age {role?.ageRange?.min || "?"}–{role?.ageRange?.max || "?"}</p>
                    <p>{text(role?.description, "No description supplied.")}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="swb-empty"><Users size={26} /><h3>No character roles added</h3><p>{capabilities.owner ? "Add castable roles from the project editor." : "The writer has not added castable roles yet."}</p></div>
            )}
          </section>

          {/* PREVIEW */}
          <section className={`swb-panel${section === "preview" ? " is-active" : ""}`} aria-hidden={section !== "preview"}>
            <div className="swb-panel-head">
              <h3 className="swb-sect-title">Viewable Script{script?.scriptPreviewAccess?.start ? ` · pages ${script.scriptPreviewAccess.start}–${script.scriptPreviewAccess.end}` : ""}</h3>
              <button type="button" className="swb-btn swb-btn--sm" onClick={vm.handleDownloadPreview}><Download size={13} />Download</button>
            </div>
            <p className="swb-muted" style={{ fontSize: 11.5, marginTop: -6, marginBottom: 12 }}>Read events are recorded for non-creators. Falls back to structured text if the PDF renderer fails.</p>
            {journey.hasPreviewSource ? (
              <ScreenplayPdfViewer
                pdfUrl={vm.uploadedScriptPdfUrl}
                title={`${script?.title || "Script"} preview`}
                startPage={vm.previewStart || 1}
                endPage={vm.previewEnd || vm.previewStart || 1}
                fallbackPages={vm.previewPageBlocks}
                fallbackText={vm.previewSourceText}
                showHeader={false}
                onDownload={vm.handleDownloadPreview}
                className="swb-script-viewer"
              />
            ) : (
              <div className="swb-empty"><LockKeyhole size={26} /><h3>Preview unavailable</h3><p>The writer has not configured public preview pages for this project.</p></div>
            )}
          </section>

          {/* FULL SCRIPT */}
          {capabilities.fullScript && journey.hasFullSource && (
            <section className={`swb-panel${section === "full" ? " is-active" : ""}`} aria-hidden={section !== "full"}>
              <div className="swb-panel-head">
                <div><h3 className="swb-sect-title" style={{ marginBottom: 3 }}>{capabilities.owner ? "My Script" : "Full Script"}</h3><p className="swb-muted" style={{ fontSize: 11.5 }}>{script?.pageCount ? `~${script.pageCount} pages` : ""}{capabilities.owner ? " · private creator view" : " · unlocked access"}</p></div>
                <div style={{ display: "flex", gap: 7 }}>
                  <button type="button" className="swb-btn swb-btn--sm" onClick={async () => { try { await navigator.clipboard.writeText(String(vm.fullScriptSourceText || "")); vm.showNotice("Script text copied.", "success"); } catch { vm.showNotice("Copy failed. Try Download instead.", "error"); } }}><Copy size={13} />Copy</button>
                  <button type="button" className="swb-btn swb-btn--sm" onClick={vm.handlePrint}><Printer size={13} />Print</button>
                  <button type="button" className="swb-btn swb-btn--sm" onClick={vm.handleDownload}><Download size={13} />Download</button>
                </div>
              </div>
              {vm.hasUploadedScriptPdf ? (
                <ScreenplayPdfViewer pdfUrl={vm.uploadedScriptPdfUrl} title={script?.title} showAllPages showHeader={false} onDownload={vm.handleDownload} className="swb-script-viewer" />
              ) : vm.hasHtmlScriptContent ? (
                <div className="script-content swb-prose-viewer" dangerouslySetInnerHTML={{ __html: script?.textContent || "" }} />
              ) : (
                <ScreenplayReadOnly text={vm.formattedPlainScriptText || vm.fullScriptSourceText} dark={vm.dark} className="swb-script-viewer" />
              )}
            </section>
          )}

          {/* EVALUATION */}
          <section className={`swb-panel${section === "evaluation" ? " is-active" : ""}`} aria-hidden={section !== "evaluation"}>
            <h3 className="swb-sect-title">AI evaluation &amp; Ckript Score</h3>
            {ai ? (
              <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16 }}>
                <article className="swb-card swb-pad swb-orbit"><div><strong>{ai}</strong><span className="swb-status swb-status--live" style={{ justifyContent: "center", marginTop: 6 }}>{gradeFor(ai)}</span><small>{scoreObj?.scoredAt ? `Scored ${vm.formatDate(scoreObj.scoredAt)}` : "AI evaluation"}</small></div></article>
                <article className="swb-card swb-pad"><p className="swb-label">AI dimension scores</p><ScoreBars score={scoreObj} /></article>
                <article className="swb-card swb-pad swb-full">
                  <p className="swb-label">Analysis</p>
                  <p className="swb-prose">{text(scoreObj?.feedback, "No evaluation summary supplied.")}</p>
                  <div className="swb-evi">
                    <div><p className="swb-label" style={{ color: "#4f7e59" }}>Strengths</p>{toList(scoreObj?.strengths).length ? <ul>{toList(scoreObj.strengths).map((s, i) => <li key={`${s}-${i}`}>{s}</li>)}</ul> : <p className="swb-muted" style={{ fontSize: 12 }}>None supplied.</p>}</div>
                    <div><p className="swb-label" style={{ color: "#a56c19" }}>Improvements</p>{toList(scoreObj?.improvements).length ? <ul>{toList(scoreObj.improvements).map((s, i) => <li key={`${s}-${i}`}>{s}</li>)}</ul> : <p className="swb-muted" style={{ fontSize: 12 }}>None supplied.</p>}</div>
                    <div><p className="swb-label" style={{ color: "#315c82" }}>Audience &amp; comps</p><p className="swb-muted" style={{ fontSize: 12, lineHeight: 1.55 }}>{text(scoreObj?.targetAudience || scoreObj?.audience)}{toList(scoreObj?.comparables).length ? ` · ${toList(scoreObj.comparables).join(", ")}` : ""}</p></div>
                  </div>
                  {(platform?.overall !== undefined && platform?.overall !== null) && <><div className="swb-divider" /><p className="swb-label">Ckript Score · platform</p><p className="swb-muted" style={{ fontSize: 12 }}>Overall {platform.overall}{platform.mainContent != null ? ` · Main ${platform.mainContent}` : ""}{platform.title != null ? ` · Title ${platform.title}` : ""}{platform.synopsis != null ? ` · Synopsis ${platform.synopsis}` : ""}{platform.tagMeta != null ? ` · Tag & Meta ${platform.tagMeta}` : ""}</p>{platform?.feedback && <p className="swb-muted" style={{ fontSize: 12, marginTop: 6 }}>{platform.feedback}</p>}</>}
                </article>
              </div>
            ) : (
              <div className="swb-empty"><CircleAlert size={26} /><h3>{script?.evaluationStatus === "requested" ? "Evaluation in progress" : "No evaluation yet"}</h3><p>{script?.evaluationStatus === "requested" ? "The report will appear here when processing finishes." : "No AI evaluation is available for this project."}</p></div>
            )}
          </section>

          {/* RATINGS */}
          <section className={`swb-panel${section === "ratings" ? " is-active" : ""}`} aria-hidden={section !== "ratings"}>
            <h3 className="swb-sect-title">Producer ratings &amp; reviews</h3>
            <div className="swb-grid2">
              <article className="swb-card swb-pad" style={{ padding: 0, overflow: "hidden" }}>
                <ProducerRatingCard script={script} user={vm.user} dark={vm.dark} onAggregate={vm.onProducerAggregate} />
              </article>
              <article className="swb-card swb-pad">
                <div className="swb-panel-head" style={{ marginBottom: 10 }}><p className="swb-label" style={{ margin: 0 }}>Reader reviews</p><span className="swb-status swb-status--sm">{Number(script?.rating || 0).toFixed(1)} · {vm.reviewsTotal} review{vm.reviewsTotal === 1 ? "" : "s"}</span></div>
                {vm.canSubmitReview && (
                  <form onSubmit={vm.handleSubmitReview} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                      {[1, 2, 3, 4, 5].map((v) => <button type="button" key={v} className="swb-iconbtn" aria-label={`${v} stars`} aria-pressed={vm.reviewRating === v} onClick={() => vm.setReviewRating(v)} style={{ color: vm.reviewRating >= v ? "#e6a31a" : "#a39d92" }}>★</button>)}
                    </div>
                    <label className="swb-field"><span>Your review</span><textarea value={vm.reviewComment} maxLength={2000} onChange={(e) => vm.setReviewComment(e.target.value)} placeholder="Share a thoughtful reader review…" style={{ width: "100%", minHeight: 70, padding: "9px 12px", border: "1px solid #ded8ce", borderRadius: 9 }} /></label>
                    <button type="submit" className="swb-btn swb-btn--primary swb-btn--sm" disabled={vm.reviewSubmitting}>{vm.reviewSubmitting ? "Saving…" : vm.myReview ? "Update review" : "Publish review"}</button>
                  </form>
                )}
                {vm.reviewsLoading ? <p className="swb-muted" style={{ fontSize: 12 }}>Loading reader reviews…</p> : (vm.reviews?.length ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {vm.reviews.map((r) => (
                      <div key={r?._id} style={{ display: "flex", gap: 10 }}>
                        <span className="swb-avatar swb-avatar--sm">{initials(r?.user?.name)}</span>
                        <div><b style={{ fontSize: 12 }}>{text(r?.user?.name, "Reader")}</b> <span style={{ color: "#e6a31a", fontSize: 11 }}>{"★".repeat(Number(r?.rating || 0))}</span><p className="swb-muted" style={{ fontSize: 11.5, margin: "2px 0 0", lineHeight: 1.5 }}>{text(r?.comment)}</p></div>
                      </div>
                    ))}
                  </div>
                ) : <p className="swb-muted" style={{ fontSize: 12 }}>No reader reviews yet.</p>)}
                {vm.reviewsTotalPages > 1 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                    <button type="button" className="swb-btn swb-btn--sm" disabled={vm.reviewsPage <= 1} onClick={() => vm.fetchReviews({ page: vm.reviewsPage - 1 })}>Previous</button>
                    <span className="swb-muted" style={{ fontSize: 11 }}>Page {vm.reviewsPage} of {vm.reviewsTotalPages}</span>
                    <button type="button" className="swb-btn swb-btn--sm" disabled={vm.reviewsPage >= vm.reviewsTotalPages} onClick={() => vm.fetchReviews({ page: vm.reviewsPage + 1 })}>Next</button>
                  </div>
                )}
              </article>
            </div>
          </section>

          {/* DEAL / PURCHASE REQUESTS */}
          <section className={`swb-panel${section === "deal" ? " is-active" : ""}`} aria-hidden={section !== "deal"}>
            <div className="swb-panel-head">
              <h3 className="swb-sect-title">Deal terms</h3>
            </div>
            <article className="swb-card swb-pad" style={{ marginBottom: 16 }}>
              <p className="swb-label">Deal summary</p>
              <div className="swb-grid2" style={{ gap: 0 }}>
                <div>
                  <div className="swb-spec"><span className="swb-spec__k">Script price</span><span className="swb-spec__v swb-spec__v--strong">{money(script?.price)}</span></div>
                  <div className="swb-spec"><span className="swb-spec__k">Rights</span><span className="swb-spec__v">{RIGHTS_LABELS[rights?.rightsType] || "Not specified"}</span></div>
                  <div className="swb-spec"><span className="swb-spec__k">Modification</span><span className="swb-spec__v">{MODIFICATION_LABELS[rights?.modificationRights] || "Not specified"}</span></div>
                </div>
                <div>
                  <div className="swb-spec"><span className="swb-spec__k">Payment</span><span className="swb-spec__v">{PAYMENT_LABELS[rights?.paymentStructure] || "Not specified"}</span></div>
                  <div className="swb-spec"><span className="swb-spec__k">License</span><span className="swb-spec__v">{rights?.timeBound?.licenseDurationMonths ? `${rights.timeBound.licenseDurationMonths} months` : "Perpetual"}</span></div>
                  <div className="swb-spec"><span className="swb-spec__k">Negotiation</span><span className="swb-spec__v">{NEGOTIATION_LABELS[rights?.negotiationMode] || "Not specified"}</span></div>
                </div>
              </div>
            </article>

            {vm.script?.myPendingRequest?.status === "approved" ? (
              <div className="swb-lock" style={{ background: "#edf6ef", borderColor: "#c4dcc8" }}><Check size={18} style={{ color: "#4f7e59" }} /><div><b>Your request was approved</b><p>Complete payment within the server-provided window to unlock the full script.</p></div><button type="button" className="swb-btn swb-btn--primary" onClick={vm.openPayment}>Continue to payment</button></div>
            ) : vm.script?.myPendingRequest ? (
              <div className="swb-lock"><FileText size={18} /><div><b>Request {vm.script.myPendingRequest.status}</b><p>The writer controls approval. Payment terms are accepted only on the secure payment page.</p></div></div>
            ) : capabilities.canPurchase ? (
              <div className="swb-lock"><FileText size={18} /><div><b>Interested in this script?</b><p>Review the rights and writer conditions, then request access or contact the writer to discuss a deal.</p></div><button type="button" className="swb-btn swb-btn--primary" onClick={() => setPurchaseOpen(true)}>Request to purchase</button></div>
            ) : (
              <div className="swb-empty"><LockKeyhole size={26} /><h3>Deal access restricted</h3><p>Purchase controls are available only to eligible industry accounts.</p></div>
            )}
          </section>

          {/* CONTACT */}
          <section className={`swb-panel${section === "contact" ? " is-active" : ""}`} aria-hidden={section !== "contact"}>
            <h3 className="swb-sect-title">Writer contact</h3>
            {capabilities.owner ? (
              <article className="swb-card swb-pad"><p className="swb-label">Owner view</p><p className="swb-muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>You are the writer — no contact card is needed. Your identity links to your public profile. Industry viewers see plan, reveal and quota states here instead.</p><button type="button" className="swb-btn swb-btn--sm" style={{ marginTop: 10 }} onClick={vm.openProfile}>Open public profile</button></article>
            ) : (
              <div className="swb-grid2">
                <article className="swb-card swb-pad">
                  <div style={{ display: "flex", alignItems: "center", gap: 11 }}><span className="swb-avatar">{initials(creator?.name)}</span><div><b style={{ fontSize: 14 }}>{text(creator?.name, "Writer")}</b><div className="swb-muted" style={{ fontSize: 11.5 }}>{text(script?.companyName || creator?.writerProfile?.company, "Ckript writer")}</div></div></div>
                  {credits.length > 1 && (
                    <div style={{ marginTop: 12 }}><p className="swb-label">{credits.length} writers credited</p><ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>{credits.map((w, i) => <li key={`${w.id || w.name}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}><span className="swb-avatar swb-avatar--sm" style={{ width: 24, height: 24, fontSize: 10 }}>{initials(w.name)}</span>{w.name}{i === 0 ? " · point of contact" : ""} <em className="swb-muted" style={{ marginLeft: "auto", fontSize: 10 }}>{creditLabel(w.creditType)}</em></li>)}</ul></div>
                  )}
                </article>
                <article className="swb-card swb-pad">
                  <div className="swb-panel-head" style={{ marginBottom: 8 }}><p className="swb-label" style={{ margin: 0 }}>Professional access</p><span className="swb-status swb-status--info swb-status--sm">Industry Pro</span></div>
                  {!vm.canViewWriterInfo ? (
                    <div className="swb-empty" style={{ padding: "20px 14px" }}><LockKeyhole size={22} /><p style={{ fontSize: 11.5 }}>Private contact details require an active Film Industry Professional plan.</p><button type="button" className="swb-btn swb-btn--primary swb-btn--sm" onClick={vm.openPricing}>View plans</button></div>
                  ) : (
                    <>
                      <div className="swb-quota"><div className="swb-quota__row"><span>Contact reveals</span><b>{vm.contactsUsed} / {vm.contactsLimit}</b></div><div className="swb-quota__track"><b style={{ width: `${vm.contactsLimit ? Math.min(100, (vm.contactsUsed / vm.contactsLimit) * 100) : 0}%` }} /></div></div>
                      {!vm.contactAlreadyRevealed ? (
                        <button type="button" className="swb-btn swb-btn--primary swb-btn--full swb-btn--sm" style={{ marginTop: 10 }} disabled={vm.revealLoading || vm.contactRevealBlocked} onClick={vm.handleRevealContact}>{vm.revealLoading ? "Revealing…" : vm.contactRevealBlocked ? "Contact quota reached" : "Reveal email & phone"}</button>
                      ) : (
                        <dl className="swb-kv" style={{ marginTop: 8 }}><div><dt>Email</dt><dd><a href={`mailto:${vm.writerContact?.email}`}>{text(vm.writerContact?.email)}</a></dd></div><div><dt>Phone</dt><dd><a href={`tel:${vm.writerContact?.phone}`}>{text(vm.writerContact?.phone)}</a></dd></div></dl>
                      )}
                      {vm.revealError && <p className="swb-alert swb-alert--err" style={{ marginTop: 8 }} role="alert">{vm.revealError}</p>}
                      <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
                        <button type="button" className="swb-btn swb-btn--sm" disabled={vm.messageWriterBlocked} onClick={vm.handleMessageWriter}><MessageCircle size={13} />Message · {vm.messageWritersUsed}/{vm.messageWritersLimit}</button>
                        <button type="button" className="swb-btn swb-btn--sm" disabled={vm.meetingsBlocked} onClick={vm.openMeeting}><Users size={13} />Meeting · {vm.meetingsUsed}/{vm.meetingsLimit}</button>
                      </div>
                      {vm.contactAlreadyRevealed && vm.availableWriterLinks?.length > 0 && <div style={{ marginTop: 12 }}><p className="swb-label">Professional links</p><div className="swb-contact-links">{vm.availableWriterLinks.map((l) => <a key={l.key} href={l.href} target="_blank" rel="noopener noreferrer">{l.label}<ExternalLink size={12} /></a>)}</div></div>}
                    </>
                  )}
                </article>
              </div>
            )}
          </section>

          {/* HISTORY */}
          {(capabilities.owner || capabilities.collaborator) && (
            <section className={`swb-panel${section === "history" ? " is-active" : ""}`} aria-hidden={section !== "history"}>
              <h3 className="swb-sect-title">Status &amp; history</h3>
              <div className="swb-grid2">
                <article className="swb-card swb-pad">
                  <p className="swb-label">Publication &amp; service history</p>
                  <div className="swb-spec"><span className="swb-spec__k">Status</span><span className="swb-spec__v"><span className={`swb-status swb-status--sm ${script?.status === "published" ? "swb-status--live" : "swb-status--warn"}`}>{text(script?.status, "Draft")}</span></span></div>
                  <div className="swb-spec"><span className="swb-spec__k">Evaluation</span><span className="swb-spec__v">{ai ? "Completed" : script?.evaluationStatus === "requested" ? "In progress" : "Not evaluated"}</span></div>
                  <div className="swb-spec"><span className="swb-spec__k">Trailer</span><span className="swb-spec__v swb-spec__v--muted">{journey.hasTrailer ? "Available" : "Not requested"}</span></div>
                  <div className="swb-spec"><span className="swb-spec__k">Spotlight</span><span className="swb-spec__v swb-spec__v--muted">{script?.services?.spotlight ? "Active" : "Inactive"}</span></div>
                  <div className="swb-spec"><span className="swb-spec__k">Transaction</span><span className="swb-spec__v"><span className={`swb-status swb-status--sm ${journey.transactionAvailable ? "swb-status--live" : "swb-status--warn"}`}>{journey.transactionAvailable ? "Available" : text(script?.transactionStatus, "Unavailable")}</span></span></div>
                  <div className="swb-spec"><span className="swb-spec__k">Published</span><span className="swb-spec__v">{vm.formatDate(script?.publishedAt || script?.createdAt)}</span></div>
                </article>

              </div>
            </section>
          )}

          {/* SIMILAR SCRIPTS */}
          {vm.similarScripts?.length > 0 && (
            <section className="swb-panel is-active" style={{ marginTop: 40, borderTop: "1px solid var(--border, #e5e7eb)", paddingTop: 30, display: "block" }}>
              <h3 className="swb-sect-title" style={{ marginBottom: 20 }}>Similar scripts you might like</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {vm.similarScripts.map((similarScript) => (
                  <ProjectCard 
                    key={similarScript._id} 
                    project={similarScript} 
                    userName={similarScript.creator?.name || "Unknown"} 
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Inspector drawer */}
      <aside className={`swb-inspector${inspectorOpen ? " is-open" : ""}`} aria-label="Actions inspector" aria-hidden={!inspectorOpen}>
        <div className="swb-insp__head"><h3>Actions &amp; queue</h3><button type="button" className="swb-iconbtn" onClick={() => setInspectorOpen(false)} aria-label="Close inspector"><X size={16} /></button></div>
        <div className="swb-insp__body">
          <div className="swb-insp__sect">
            <div className="swb-insp__row"><p className="swb-label" style={{ margin: 0 }}>Project</p><span className={`swb-status swb-status--sm ${script?.status === "published" ? "swb-status--live" : "swb-status--warn"}`}>{text(script?.status, "Draft")}</span></div>
            <div className="swb-stack">
              {capabilities.canEdit && <button type="button" className="swb-btn swb-btn--primary" onClick={vm.openEdit}><Pencil size={14} />{capabilities.owner ? "Edit Project" : "Co-write"}</button>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                <SocialShareButton share={vm.scriptShare} className="swb-btn swb-btn--sm" buttonLabel="Share" />

              </div>
            </div>
          </div>

          <div className="swb-insp__sect">
            <div className="swb-insp__row"><p className="swb-label" style={{ margin: 0 }}>Deal terms</p></div>
            <button type="button" className="swb-btn swb-btn--sm swb-btn--full" onClick={() => { setInspectorOpen(false); setSection("deal"); }}>View deal terms</button>
          </div>

          {capabilities.owner && (
            <div className="swb-insp__sect">
              <div className="swb-insp__row"><p className="swb-label" style={{ margin: 0 }}>Trailer package</p><span className="swb-status swb-status--sm">{journey.hasTrailer ? "Available" : "Not requested"}</span></div>
              <p className="swb-muted" style={{ fontSize: 11, margin: "0 0 8px" }}>{vm.trailerDurationChoice}s · {vm.trailerQualityChoice}p · {vm.trailerFormatChoice} · creator only.</p>
              <button type="button" className="swb-btn swb-btn--sm swb-btn--full" onClick={() => setTrailerOpen(true)}>Configure &amp; pay</button>
            </div>
          )}

          <div className="swb-insp__sect">
            <p className="swb-label">Role-aware actions</p>
            <div className="swb-stack">
              {capabilities.canBookmark && <button type="button" className="swb-btn swb-btn--sm" aria-pressed={vm.isBookmarked} onClick={vm.handleToggleBookmark}><Bookmark size={13} fill={vm.isBookmarked ? "currentColor" : "none"} />{vm.isBookmarked ? "Saved" : "Save script"}</button>}
              {capabilities.industry && <button type="button" className="swb-btn swb-btn--sm" onClick={() => { setInspectorOpen(false); setSection("contact"); }}>Reveal / contact writer</button>}
              <button type="button" className="swb-btn swb-btn--sm" onClick={() => { setInspectorOpen(false); setSection("ratings"); }}>Ratings &amp; reviews</button>
            </div>
          </div>

          {capabilities.owner && (
            <div className="swb-insp__sect">
              <p className="swb-label" style={{ color: "#b73a34" }}>Danger zone</p>
              <button type="button" className="swb-btn swb-btn--danger swb-btn--full" onClick={() => vm.setShowDeleteModal(true)}><X size={14} />Delete Project</button>
            </div>
          )}
        </div>
      </aside>

      {/* Modals */}
      <TrailerDialog vm={vm} open={trailerOpen} onClose={() => setTrailerOpen(false)} />
      <PurchaseDialog vm={vm} open={purchaseOpen} onClose={() => setPurchaseOpen(false)} />
      <ConfirmDialog
        open={Boolean(declineRequest)}
        onClose={() => setDeclineRequest(null)}
        title={`Decline ${text(declineRequest?.investor?.name, "request")}?`}
        description="The buyer will be notified. A reason is optional."
        confirmLabel="Decline request"
        danger
        busy={vm.pendingReqActionId === declineRequest?._id}
        onConfirm={async () => { const ok = await vm.handleRejectRequest(declineRequest?._id, declineNote); if (ok) setDeclineRequest(null); }}
      >
        <label className="swb-field" htmlFor="swb-decline-note"><span>Reason <span>Optional</span></span><textarea id="swb-decline-note" value={declineNote} maxLength={500} onChange={(e) => setDeclineNote(e.target.value)} /></label>
      </ConfirmDialog>
      <ConfirmDialog
        open={vm.showDeleteModal}
        onClose={() => vm.setShowDeleteModal(false)}
        title={`Delete “${text(script?.title)}”?`}
        description="The project will be removed from the writer profile and listings. Governed purchased/admin access may remain available."
        confirmLabel="Delete project"
        danger
        busy={vm.deleteLoading}
        onConfirm={vm.handleDeleteScript}
      />
      <WbOverlay open={mediaOpen} onClose={() => setMediaOpen(false)} title="Trailer preview" eyebrow="Project media">
        <div className="swb-video">{vm.canPlayTrailer ? <video src={vm.trailerPlaybackUrl} controls autoPlay playsInline onError={vm.handleTrailerPlaybackError} /> : <div className="swb-video__empty"><Film size={26} /><p>Trailer playback is unavailable.</p></div>}</div>
      </WbOverlay>
      <MeetingModal isOpen={vm.showMeetingModal} onClose={() => vm.setShowMeetingModal(false)} writerId={script?.creator?._id} scriptId={script?._id} writerName={script?.creator?.name} scriptName={script?.title} onMeetingScheduled={vm.handleMeetingScheduled} />
    </main>
  );
}
