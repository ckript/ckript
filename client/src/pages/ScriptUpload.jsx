import { useState, useContext, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import Cropper from "react-easy-crop";
import api from "../services/api";
import { AuthContext } from "../context/AuthContext";
import { useDarkMode } from "../context/DarkModeContext";
import { useAuthModal } from "../context/AuthModalContext";
import { formatCurrency } from "../utils/currency";
import {
  AI_LOCKED_TOAST,
  AI_QUOTA_TOAST,
  aiImagesRemaining,
  describeAiError,
  userHasAiAccess,
} from "../config/aiEntitlements";
import { formatScreenplayLikeText } from "../utils/screenplayText";
import { getScriptCanonicalPath } from "../utils/scriptPath";
import { SCRIPT_UPLOAD_TERMS_TEXT, SCRIPT_UPLOAD_TERMS_VERSION } from "../constants/scriptUploadTerms";
import { DRAFT_ENDPOINT } from "./CreateProject/constants";
import { encodeKeepaliveBody } from "./CreateProject/lib/keepaliveSave";
import {
  buildMediaUploadPreflight,
  mediaRecoveryTypes,
  mergeMediaProgress,
  uploadProjectMedia,
  withoutMediaProgress,
} from "./CreateProject/lib/projectMediaUpload";
import {
  buildUploadWorkingDraftSnapshot,
  chooseUploadWorkingDraftRecovery,
  clearUploadWorkingDraft,
  getUploadWorkingDraftSignature,
  pruneUploadWorkingDrafts,
  readUploadWorkingDraft,
  uploadWorkingDraftKey,
  writeUploadWorkingDraft,
} from "./CreateProject/lib/uploadWorkingDraft";
import {
  UPLOAD_SOURCE_LOAD_STATUS,
  classifyUploadSourceLoadError,
  getUploadSource,
  initialUploadSourceLoad,
  uploadSourceCopy,
  uploadSourceNeedsGate,
} from "./CreateProject/lib/uploadSourceLoad";
import ScriptUploadWorkspace from "../components/script-upload/ScriptUploadWorkspace";
import ScriptUploadSuccess from "../components/script-upload/ScriptUploadSuccess";
import {
  SCRIPT_COMPLETION_OPTIONS,
  buildScriptCompletionPayload,
  createScriptCompletionFormState,
} from "../utils/scriptCompletion";
import {
  DETAIL_SCREEN_ORDER,
  UPLOAD_SCREEN_LOCATIONS,
  getUploadScreenKey,
  resolveUploadServerIssue,
  validateUploadScreen,
  validateUploadWorkflow,
} from "../utils/scriptUploadValidation";

// Format options
const formats = [
  { value: "feature", label: "Feature" },
  { value: "tv_1hour", label: "TV 1hr" },
  { value: "tv_halfhour", label: "TV 1/2hr" },
  { value: "short", label: "Short" },
  { value: "web_series", label: "Web Series" },
  { value: "drama_school", label: "Drama School" },
  { value: "micro_drama", label: "Micro Drama" },
  { value: "anime", label: "Anime" },
  { value: "movie", label: "Movie" },
  { value: "tv_serial", label: "TV Serial" },
  { value: "cartoon", label: "Cartoon" },
  { value: "limited_series", label: "Limited Series" },
  { value: "documentary", label: "Documentary" },
  { value: "songs", label: "Songs" },
  { value: "standup_comedy", label: "Standup Comedy" },
  { value: "dialogues", label: "Dialogues" },
  { value: "poet", label: "Poet" },
  { value: "other", label: "Other" },
];

const CONTENT_TYPE_BY_FORMAT = {
  movie: "movie",
  feature: "movie",
  tv_1hour: "tv_series",
  tv_halfhour: "tv_series",
  limited_series: "tv_series",
  tv_serial: "tv_series",
  short: "short_film",
  web_series: "web_series",
  documentary: "documentary",
  drama_school: "drama_school",
  micro_drama: "micro_drama",
  anime: "anime",
  cartoon: "anime",
  songs: "songs",
  standup_comedy: "standup_comedy",
  dialogues: "dialogues",
  poet: "poet",
};

const getContentTypeFromFormat = (format) => CONTENT_TYPE_BY_FORMAT[format] || "movie";

const FORMAT_PAGE_RANGES = {
  feature: { min: 70, max: 180, typical: "90-120", label: "Feature" },
  tv_1hour: { min: 45, max: 75, typical: "50-65", label: "TV 1-Hour" },
  tv_halfhour: { min: 22, max: 45, typical: "25-35", label: "TV Half-Hour" },
  short: { min: 1, max: 40, typical: "5-25", label: "Short" },
  web_series: { min: 20, max: 80, typical: "25-45", label: "Web Series" },
  drama_school: { min: 10, max: 60, typical: "15-35", label: "Drama School" },
  micro_drama: { min: 1, max: 15, typical: "3-10", label: "Micro Drama" },
  anime: { min: 18, max: 65, typical: "22-45", label: "Anime" },
  movie: { min: 70, max: 180, typical: "90-120", label: "Movie" },
  tv_serial: { min: 18, max: 50, typical: "20-35", label: "TV Serial" },
  cartoon: { min: 7, max: 45, typical: "10-25", label: "Cartoon" },
  limited_series: { min: 45, max: 75, typical: "50-65", label: "Limited Series" },
  documentary: { min: 60, max: 120, typical: "70-100", label: "Documentary" },
  songs: { min: 1, max: 10, typical: "3-5", label: "Songs" },
  standup_comedy: { min: 3, max: 50, typical: "8-20", label: "Standup Comedy" },
  dialogues: { min: 1, max: 80, typical: "5-25", label: "Dialogues" },
  poet: { min: 1, max: 60, typical: "3-20", label: "Poet" },
  other: { min: 1, max: 250, typical: "Varies", label: "Other" },
};

const getPageCountWarning = (format, pageCountValue) => {
  const range = FORMAT_PAGE_RANGES[format];
  const pageCount = Number(pageCountValue);

  if (!range || !Number.isFinite(pageCount) || pageCount <= 0) {
    return "";
  }

  if (pageCount < range.min) {
    return `${range.label} scripts are usually ${range.min}+ pages (typical ${range.typical}). You can continue, but this may feel short for the format.`;
  }

  if (pageCount > range.max) {
    return `${range.label} scripts are usually under ${range.max} pages (typical ${range.typical}). You can continue, but this may feel long for the format.`;
  }

  return "";
};

// Genre options
const genres = [
  "Action", "Adventure", "Animation", "Anime", "Art/Foreign", "Biographical",
  "Children/Family", "Comedy", "Coming of Age", "Crime", "Dark Comedy", "Documentary",
  "Drama", "Erotic", "Espionage", "Faith/Spirituality", "Family", "Fantasy",
  "Film Noir", "Historical", "Horror", "Indie", "Legal", "Martial Arts",
  "Medical", "Mockumentary", "Musical", "Mystery", "Noir", "Political",
  "Psychological", "Romance", "Romantic Comedy", "Satire", "Sci-Fi", "Short Film",
  "Slice of Life", "Sports", "Steampunk", "Superhero", "Supernatural", "Suspense",
  "Teen", "Thriller", "True Crime", "War", "Western", "Zombie"
];

// Classification options
const toneOptions = [
  "Absurdist", "Atmospheric", "Bleak", "Cerebral", "Claustrophobic", "Campy",
  "Cynical", "Dark", "Dreamlike", "Edgy", "Epic", "Fast-paced", "Gritty",
  "Heartwarming", "Hopeful", "Intense", "Irreverent", "Lighthearted",
  "Melancholic", "Mind-bending", "Noir", "Nostalgic", "Poetic", "Provocative",
  "Quirky", "Raw", "Romantic", "Satirical", "Sensual", "Slow-burn", "Surreal",
  "Suspenseful", "Tense", "Tragic", "Uplifting", "Whimsical"
];

const themeOptions = [
  "Abandonment", "Addiction", "Alienation", "Ambition", "Betrayal", "Brotherhood",
  "Capitalism", "Chosen One", "Class Struggle", "Colonialism", "Coming of Age",
  "Corruption", "Revenge", "Redemption", "Love Triangle", "Family Drama",
  "Social Justice", "Identity Crisis", "Survival", "Power Struggle",
  "Forbidden Love", "Loss & Grief", "Good vs Evil", "Man vs Nature",
  "Isolation", "Second Chance", "Underdog Story", "Fish Out of Water",
  "Quest", "Transformation", "Sacrifice", "Justice", "Freedom", "Mental Illness",
  "Existentialism", "Fate vs Free Will", "Man vs Technology", "War & Peace", "Grief", "Hope"
];

const settingOptions = [
  "Ancient", "Cyberpunk", "Contemporary", "Deep Space", "Desert", "Dystopian",
  "Future", "Haunted House", "Historical", "Hospital", "Jungle", "Medieval",
  "Military Base", "Ocean/Sea", "Post-Apocalyptic", "Prison", "Rural",
  "School/College", "Small Town", "Big City", "Space", "Suburban",
  "Alternate Reality", "Virtual Reality", "Underground", "Wilderness",
  "Wild West", "Victorian Era", "World War I", "World War II", "Secret Facility",
  "New York", "Isolated", "Los Angeles"
];
const ROLE_GENDER_OPTIONS = ["Any", "Female", "Male", "Non-binary", "Other"];



const THUMBNAIL_ASPECT = 16 / 10;
const MAX_THUMBNAIL_SIZE = 5 * 1024 * 1024;
const MAX_TRAILER_SIZE = 250 * 1024 * 1024;
const MAX_PDF_SIZE = 30 * 1024 * 1024;
const MAX_CUSTOM_INVESTOR_TERMS_LENGTH = 3000;
const MAX_RIGHTS_CUSTOM_CONDITIONS_LENGTH = 5000;

const createImage = (url) => new Promise((resolve, reject) => {
  const image = new Image();
  image.addEventListener("load", () => resolve(image));
  image.addEventListener("error", reject);
  image.setAttribute("crossOrigin", "anonymous");
  image.src = url;
});

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const getRotatedSize = (width, height, rotation) => {
  const r = toRadians(rotation);
  return {
    width: Math.abs(Math.cos(r) * width) + Math.abs(Math.sin(r) * height),
    height: Math.abs(Math.sin(r) * width) + Math.abs(Math.cos(r) * height),
  };
};

const getCroppedThumbnailBlob = async (imageSrc, pixelCrop, rotation = 0) => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) return null;

  const rotated = getRotatedSize(image.width, image.height, rotation);
  canvas.width = rotated.width;
  canvas.height = rotated.height;

  ctx.translate(rotated.width / 2, rotated.height / 2);
  ctx.rotate(toRadians(rotation));
  ctx.drawImage(image, -image.width / 2, -image.height / 2);

  const cropCanvas = document.createElement("canvas");
  const cropCtx = cropCanvas.getContext("2d");

  if (!cropCtx) return null;

  cropCanvas.width = pixelCrop.width;
  cropCanvas.height = pixelCrop.height;

  cropCtx.drawImage(
    canvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve) => {
    cropCanvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
  });
};

const STEPS = [
  { num: 1, label: "Upload", shortLabel: "Upload", desc: "Files" },
  { num: 2, label: "Basics", shortLabel: "Basic", desc: "Essentials" },
  { num: 3, label: "Classify", shortLabel: "Class", desc: "Tags & tone" },
  { num: 4, label: "Film Info", shortLabel: "Film", desc: "Direction & language" },
  { num: 5, label: "Publish", shortLabel: "Publish", desc: "Plan & pricing" },
];

const FILM_LANGUAGE_OPTIONS = [
  "Hindi", "English", "Hinglish", "Sindhi", "Urdu", "Tamil", "Telugu", "Marathi",
  "Bengali", "Kannada", "Malayalam", "Punjabi", "Gujarati", "Odia", "Other",
];

