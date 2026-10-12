import { useMemo, useRef, useState } from "react";
import {
  SCRIPT_COMPLETION_OPTIONS,
} from "../../utils/scriptCompletion";
import { SCRIPT_UPLOAD_TERMS_TEXT } from "../../constants/scriptUploadTerms";
import { getUploadScreenKey } from "../../utils/scriptUploadValidation";
import ScriptUploadChrome from "../screens/upload/ScriptUploadChrome";
import "../screens/upload/Upload.css";

/*
 * Development-only harness for the whole upload chrome (/__mobile-upload; see
 * App.jsx, never built into production routes).
 *
 * WHY IT EXISTS WHEN THE ROUTE IS REAL. `/upload` authenticates, fetches the
 * plan limit, posts a PDF to the extractor and uploads media, so it renders a
 * different screen on every run and cannot be measured twice with the same
 * result. The checks that matter most here are exactly the ones a jsdom suite
 * cannot answer — touch-target sizes, contrast, whether a 48-chip genre row
 * overflows at 320px, whether the sticky footer clears the last field of the
 * publish panel, whether the agreement region scrolls without taking the page
 * with it.
 *
 * The `vm` shape is the seam. `pages/ScriptUpload.jsx` hands one object to
 * whichever chrome is mounted, so a harness is a fixture of that object and
 * nothing else — no context provider, no mocked network, no re-implemented
 * chrome. If the shape drifts, this file stops compiling, which is the point.
 *
 * NAVIGABLE, NOT DRIVEN. Every state a sweep needs is reachable by URL:
 *   ?step=1..5
 *   ?panel=basics|story|cast|progress|access|media
 *   ?state=extracting | ready | error | blocked | locked | recovery | crop
 *          | denied | resolving | submitted | contentonly | uploading | saving
 *          | local-saved | exit | source-error | source-local
 *          | media-preflight | media-cancelled
 * A harness that has to be *driven* into a state measures something slightly
 * different each time a click lands slightly differently.
 */

const FIXTURE_PAGE = `INT. RAILWAY RETIRING ROOM - NIGHT

A ceiling fan turns too slowly to matter. ARSHAD, 40s, sits with a
manuscript in his lap and no intention of reading it.

ARSHAD
You said the last train was at eleven.

MEHER (O.S.)
I said the last train I was taking.
`;

const FIXTURE_FORMATS = [
  { value: "feature", label: "Feature" }, { value: "tv_1hour", label: "TV 1hr" },
  { value: "tv_halfhour", label: "TV 1/2hr" }, { value: "short", label: "Short" },
  { value: "web_series", label: "Web Series" }, { value: "drama_school", label: "Drama School" },
  { value: "micro_drama", label: "Micro Drama" }, { value: "anime", label: "Anime" },
  { value: "movie", label: "Movie" }, { value: "tv_serial", label: "TV Serial" },
  { value: "cartoon", label: "Cartoon" }, { value: "limited_series", label: "Limited Series" },
  { value: "documentary", label: "Documentary" }, { value: "songs", label: "Songs" },
  { value: "standup_comedy", label: "Standup Comedy" }, { value: "dialogues", label: "Dialogues" },
  { value: "poet", label: "Poet" }, { value: "other", label: "Other" },
];

const GENRES = [
  "Action", "Adventure", "Animation", "Anime", "Art/Foreign", "Biographical",
  "Children/Family", "Comedy", "Coming of Age", "Crime", "Dark Comedy", "Documentary",
  "Drama", "Erotic", "Espionage", "Faith/Spirituality", "Family", "Fantasy",
  "Film Noir", "Historical", "Horror", "Indie", "Legal", "Martial Arts",
  "Medical", "Mockumentary", "Musical", "Mystery", "Noir", "Political",
  "Psychological", "Romance", "Romantic Comedy", "Satire", "Sci-Fi", "Short Film",
  "Slice of Life", "Sports", "Steampunk", "Superhero", "Supernatural", "Suspense",
  "Teen", "Thriller", "True Crime", "War", "Western", "Zombie",
];