const SCRIPT_STYLE_OPTIONS = [
  { id: "Professional", desc: "Industry-standard structure", path: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" },
  { id: "Modern", desc: "Contemporary voice & fresh approach", path: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" },
  { id: "Clean", desc: "Minimal prose, tight & uncluttered", path: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" },
  { id: "Concise", desc: "Every scene earns its place", path: "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" },
  { id: "Commercial", desc: "Broad appeal, market-friendly", path: "M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" },
  { id: "Realistic", desc: "Grounded characters & authentic dialogue", path: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" },
  { id: "Poetic", desc: "Lyrical prose & metaphorical language", path: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" },
  { id: "Experimental", desc: "Non-linear, unconventional structure", path: "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5" },
  { id: "Dialogue-Heavy", desc: "Character-driven through conversation", path: "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" },
  { id: "Visual-Heavy", desc: "Scene-led, strong visual prose", path: "M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" },
];

const LEGAL_AGREEMENT = SCRIPT_UPLOAD_TERMS_TEXT;

const RIGHTS_TYPE_OPTIONS = [
  { value: "full_rights_sale", label: "Full Rights Sale (Ownership Transfer)" },
  { value: "exclusive_license", label: "Exclusive License" },
  { value: "custom_negotiation_required", label: "Custom Negotiation Required" },
];

const MODIFICATION_RIGHTS_OPTIONS = [
  { value: "buyer_can_modify_freely", label: "Buyer can modify freely" },
  { value: "buyer_must_consult_writer", label: "Buyer must consult writer" },
  { value: "writer_retains_creative_approval_rights", label: "Writer retains creative approval rights" },
];

const PAYMENT_STRUCTURE_OPTIONS = [
  { value: "one_time_upfront_payment", label: "One-time upfront payment" },
  { value: "lower_upfront_plus_royalty_percent", label: "Lower upfront + royalty %" },
  { value: "revenue_sharing_model", label: "Revenue sharing model" },
  { value: "custom_deal", label: "Custom deal" },
];

const NEGOTIATION_MODE_OPTIONS = [
  { value: "fixed_terms_non_negotiable", label: "Fixed terms (non-negotiable)" },
  { value: "open_to_discussion_after_purchase", label: "Open to discussion after purchase" },
];

const RIGHTS_LABEL_MAP = Object.fromEntries(RIGHTS_TYPE_OPTIONS.map((option) => [option.value, option.label]));
const MODIFICATION_LABEL_MAP = Object.fromEntries(MODIFICATION_RIGHTS_OPTIONS.map((option) => [option.value, option.label]));
const PAYMENT_LABEL_MAP = Object.fromEntries(PAYMENT_STRUCTURE_OPTIONS.map((option) => [option.value, option.label]));
const NEGOTIATION_LABEL_MAP = Object.fromEntries(NEGOTIATION_MODE_OPTIONS.map((option) => [option.value, option.label]));
const LICENSE_DURATION_PRESET_MONTHS = [12, 18, 24];
const MAX_LICENSE_DURATION_MONTHS = 120;

const createDefaultRightsLicensing = () => ({
  rightsType: "full_rights_sale",
  exclusivity: true,
  modificationRights: "buyer_must_consult_writer",
  paymentStructure: "one_time_upfront_payment",
  royaltySettings: {
    percentage: 0,
    durationType: "none",
    durationYears: 0,
  },
  timeBound: {
    licenseDurationMonths: 12,
    autoRevertToWriter: true,
  },
  negotiationMode: "fixed_terms_non_negotiable",
  customConditions: "",
  legalAcknowledgement: {
    ownershipConfirmed: false,
    platformTermsAccepted: false,
    exclusivityUnderstood: false,
  },
});

const normalizeRightsLicensingState = (incoming = {}) => {
  const defaults = createDefaultRightsLicensing();
  const normalizedRightsType = RIGHTS_LABEL_MAP[incoming?.rightsType] ? incoming.rightsType : defaults.rightsType;
  const normalizedPaymentStructure = PAYMENT_LABEL_MAP[incoming?.paymentStructure]
    ? incoming.paymentStructure
    : defaults.paymentStructure;
  const requestedDurationRaw = Number(incoming?.timeBound?.licenseDurationMonths ?? defaults.timeBound.licenseDurationMonths);
  const requestedDuration = Number.isFinite(requestedDurationRaw)
    ? Math.max(0, Math.min(MAX_LICENSE_DURATION_MONTHS, Math.round(requestedDurationRaw)))
    : defaults.timeBound.licenseDurationMonths;

  return {
    rightsType: normalizedRightsType,
    exclusivity: true,
    modificationRights: MODIFICATION_LABEL_MAP[incoming?.modificationRights]
      ? incoming.modificationRights
      : defaults.modificationRights,
    paymentStructure: normalizedPaymentStructure,
    royaltySettings: {
      percentage: Number.isFinite(Number(incoming?.royaltySettings?.percentage))
        ? Math.max(0, Math.min(100, Number(incoming.royaltySettings.percentage)))
        : defaults.royaltySettings.percentage,
      durationType: ["none", "years", "project_lifetime"].includes(incoming?.royaltySettings?.durationType)
        ? incoming.royaltySettings.durationType
        : defaults.royaltySettings.durationType,
      durationYears: Number.isFinite(Number(incoming?.royaltySettings?.durationYears))
        ? Math.max(0, Math.min(99, Math.round(Number(incoming.royaltySettings.durationYears))))
        : defaults.royaltySettings.durationYears,
    },
    timeBound: {
      licenseDurationMonths: requestedDuration,
      autoRevertToWriter: incoming?.timeBound?.autoRevertToWriter !== undefined
        ? Boolean(incoming.timeBound.autoRevertToWriter)
        : defaults.timeBound.autoRevertToWriter,
    },
    negotiationMode: NEGOTIATION_LABEL_MAP[incoming?.negotiationMode]
      ? incoming.negotiationMode
      : defaults.negotiationMode,
    customConditions: String(incoming?.customConditions || "").slice(0, MAX_RIGHTS_CUSTOM_CONDITIONS_LENGTH),
    legalAcknowledgement: {
      ownershipConfirmed: Boolean(incoming?.legalAcknowledgement?.ownershipConfirmed),
      platformTermsAccepted: Boolean(incoming?.legalAcknowledgement?.platformTermsAccepted),
      exclusivityUnderstood: Boolean(incoming?.legalAcknowledgement?.exclusivityUnderstood),
    },
  };
};

const formatDuration = (seconds) => {
  const total = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

const isHttpUrl = (value = "") => /^https?:\/\//i.test(String(value || ""));

const getFileNameFromUrl = (url = "") => {
  try {
    const last = String(url || "").split("?")[0].split("/").pop() || "script.pdf";
    return decodeURIComponent(last) || "script.pdf";
  } catch {
    return "script.pdf";
  }
};

/*
 * The chrome seam (added 2026-08-09, plan §11 Phase 3 bullet 3).
 *
 * Everything above and below this line is platform-neutral: the extraction, the
 * draft conversion, the content-only revision path, the plan gate, validation,
 * the media recovery and the submit payload. What is NOT neutral is
 * `ScriptUploadWorkspace`, a three-column desktop workspace with a tracker rail,
 * a helper rail and an action bar whose own phone breakpoints breach four of the
 * mobile plan's floors (DEF-4).
 *
 * So the chrome is injected rather than forked, exactly as
 * `pages/CreateProject/index.jsx` injects its `Shell`:
 *
 *   • `Workspace`      — which component draws the page. Defaults to the desktop
 *                        one, so App.jsx's `<ScriptUpload />` renders precisely
 *                        what it rendered before.
 *   • `nativeChrome`   — suppresses the desktop-only surfaces that a native
 *                        chrome replaces, and routes the route-state early
 *                        states through the view model instead of returning
 *                        markup that no injected chrome could ever reach.
 *   • `hostClassName`  — `.ckm-shell` is `height: 100%` and needs a host that
 *                        passes the height through. Purely a mobile concern, so
 *                        it stays on the mobile side of the seam.
 *
 * `nativeChrome` changes exactly five things in this file, and every one of them
 * is REPLACED rather than dropped:
 *
 *   1–4. the four early returns above (access refused, a source load still
 *        resolving, a source-load failure, the post-submit screen) become view-model flags, because an
 *        early return happens before any injected chrome and can therefore never
 *        be re-drawn by one;
 *   5.   the portal-rendered thumbnail cropper — a Tailwind modal with a
 *        hand-rolled focus trap — is not rendered, because the native chrome
 *        mounts the shared `ckm-media` cropper, which inherits Phase 1's already
 *        tested trap, scroll lock and focus restoration.
 *
 * The toast needs no flag: `ScriptUploadWorkspace` is what draws it, so a chrome
 * that replaces the workspace replaces the toast too. `state.toastMessage` stays
 * on the view model and `useUploadToasts` forwards it to the app-wide layer, so
 * nothing is swallowed.
 */
const ScriptUpload = ({
  Workspace = ScriptUploadWorkspace,
  nativeChrome = false,
  hostClassName = "",
}) => {
  /*
   * Paired wrongly, `nativeChrome` is a silent failure: it removes the cropper
   * and four whole screens on the promise that something else renders them, and
   * the desktop workspace renders none of the five. A writer would tap a cover
   * and watch nothing happen. DEV-only, because it is a wiring mistake, not a
   * runtime condition.
   */
  if (import.meta.env?.DEV && nativeChrome && Workspace === ScriptUploadWorkspace) {
    console.error(
      "[script-upload] `nativeChrome` was passed with the desktop ScriptUploadWorkspace. "
      + "That flag suppresses the thumbnail cropper and the access-denied, source-loading, "
      + "source-failure and submitted screens on the assumption a native chrome owns them — pass that chrome as "
      + "`Workspace`.",
    );
  }

  const { user } = useContext(AuthContext);
  const { isDarkMode } = useDarkMode();
  const { openPricingModal } = useAuthModal();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get("draft");
  const editId = searchParams.get("edit");
  const uploadSource = useMemo(() => getUploadSource({ draftId, editId }), [draftId, editId]);
  const workingDraftStorageKey = uploadWorkingDraftKey({ draftId, editId });
  const [step, setStep] = useState(1);
  const [detailStep, setDetailStep] = useState(0);
  const [fromDraft, setFromDraft] = useState(false);
  const [scriptId, setScriptId] = useState(null);
  const scriptIdRef = useRef(null);
  scriptIdRef.current = scriptId;
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [toastMessage, setToastMessage] = useState(null);
  // Writer "scripts per plan" limit (e.g. Free = 1) — fetched on mount so the gate shows UPFRONT
  // and blocks progression, not just at submit. Shared rule with the server (utils/scriptLimits.js).
  const [scriptLimit, setScriptLimit] = useState(null);
  const [pdfNotice, setPdfNotice] = useState("");
  const [editApprovalLocked, setEditApprovalLocked] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedPdfFile, setUploadedPdfFile] = useState(null);
  const [existingUploadedFile, setExistingUploadedFile] = useState(null);
  const [textContent, setTextContent] = useState("");
  const [pdfPageTexts, setPdfPageTexts] = useState([]);
  const [pdfTextExtracted, setPdfTextExtracted] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [agreementScrolled, setAgreementScrolled] = useState(true);

  const agreementRef = useRef(null);
  const fileInputRef = useRef(null);
  const thumbnailInputRef = useRef(null);
  const trailerInputRef = useRef(null);
  const pitchVideoInputRef = useRef(null);
  const toastTimerRef = useRef(null);
  const currentScreenRef = useRef("upload");
  const thumbnailDialogRef = useRef(null);
  const serverUpdatedAtRef = useRef(null);
  const baselineWorkingSignatureRef = useRef("");
  const currentWorkingSnapshotRef = useRef(null);
  const currentWorkingSignatureRef = useRef("");
  const currentDraftPayloadRef = useRef(null);
  const workingDraftDirtyRef = useRef(false);
  const flushWorkingSnapshotRef = useRef(() => false);
  const queueExitDraftSaveRef = useRef(() => false);
  const localDraftHydratedRef = useRef(false);
  const intentionalExitRef = useRef(false);
  const lastExitSaveSignatureRef = useRef("");
  const [localSnapshotSaved, setLocalSnapshotSaved] = useState(false);
  const [navigationExitRequested, setNavigationExitRequested] = useState(0);
  const [recoveryContext, setRecoveryContext] = useState(null);
  const [sourceLoad, setSourceLoad] = useState(() => initialUploadSourceLoad({ draftId, editId }));
  const [sourceLoadAttempt, setSourceLoadAttempt] = useState(0);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToastMessage(null);
  }, []);

  const showToast = useCallback((message, type = "error", action = null, options = {}) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const duration = options.duration ?? (type === "error" ? 7000 : 5000);
    const defaultTitle = type === "success"
      ? "All set"
      : type === "warning"
        ? "Before you continue"
        : "Something needs attention";

    setToastMessage({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: String(message || "Something went wrong. Please try again."),
      type,
      action,
      title: options.title || defaultTitle,
      scope: options.scope || "general",
      duration,
    });
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, duration);
  }, []);

  // One gate for every AI action on this page. There was none here at all: a free-plan writer could
  // tap Generate and receive a raw 403 string, while the same action on /create-project was
  // (wrongly) refused to everyone but gold. Defined here, above its first caller.
  const enforceAiPlan = useCallback(() => {
    if (userHasAiAccess(user)) return true;
    showToast(
      AI_LOCKED_TOAST,
      "warning",
      { label: "Pricing Plan", onClick: () => openPricingModal("writer") }
    );
    return false;
  }, [user, showToast, openPricingModal]);

  const setError = useCallback((message, targetScreen = null) => {
    const nextMessage = String(message || "");
    if (!nextMessage) {
      setValidationErrors([]);
      setToastMessage((current) => {
        if (current?.scope !== "page-error") return current;
        if (toastTimerRef.current) {
          clearTimeout(toastTimerRef.current);
          toastTimerRef.current = null;
        }
        return null;
      });
      return;
    }

    const screen = typeof targetScreen === "string"
      ? targetScreen
      : targetScreen?.screen || currentScreenRef.current;
    showToast(nextMessage, "error", null, {
      scope: "page-error",
      title: `${UPLOAD_SCREEN_LOCATIONS[screen]?.label || "This page"} needs attention`,
    });
  }, [showToast]);

  const clearValidationFeedback = useCallback(() => {
    setValidationErrors([]);
    setToastMessage((current) => {
      if (!["validation", "page-error"].includes(current?.scope)) return current;
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      return null;
    });
  }, []);

  useEffect(() => {
    currentScreenRef.current = getUploadScreenKey(step, detailStep);
  }, [detailStep, step]);

  // Thumbnail and Trailer states
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [isGeneratingAiCover, setIsGeneratingAiCover] = useState(false);
  const [trailerFile, setTrailerFile] = useState(null);
  const [trailerOption, setTrailerOption] = useState("none"); // "none", "ai", "upload"
  const [pitchVideoFile, setPitchVideoFile] = useState(null);
  const [pitchVideoPreviewUrl, setPitchVideoPreviewUrl] = useState("");
  const [pitchVideoMeta, setPitchVideoMeta] = useState(null);
  const [pitchVideoMetaLoading, setPitchVideoMetaLoading] = useState(false);
  const [pendingMediaRecovery, setPendingMediaRecovery] = useState(null);
  const [mediaUploadActive, setMediaUploadActive] = useState(false);
  const [mediaUploadPreflight, setMediaUploadPreflight] = useState(null);
  const mediaUploadControllerRef = useRef(null);
  const acknowledgedMediaPreflightRef = useRef("");
  // { thumbnail?: { percent, status }, trailer?: …, pitchVideo?: … } — see
  // `postMedia` below. Empty until a submit actually starts sending files.
  const [mediaProgress, setMediaProgress] = useState({});
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState("");
  const [trailerPreviewUrl, setTrailerPreviewUrl] = useState("");
  const [trailerMeta, setTrailerMeta] = useState(null);
  const [trailerMetaLoading, setTrailerMetaLoading] = useState(false);
  const [thumbnailSourceName, setThumbnailSourceName] = useState("thumbnail");
  const [isThumbnailEditorOpen, setIsThumbnailEditorOpen] = useState(false);
  const [thumbnailSourceUrl, setThumbnailSourceUrl] = useState("");
  const [thumbnailCrop, setThumbnailCrop] = useState({ x: 0, y: 0 });
  const [thumbnailZoom, setThumbnailZoom] = useState(1);
  const [thumbnailRotation, setThumbnailRotation] = useState(0);
  const [thumbnailCropPixels, setThumbnailCropPixels] = useState(null);
  const [thumbnailApplying, setThumbnailApplying] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(null);
  const [isContentOnlyEditMode, setIsContentOnlyEditMode] = useState(false);
  const [originalEditContent, setOriginalEditContent] = useState("");

  useEffect(() => {
    setMediaProgress((current) => withoutMediaProgress(current, "thumbnail"));
    setMediaUploadPreflight(null);
    acknowledgedMediaPreflightRef.current = "";
  }, [thumbnailFile]);
  useEffect(() => {
    setMediaProgress((current) => withoutMediaProgress(current, "trailer"));
    setMediaUploadPreflight(null);
    acknowledgedMediaPreflightRef.current = "";
  }, [trailerFile]);
  useEffect(() => {
    setMediaProgress((current) => withoutMediaProgress(current, "pitchVideo"));
    setMediaUploadPreflight(null);
    acknowledgedMediaPreflightRef.current = "";
  }, [pitchVideoFile]);
  useEffect(() => () => mediaUploadControllerRef.current?.abort(), []);

  // Form data
  const [formData, setFormData] = useState({
    title: "",
    format: "feature",
    formatOther: "",
    pageCount: "",
    viewableScript: true,
    previewWindowMode: "pages",
    previewWindowStart: "1",
    previewWindowEnd: "8",
    primaryGenre: "",
    logline: "",
    synopsis: "",
    ...createScriptCompletionFormState(),
  });

  // Classification data
  const [classification, setClassification] = useState({
    tones: [],
    themes: [],
    settings: [],
  });

  // Services data
  const [services, setServices] = useState({
    hosting: true,
    evaluation: false,
    aiTrailer: false,
    spotlight: false,
  });



  // Legal data
  const [legal, setLegal] = useState({
    agreedToTerms: false,
    customInvestorTerms: "",
  });
  const [rightsLicensing, setRightsLicensing] = useState(() => createDefaultRightsLicensing());

  // Tags as comma-separated input
  const [tagsInput, setTagsInput] = useState("");
  const [roles, setRoles] = useState([]);

  // Film production details (step 4)
  const [filmDetails, setFilmDetails] = useState({
    filmLanguage: "",
    filmLanguageCustom: "",
    dialoguesPresent: "yes",
    wantToDirect: false,
    wantToProduce: false,
    scriptStyle: [],
  });

  // AI metadata generation (per-section: "logline" | "synopsis" | "roles")
  const [metaLoadingField, setMetaLoadingField] = useState("");
  const [metaNotice, setMetaNotice] = useState({ field: "", text: "" });

  // Script pricing
  const PRICE_PRESETS = [5, 10, 15, 25, 50];
  const BUYER_COMMISSION_RATE = 0.05;
  const [isPremium, setIsPremium] = useState(true);
  const [scriptPrice, setScriptPrice] = useState(10);
  const [customPriceInput, setCustomPriceInput] = useState("");
  const [useCustomPrice, setUseCustomPrice] = useState(false);
  const effectivePrice = useCustomPrice ? Number(customPriceInput) || 0 : scriptPrice;
  const buyerCommissionAmount = Math.round(effectivePrice * BUYER_COMMISSION_RATE * 100) / 100;
  const buyerTotalPayable = Math.round((effectivePrice + buyerCommissionAmount) * 100) / 100;
  const writerPayout = Math.round(effectivePrice * 100) / 100;
  const FORMAT_PRICE_GUIDE = {
    feature:      { label: "Feature Film",  min: 15, max: 50, suggest: 25 },
    tv_1hour:     { label: "TV 1-Hour",     min: 10, max: 30, suggest: 15 },
    tv_halfhour:  { label: "TV Half-Hour",  min: 5,  max: 20, suggest: 10 },
    short:        { label: "Short Film",    min: 5,  max: 15, suggest: 5  },
    web_series:   { label: "Web Series",    min: 8,  max: 35, suggest: 15 },
    drama_school: { label: "Drama School",  min: 5,  max: 20, suggest: 10 },
    micro_drama:  { label: "Micro Drama",   min: 1,  max: 10, suggest: 5  },
    anime:        { label: "Anime",         min: 8,  max: 35, suggest: 15 },
    movie:        { label: "Movie",         min: 15, max: 50, suggest: 25 },
    tv_serial:    { label: "TV Serial",     min: 5,  max: 25, suggest: 10 },
    cartoon:      { label: "Cartoon",       min: 5,  max: 20, suggest: 10 },
    limited_series:{ label: "Limited Series", min: 10, max: 35, suggest: 15 },
    documentary:  { label: "Documentary",   min: 10, max: 40, suggest: 20 },
    songs:        { label: "Songs",         min: 5,  max: 30, suggest: 10 },
    standup_comedy:{ label: "Standup Comedy", min: 5, max: 35, suggest: 10 },
    dialogues:    { label: "Dialogues",     min: 5,  max: 25, suggest: 10 },
    poet:         { label: "Poet",          min: 5,  max: 25, suggest: 10 },
    other:        { label: "Other",         min: 5,  max: 50, suggest: 10 },
  };

  const buildRightsPayload = () => {
    const normalized = normalizeRightsLicensingState(rightsLicensing || {});
    const royaltyBased = ["lower_upfront_plus_royalty_percent", "revenue_sharing_model"].includes(normalized.paymentStructure);

    return {
      ...normalized,
      legalAcknowledgement: {
        ...normalized.legalAcknowledgement,
        platformTermsAccepted: Boolean(legal.agreedToTerms) && Boolean(normalized.legalAcknowledgement.platformTermsAccepted),
      },
      royaltySettings: royaltyBased
        ? normalized.royaltySettings
        : { percentage: 0, durationType: "none", durationYears: 0 },
      timeBound: {
        ...normalized.timeBound,
        licenseDurationMonths: normalized.rightsType === "exclusive_license"
          ? normalized.timeBound.licenseDurationMonths
          : 0,
      },
      termsVersion: SCRIPT_UPLOAD_TERMS_VERSION,
      lastUpdatedAt: new Date().toISOString(),
    };
  };

  const buildScriptPreviewPayload = (source = formData) => {
    const mode = "pages";
    const start = Math.max(1, Number(source.previewWindowStart || 1) || 1);
    const end = Math.max(start, Number(source.previewWindowEnd || 8) || 8);
    return {
      mode,
      start,
      end,
    };
  };

  /*
   * The local snapshot is the durable autosave. It intentionally carries only
   * JSON state: a browser cannot resurrect File objects after refresh, but it
   * can restore every typed field, the remote PDF descriptor, and the exact
   * panel the writer left. File names are recorded separately so recovery can
   * say what must be selected again instead of silently dropping it.
   */
  const workingSnapshot = buildUploadWorkingDraftSnapshot({
    userId: user?._id || null,
    draftId,
    editId,
    scriptId,
    step,
    detailStep,
    baseUpdatedAt: serverUpdatedAtRef.current,
    data: {
      formData,
      classification,
      services,
      legal,
      rightsLicensing,
      tagsInput,
      roles,
      filmDetails,
      textContent,
      uploadedFile: uploadedFile ? {
        name: uploadedFile.name || "",
        size: uploadedFile.size ?? null,
        url: uploadedFile.url || "",
        fileGrant: uploadedFile.fileGrant || "",
        sourceMode: uploadedFile.sourceMode || "",
      } : null,
      existingUploadedFile: existingUploadedFile ? {
        name: existingUploadedFile.name || "",
        size: existingUploadedFile.size ?? null,
        url: existingUploadedFile.url || "",
      } : null,
      trailerOption,
      isPremium,
      scriptPrice,
      customPriceInput,
      useCustomPrice,
    },
    pendingFiles: {
      thumbnail: thumbnailFile?.name || "",
      trailer: trailerFile?.name || "",
      pitchVideo: pitchVideoFile?.name || "",
    },
  });
  const workingSignature = getUploadWorkingDraftSignature(workingSnapshot);
  currentWorkingSnapshotRef.current = workingSnapshot;
  currentWorkingSignatureRef.current = workingSignature;
  if (!baselineWorkingSignatureRef.current) {
    baselineWorkingSignatureRef.current = workingSignature;
  }
  const workingDraftDirty = Boolean(
    localDraftHydratedRef.current
    && workingSignature !== baselineWorkingSignatureRef.current
  );
  workingDraftDirtyRef.current = workingDraftDirty;

  const applyWorkingSnapshot = useCallback((snapshot) => {
    const data = snapshot?.data || {};
    if (data.formData && typeof data.formData === "object") {
      setFormData((current) => ({ ...current, ...data.formData }));
    }
    if (data.classification && typeof data.classification === "object") setClassification(data.classification);
    if (data.services && typeof data.services === "object") setServices(data.services);
    if (data.legal && typeof data.legal === "object") setLegal(data.legal);
    if (data.rightsLicensing && typeof data.rightsLicensing === "object") setRightsLicensing(data.rightsLicensing);
    if (typeof data.tagsInput === "string") setTagsInput(data.tagsInput);
    if (Array.isArray(data.roles)) setRoles(data.roles);
    if (data.filmDetails && typeof data.filmDetails === "object") setFilmDetails(data.filmDetails);
    if (typeof data.textContent === "string") setTextContent(data.textContent);
    setUploadedFile(data.uploadedFile && typeof data.uploadedFile === "object" ? data.uploadedFile : null);
    setExistingUploadedFile(
      data.existingUploadedFile && typeof data.existingUploadedFile === "object"
        ? data.existingUploadedFile
        : null
    );
    setUploadedPdfFile(null);
    setPdfPageTexts([]);
    setPdfTextExtracted(false);
    if (typeof data.trailerOption === "string") setTrailerOption(data.trailerOption);
    if (typeof data.isPremium === "boolean") setIsPremium(data.isPremium);
    if (Number.isFinite(Number(data.scriptPrice))) setScriptPrice(Number(data.scriptPrice));
    if (typeof data.customPriceInput === "string") setCustomPriceInput(data.customPriceInput);
    if (typeof data.useCustomPrice === "boolean") setUseCustomPrice(data.useCustomPrice);

    const restoredStep = Number(snapshot?.step);
    const restoredDetail = Number(snapshot?.detailStep);
    if (Number.isFinite(restoredStep) && restoredStep >= 1 && restoredStep <= 5) setStep(restoredStep);
    if (Number.isFinite(restoredDetail) && restoredDetail >= 0 && restoredDetail <= 5) setDetailStep(restoredDetail);
    if (snapshot?.scriptId) {
      scriptIdRef.current = snapshot.scriptId;
      setScriptId(snapshot.scriptId);
      setFromDraft(true);
    }

    const fileNames = Object.values(snapshot?.pendingFiles || {}).filter(Boolean);
    setLocalSnapshotSaved(true);
    showToast(
      fileNames.length
        ? `Recovered your local upload. Select ${fileNames.join(", ")} again before submitting.`
        : "Recovered the upload changes saved on this device.",
      fileNames.length ? "warning" : "success",
      null,
      { title: "Local work recovered", duration: 8000 }
    );
  }, [showToast]);

  const resolveWorkingDraftRecovery = useCallback((serverUpdatedAt = null) => {
    const flow = { draftId, editId };
    const snapshot = readUploadWorkingDraft(flow);
    const decision = chooseUploadWorkingDraftRecovery({
      snapshot,
      userId: user?._id || null,
      serverUpdatedAt,
    });

    localDraftHydratedRef.current = true;
    if (decision.action === "discard") {
      clearUploadWorkingDraft(flow);
      setLocalSnapshotSaved(false);
      return;
    }
    if (decision.action === "none") return;
    if (decision.action === "conflict") {
      setLocalSnapshotSaved(true);
      showToast(
        "This device has upload changes, but the server copy changed too. Review the server copy or restore your local version.",
        "warning",
        {
          label: "Restore local version",
          onClick: () => applyWorkingSnapshot(snapshot),
        },
        { title: "Two versions need your choice", duration: 12000 }
      );
      return;
    }
    applyWorkingSnapshot(snapshot);
  }, [applyWorkingSnapshot, draftId, editId, showToast, user?._id]);

  const readRecoverableSourceSnapshot = useCallback(() => {
    if (!uploadSource) return null;
    const flow = { draftId, editId };
    const snapshot = readUploadWorkingDraft(flow);
    const decision = chooseUploadWorkingDraftRecovery({
      snapshot,
      userId: user?._id || null,
      serverUpdatedAt: null,
    });
    if (decision.action === "discard") {
      clearUploadWorkingDraft(flow);
      return null;
    }
    return decision.action === "restore" || decision.action === "conflict" ? snapshot : null;
  }, [draftId, editId, uploadSource, user?._id]);

  const recoverSourceFromDevice = useCallback(() => {
    if (sourceLoad.status !== UPLOAD_SOURCE_LOAD_STATUS.FAILED) return false;
    const snapshot = readRecoverableSourceSnapshot();
    if (!snapshot || !uploadSource) {
      setSourceLoad((current) => ({ ...current, hasLocalRecovery: false }));
      return false;
    }

    // This is deliberately opt-in. A failed GET gives us no server updatedAt,
    // so silently applying the snapshot would be indistinguishable from
    // overwriting a co-writer's newer server copy. Retry still reloads the
    // server and runs the normal three-way recovery decision before any write.
    serverUpdatedAtRef.current = snapshot.baseUpdatedAt ? String(snapshot.baseUpdatedAt) : null;
    baselineWorkingSignatureRef.current = currentWorkingSignatureRef.current;
    localDraftHydratedRef.current = true;
    applyWorkingSnapshot(snapshot);
    setSourceLoad({
      ...uploadSource,
      status: UPLOAD_SOURCE_LOAD_STATUS.LOCAL_ONLY,
      hasLocalRecovery: true,
      offline: sourceLoad.offline,
      message: sourceLoad.message,
    });
    return true;
  }, [applyWorkingSnapshot, readRecoverableSourceSnapshot, sourceLoad.message, sourceLoad.offline, sourceLoad.status, uploadSource]);

  const retrySourceLoad = useCallback(() => {
    if (!uploadSource) return;
    if (sourceLoad.status === UPLOAD_SOURCE_LOAD_STATUS.LOCAL_ONLY) {
      // Retry temporarily replaces the form with a loader. Persist the exact
      // local version first so a fast server response cannot race the debounce.
      flushWorkingSnapshotRef.current({ report: false });
    }
    setSourceLoad({
      ...uploadSource,
      status: UPLOAD_SOURCE_LOAD_STATUS.LOADING,
      hasLocalRecovery: false,
    });
    setSourceLoadAttempt((attempt) => attempt + 1);
  }, [sourceLoad.status, uploadSource]);

  const flushWorkingSnapshot = useCallback((options = {}) => {
    if (!localDraftHydratedRef.current) return false;
    const snapshot = currentWorkingSnapshotRef.current;
    const signature = currentWorkingSignatureRef.current;
    if (!snapshot || !signature || signature === baselineWorkingSignatureRef.current) return true;
    const written = writeUploadWorkingDraft({ draftId, editId }, snapshot);
    if (options?.report !== false) setLocalSnapshotSaved(written);
    return written;
  }, [draftId, editId]);
  flushWorkingSnapshotRef.current = flushWorkingSnapshot;

  const markWorkingDraftCommitted = useCallback((updatedAt = null) => {
    if (updatedAt) serverUpdatedAtRef.current = String(updatedAt);
    baselineWorkingSignatureRef.current = currentWorkingSignatureRef.current;
    clearUploadWorkingDraft({ draftId, editId });
    setLocalSnapshotSaved(false);
  }, [draftId, editId]);

  const discardWorkingDraft = useCallback(() => {
    intentionalExitRef.current = true;
    baselineWorkingSignatureRef.current = currentWorkingSignatureRef.current;
    clearUploadWorkingDraft({ draftId, editId });
    setLocalSnapshotSaved(false);
  }, [draftId, editId]);

  // The recovery effect runs before this writer. That ordering prevents the
  // empty initial form from replacing the snapshot a refresh is about to read.
  useEffect(() => {
    if (draftId || editId) return;
    baselineWorkingSignatureRef.current = currentWorkingSignatureRef.current;
    resolveWorkingDraftRecovery(null);
  }, [draftId, editId, resolveWorkingDraftRecovery]);

  useEffect(() => {
    if (!recoveryContext || recoveryContext.key !== workingDraftStorageKey) return;
    serverUpdatedAtRef.current = recoveryContext.serverUpdatedAt || null;
    baselineWorkingSignatureRef.current = currentWorkingSignatureRef.current;
    resolveWorkingDraftRecovery(recoveryContext.serverUpdatedAt || null);
    setRecoveryContext(null);
  }, [recoveryContext, resolveWorkingDraftRecovery, workingDraftStorageKey]);

  useEffect(() => { pruneUploadWorkingDrafts(); }, []);

  useEffect(() => {
    if (!localDraftHydratedRef.current || !workingDraftDirty) return;
    const timeoutId = window.setTimeout(flushWorkingSnapshot, 300);
    return () => window.clearTimeout(timeoutId);
  }, [flushWorkingSnapshot, workingDraftDirty, workingSignature]);



  // Load existing published script when entering edit mode
  useEffect(() => {
    if (!editId) return undefined;
    let active = true;
    const load = async () => {
      setSourceLoad({
        kind: "edit",
        id: editId,
        status: UPLOAD_SOURCE_LOAD_STATUS.LOADING,
        hasLocalRecovery: false,
      });
      try {
        const { data } = await api.get(`/scripts/${editId}`);
        if (!active) return;
        const isEditApprovalPending = data?.status === "pending_approval" && data?.approvalRequestType === "edit_submission";
        const purchasedFromHistory = {
          evaluation: Boolean(
            Number(data?.billing?.evaluationCreditsChargedAtUpload || 0) > 0
            || Number(data?.billing?.evaluationCreditsCharged || 0) > 0
            || data?.services?.evaluation
          ),
          aiTrailer: Boolean(
            Number(data?.billing?.aiTrailerCreditsChargedAtUpload || 0) > 0
            || Number(data?.billing?.aiTrailerCreditsCharged || 0) > 0
            || data?.services?.aiTrailer
          ),
          spotlight: Boolean(
            Number(data?.billing?.spotlightCreditsChargedAtUpload || 0) > 0
            || data?.services?.spotlight
          ),
        };
        setEditApprovalLocked(Boolean(isEditApprovalPending));

        if (isEditApprovalPending) {
          setError("This script edit is already in admin review. You can edit again after approval or rejection.");
        }
        const contentOnlyMode = Boolean(data?.isCollaborator && data?.canEditMetadata === false);
        setIsContentOnlyEditMode(contentOnlyMode);
        if (contentOnlyMode) {
          setStep(1);
        }
        const initialContent = data.textContent || "";
        setTextContent(initialContent);
        setOriginalEditContent(initialContent);
        setUploadedFile(null);
        setUploadedPdfFile(null);
        setExistingUploadedFile(data.fileUrl ? {
          name: getFileNameFromUrl(data.fileUrl),
          size: null,
          url: data.fileUrl,
        } : null);
        setFormData({
          title: data.title || "",
          logline: data.logline || "",
          format: data.format || "feature",
          formatOther: data.formatOther || "",
          pageCount: data.pageCount ? String(data.pageCount) : "",
          viewableScript: Boolean(data.viewableScript),
          previewWindowMode: data.scriptPreviewAccess?.mode || "pages",
          previewWindowStart: data.scriptPreviewAccess?.start ? String(data.scriptPreviewAccess.start) : "1",
          previewWindowEnd: data.scriptPreviewAccess?.end ? String(data.scriptPreviewAccess.end) : "8",
          primaryGenre: data.classification?.primaryGenre || data.primaryGenre || data.genre || "",
          synopsis: data.synopsis || data.description || "",
          ...createScriptCompletionFormState(data?.scriptCompletion || {}),
        });
        const storedPreviewPages = Array.isArray(data.scriptPreviewPageTexts) ? data.scriptPreviewPageTexts : [];
        setPdfPageTexts(storedPreviewPages);
        setPdfTextExtracted(storedPreviewPages.length > 0);
        setTagsInput((data.tags || []).join(", "));
        setClassification({
          tones: data.classification?.tones || [],
          themes: data.classification?.themes || [],
          settings: data.classification?.settings || [],
        });
        setRoles(Array.isArray(data.roles) ? data.roles.map((role) => ({
            characterName: role?.characterName || "",
            type: role?.type || "",
            description: role?.description || "",
            gender: role?.gender || "Any",
            ageRange: {
              min: role?.ageRange?.min ?? "",
              max: role?.ageRange?.max ?? "",
            },
          })) : []);
        setServices({
          hosting: data.services?.hosting ?? true,
          evaluation: purchasedFromHistory.evaluation || data.services?.evaluation || false,
          aiTrailer: purchasedFromHistory.aiTrailer || data.services?.aiTrailer || false,
          spotlight: purchasedFromHistory.spotlight || data.services?.spotlight || false,
        });
        if (purchasedFromHistory.aiTrailer || data.services?.aiTrailer) {
          setTrailerOption("ai");
        }
        setLegal({
          agreedToTerms: Boolean(data?.legal?.agreedToTerms),
          customInvestorTerms: data?.legal?.customInvestorTerms || "",
        });
        setRightsLicensing(normalizeRightsLicensingState(data?.rightsLicensing || {}));
        const storedPrice = Number(data?.price || 0);
        setIsPremium(Boolean(data?.premium && storedPrice > 0));
        setScriptPrice(storedPrice || 10);
        setUseCustomPrice(storedPrice > 0 && ![5, 10, 15, 25, 50].includes(storedPrice));
        setCustomPriceInput(storedPrice > 0 ? String(storedPrice) : "");
        const storedLanguage = data?.filmDetails?.filmLanguage || "";
        const knownLanguage = FILM_LANGUAGE_OPTIONS.includes(storedLanguage);
        setFilmDetails({
          filmLanguage: knownLanguage ? storedLanguage : (storedLanguage ? "Other" : ""),
          filmLanguageCustom: knownLanguage ? "" : storedLanguage,
          dialoguesPresent: data?.filmDetails?.dialoguesPresent || "yes",
          wantToDirect: Boolean(data?.filmDetails?.wantToDirect),
          wantToProduce: Boolean(data?.filmDetails?.wantToProduce),
          scriptStyle: Array.isArray(data?.filmDetails?.scriptStyle) ? data.filmDetails.scriptStyle : [],
        });
        setSourceLoad({
          kind: "edit",
          id: editId,
          status: UPLOAD_SOURCE_LOAD_STATUS.READY,
          hasLocalRecovery: false,
        });
        setRecoveryContext({
          key: uploadWorkingDraftKey({ editId }),
          serverUpdatedAt: data?.updatedAt || null,
        });
      } catch (error) {
        if (!active) return;
        setSourceLoad(classifyUploadSourceLoadError(error, {
          kind: "edit",
          id: editId,
          online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
          hasLocalRecovery: Boolean(readRecoverableSourceSnapshot()),
        }));
      }
    };
    load();
    return () => { active = false; };
  }, [editId, readRecoverableSourceSnapshot, setError, sourceLoadAttempt]);

  // Load draft when coming from Create Project editor
  useEffect(() => {
    if (!draftId || editId) {
      if (!draftId && !editId) {
        setSourceLoad(initialUploadSourceLoad());
      }
      return undefined;
    }
    let active = true;
    const load = async () => {
      setSourceLoad({
        kind: "draft",
        id: draftId,
        status: UPLOAD_SOURCE_LOAD_STATUS.LOADING,
        hasLocalRecovery: false,
      });
      try {
        const { data } = await api.get(`/scripts/${draftId}`);
        if (!active) return;
        scriptIdRef.current = data._id;
        setScriptId(data._id);
        setTextContent(data.textContent || "");
        const storedPreviewPages = Array.isArray(data.scriptPreviewPageTexts) ? data.scriptPreviewPageTexts : [];
        setPdfPageTexts(storedPreviewPages);
        setPdfTextExtracted(storedPreviewPages.length > 0);
        setUploadedFile(null);
        setUploadedPdfFile(null);
        setExistingUploadedFile(data.fileUrl ? {
          name: getFileNameFromUrl(data.fileUrl),
          size: null,
          url: data.fileUrl,
        } : null);
        setFormData((prev) => ({
          ...prev,
          title: data.title || "",
          logline: data.logline || "",
          format: data.format || "feature",
          formatOther: data.formatOther || "",
          pageCount: data.pageCount ? String(data.pageCount) : "",
          viewableScript: Boolean(data.viewableScript),
          previewWindowMode: data.scriptPreviewAccess?.mode || "pages",
          previewWindowStart: data.scriptPreviewAccess?.start ? String(data.scriptPreviewAccess.start) : "1",
          previewWindowEnd: data.scriptPreviewAccess?.end ? String(data.scriptPreviewAccess.end) : "8",
          primaryGenre: data.classification?.primaryGenre || data.primaryGenre || "",
          synopsis: data.synopsis || data.description || "",
          ...createScriptCompletionFormState(data?.scriptCompletion || {}),
        }));
        setRoles(Array.isArray(data.roles) ? data.roles.map((role) => ({
            characterName: role?.characterName || "",
            type: role?.type || "",
            description: role?.description || "",
            gender: role?.gender || "Any",
            ageRange: {
              min: role?.ageRange?.min ?? "",
              max: role?.ageRange?.max ?? "",
            },
          })) : []);
        setTagsInput((data.tags || []).join(", "));
        setClassification({
          tones: data.classification?.tones || [],
          themes: data.classification?.themes || [],
          settings: data.classification?.settings || [],
        });
        setServices({
          hosting: data.services?.hosting ?? true,
          evaluation: Boolean(data.services?.evaluation),
          aiTrailer: Boolean(data.services?.aiTrailer),
          spotlight: Boolean(data.services?.spotlight),
        });
        setTrailerOption(data.services?.aiTrailer ? "ai" : "none");
        setLegal((prev) => ({
          ...prev,
          agreedToTerms: Boolean(data?.legal?.agreedToTerms),
          customInvestorTerms: data?.legal?.customInvestorTerms || "",
        }));
        setRightsLicensing(normalizeRightsLicensingState(data?.rightsLicensing || {}));
        const storedPrice = Number(data?.price || 0);
        setIsPremium(Boolean(data?.premium && storedPrice > 0));
        setScriptPrice(storedPrice || 10);
        setUseCustomPrice(storedPrice > 0 && ![5, 10, 15, 25, 50].includes(storedPrice));
        setCustomPriceInput(storedPrice > 0 ? String(storedPrice) : "");
        const storedLanguage = data?.filmDetails?.filmLanguage || "";
        const knownLanguage = FILM_LANGUAGE_OPTIONS.includes(storedLanguage);
        setFilmDetails({
          filmLanguage: knownLanguage ? storedLanguage : (storedLanguage ? "Other" : ""),
          filmLanguageCustom: knownLanguage ? "" : storedLanguage,
          dialoguesPresent: data?.filmDetails?.dialoguesPresent || "yes",
          wantToDirect: Boolean(data?.filmDetails?.wantToDirect),
          wantToProduce: Boolean(data?.filmDetails?.wantToProduce),
          scriptStyle: Array.isArray(data?.filmDetails?.scriptStyle) ? data.filmDetails.scriptStyle : [],
        });
        setFromDraft(true);
        setSourceLoad({
          kind: "draft",
          id: draftId,
          status: UPLOAD_SOURCE_LOAD_STATUS.READY,
          hasLocalRecovery: false,
        });
        setRecoveryContext({
          key: uploadWorkingDraftKey({ draftId }),
          serverUpdatedAt: data?.updatedAt || null,
        });

      } catch (error) {
        if (!active) return;
        setSourceLoad(classifyUploadSourceLoadError(error, {
          kind: "draft",
          id: draftId,
          online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
          hasLocalRecovery: Boolean(readRecoverableSourceSnapshot()),
        }));
      }
    };
    load();
    return () => { active = false; };
  }, [draftId, editId, readRecoverableSourceSnapshot, sourceLoadAttempt]);

  // Handle form field changes
  const handleChange = (e) => {
    clearValidationFeedback();
    const { name, value, type, checked } = e.target;
    const nextValue = type === "checkbox" ? checked : value;
    setFormData((prev) => {
      if (name === "format") {
        return {
          ...prev,
          format: value,
          formatOther: value === "other" ? prev.formatOther : "",
        };
      }

      return { ...prev, [name]: nextValue };
    });
  };

  const addRole = () => {
    clearValidationFeedback();
    setRoles((prev) => ([
      ...prev,
      {
        characterName: "",
        type: "",
        description: "",
        gender: "Any",
        ageRange: { min: "", max: "" },
      },
    ]));
  };

  const updateRoleField = (index, field, value) => {
    clearValidationFeedback();
    setRoles((prev) => prev.map((role, i) => (i === index ? { ...role, [field]: value } : role)));
  };

  const updateRoleAge = (index, field, value) => {
    clearValidationFeedback();
    setRoles((prev) => prev.map((role, i) => (
      i === index
        ? { ...role, ageRange: { ...role.ageRange, [field]: value === "" ? "" : Number(value) } }
        : role
    )));
  };

  const removeRole = (index) => {
    clearValidationFeedback();
    setRoles((prev) => prev.filter((_, i) => i !== index));
  };

  // Generate a single section (logline / synopsis / roles) by parsing the uploaded project content
  const handleGenerateMetadata = async (field) => {
    if (!enforceAiPlan()) return;
    if (metaLoadingField) return;
    const plainText = String(textContent || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!plainText || plainText.length < 50) {
      setError("Upload or paste at least a short passage of script content before generating with AI.");
      return;
    }

    setMetaLoadingField(field);
    setMetaNotice({ field: "", text: "" });
    setError("");

    try {
      const { data } = await api.post("/ai/generate-metadata", {
        text: plainText,
        fields: [field],
        title: formData.title,
        primaryGenre: formData.primaryGenre,
        contentType: getContentTypeFromFormat(formData.format),
      });

      let filled = false;
      if (field === "logline" && typeof data.logline === "string" && data.logline.trim()) {
        setFormData((f) => ({ ...f, logline: data.logline.trim().slice(0, 500) }));
        filled = true;
      }
      if (field === "synopsis" && typeof data.synopsis === "string" && data.synopsis.trim()) {
        setFormData((f) => ({ ...f, synopsis: data.synopsis.trim() }));
        filled = true;
      }
      if (field === "roles" && Array.isArray(data.roles) && data.roles.length) {
        setRoles(data.roles.map((role) => ({
          characterName: role.characterName || "",
          type: role.type || "",
          description: role.description || "",
          gender: role.gender || "Any",
          ageRange: {
            min: role.ageRange?.min ?? "",
            max: role.ageRange?.max ?? "",
          },
        })));
        filled = true;
      }

      if (data.usedFallback) {
        setMetaNotice({ field, text: "AI is busy right now — please try again in a moment." });
      } else if (filled) {
        setMetaNotice({ field, text: "Generated by AI — review and edit before submitting." });
      } else {
        setMetaNotice({ field, text: "Not enough story detail — add more script content and try again." });
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to generate. Please try again.");
    } finally {
      setMetaLoadingField("");
    }
  };

  const pageCountWarning = getPageCountWarning(formData.format, formData.pageCount);
  useEffect(() => {
    const pageCount = Number(formData.pageCount || 0);
    const start = Math.max(1, Number(formData.previewWindowStart || 1) || 1);
    const currentEnd = Math.max(start, Number(formData.previewWindowEnd || 0) || start);

    if (Number(formData.previewWindowEnd || 0) > 0 && Number(formData.previewWindowEnd || 0) < start) {
      setFormData((prev) => ({
        ...prev,
        previewWindowEnd: String(start),
      }));
      return;
    }

    if (pageCount > 0 && (start > pageCount || currentEnd > pageCount)) {
      setFormData((prev) => ({
        ...prev,
        previewWindowStart: String(Math.min(Math.max(1, Number(prev.previewWindowStart || 1) || 1), pageCount)),
        previewWindowEnd: String(Math.min(Math.max(1, Number(prev.previewWindowEnd || 1) || 1), pageCount)),
      }));
    }
  }, [formData.pageCount, formData.previewWindowStart, formData.previewWindowEnd]);

  // Toggle classification chips (max 3 per category)
  const toggleClassification = (category, value) => {
    clearValidationFeedback();
    setClassification((prev) => {
      const current = prev[category] || [];
      if (current.includes(value)) {
        return { ...prev, [category]: current.filter((v) => v !== value) };
      } else if (current.length < 3) {
        return { ...prev, [category]: [...current, value] };
      } else {
        setError(`You can only select up to 3 ${category}. Please deselect one first.`);
        return prev;
      }
    });
  };

  // Handle file upload and text extraction
  const handleFileSelect = async (file) => {
    if (!file) return;

    const fileName = String(file.name || "").toLowerCase();
    const isPdf = file.type === "application/pdf" || fileName.endsWith(".pdf");
    const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || fileName.endsWith(".docx");
    const isDoc = file.type === "application/msword" || fileName.endsWith(".doc");
    if (!isPdf && !isDocx && !isDoc) {
      setError("Please upload a PDF, DOCX, or DOC file.");
      return;
    }

    if (file.size > MAX_PDF_SIZE) {
      setError("File must be 30MB or smaller.");
      return;
    }

    setUploadProgress(0);
    setUploadedFile(null);
    setUploadedPdfFile(file);
    setTextContent("");
    setPdfPageTexts([]);
    setFormData((prev) => ({ ...prev, pageCount: "" }));
    setPdfNotice("");
    setPdfTextExtracted(false);
    setIsExtracting(true);
    setError("");
    const localPreviewUrl = URL.createObjectURL(file);

    // Simulate upload progress while we process
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + 10;
      });
    }, 200);

    try {
      const formData = new FormData();
      formData.append("pdf", file);

      // Call our new backend extraction endpoint
      const { data } = await api.post("/scripts/extract-pdf", formData);
      clearInterval(interval);
      setUploadProgress(100);

      setUploadedFile({
        name: file.name,
        size: file.size,
        url: data.fileUrl || "",
        fileGrant: data.fileGrant || "",
        sourceMode: data.sourceMode || (data.fileUrl ? "uploaded-pdf" : "imported-text"),
        previewUrl: localPreviewUrl,
      });
      setPdfTextExtracted(Boolean(data.extractedTextAvailable));
      setPdfPageTexts(Array.isArray(data.pageTexts) ? data.pageTexts : []);

      if (data.numItems > 0) {
        setFormData((prev) => ({ ...prev, pageCount: String(data.numItems) }));
      }

      // Populate the editor with extracted text
      if (data.text) {
        setTextContent(formatScreenplayLikeText(data.text));
      }

      if (data.extractionWarning) {
        setPdfNotice(data.extractionWarning);
      } else if (!data.fileUrl) {
        setPdfNotice("Text extracted, but PDF upload link could not be created. Submit will update script content only.");
      }
    } catch (err) {
      clearInterval(interval);
      URL.revokeObjectURL(localPreviewUrl);
      setUploadedPdfFile(null);
      setPdfNotice("");
      setPdfTextExtracted(false);
      setError(err.response?.data?.message || "Failed to extract text from PDF.");
    } finally {
      setIsExtracting(false);
    }
  };

  useEffect(() => {
    return () => {
      if (uploadedFile?.previewUrl) {
        URL.revokeObjectURL(uploadedFile.previewUrl);
      }
    };
  }, [uploadedFile?.previewUrl]);

  // Handle drag and drop
  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const resetThumbnailEditor = useCallback(() => {
    setIsThumbnailEditorOpen(false);
    setThumbnailCrop({ x: 0, y: 0 });
    setThumbnailZoom(1);
    setThumbnailRotation(0);
    setThumbnailCropPixels(null);
    setThumbnailSourceUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return "";
    });
  }, []);

  const openThumbnailEditor = useCallback((file) => {
    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      setError("Please select an image file for thumbnail.");
      return;
    }

    if (file.size > MAX_THUMBNAIL_SIZE) {
      setError("Thumbnail must be an image under 5MB.");
      return;
    }

    setError("");
    setThumbnailSourceName(file.name || "thumbnail");
    const sourceUrl = URL.createObjectURL(file);
    setThumbnailSourceUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return sourceUrl;
    });
    setThumbnailCrop({ x: 0, y: 0 });
    setThumbnailZoom(1);
    setThumbnailRotation(0);
    setThumbnailCropPixels(null);
    setIsThumbnailEditorOpen(true);
  }, [setError]);

  // Handle thumbnail selection
  const handleThumbnailSelect = (file) => {
    if (!file) return;
    openThumbnailEditor(file);
  };

  const handleApplyThumbnail = async () => {
    if (!thumbnailSourceUrl || !thumbnailCropPixels) {
      setError("Adjust thumbnail and try again.");
      return;
    }

    setThumbnailApplying(true);
    try {
      const croppedBlob = await getCroppedThumbnailBlob(thumbnailSourceUrl, thumbnailCropPixels, thumbnailRotation);
      if (!croppedBlob) throw new Error("thumbnail-processing-failed");

      if (croppedBlob.size > MAX_THUMBNAIL_SIZE) {
        setError("Processed thumbnail exceeds 5MB. Reduce zoom/area and retry.");
        return;
      }

      const baseName = (thumbnailSourceName || "thumbnail").replace(/\.[^/.]+$/, "");
      const processedFile = new File([croppedBlob], `${baseName}-cover.jpg`, { type: "image/jpeg" });
      setThumbnailFile(processedFile);
      setError("");
      resetThumbnailEditor();
    } catch {
      setError("Could not process thumbnail. Please try another image.");
    } finally {
      setThumbnailApplying(false);
    }
  };

  // Handle trailer selection
  const handleTrailerSelect = (file) => {
    if (!file) return;
    
    console.log("Trailer file selected:", file.name, file.type, file.size);
    
    const allowedTypes = ["video/mp4", "video/mpeg", "video/quicktime", "video/webm", "video/x-m4v"];
    if (!allowedTypes.includes(file.type)) {
      setError("Please upload a valid video file (MP4, MPEG, MOV, or WebM).");
      return;
    }

    if (file.size > MAX_TRAILER_SIZE) {
      setError("Trailer must be under 250MB for high-quality upload.");
      return;
    }

    setTrailerFile(file);
    setTrailerOption("upload");
    setError("");
    console.log("Trailer file set successfully, trailerOption set to 'upload'");
  };

  useEffect(() => {
    if (!thumbnailFile) {
      setThumbnailPreviewUrl("");
      return;
    }

    const previewUrl = URL.createObjectURL(thumbnailFile);
    setThumbnailPreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [thumbnailFile]);

  const [aiCoverAttempts, setAiCoverAttempts] = useState(
    Number(user?.subscription?.aiImagesGeneratedTotal) || 0
  );
  // The server's number, seeded from the auth user and replaced by every response. This used to be
  // `3 - aiCoverAttempts` over state a page reload reset, against a server that counted nothing.
  const [aiCoverRemaining, setAiCoverRemaining] = useState(
    aiImagesRemaining(user?.subscription?.aiImagesGeneratedTotal)
  );
  const [aiCoverHistory, setAiCoverHistory] = useState([]);
  const [aiCoverIndex, setAiCoverIndex] = useState(-1);
  // `disabled` only applies after React commits. This latch closes the same-frame double-tap window
  // and prevents two server responses arriving out of order from making the remaining count rise.
  const aiCoverRequestInFlightRef = useRef(false);

  const generateAiCover = async () => {
    if (aiCoverRequestInFlightRef.current) return;
    if (!enforceAiPlan()) return;
    if (!formData.title) {
      showToast("Please enter a title in Step 1 first to generate an AI cover.", "warning");
      return;
    }
    if (aiCoverRemaining <= 0) {
      // No upgrade action: this writer already pays, they have spent the period's images.
      showToast(AI_QUOTA_TOAST, "warning");
      return;
    }
    try {
      aiCoverRequestInFlightRef.current = true;
      setIsGeneratingAiCover(true);
      const res = await api.post("/scripts/generate-ai-cover", {
        title: formData.title,
        genre: formData.primaryGenre || "",
        logline: formData.logline || "",
        scriptText: textContent ? textContent.substring(0, 4000) : ""
      });
      if (res.data && res.data.base64Image) {
        // Convert Base64 directly to Blob to avoid browser fetch/CORS blocks
        const resUrl = res.data.base64Image;
        const resFetch = await fetch(resUrl);
        const blob = await resFetch.blob();
        const file = new File([blob], `ai-cover-${Date.now()}.jpg`, { type: "image/jpeg" });
        setThumbnailFile(file);
        setAiCoverAttempts(res.data.attempts ?? (aiCoverAttempts + 1));
        setAiCoverRemaining(
          typeof res.data.remaining === "number" ? res.data.remaining : aiCoverRemaining - 1
        );
        const newHistory = [...aiCoverHistory.slice(0, aiCoverIndex + 1), file];
        setAiCoverHistory(newHistory);
        setAiCoverIndex(newHistory.length - 1);
      } else {
        showToast("Failed to generate AI cover. Please try again.", "error");
      }
    } catch (error) {
      console.error("AI cover generation failed:", error);
      const { kind, message, offerUpgrade } = describeAiError(error);
      if (kind === "quota") setAiCoverRemaining(0);
      showToast(
        message,
        "warning",
        offerUpgrade ? { label: "Pricing Plan", onClick: () => openPricingModal("writer") } : null
      );
    } finally {
      aiCoverRequestInFlightRef.current = false;
      setIsGeneratingAiCover(false);
    }
  };

  const downloadWatermarkedImage = (file) => {
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.crossOrigin = "anonymous";
    img.src = url;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      
      // Draw original image
      ctx.drawImage(img, 0, 0);
      
      // Add watermark
      ctx.font = "bold 120px Arial";
      ctx.fillStyle = "rgba(255, 255, 255, 1)"; // Fully opaque white for clarity
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      
      // Add a crisp black outline (stroke) instead of a blurry shadow
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
      ctx.strokeText("ckript", canvas.width - 40, canvas.height - 40);
      
      // Draw the solid white text over the outline
      ctx.fillText("ckript", canvas.width - 40, canvas.height - 40);
      
      // Download
      const a = document.createElement("a");
      a.download = `watermarked-${file.name}`;
      a.href = canvas.toDataURL("image/jpeg");
      a.click();
      URL.revokeObjectURL(url);
    };
  };

  useEffect(() => () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!trailerFile) {
      setTrailerPreviewUrl("");
      setTrailerMeta(null);
      setTrailerMetaLoading(false);
      return;
    }

    const previewUrl = URL.createObjectURL(trailerFile);
    setTrailerPreviewUrl(previewUrl);
    setTrailerMeta(null);
    setTrailerMetaLoading(true);

    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = previewUrl;

    video.onloadedmetadata = () => {
      setTrailerMeta({
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
      });
      setTrailerMetaLoading(false);
    };

    video.onerror = () => {
      setTrailerMetaLoading(false);
      setTrailerMeta(null);
    };

    return () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      URL.revokeObjectURL(previewUrl);
    };
  }, [trailerFile]);

  const handlePitchVideoSelect = (file) => {
    if (!file) return;
    const allowedTypes = ["video/mp4", "video/mpeg", "video/quicktime", "video/webm", "video/x-m4v"];
    if (!allowedTypes.includes(file.type)) {
      setError("Please upload a valid video file (MP4, MPEG, MOV, or WebM) for the pitch video.");
      return;
    }
    if (file.size > 90 * 1024 * 1024) {
      setError("Pitch video must be under 90MB.");
      return;
    }
    setPitchVideoFile(file);
    setError("");
  };

  useEffect(() => {
    if (!pitchVideoFile) {
      setPitchVideoPreviewUrl("");
      setPitchVideoMeta(null);
      setPitchVideoMetaLoading(false);
      return;
    }
    const previewUrl = URL.createObjectURL(pitchVideoFile);
    setPitchVideoPreviewUrl(previewUrl);
    setPitchVideoMeta(null);
    setPitchVideoMetaLoading(true);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = previewUrl;
    video.onloadedmetadata = () => {
      if (video.duration > 90) {
        setError("Pitch video must be 1 minute 30 seconds (90 seconds) or less.");
        setPitchVideoFile(null);
        setPitchVideoPreviewUrl("");
        setPitchVideoMeta(null);
        setPitchVideoMetaLoading(false);
        URL.revokeObjectURL(previewUrl);
        return;
      }
      setPitchVideoMeta({
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
      });
      setPitchVideoMetaLoading(false);
    };
    video.onerror = () => {
      setPitchVideoMetaLoading(false);
      setPitchVideoMeta(null);
    };
    return () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      URL.revokeObjectURL(previewUrl);
    };
  }, [pitchVideoFile, setError]);

  // Handle agreement scroll
  useEffect(() => {
    if (step !== 5) return;

    const agreementElement = agreementRef.current;
    if (!agreementElement) return;

    const updateAgreementScrollState = () => {
      const { scrollTop, scrollHeight, clientHeight } = agreementElement;
      const isScrollable = scrollHeight - clientHeight > 8;

      if (!isScrollable) {
        setAgreementScrolled(true);
        return;
      }

      // Allow a slightly larger threshold to avoid sub-pixel rounding issues on some devices.
      const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
      setAgreementScrolled(distanceFromBottom <= 24);
    };

    updateAgreementScrollState();
    const rafId = window.requestAnimationFrame(updateAgreementScrollState);
    agreementElement.addEventListener("scroll", updateAgreementScrollState);
    window.addEventListener("resize", updateAgreementScrollState);

    return () => {
      window.cancelAnimationFrame(rafId);
      agreementElement.removeEventListener("scroll", updateAgreementScrollState);
      window.removeEventListener("resize", updateAgreementScrollState);
    };
  }, [step]);

  // Scroll to top on step change
  useEffect(() => {
    const scrollToTop = () => {
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    const frameId = window.requestAnimationFrame(scrollToTop);
    return () => window.cancelAnimationFrame(frameId);
  }, [step]);



  const getValidationContext = () => ({
    formData,
    textContent,
    uploadedFile,
    existingUploadedFile,
    roles,
    filmDetails,
    rightsLicensing: buildRightsPayload(),
    legal,
    isPremium,
    effectivePrice,
    maxInvestorTermsLength: MAX_CUSTOM_INVESTOR_TERMS_LENGTH,
    maxRightsConditionsLength: MAX_RIGHTS_CUSTOM_CONDITIONS_LENGTH,
    contentOnly: isContentOnlyEditMode,
  });

  const focusValidationIssue = (validationIssue) => {
    if (!validationIssue) return;
    setStep(validationIssue.step);
    if (validationIssue.step === 2) setDetailStep(validationIssue.detailStep);
    setValidationErrors((current) => {
      const selectedIssue = current.find((item) => item.code === validationIssue.code);
      if (!selectedIssue || current[0]?.code === validationIssue.code) return current;
      return [selectedIssue, ...current.filter((item) => item.code !== validationIssue.code)];
    });
    setValidationAttempt((current) => current + 1);
  };

  const presentValidationIssues = (issues) => {
    const firstIssue = issues?.[0];
    if (!firstIssue) {
      clearValidationFeedback();
      return true;
    }

    setValidationErrors(issues);
    focusValidationIssue(firstIssue);
    showToast(firstIssue.message, "error", {
      label: "Review field",
      onClick: () => focusValidationIssue(firstIssue),
    }, {
      duration: 8000,
      scope: "validation",
      title: `${firstIssue.label} needs attention`,
    });
    return false;
  };

  const validateScreenAndPresent = (screen) => presentValidationIssues(
    validateUploadScreen(screen, getValidationContext())
  );

  const validateStep = (stepNum) => {
    if (stepNum === 2) {
      return presentValidationIssues(
        DETAIL_SCREEN_ORDER.flatMap((screen) => validateUploadScreen(screen, getValidationContext()))
      );
    }
    return validateScreenAndPresent(getUploadScreenKey(stepNum, 0));
  };

  const validateDetailStep = (detailIndex) => validateScreenAndPresent(
    DETAIL_SCREEN_ORDER[detailIndex] || "basics"
  );

  // Handle next step
  // Fetch the writer's script-limit status once, so the gate is visible before any upload work.
  useEffect(() => {
    let active = true;
    api.get("/scripts/script-limit")
      .then(({ data }) => { if (active) setScriptLimit(data); })
      .catch(() => { if (active) setScriptLimit(null); });
    return () => { active = false; };
  }, []);

  // Block creating a NEW upload when the plan limit is reached; editing an existing script (scriptId
  // present) is never blocked — only the fresh "upload another" path is.
  const creationBlocked = Boolean(scriptLimit?.limitReached) && !scriptId && !editId;
  const sourceWriteBlocked = uploadSourceNeedsGate(sourceLoad);

  const handleNext = () => {
    if (isContentOnlyEditMode) return;
    // The persistent amber gate already explains why; don't set a generic error (avoids a duplicate banner).
    if (creationBlocked) return;
    
    setPdfNotice("");

    if (step === 2 && detailStep < 5) {
      if (!validateDetailStep(detailStep)) return;
      setDetailStep((current) => Math.min(5, current + 1));
      return;
    }
    if (!validateStep(step)) return;
    if (step < 5) {
      setStep(step + 1);
      if (step + 1 === 2) setDetailStep(0);
      clearValidationFeedback();
    }
  };

  // Handle back step
  const handleBack = () => {
    if (isContentOnlyEditMode) return;
    if (step === 2 && detailStep > 0) {
      setDetailStep((current) => Math.max(0, current - 1));
      clearValidationFeedback();
      return;
    }
    if (step > 1) {
      setStep(step - 1);
      if (step - 1 === 2) setDetailStep(5);
      clearValidationFeedback();
    }
  };

  const buildUploadDraftPayload = () => ({
    ...(scriptIdRef.current ? { scriptId: scriptIdRef.current } : {}),
    title: formData.title || "Untitled Draft",
    logline: formData.logline,
    synopsis: formData.synopsis,
    format: formData.format,
    contentType: getContentTypeFromFormat(formData.format),
    formatOther: formData.format === "other" ? String(formData.formatOther || "").trim() : "",
    pageCount: Number(formData.pageCount) || 0,
    textContent,
    ...(isHttpUrl(uploadedFile?.url)
      ? { fileUrl: uploadedFile.url, fileGrant: uploadedFile.fileGrant }
      : (isHttpUrl(existingUploadedFile?.url) ? { fileUrl: existingUploadedFile.url } : {})),
    roles: roles
      .filter((role) => role.characterName?.trim())
      .map((role) => ({
        characterName: role.characterName.trim(),
        type: role.type?.trim() || "",
        description: role.description?.trim() || "",
        gender: role.gender || "Any",
        ageRange: {
          min: role.ageRange?.min === "" ? undefined : Number(role.ageRange?.min),
          max: role.ageRange?.max === "" ? undefined : Number(role.ageRange?.max),
        },
      })),
    classification: {
      primaryGenre: formData.primaryGenre,
      tones: classification.tones,
      themes: classification.themes,
      settings: classification.settings,
    },
    viewableScript: Boolean(formData.viewableScript),
    scriptPreviewAccess: buildScriptPreviewPayload(formData),
    scriptCompletion: buildScriptCompletionPayload(formData),
    scriptPreviewPageTexts: pdfPageTexts,
    tags: tagsInput.split(",").map((tag) => tag.trim()).filter(Boolean),
    services: {
      hosting: true,
      evaluation: services.evaluation,
      aiTrailer: trailerOption === "ai",
      spotlight: services.spotlight,
    },
    premium: effectivePrice > 0,
    price: effectivePrice > 0 ? effectivePrice : 0,
    legal: {
      agreedToTerms: legal.agreedToTerms,
      termsVersion: SCRIPT_UPLOAD_TERMS_VERSION,
      customInvestorTerms: String(legal.customInvestorTerms || "").trim(),
    },
    rightsLicensing: buildRightsPayload(),
    filmDetails: {
      filmLanguage: filmDetails.filmLanguage === "Other" ? (filmDetails.filmLanguageCustom || "Other") : filmDetails.filmLanguage,
      dialoguesPresent: filmDetails.dialoguesPresent,
      wantToDirect: filmDetails.wantToDirect,
      wantToProduce: filmDetails.wantToProduce,
      scriptStyle: filmDetails.scriptStyle,
    },
  });
  currentDraftPayloadRef.current = buildUploadDraftPayload();

  const hasMeaningfulUploadDraft = (payload) => Boolean(
    (String(payload?.title || "").trim() && payload?.title !== "Untitled Draft")
    || String(payload?.textContent || "").replace(/<[^>]*>/g, " ").trim()
    || payload?.fileUrl
  );

  /*
   * Last-resort exit save. Unlike the manual Save draft action this never
   * clears the local snapshot or claims success: fetch keepalive can be refused
   * after navigation starts, and bodies above the browser's 64 KiB allowance
   * are rejected before they are queued. The local snapshot remains the truth.
   */
  const queueExitDraftSave = useCallback((reason = "exit") => {
    if (editId || isContentOnlyEditMode || creationBlocked || sourceWriteBlocked || intentionalExitRef.current) return false;
    const signature = currentWorkingSignatureRef.current;
    if (!signature || signature === baselineWorkingSignatureRef.current) return false;
    if (signature === lastExitSaveSignatureRef.current) return true;

    const payload = currentDraftPayloadRef.current;
    if (!hasMeaningfulUploadDraft(payload)) return false;
    const encoded = encodeKeepaliveBody(payload);
    if (!encoded.withinLimit) return false;

    let token = "";
    try {
      token = JSON.parse(localStorage.getItem("user") || "null")?.token || "";
    } catch {
      token = "";
    }
    fetch(DRAFT_ENDPOINT, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "X-Draft-Save-Reason": reason,
      },
      body: encoded.body,
    }).catch(() => {});
    lastExitSaveSignatureRef.current = signature;
    return true;
  }, [creationBlocked, editId, isContentOnlyEditMode, sourceWriteBlocked]);
  queueExitDraftSaveRef.current = queueExitDraftSave;

  // Manual Save is the confirmed server save: callers receive true/false, the
  // local snapshot clears only on success, and "Save & leave" no longer leaves
  // after a failed request.
  const handleSaveDraft = async () => {
    clearValidationFeedback();
    if (editId || isContentOnlyEditMode || sourceWriteBlocked) {
      if (sourceWriteBlocked) {
        setError("Reload the server copy before saving this draft. Your device copy will stay available.");
      }
      return false;
    }
    setLoading(true);
    try {
      const payload = currentDraftPayloadRef.current;
      const { data } = await api.post("/scripts/draft", payload);
      if (data?._id) {
        scriptIdRef.current = data._id;
        setScriptId(data._id);
      }
      setFromDraft(true);
      markWorkingDraftCommitted(data?.updatedAt || null);
      showToast("Draft saved. You can resume it from your dashboard.", "success");
      return true;
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save draft.");
      flushWorkingSnapshot();
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Refresh, OS backgrounding and same-tab navigation all synchronously flush
  // the local snapshot. The server keepalive is only a best-effort extra; a
  // browser prompt is still shown while the confirmed server baseline is dirty.
  useEffect(() => {
    const persistForExit = (reason) => {
      flushWorkingSnapshotRef.current({ report: false });
      queueExitDraftSaveRef.current(reason);
    };
    const handleBeforeUnload = (event) => {
      if (!workingDraftDirtyRef.current || intentionalExitRef.current) return;
      persistForExit("beforeunload");
      event.preventDefault();
      event.returnValue = "";
    };
    const handlePageHide = () => persistForExit("pagehide");
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") persistForExit("hidden");
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (!intentionalExitRef.current) persistForExit("unmount");
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Browser/OS Back uses the same native exit sheet as the close control. The
  // desktop presentation has no sheet, so it receives the browser confirmation
  // and leaves the local snapshot recoverable when the writer accepts.
  useEffect(() => {
    window.history.pushState({ scriptUploadGuard: true }, "", window.location.href);
    const handlePopState = () => {
      if (!workingDraftDirtyRef.current) {
        intentionalExitRef.current = true;
        navigate("/dashboard");
        return;
      }

      flushWorkingSnapshotRef.current();
      window.history.pushState({ scriptUploadGuard: true }, "", window.location.href);
      if (nativeChrome) {
        setNavigationExitRequested((current) => current + 1);
        return;
      }

      const shouldLeave = window.confirm(
        "Leave this upload? Your latest changes are saved on this device and can be recovered when you return."
      );
      if (shouldLeave) {
        queueExitDraftSaveRef.current("browser-back");
        intentionalExitRef.current = true;
        navigate("/dashboard");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [nativeChrome, navigate]);

  useEffect(() => {
    if (!isThumbnailEditorOpen) return undefined;

    const dialog = thumbnailDialogRef.current;
    if (!dialog) return undefined;

    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const getFocusableElements = () => Array.from(dialog.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    ));
    const frame = window.requestAnimationFrame(() => {
      (getFocusableElements()[0] || dialog).focus();
    });

    const handleDialogKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        resetThumbnailEditor();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = getFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleDialogKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [isThumbnailEditorOpen, resetThumbnailEditor]);

  /*
   * Per-file upload progress (decision D14, 2026-08-09).
   *
   * These three requests carry up to 5 MB, 250 MB and 90 MB, and until now they
   * reported nothing at all — the only progress bar anywhere on this page was
   * the SIMULATED one in `handleFileSelect` (a setInterval adding 10% every
   * 200ms and stopping at 90%, DEF-9). A 250 MB trailer on a phone connection is
   * minutes of a screen that looks frozen, and a writer who concludes it has
   * hung and backgrounds the tab loses the upload.
   *
   * `onUploadProgress` needs no new dependency: it is an axios feature and
   * `services/api.js` already exports an axios instance. Shared code, so both
   * platforms get it.
   */
  const selectedUploadMediaFiles = () => ({
    thumbnail: thumbnailFile,
    trailer: trailerOption === "upload" ? trailerFile : null,
    pitchVideo: pitchVideoFile,
  });

  const moveToUploadMediaPanel = () => {
    setStep(UPLOAD_SCREEN_LOCATIONS.media.step);
    setDetailStep(UPLOAD_SCREEN_LOCATIONS.media.detailStep);
  };

  const requireMediaUploadPreflight = (requestedTypes = null) => {
    if (!nativeChrome) return false;
    const preflight = buildMediaUploadPreflight({
      files: selectedUploadMediaFiles(),
      requestedTypes,
    });
    if (!preflight || acknowledgedMediaPreflightRef.current === preflight.signature) {
      setMediaUploadPreflight(null);
      return false;
    }

    setMediaUploadPreflight(preflight);
    clearValidationFeedback();
    moveToUploadMediaPanel();
    return true;
  };

  const uploadMediaForScript = async (targetScriptId, requestedTypes = null) => {
    mediaUploadControllerRef.current?.abort();
    const controller = new AbortController();
    mediaUploadControllerRef.current = controller;
    setMediaUploadActive(true);
    try {
      return await uploadProjectMedia({
        apiClient: api,
        targetScriptId,
        requestedTypes,
        files: selectedUploadMediaFiles(),
        signal: controller.signal,
        onProgress: (type, next) => mergeMediaProgress(setMediaProgress, type, next),
      });
    } finally {
      if (mediaUploadControllerRef.current === controller) {
        mediaUploadControllerRef.current = null;
        setMediaUploadActive(false);
      }
    }
  };

  const cancelMediaUpload = () => mediaUploadControllerRef.current?.abort();

  const handleSubmit = async (e = null) => {
    e?.preventDefault?.();
    clearValidationFeedback();
    if (sourceWriteBlocked) {
      setError(
        sourceLoad.status === UPLOAD_SOURCE_LOAD_STATUS.LOCAL_ONLY
          ? "Reload the server copy before submitting. Your recovered device copy has not been sent."
          : "Wait for the original script to load before submitting changes."
      );
      return;
    }
    // Submit is disabled at the limit; if reached defensively, just stop (amber gate is the message).
    if (creationBlocked) return;

    if (editId && editApprovalLocked) {
      presentValidationIssues([
        resolveUploadServerIssue(
          "This script edit is already in admin review. You can edit again after approval or rejection.",
          "publish"
        ),
      ]);
      return;
    }

    const submissionIssues = isContentOnlyEditMode
      ? validateUploadScreen("upload", { ...getValidationContext(), contentOnly: true })
      : validateUploadWorkflow(getValidationContext());
    if (!presentValidationIssues(submissionIssues)) return;

    const recoveryRequestedTypes = pendingMediaRecovery
      ? mediaRecoveryTypes(pendingMediaRecovery)
      : null;
    if (requireMediaUploadPreflight(recoveryRequestedTypes)) return;

    if (pendingMediaRecovery) {
      const recovery = pendingMediaRecovery;
      setLoading(true);
      try {
        moveToUploadMediaPanel();
        const mediaResult = await uploadMediaForScript(
          recovery.targetScriptId,
          recoveryRequestedTypes,
        );
        const issueTypes = mediaRecoveryTypes(mediaResult);
        if (issueTypes.length > 0) {
          setPendingMediaRecovery((current) => ({
            ...current,
            failedTypes: mediaResult.failedTypes,
            cancelledTypes: mediaResult.cancelledTypes,
          }));
          if (mediaResult.failedTypes.length > 0) {
            presentValidationIssues([
              resolveUploadServerIssue(
                `The project is saved, but ${mediaResult.failedTypes.length} media file${mediaResult.failedTypes.length > 1 ? "s" : ""} still could not be uploaded. Replace or remove the highlighted media, then submit again.`,
                "media"
              ),
            ]);
          } else {
            clearValidationFeedback();
          }
          return;
        }

        setPendingMediaRecovery(null);
        markWorkingDraftCommitted();
        setSubmissionSuccess({
          projectTitle: recovery.title,
          reviewPath: recovery.redirectPath,
        });
      } catch (recoveryError) {
        presentValidationIssues([
          resolveUploadServerIssue(
            recoveryError?.response?.data?.message || "Media recovery failed. Replace or remove the media and try again.",
            "media"
          ),
        ]);
      } finally {
        setLoading(false);
      }
      return;
    }

    console.log("Starting script submission...");
    console.log("Thumbnail file:", thumbnailFile ? thumbnailFile.name : "none");
    console.log("Trailer file:", trailerFile ? trailerFile.name : "none");
    console.log("Trailer option:", trailerOption);

    setLoading(true);

    try {
      if (isContentOnlyEditMode && editId) {
        await api.post(`/collab/${editId}/revisions`, {
          baseContent: originalEditContent,
          content: textContent,
          sectionRef: "textContent",
        });
        markWorkingDraftCommitted();
        intentionalExitRef.current = true;
        navigate(`/script/${editId}`);
        return;
      }

      const tagsArr = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);

      // Build payload according to specification
      const payload = {
        title: formData.title,
        logline: formData.logline,
        synopsis: formData.synopsis,
        description: formData.synopsis,
        format: formData.format,
        contentType: getContentTypeFromFormat(formData.format),
        formatOther: formData.format === "other" ? String(formData.formatOther || "").trim() : "",
        pageCount: Number(formData.pageCount),
        textContent: textContent,
        roles: roles
          .filter((role) => role.characterName?.trim())
          .map((role) => ({
            characterName: role.characterName.trim(),
            type: role.type?.trim() || "",
            description: role.description?.trim() || "",
            gender: role.gender || "Any",
            ageRange: {
              min: role.ageRange?.min === "" ? undefined : Number(role.ageRange?.min),
              max: role.ageRange?.max === "" ? undefined : Number(role.ageRange?.max),
            },
          })),
        tags: tagsArr,
        classification: {
          primaryGenre: formData.primaryGenre,
          secondaryGenre: null,
          tones: classification.tones,
          themes: classification.themes,
          settings: classification.settings,
        },
        viewableScript: Boolean(formData.viewableScript),
        scriptPreviewAccess: buildScriptPreviewPayload(formData),
        scriptCompletion: buildScriptCompletionPayload(formData),
        scriptPreviewPageTexts: pdfPageTexts,
        // Send script URL only when we have a remote file URL.
        ...(isHttpUrl(uploadedFile?.url)
          ? { scriptUrl: uploadedFile.url, fileGrant: uploadedFile.fileGrant }
          : (isHttpUrl(existingUploadedFile?.url) ? { scriptUrl: existingUploadedFile.url } : {})),
        services: {
          hosting: services.hosting,
          evaluation: services.evaluation,
          aiTrailer: trailerOption === "ai",
          spotlight: services.spotlight,
        },
        legal: {
          agreedToTerms: legal.agreedToTerms,
          timestamp: new Date().toISOString(),
          termsVersion: SCRIPT_UPLOAD_TERMS_VERSION,
          customInvestorTerms: String(legal.customInvestorTerms || "").trim(),
        },
        rightsLicensing: buildRightsPayload(),
        filmDetails: {
          filmLanguage: filmDetails.filmLanguage === "Other" ? (filmDetails.filmLanguageCustom || "Other") : filmDetails.filmLanguage,
          dialoguesPresent: filmDetails.dialoguesPresent,
          wantToDirect: filmDetails.wantToDirect,
          wantToProduce: filmDetails.wantToProduce,
          scriptStyle: filmDetails.scriptStyle,
        },
        premium: effectivePrice > 0,
        price: effectivePrice > 0 ? effectivePrice : 0,
        // If this was created via the editor, attach the draftId so the backend updates/converts it
        ...(scriptId ? { scriptId } : {}),
      };

      if (editId) {
        const { data } = await api.put(`/scripts/${editId}`, payload);
        if (data?.revisionSubmitted) {
          markWorkingDraftCommitted(data?.updatedAt || null);
          intentionalExitRef.current = true;
          navigate(`/script/${editId}`);
          return;
        }
        const redirectPath = getScriptCanonicalPath({
          ...data,
          _id: data?._id || editId,
          title: data?.title || payload.title,
          creator: data?.creator && typeof data.creator === "object" ? data.creator : {
            writerProfile: { username: user?.writerProfile?.username },
            username: user?.username,
          },
        });
        const mediaResult = await uploadMediaForScript(editId);
        const issueTypes = mediaRecoveryTypes(mediaResult);
        if (issueTypes.length > 0) {
          setPendingMediaRecovery({
            targetScriptId: editId,
            failedTypes: mediaResult.failedTypes,
            cancelledTypes: mediaResult.cancelledTypes,
            title: payload.title,
            redirectPath,
          });
          moveToUploadMediaPanel();
          if (mediaResult.failedTypes.length > 0) {
            presentValidationIssues([
              resolveUploadServerIssue(
                `The project was updated, but ${mediaResult.failedTypes.length} media file${mediaResult.failedTypes.length > 1 ? "s" : ""} could not be uploaded. Replace or remove the highlighted media, then submit again.`,
                "media"
              ),
            ]);
          }
          return;
        }
        markWorkingDraftCommitted(data?.updatedAt || null);
        setSubmissionSuccess({ projectTitle: payload.title, reviewPath: redirectPath });
      } else {
        const response = await api.post("/scripts/upload", payload);
        const newScriptId = response.data._id;
        const mediaResult = await uploadMediaForScript(newScriptId);
        const issueTypes = mediaRecoveryTypes(mediaResult);
        if (issueTypes.length > 0) {
          setPendingMediaRecovery({
            targetScriptId: newScriptId,
            failedTypes: mediaResult.failedTypes,
            cancelledTypes: mediaResult.cancelledTypes,
            title: payload.title,
            redirectPath: "/dashboard",
          });
          moveToUploadMediaPanel();
          if (mediaResult.failedTypes.length > 0) {
            presentValidationIssues([
              resolveUploadServerIssue(
                `The project was created, but ${mediaResult.failedTypes.length} media file${mediaResult.failedTypes.length > 1 ? "s" : ""} could not be uploaded. Replace or remove the highlighted media, then submit again.`,
                "media"
              ),
            ]);
          }
          return;
        }
        const reviewPath = getScriptCanonicalPath({
          ...response.data,
          _id: newScriptId,
          title: response.data?.title || payload.title,
          creator: response.data?.creator && typeof response.data.creator === "object" ? response.data.creator : {
            writerProfile: { username: user?.writerProfile?.username },
            username: user?.username,
          },
        });
        markWorkingDraftCommitted(response.data?.updatedAt || null);
        setSubmissionSuccess({ projectTitle: payload.title, reviewPath });
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || "Failed to upload script. Please try again.";
      console.error("Submission failed with error from server:", errorMsg);
      console.error("Full error object:", err);
      presentValidationIssues([
        resolveUploadServerIssue(errorMsg, currentScreenRef.current),
      ]);


    } finally {
      setLoading(false);
    }
  };

  const confirmMediaUploadPreflight = () => {
    if (!mediaUploadPreflight) return;
    acknowledgedMediaPreflightRef.current = mediaUploadPreflight.signature;
    setMediaUploadPreflight(null);
    handleSubmit();
  };

  /*
   * THE THREE EARLY RETURNS ARE DESKTOP-ONLY UNDER `nativeChrome`.
   *
   * Each of them returns before the workspace is rendered at all, so an injected
   * chrome can never reach them — which is how the desktop `accessDenied` markup
   * on `/create-project` ended up as a still-open follow-up in the plan's §19.1.
   * Rather than repeat that, the three conditions are published on the view
   * model (`state.accessDenied`, `state.sourceLoad`,
   * `state.submissionSuccess`) and the native chrome draws its own.
   *
   * Desktop's branches are untouched: same conditions, same order, same markup.
   */
  const accessDenied = !["creator", "writer"].includes(user?.role);

  // Access control
  if (accessDenied && !nativeChrome) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 sm:p-10 max-w-sm text-center">
          <div className="text-5xl mb-4">🚫</div>
          <h2 className={`text-xl font-bold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>Access Denied</h2>
          <p className="text-sm text-neutral-400">Only creator accounts can upload scripts. Switch to your creator profile to continue.</p>
        </div>
      </div>
    );
  }

  if (sourceLoad.status === UPLOAD_SOURCE_LOAD_STATUS.LOADING && !nativeChrome) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-4">
          <div className={`w-10 h-10 border-[3px] rounded-full animate-spin ${isDarkMode ? "border-white/[0.12] border-t-white/70" : "border-gray-200 border-t-[#1e3a5f]"}`} />
          <p className={`text-sm font-medium ${isDarkMode ? "text-neutral-400" : "text-gray-500"}`} role="status">
            Loading the {sourceLoad.kind === "edit" ? "script" : "draft"}…
          </p>
        </div>
      </div>
    );
  }

  const sourceIssue = uploadSourceCopy(sourceLoad);
  if (sourceIssue && !nativeChrome) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] px-4">
        <section
          className={`w-full max-w-md rounded-2xl border p-6 text-center ${isDarkMode ? "border-white/10 bg-neutral-900 text-white" : "border-gray-200 bg-white text-gray-900"}`}
          aria-labelledby="script-upload-source-title"
        >
          <span className="material-symbols-outlined mb-3 text-4xl" aria-hidden="true">{sourceIssue.icon}</span>
          <p className={`mb-2 text-xs font-semibold uppercase tracking-wider ${isDarkMode ? "text-neutral-400" : "text-gray-500"}`}>{sourceIssue.kicker}</p>
          <h2 id="script-upload-source-title" className="text-xl font-bold">{sourceIssue.title}</h2>
          <p className={`mt-3 text-sm leading-6 ${isDarkMode ? "text-neutral-300" : "text-gray-600"}`}>{sourceIssue.body}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {sourceIssue.retryable && (
              <button type="button" className="min-h-11 rounded-xl bg-[#1e3a5f] px-5 font-semibold text-white" onClick={retrySourceLoad}>
                Try again
              </button>
            )}
            {sourceIssue.retryable && sourceLoad.hasLocalRecovery && (
              <button type="button" className={`min-h-11 rounded-xl border px-5 font-semibold ${isDarkMode ? "border-white/20" : "border-gray-300"}`} onClick={recoverSourceFromDevice}>
                Open device copy
              </button>
            )}
            <button type="button" className={`min-h-11 rounded-xl px-5 font-semibold ${isDarkMode ? "text-neutral-200" : "text-gray-700"}`} onClick={() => navigate("/dashboard")}>
              Go to dashboard
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (submissionSuccess && !nativeChrome) {
    return (
      <ScriptUploadSuccess
        projectTitle={submissionSuccess.projectTitle}
        reviewPath={submissionSuccess.reviewPath}
      />
    );
  }

  const priceGuide = FORMAT_PRICE_GUIDE[formData.format];
  const publishServices = [
    {
      key: "hosting",
      label: "Hosting & Discovery",
      enabled: true,
      detail: "Listed in Ckript search and discovery.",
      meta: "Included",
      onToggle: () => {},
    },
    {
      key: "spotlight",
      label: "Activate Spotlight",
      enabled: services.spotlight,
      detail: "Boost visibility in featured discovery placements.",
      meta: "1 credit",
      onToggle: () => setServices((current) => ({ ...current, spotlight: !current.spotlight })),
    },
    {
      key: "evaluation",
      label: "Professional Evaluation",
      enabled: services.evaluation,
      detail: "Request structured industry feedback after submission.",
      meta: "1 credit",
      onToggle: () => setServices((current) => ({ ...current, evaluation: !current.evaluation })),
    },
    {
      key: "aiTrailer",
      label: "AI Concept Trailer",
      enabled: trailerOption === "ai",
      detail: "Generate a concept trailer after approval.",
      meta: "1 credit",
      onToggle: () => {
        const nextOption = trailerOption === "ai" ? "none" : "ai";
        setTrailerOption(nextOption);
        setServices((current) => ({ ...current, aiTrailer: nextOption === "ai" }));
      },
    },
  ];
  const publishInvoiceRows = [
    {
      item: "Script Access Fee",
      detail: isPremium ? "Premium reader purchase model" : "Free public access",
      amount: formatCurrency(effectivePrice),
    },
    {
      item: "Platform fee (" + Math.round(BUYER_COMMISSION_RATE * 100) + "%)",
      detail: "Paid by the buyer on top of the script price",
      amount: formatCurrency(buyerCommissionAmount),
    },
    {
      item: "Buyer pays (before taxes)",
      detail: "Script price plus platform fee; taxes of 18% are added at the buyer's checkout",
      amount: formatCurrency(buyerTotalPayable),
    },
    {
      item: "Projected Writer Payout",
      detail: "You receive the full script price — the fee and taxes never reduce it",
      amount: formatCurrency(writerPayout),
    },
  ];

  const workspaceVm = {
    user,
    mode: {
      isContentOnlyEditMode,
      editId,
      // Read by the native chrome to tell "converting an editor draft" from a
      // fresh upload; the desktop workspace does not distinguish them.
      draftId,
    },
    state: {
      step,
      detailStep,
      formData,
      classification,
      services,
      legal,
      rightsLicensing,
      roles,
      filmDetails,
      tagsInput,
      uploadedFile,
      uploadedPdfFile,
      existingUploadedFile,
      textContent,
      pdfPageTexts,
      pdfTextExtracted,
      fromDraft,
      workingDraftDirty,
      localSnapshotSaved,
      navigationExitRequested,
      isExtracting,
      uploadProgress,
      thumbnailFile,
      thumbnailPreviewUrl,
      isGeneratingAiCover,
      aiCoverAttempts,
      aiCoverRemaining,
      aiCoverHistory,
      aiCoverIndex,
      trailerFile,
      trailerPreviewUrl,
      trailerMetaLabel: trailerMetaLoading
        ? "Reading video details…"
        : trailerMeta
          ? formatDuration(trailerMeta.duration) + " · " + trailerMeta.width + "×" + trailerMeta.height
          : "",
      pitchVideoFile,
      pitchVideoPreviewUrl,
      pitchVideoMetaLabel: pitchVideoMetaLoading
        ? "Reading video details…"
        : pitchVideoMeta
          ? formatDuration(pitchVideoMeta.duration)
          : "",
      metaLoadingField,
      metaNotice,
      validationErrors,
      validationAttempt,
      mediaRecoveryPending: Boolean(pendingMediaRecovery),
      mediaRecovery: pendingMediaRecovery,
      mediaUploadActive,
      mediaUploadPreflight,
      pdfNotice,
      creationBlocked,
      sourceLoad,
      sourceWriteBlocked,
      scriptLimit,
      loading,
      agreementScrolled,
      isPremium,
      scriptPrice,
      customPriceInput,
      useCustomPrice,
      toastMessage,

      /*
       * Read only by a native chrome. The desktop workspace never needs them
       * because this file renders each of these itself — the three early
       * returns above, and the thumbnail cropper portal below.
       */
      accessDenied,
      isEditModeResolving: sourceLoad.status === UPLOAD_SOURCE_LOAD_STATUS.LOADING,
      submissionSuccess,
      editApprovalLocked,
      mediaProgress,
      thumbnailEditor: {
        open: isThumbnailEditorOpen,
        imageUrl: thumbnailSourceUrl,
        aspect: THUMBNAIL_ASPECT,
        crop: thumbnailCrop,
        zoom: thumbnailZoom,
        rotation: thumbnailRotation,
        applying: thumbnailApplying,
        onCropChange: setThumbnailCrop,
        onZoomChange: setThumbnailZoom,
        onRotationChange: setThumbnailRotation,
        onCropComplete: setThumbnailCropPixels,
        onCancel: resetThumbnailEditor,
        onApply: handleApplyThumbnail,
        description: "Drag the image to choose the best angle. Covers are 16:10.",
      },
    },
    actions: {
      handleDrop,
      handleDragOver,
      handleFileSelect,
      handleChange,
      setFormData: (update) => {
        clearValidationFeedback();
        setFormData(update);
      },
      setTextContent: (value) => {
        clearValidationFeedback();
        setTextContent(value);
      },
      openEditor: () => navigate("/create-project"),
      openDrafts: () => navigate("/dashboard"),
      openPricing: () => openPricingModal("writer"),
      handleGenerateMetadata,
      setTagsInput: (value) => {
        clearValidationFeedback();
        setTagsInput(value);
      },
      addRole,
      removeRole,
      updateRoleField,
      updateRoleAge,
      setFilmDetails: (update) => {
        clearValidationFeedback();
        setFilmDetails(update);
      },
      toggleClassification,
      generateAiCover,
      downloadWatermarkedImage,
      setThumbnailFile: (file) => {
        clearValidationFeedback();
        setThumbnailFile(file);
      },
      handleThumbnailSelect,
      // Re-opens the cropper on an already-chosen cover. Desktop has no such
      // control — once a cover is applied the only way to re-frame it is to pick
      // the file again — so the mobile media slot's "Adjust" action needs it.
      openThumbnailEditor,
      setAiCoverHistoryIndex: (nextIndex) => {
        if (nextIndex < 0 || nextIndex >= aiCoverHistory.length) return;
        setAiCoverIndex(nextIndex);
        setThumbnailFile(aiCoverHistory[nextIndex]);
      },
      handleTrailerSelect,
      setTrailerFile: (file) => {
        clearValidationFeedback();
        setTrailerFile(file);
        if (!file) setTrailerOption("none");
      },
      handlePitchVideoSelect,
      setPitchVideoFile: (file) => {
        clearValidationFeedback();
        setPitchVideoFile(file);
      },
      cancelMediaUpload,
      confirmMediaUploadPreflight,
      dismissMediaUploadPreflight: () => setMediaUploadPreflight(null),
      setIsPremium: (value) => {
        clearValidationFeedback();
        setIsPremium(value);
      },
      setScriptPrice: (value) => {
        clearValidationFeedback();
        setScriptPrice(value);
      },
      setUseCustomPrice: (value) => {
        clearValidationFeedback();
        setUseCustomPrice(value);
      },
      setCustomPriceInput: (value) => {
        clearValidationFeedback();
        setCustomPriceInput(value);
      },
      setServices: (update) => {
        clearValidationFeedback();
        setServices(update);
      },
      setLegal: (update) => {
        clearValidationFeedback();
        setLegal(update);
      },
      setRightsLicensing: (update) => {
        clearValidationFeedback();
        setRightsLicensing(update);
      },
      onStepSelect: (targetStep) => {
        if (targetStep > step) return;
        setPdfNotice("");
        setStep(targetStep);
        if (targetStep === 2 && step !== 2) setDetailStep(0);
        clearValidationFeedback();
      },
      onDetailSelect: (targetDetailStep) => {
        if (targetDetailStep > detailStep) return;
        setPdfNotice("");
        setDetailStep(targetDetailStep);
        clearValidationFeedback();
      },
      dismissToast,
      focusValidationIssue,
      handleBack,
      handleNext,
      handleSaveDraft,
      retrySourceLoad,
      recoverSourceFromDevice,
      flushWorkingSnapshot,
      discardWorkingDraft,
      handleSubmit,
      cancelContentEdit: () => {
        if (workingDraftDirtyRef.current) {
          flushWorkingSnapshotRef.current();
          if (nativeChrome) {
            setNavigationExitRequested((current) => current + 1);
            return;
          }
          if (!window.confirm("Leave this edit? Your latest changes are saved on this device.")) return;
        }
        intentionalExitRef.current = true;
        navigate(-1);
      },
    },
    elements: {
      fileInputRef,
      thumbnailInputRef,
      trailerInputRef,
      pitchVideoInputRef,
      agreementRef,
    },
    options: {
      formats,
      formatRanges: FORMAT_PAGE_RANGES,
      genres,
      tones: toneOptions,
      themes: themeOptions,
      settings: settingOptions,
      roleGenders: ROLE_GENDER_OPTIONS,
      languages: FILM_LANGUAGE_OPTIONS,
      styles: SCRIPT_STYLE_OPTIONS,
      completion: SCRIPT_COMPLETION_OPTIONS,
      rights: [
        {
          value: "full_rights_sale",
          title: "Full Rights Sale",
          tag: "ownership transfer",
          short: "Full sale",
          desc: "The buyer receives ownership under the final transaction agreement.",
        },
        {
          value: "exclusive_license",
          title: "Exclusive License",
          tag: "time-bound",
          short: "Exclusive license",
          desc: "Grant one buyer exclusive use for a fixed term, then rights return to you.",
        },
        {
          value: "custom_negotiation_required",
          title: "Custom Negotiation",
          tag: "discuss terms",
          short: "Custom deal",
          desc: "Use the listing to start a deal discussion before rights are transferred.",
        },
      ],
      modification: MODIFICATION_RIGHTS_OPTIONS,
      payments: PAYMENT_STRUCTURE_OPTIONS,
      negotiations: NEGOTIATION_MODE_OPTIONS,
      licenseDurations: LICENSE_DURATION_PRESET_MONTHS,
      pricePresets: PRICE_PRESETS,
    },
    computed: {
      pageCountWarning,
      effectivePrice,
      buyerTotalPayable,
      writerPayout,
      priceGuide: priceGuide
        ? "Suggested ₹" + priceGuide.min + "–₹" + priceGuide.max + " for " + priceGuide.label
        : "Choose a price that matches the scope and readiness of the work.",
      publishServices,
      legalAgreement: LEGAL_AGREEMENT,
      publishInvoiceRows,
    },
  };

  /*
   * A native chrome owns the whole frame: it mounts `MobileShell`, which is
   * `height: 100%` and therefore needs a host that passes the height through.
   * Desktop keeps the bare fragment it has always rendered.
   */
  if (nativeChrome) {
    return (
      <div className={hostClassName}>
        <Workspace vm={workspaceVm} />
      </div>
    );
  }

  return (
    <>
      <Workspace vm={workspaceVm} />
      {isThumbnailEditorOpen && thumbnailSourceUrl && createPortal(
        <AnimatePresence>
          <Motion.div
            key="thumbnail-modal-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto"
            style={{ background: "rgba(0,0,0,0.76)", backdropFilter: "blur(8px)" }}
            onClick={resetThumbnailEditor}
          >
            <Motion.div
              key="thumbnail-modal"
              ref={thumbnailDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="su-thumbnail-dialog-title"
              tabIndex={-1}
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.96 }}
              transition={{ type: "spring", damping: 24, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-3xl max-h-[92vh] my-2 rounded-2xl shadow-2xl overflow-hidden flex flex-col ${isDarkMode
                ? "bg-[#091322] border border-white/[0.08]"
                : "bg-white border border-gray-200"
                }`}
            >
              <div className={`px-4 sm:px-5 py-3 sm:py-4 border-b flex items-center justify-between shrink-0 ${isDarkMode ? "border-white/[0.08]" : "border-gray-100"}`}>
                <div>
                  <h3 id="su-thumbnail-dialog-title" className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>Set Script Cover Image</h3>
                  <p className={`text-[11px] mt-0.5 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>Drag to frame the best angle. Cover ratio is 16:10.</p>
                </div>
                <button
                  type="button"
                  onClick={resetThumbnailEditor}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${isDarkMode
                    ? "text-gray-400 hover:bg-white/[0.08]"
                    : "text-gray-500 hover:bg-gray-100"
                    }`}
                >
                  Close
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                <div className={`relative w-full h-[45vh] sm:h-[380px] min-h-[220px] rounded-xl overflow-hidden ${isDarkMode ? "bg-black/50" : "bg-gray-100"}`}>
                  <Cropper
                    image={thumbnailSourceUrl}
                    crop={thumbnailCrop}
                    zoom={thumbnailZoom}
                    minZoom={0.1}
                    rotation={thumbnailRotation}
                    aspect={THUMBNAIL_ASPECT}
                    showGrid
                    objectFit="cover"
                    onCropChange={setThumbnailCrop}
                    onZoomChange={setThumbnailZoom}
                    onRotationChange={setThumbnailRotation}
                    onCropComplete={(_, croppedAreaPixels) => setThumbnailCropPixels(croppedAreaPixels)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={`rounded-xl p-3 border ${isDarkMode ? "border-white/[0.08] bg-white/[0.02]" : "border-gray-200 bg-gray-50"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <label className={`text-xs font-semibold ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>Zoom</label>
                      <span className={`ml-auto text-[11px] ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}>{thumbnailZoom.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={3}
                      step={0.01}
                      value={thumbnailZoom}
                      onChange={(e) => setThumbnailZoom(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div className={`rounded-xl p-3 border ${isDarkMode ? "border-white/[0.08] bg-white/[0.02]" : "border-gray-200 bg-gray-50"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <label className={`text-xs font-semibold ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>Rotation</label>
                      <span className={`ml-auto text-[11px] ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}>{Math.round(thumbnailRotation)} deg</span>
                    </div>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      step={1}
                      value={thumbnailRotation}
                      onChange={(e) => setThumbnailRotation(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className={`rounded-xl px-3 py-2 border flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:justify-between ${isDarkMode ? "border-white/[0.08] bg-white/[0.02]" : "border-gray-200 bg-gray-50"}`}>
                  <p className={`text-[11px] ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>Tip: drag image to choose focal point, then fine-tune zoom and angle.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setThumbnailCrop({ x: 0, y: 0 });
                      setThumbnailZoom(1);
                      setThumbnailRotation(0);
                    }}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition ${isDarkMode
                      ? "bg-white/[0.08] text-gray-300 hover:bg-white/[0.12]"
                      : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
                      }`}
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className={`px-4 sm:px-5 pb-4 sm:pb-5 pt-3 flex gap-3 shrink-0 ${isDarkMode ? "border-t border-white/[0.06]" : "border-t border-gray-100"}`}>
                <button
                  type="button"
                  onClick={resetThumbnailEditor}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition ${isDarkMode
                    ? "bg-white/[0.05] text-gray-400 hover:bg-white/[0.08]"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyThumbnail}
                  disabled={thumbnailApplying}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-40 disabled:cursor-not-allowed bg-[#1e3a5f] hover:bg-[#162d4a] text-white"
                >
                  {thumbnailApplying ? "Saving Cover..." : "Save Cover"}
                </button>
              </div>
            </Motion.div>
          </Motion.div>
        </AnimatePresence>,
        document.body
      )}

    </>
  );
};

export default ScriptUpload;