const TONES = ["Absurdist", "Atmospheric", "Bleak", "Cerebral", "Gritty", "Melancholic", "Noir", "Slow-burn", "Tense", "Tragic"];
const THEMES = ["Abandonment", "Betrayal", "Grief", "Identity Crisis", "Isolation", "Redemption", "Second Chance", "Survival"];
const SETTINGS = ["Contemporary", "Historical", "Isolated", "Rural", "Small Town", "Big City", "Wilderness"];

/* A 1x1 transparent GIF. The cropper needs a decodable image to lay itself out,
   and a data URI keeps the harness free of a network fetch that could fail
   differently on different runs. */
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const fixtureFile = (name, size, type) => ({ name, size, type });

const noop = () => {};

export default function UploadHarness() {
  const query = new URLSearchParams(window.location.search);
  const requested = query.get("state") || "";
  const requestedStep = Number(query.get("step") || 1);
  const requestedPanel = query.get("panel") || "";

  const [step, setStep] = useState(
    Number.isFinite(requestedStep) ? Math.min(Math.max(requestedStep, 1), 5) : 1,
  );
  const [detailStep, setDetailStep] = useState(0);
  const [formData, setFormData] = useState({
    title: "The Four O'Clock Train",
    format: "feature",
    formatOther: "",
    pageCount: "104",
    viewableScript: true,
    previewWindowMode: "pages",
    previewWindowStart: "1",
    previewWindowEnd: "2",
    primaryGenre: "Drama",
    logline: "A man who missed the last train discovers the woman who took it never left the station.",
    synopsis: "Two strangers wait out a monsoon night in a railway retiring room, discovering that neither of them is travelling anywhere.",
    completionStatus: "partial",
    completedParts: "4",
    totalParts: "10",
    futurePlans: "",
  });
  const [classification, setClassification] = useState({ tones: ["Gritty"], themes: [], settings: [] });
  const [filmDetails, setFilmDetails] = useState({
    filmLanguage: "Hindi", filmLanguageCustom: "", dialoguesPresent: "yes",
    wantToDirect: true, wantToProduce: false, scriptStyle: [],
  });
  const [roles, setRoles] = useState([
    { characterName: "Arshad", type: "Lead", description: "", gender: "Male", ageRange: { min: 38, max: 48 } },
  ]);
  const [legal, setLegal] = useState({ agreedToTerms: false, customInvestorTerms: "" });
  const [rightsLicensing, setRightsLicensing] = useState({
    rightsType: "exclusive_license",
    exclusivity: true,
    modificationRights: "buyer_must_consult_writer",
    paymentStructure: "lower_upfront_plus_royalty_percent",
    negotiationMode: "open_to_discussion_after_purchase",
    customConditions: "",
    timeBound: { licenseDurationMonths: 18, autoRevertToWriter: true },
    royaltySettings: { percentage: 5, durationType: "years", durationYears: 7 },
    legalAcknowledgement: { ownershipConfirmed: false, platformTermsAccepted: false, exclusivityUnderstood: false },
  });
  const [tagsInput, setTagsInput] = useState("monsoon, two-hander");
  const [scriptPrice, setScriptPrice] = useState(15);
  const [customPriceInput, setCustomPriceInput] = useState("");
  const [useCustomPrice, setUseCustomPrice] = useState(false);

  const agreementRef = useRef(null);

  // Panel selection by name, resolved against the same table the screen reads —
  // a ?panel= that does not exist must fail visibly rather than silently show
  // Basics and let a sweep record the wrong surface as passing.
  const panelIndex = requestedPanel
    ? ["basics", "story", "cast", "progress", "access", "media"].indexOf(requestedPanel)
    : -1;
  const effectiveDetailStep = panelIndex >= 0 ? panelIndex : detailStep;
  const effectiveStep = panelIndex >= 0 ? 2 : step;

  const contentOnly = requested === "contentonly";
  const attached = requested !== "extracting" && requested !== "denied";

  const vm = useMemo(() => ({
    user: { _id: "u1", name: "Arshad Rahman", role: "creator", subscription: { plan: "gold" } },
    mode: {
      isContentOnlyEditMode: contentOnly,
      editId: contentOnly || ["locked", "source-error", "source-local"].includes(requested) ? "script-1" : null,
      draftId: null,
    },
    state: {
      step: effectiveStep,
      detailStep: effectiveDetailStep,
      formData,
      classification,
      services: { hosting: true, evaluation: false, aiTrailer: false, spotlight: false },
      legal,
      rightsLicensing,
      roles,
      filmDetails,
      tagsInput,
      uploadedFile: attached ? { name: "four-oclock-train.pdf", size: 2_411_233, url: "https://example.test/s.pdf" } : null,
      uploadedPdfFile: null,
      existingUploadedFile: null,
      textContent: attached ? FIXTURE_PAGE : "",
      pdfPageTexts: attached ? [FIXTURE_PAGE, FIXTURE_PAGE] : [],
      pdfTextExtracted: attached,
      fromDraft: requested !== "extracting",
      isExtracting: requested === "extracting",
      uploadProgress: 0,
      thumbnailFile: attached && requested !== "quota" ? fixtureFile("cover.jpg", 812_004, "image/jpeg") : null,
      thumbnailPreviewUrl: PIXEL,
      isGeneratingAiCover: false,
      aiCoverAttempts: 1,
      aiCoverRemaining: requested === "quota" ? 0 : 14,
      aiCoverHistory: requested === "quota" ? [] : [fixtureFile("ai-cover-1.jpg", 700_000, "image/jpeg"), fixtureFile("ai-cover-2.jpg", 690_000, "image/jpeg")],
      aiCoverIndex: requested === "quota" ? -1 : 1,
      trailerFile: fixtureFile("trailer.mp4", 184_000_000, "video/mp4"),
      trailerPreviewUrl: "",
      trailerMetaLabel: "1:12 · 1920×1080",
      pitchVideoFile: null,
      pitchVideoPreviewUrl: "",
      pitchVideoMetaLabel: "",
      metaLoadingField: "",
      metaNotice: { field: "", text: "" },
      validationErrors: requested === "error"
        ? [{ screen: "story", step: 2, detailStep: 1, fieldId: "su-logline", message: "Write a logline before continuing.", label: "Story", code: "logline-required" }]
        : [],
      validationAttempt: 0,
      mediaRecoveryPending: requested === "recovery" || requested === "media-cancelled",
      mediaRecovery: requested === "recovery"
        ? { failedTypes: ["trailer"], cancelledTypes: [] }
        : requested === "media-cancelled"
          ? { failedTypes: [], cancelledTypes: ["trailer"] }
          : null,
      mediaUploadActive: requested === "uploading",
      mediaUploadPreflight: requested === "media-preflight"
        ? {
          signature: "trailer:trailer.mp4:184000000:0",
          files: [{ type: "trailer", label: "Trailer video", name: "trailer.mp4", size: 184_000_000 }],
          totalBytes: 184_000_000,
        }
        : null,
      pdfNotice: requested === "ready" ? "Text extracted, but the PDF upload link could not be created. Submit will update script content only." : "",
      creationBlocked: requested === "blocked",
      scriptLimit: { applies: true, limitReached: requested === "blocked", plan: "Free", used: 1, limit: 1 },
      loading: requested === "saving" || requested === "uploading",
      workingDraftDirty: requested === "local-saved" || requested === "exit",
      localSnapshotSaved: requested === "local-saved" || requested === "exit",
      navigationExitRequested: requested === "exit" ? 1 : 0,
      agreementScrolled: false,
      isPremium: true,
      scriptPrice,
      customPriceInput,
      useCustomPrice,
      toastMessage: null,

      accessDenied: requested === "denied",
      sourceLoad: requested === "resolving"
        ? { kind: "edit", id: "fixture", status: "loading", hasLocalRecovery: false }
        : requested === "source-error"
          ? { kind: "edit", id: "fixture", status: "failed", offline: true, hasLocalRecovery: true }
          : requested === "source-local"
            ? { kind: "edit", id: "fixture", status: "local-only", offline: true, hasLocalRecovery: true }
            : { kind: null, id: null, status: "ready", hasLocalRecovery: false },
      sourceWriteBlocked: requested === "source-local",
      submissionSuccess: requested === "submitted"
        ? { projectTitle: "The Four O'Clock Train", reviewPath: "/dashboard" }
        : null,
      editApprovalLocked: requested === "locked",
      mediaProgress: requested === "uploading"
        ? {
          thumbnail: { percent: 100, status: "done" },
          trailer: { percent: 41, status: "uploading" },
        }
        : requested === "media-cancelled"
          ? { trailer: { percent: 41, status: "cancelled" } }
        : {},
      thumbnailEditor: {
        open: requested === "crop",
        imageUrl: PIXEL,
        aspect: 16 / 10,
        crop: { x: 0, y: 0 },
        zoom: 1,
        rotation: 0,
        applying: false,
        onCropChange: noop,
        onZoomChange: noop,
        onRotationChange: noop,
        onCropComplete: noop,
        onCancel: noop,
        onApply: noop,
        description: "Drag the image to choose the best angle. Covers are 16:10.",
      },
    },
    actions: {
      handleDrop: noop,
      handleDragOver: noop,
      handleFileSelect: noop,
      handleChange: (event) => {
        const { name, value, type, checked } = event.target;
        setFormData((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
      },
      setFormData,
      setTextContent: noop,
      openEditor: noop,
      openDrafts: noop,
      openPricing: noop,
      handleGenerateMetadata: noop,
      setTagsInput,
      addRole: () => setRoles((prev) => [...prev, { characterName: "", type: "", description: "", gender: "Any", ageRange: { min: "", max: "" } }]),
      removeRole: (index) => setRoles((prev) => prev.filter((_, i) => i !== index)),
      updateRoleField: (index, field, next) => setRoles((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: next } : r))),
      updateRoleAge: (index, field, next) => setRoles((prev) => prev.map((r, i) => (
        i === index ? { ...r, ageRange: { ...r.ageRange, [field]: next === "" ? "" : Number(next) } } : r
      ))),
      setFilmDetails,
      toggleClassification: (category, tag) => setClassification((prev) => {
        const list = prev[category];
        return {
          ...prev,
          [category]: list.includes(tag) ? list.filter((v) => v !== tag) : list.length < 3 ? [...list, tag] : list,
        };
      }),
      generateAiCover: noop,
      downloadWatermarkedImage: noop,
      setThumbnailFile: noop,
      handleThumbnailSelect: noop,
      openThumbnailEditor: noop,
      setAiCoverHistoryIndex: noop,
      handleTrailerSelect: noop,
      setTrailerFile: noop,
      handlePitchVideoSelect: noop,
      setPitchVideoFile: noop,
      cancelMediaUpload: noop,
      confirmMediaUploadPreflight: noop,
      dismissMediaUploadPreflight: noop,
      setIsPremium: noop,
      setScriptPrice,
      setUseCustomPrice,
      setCustomPriceInput,
      setServices: noop,
      setLegal,
      setRightsLicensing,
      onStepSelect: setStep,
      onDetailSelect: setDetailStep,
      dismissToast: noop,
      focusValidationIssue: noop,
      handleBack: () => {
        if (effectiveStep === 2 && effectiveDetailStep > 0) { setDetailStep(effectiveDetailStep - 1); return; }
        setStep((current) => Math.max(1, current - 1));
      },
      handleNext: () => {
        if (effectiveStep === 2 && effectiveDetailStep < 5) { setDetailStep(effectiveDetailStep + 1); return; }
        setStep((current) => Math.min(5, current + 1));
        if (effectiveStep === 1) setDetailStep(0);
      },
      handleSaveDraft: noop,
      retrySourceLoad: noop,
      recoverSourceFromDevice: noop,
      flushWorkingSnapshot: noop,
      discardWorkingDraft: noop,
      handleSubmit: noop,
      cancelContentEdit: noop,
    },
    elements: {
      fileInputRef: { current: null },
      thumbnailInputRef: { current: null },
      trailerInputRef: { current: null },
      pitchVideoInputRef: { current: null },
      agreementRef,
    },
    options: {
      formats: FIXTURE_FORMATS,
      formatRanges: { feature: { min: 70, max: 180, typical: "90-120", label: "Feature" } },
      genres: GENRES,
      tones: TONES,
      themes: THEMES,
      settings: SETTINGS,
      roleGenders: ["Any", "Female", "Male", "Non-binary", "Other"],
      languages: ["Hindi", "English", "Hinglish", "Sindhi", "Urdu", "Tamil", "Telugu", "Marathi", "Bengali", "Kannada", "Malayalam", "Punjabi", "Gujarati", "Odia", "Other"],
      styles: [],
      completion: SCRIPT_COMPLETION_OPTIONS,
      rights: [
        { value: "full_rights_sale", title: "Full Rights Sale", tag: "ownership transfer", short: "Full sale", desc: "The buyer receives ownership under the final transaction agreement." },
        { value: "exclusive_license", title: "Exclusive License", tag: "time-bound", short: "Exclusive license", desc: "Grant one buyer exclusive use for a fixed term, then rights return to you." },
        { value: "custom_negotiation_required", title: "Custom Negotiation", tag: "discuss terms", short: "Custom deal", desc: "Use the listing to start a deal discussion before rights are transferred." },
      ],
      modification: [
        { value: "buyer_can_modify_freely", label: "Buyer can modify freely" },
        { value: "buyer_must_consult_writer", label: "Buyer must consult writer" },
        { value: "writer_retains_creative_approval_rights", label: "Writer retains creative approval rights" },
      ],
      payments: [
        { value: "one_time_upfront_payment", label: "One-time upfront payment" },
        { value: "lower_upfront_plus_royalty_percent", label: "Lower upfront + royalty %" },
        { value: "revenue_sharing_model", label: "Revenue sharing model" },
        { value: "custom_deal", label: "Custom deal" },
      ],
      negotiations: [
        { value: "fixed_terms_non_negotiable", label: "Fixed terms (non-negotiable)" },
        { value: "open_to_discussion_after_purchase", label: "Open to discussion after purchase" },
      ],
      licenseDurations: [12, 18, 24],
      pricePresets: [5, 10, 15, 25, 50],
    },
    computed: {
      pageCountWarning: "",
      effectivePrice: 15,
      buyerTotalPayable: 15.75,
      writerPayout: 15,
      priceGuide: "Suggested ₹15–₹50 for Feature",
      publishServices: [],
      legalAgreement: SCRIPT_UPLOAD_TERMS_TEXT,
      publishInvoiceRows: [
        { item: "Script Access Fee", detail: "Premium reader purchase model", amount: "₹15.00" },
        { item: "Platform fee (5%)", detail: "Paid by the buyer on top of the script price", amount: "₹0.75" },
        { item: "Buyer pays (before taxes)", detail: "Script price plus platform fee; taxes of 18% are added at the buyer's checkout", amount: "₹15.75" },
        { item: "Projected Writer Payout", detail: "You receive the full script price — the fee and taxes never reduce it", amount: "₹15.00" },
      ],
    },
  }), [
    attached, classification, contentOnly, customPriceInput, effectiveDetailStep, effectiveStep,
    filmDetails, formData, legal, requested, rightsLicensing, roles, scriptPrice, tagsInput,
    useCustomPrice,
  ]);

  // A visible statement of what is being measured. `getUploadScreenKey` is the
  // shared resolver the screen itself uses, so this cannot claim a panel the
  // chrome is not drawing.
  const panelKey = getUploadScreenKey(effectiveStep, effectiveDetailStep);

  return (
    <div className="ckm-upload__host" data-harness-panel={panelKey} data-harness-state={requested || "default"}>
      <ScriptUploadChrome vm={vm} />
    </div>
  );
}
