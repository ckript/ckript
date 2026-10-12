import { createRequire } from "module";
import Script from "../models/Script.js";
import mongoose from "mongoose";
import ScriptOption from "../models/ScriptOption.js";
import ScriptPurchaseRequest from "../models/ScriptPurchaseRequest.js";
import CollabRequest from "../models/CollabRequest.js";
import Review from "../models/Review.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import Transaction from "../models/Transaction.js";
import { recordPayment, recordGrant, recordReversal } from "../utils/ledger.js";
import { issueInvoice, totalRow, gatewayRow, formatInvoiceMoney } from "../utils/invoiceIssue.js";
import LedgerEntry from "../models/LedgerEntry.js";
import Invoice from "../models/Invoice.js";
import Agreement from "../models/Agreement.js";
import AuditLog from "../models/AuditLog.js";
import {
  sendPurchaseRequestEmail,
  sendPurchaseApprovedEmail,
  sendPurchaseRejectedEmail,
} from "../utils/emailService.js";
import { generateAndSaveInvoicePdf } from "../utils/invoicePdf.js";
import { writerLimitApplies, buildScriptLimitStatus, getScriptUploadCycleStart } from "../utils/scriptLimits.js";
import { generateAndUploadAgreementPdfs } from "../utils/agreementPdf.js";
import { generateAndUploadScriptSubmissionPdf } from "../utils/scriptSubmissionPdf.js";
import { generateAndUploadPurchaseRequestAcceptancePdf } from "../utils/purchaseRequestAcceptancePdf.js";
import { notifyAdminWorkflowEvent } from "../utils/adminWorkflowAlerts.js";
import { runScriptScoreGeneration } from "./aiController.js";

import { buildScriptCanonicalPath, buildScriptShareMeta } from "../utils/shareMeta.js";
import { getCurrentPurchaseTermsPolicy } from "../utils/termsPolicyService.js";
import {
  hasActiveFilmIndustryProfessionalAccess,
  hasAnyFipAccess,
  hasBusinessEmail,
  isIndustryProfessionalWithPersonalEmail,
  hasRevealedContact,
  hasReachedContactLimit,
  getRevealedContactCount,
  getContactsLimit,
  getRemainingContacts,
  isFilmIndustryProfessionalRole,
} from "../utils/industryAccess.js";
import { extractTextFromPdfBuffer, extractTextFromPdfUrl, normalizeExtractedPdfText, formatScreenplayLikeText } from "../utils/pdfTextExtraction.js";
import {
  RemoteAssetPolicyError,
  createRemoteAssetGrant,
  fetchTrustedPdfAsset,
  normalizeTrustedRemoteAssetUrl,
  verifyRemoteAssetGrant,
} from "../utils/remoteAssetPolicy.js";
import { parseMongoObjectId } from "../utils/mongoId.js";
import { asTrimmedString, asInt, asSearchRegex } from "../utils/requestValue.js";
import {
  TOP_LIST_RESULT_EXCLUDE,
  parseTopListQuery,
  unpackTopListFacet,
} from "../utils/topListQuery.js";
import {
  SCRIPT_LIST_BODY_FIELDS,
  SCRIPT_LIST_RESULT_EXCLUDE,
  buildScriptListPagination,
  parseScriptListPaging,
  stripScriptBody,
  unpackScriptListFacet,
} from "../utils/scriptListPaging.js";
import {
  SCRIPT_DETAIL_CREATOR_SELECT,
  buildScriptDetailBodyAccess,
} from "../utils/scriptDetailPayload.js";
import Razorpay from "razorpay";
import crypto from "crypto";
import { resolveCurrency, convertInrToCurrency, toSubunits } from "../utils/currencyFx.js";
import { createOrderWithUsdFallback } from "../utils/razorpayOrder.js";
// verifyScriptPurchase and verifyScriptTrailerPayment both call this, and it was NEVER imported —
// so every Razorpay verification in this file threw a ReferenceError and 500'd inside its try/catch.
// A buyer paid and the purchase was never granted. Neither the build nor the test suite catches a
// dangling identifier; only eslint's no-undef does, which is why lintUndefined.test.js now runs it.
import { verifyRazorpaySignature } from "../utils/razorpaySignature.js";
import multer from "multer";
import path from "path";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";
import { uploadToCloudinary, buildPrivateDownloadUrl } from "../config/cloudinary.js";
import {
  buildInvestorFeed,
  trackInvestorInteraction,
} from "../services/recommendationService.js";
import {
  canEditScriptMetadata,
  hasScriptPermission,
  resolveCollaboratorAccessLevel,
  resolveScriptRole,
} from "../middleware/checkPermission.js";
import { applyThreeWayMerge } from "../utils/contentMerge.js";
import { normalizeWriterCredits, addWriterCredit } from "../utils/writerCredits.js";
import { derivePreviewPageTexts } from "../utils/screenplayPages.js";
import { stripPdfPageFurniture } from "../utils/screenplayImportClean.js";
import { hasProjectCreatorAccess } from "../utils/projectAccess.js";
import { canReadFullScript, FULL_SCRIPT_ACCESS_MESSAGE } from "../utils/scriptReadAccess.js";
import {
  attachUploadedScriptMedia,
  canUploadPitchVideo,
} from "../utils/scriptMedia.js";
import { validateScriptHoldPayment } from "../utils/scriptHold.js";
import { refundPayment } from "../utils/tax/refunds.js";
import { readVerifiedOrder } from "../utils/razorpayCapture.js";
import {
  billingFromRequest,
  checkoutBreakdown,
  lineFor,
  pickPriced,
  priceCheckout,
  priceWithInrFallback,
  requestIp,
  resolveCapturedTax,
  saveQuote,
} from "../utils/tax/checkout.js";
import { allocate } from "../utils/tax/engine.js";
import { VISITOR_PROFILE_SCRIPT_FIELDS } from "../utils/profileProjection.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ADMIN_APPROVAL_ARCHIVE_DIR = process.env.ADMIN_APPROVAL_ARCHIVE_DIR || "C:\\Users\\yashc\\OneDrive\\ckript-data\\c-s";

// Lazy initialization of Razorpay
let razorpayInstance = null;

const getRazorpay = () => {
  if (!razorpayInstance) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error("Razorpay credentials not configured");
    }
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayInstance;
};


const PUBLISHED_SCRIPT_STATUSES = ["published", "approved"];

const PUBLIC_SCRIPT_FILTER = {
  status: { $in: PUBLISHED_SCRIPT_STATUSES },
  isSold: { $ne: true },
  transactionStatus: { $ne: "sold_licensed" },
  isDeleted: { $ne: true },
};

const PROJECT_SPOTLIGHT_ACTIVATION_CREDITS = 310;
const PROJECT_SPOTLIGHT_EXTENSION_CREDITS = 150;
const PROJECT_SPOTLIGHT_DURATION_DAYS = 30;
const SCRIPT_UPLOAD_TERMS_VERSION = process.env.SCRIPT_UPLOAD_TERMS_VERSION || "2026-03-24";
// AI trailer packages, PRE-TAX, in MINOR units (paise / cents). Taxes are added at checkout.
const TRAILER_PRICE_MATRIX = {
  "30-480": { INR: 39900, USD: 500 },
  "30-720": { INR: 49900, USD: 600 },
  "60-480": { INR: 53900, USD: 600 },
  "60-720": { INR: 64900, USD: 700 },
  "90-480": { INR: 54900, USD: 630 },
  "90-720": { INR: 79900, USD: 900 },
};

const WRITER_CONTACT_VIEWER_ROLES = ["investor", "producer", "director", "industry", "professional"];

const canViewerAccessWriterContact = (viewer, creatorId) => {
  const viewerId = String(viewer?._id || "");
  const creatorObjectId = String(creatorId || "");
  if (!viewerId || !creatorObjectId || viewerId === creatorObjectId) {
    return false;
  }

  const role = String(viewer?.role || "").toLowerCase();
  return WRITER_CONTACT_VIEWER_ROLES.includes(role) && hasAnyFipAccess(viewer);
};

const normalizeTrailerLayout = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "portrait" ? "portrait" : "landscape";
};

const getTrailerPackagePricing = (duration, quality) => {
  const key = `${String(duration || "").trim()}-${String(quality || "").trim()}`;
  const row = TRAILER_PRICE_MATRIX[key];
  // `inr`/`usd` (major units) kept for the request note and older readers.
  return row
    ? { INR: row.INR, USD: row.USD, inr: row.INR / 100, usd: row.USD / 100 }
    : { INR: 0, USD: 0, inr: 0, usd: 0 };
};

/** The trailer package as it reads on a checkout and an invoice line. */
const trailerLineLabel = (duration, quality, format) =>
  `AI trailer · ${String(duration || "").trim()}s · ${String(quality || "").trim()}px · ${normalizeTrailerLayout(format) === "portrait" ? "Portrait" : "Landscape"}`;

const buildTrailerRequestNote = ({ duration, quality, format, currency, amount }) => {
  const layoutLabel = normalizeTrailerLayout(format) === "portrait" ? "Portrait" : "Landscape";
  const currencyLabel = String(currency || "INR").toUpperCase();
  return [
    `Duration: ${String(duration || "").trim()} sec`,
    `Quality: ${String(quality || "").trim()}px`,
    `Layout: ${layoutLabel}`,
    `Display currency: ${currencyLabel}`,
    `Price: ${currencyLabel === "USD" ? "$" : "INR"} ${String(amount ?? 0).trim()}`,
  ].join(" | ");
};

const buildWriterContactPayload = (writerDoc) => {
  if (!writerDoc) return null;

  return {
    email: String(writerDoc.email || "").trim(),
    phone: String(writerDoc.phone || "").trim(),
    links: writerDoc.writerProfile?.links || {},
  };
};
const SCRIPT_PREVIEW_WORDS_PER_UNIT = 250;
const normalizeScriptPreviewAccess = (previewAccess = {}, fallback = {}) => {
  const rawMode = String(previewAccess?.mode || fallback?.mode || "pages").trim().toLowerCase();
  const mode = rawMode === "episodes" ? "episodes" : "pages";
  const fallbackStart = Number(fallback?.start || 1);
  const fallbackEnd = Number(fallback?.end || 8);
  const rawStart = Number(previewAccess?.start ?? previewAccess?.from ?? fallbackStart);
  const rawEnd = Number(previewAccess?.end ?? previewAccess?.to ?? fallbackEnd);
  const maxUnits = Number(fallback?.maxUnits || 0);

  let start = Number.isFinite(rawStart) && rawStart > 0 ? Math.floor(rawStart) : 1;
  let end = Number.isFinite(rawEnd) && rawEnd > 0 ? Math.floor(rawEnd) : Math.max(start, fallbackEnd);

  if (maxUnits > 0) {
    start = Math.min(start, maxUnits);
    end = Math.min(end, maxUnits);
  }

  if (end < start) {
    end = start;
  }

  return { mode, start, end };
};

const hasViewableScriptPreview = (script) => Boolean(script?.viewableScript);

const getScriptPreviewLabel = (previewAccess) => {
  const safePreview = normalizeScriptPreviewAccess(previewAccess);
  const unitLabel = safePreview.mode === "episodes" ? "Episode" : "Page";
  return `${unitLabel}s ${safePreview.start} to ${safePreview.end}`;
};

const getScriptPreviewExcerpt = (script, previewAccess) => {
  const rawText = String(script?.textContent || script?.fullContent || "").trim();
  if (!rawText) return "";

  const plainText = rawText
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!plainText) return "";

  const safePreview = normalizeScriptPreviewAccess(previewAccess);
  const words = plainText.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  const startIndex = Math.max(0, (safePreview.start - 1) * SCRIPT_PREVIEW_WORDS_PER_UNIT);
  const endIndex = Math.max(startIndex, Math.min(words.length, safePreview.end * SCRIPT_PREVIEW_WORDS_PER_UNIT));
  if (startIndex >= words.length) return "";

  const excerpt = words.slice(startIndex, endIndex).join(" ");
  return excerpt ? `${excerpt}${endIndex < words.length ? "..." : ""}` : "";
};
const getScriptPreviewPageTexts = (script) => {
  if (!script) return [];

  return Array.isArray(script.scriptPreviewPageTexts)
    ? script.scriptPreviewPageTexts
      .map((pageText) => String(pageText || "").trim())
    : [];
};
const getScriptPreviewPageTextByNumber = (script, pageNumber) => {
  const pageTexts = getScriptPreviewPageTexts(script);
  const index = Math.max(0, Number(pageNumber || 0) - 1);
  return String(pageTexts[index] || "").trim();
};
const MAX_CUSTOM_INVESTOR_TERMS_LENGTH = 3000;
// The platform fee on a script purchase or hold. A FEE, not a tax: taxes (18%) are separate and are
// charged on the price plus this fee.
const SCRIPT_PURCHASE_PLATFORM_FEE_RATE = 0.05;
const MAX_RIGHTS_CUSTOM_CONDITIONS_LENGTH = 5000;
const MAX_SCRIPT_COMPLETION_FUTURE_PLANS_LENGTH = 300;
const LEGAL_MARKETPLACE_DISCLAIMER = "Please accept all required terms before continuing.";
const normalizeObjectId = (value) => String(value?._id || value?.id || value || "");
const getScriptOwnerId = (script) => String(script?.creator?._id || script?.creator || "");
const getScriptRoom = (scriptId) => `script:${scriptId}`;

const createAuditEntry = async (scriptId, actorId, action, metadata = {}) =>
  AuditLog.create({
    scriptId,
    actorId,
    action,
    metadata,
  });

const emitNotification = (req, userId, event, payload) => {
  const io = req.app.get("io");
  if (!io || !userId) return;
  io.to(`notifications-${userId}`).emit(event, payload);
};

const emitScriptEvent = (req, scriptId, event, payload) => {
  const io = req.app.get("io");
  if (!io || !scriptId) return;
  io.to(getScriptRoom(scriptId)).emit(event, payload);
};

const RIGHTS_TYPE_LABELS = {
  full_rights_sale: "Full Rights Sale (Ownership Transfer)",
  exclusive_license: "Exclusive License",
  custom_negotiation_required: "Custom Negotiation Required",
};

const MODIFICATION_RIGHTS_LABELS = {
  buyer_can_modify_freely: "Buyer can modify freely",
  buyer_must_consult_writer: "Buyer must consult writer before modification",
  writer_retains_creative_approval_rights: "Writer retains creative approval rights",
};

const PAYMENT_STRUCTURE_LABELS = {
  one_time_upfront_payment: "One-time upfront payment",
  lower_upfront_plus_royalty_percent: "Lower upfront + royalty %",
  revenue_sharing_model: "Revenue sharing model",
  custom_deal: "Custom deal",
};

const NEGOTIATION_MODE_LABELS = {
  fixed_terms_non_negotiable: "Fixed terms (non-negotiable)",
  open_to_discussion_after_purchase: "Open to discussion after purchase",
  ckript_not_involved: "Ckript not involved in negotiation",
};

const RIGHTS_TYPE_OPTIONS = new Set(Object.keys(RIGHTS_TYPE_LABELS));
const MODIFICATION_RIGHTS_OPTIONS = new Set(Object.keys(MODIFICATION_RIGHTS_LABELS));
const PAYMENT_STRUCTURE_OPTIONS = new Set(Object.keys(PAYMENT_STRUCTURE_LABELS));
const NEGOTIATION_MODE_OPTIONS = new Set(Object.keys(NEGOTIATION_MODE_LABELS));
const SCRIPT_COMPLETION_STATUS_OPTIONS = new Set(["complete", "partial", "ongoing"]);
const MIN_LICENSE_DURATION_MONTHS = 1;
const MAX_LICENSE_DURATION_MONTHS = 120;

const getRemoteAssetErrorStatus = (error) =>
  String(error?.code || "").includes("CONFIGURATION_ERROR") ? 500 : 400;

const sendRemoteAssetError = (res, error) => res.status(getRemoteAssetErrorStatus(error)).json({
  message: error.message,
  code: error.code,
});

const resolveSubmittedScriptFile = ({
  scriptUrl,
  fileUrl,
  fileGrant,
  ownerId,
  currentUrl = "",
  validateStored = false,
} = {}) => {
  const submittedScriptUrl = scriptUrl === undefined || scriptUrl === null ? "" : String(scriptUrl).trim();
  const submittedFileUrl = fileUrl === undefined || fileUrl === null ? "" : String(fileUrl).trim();
  if (submittedScriptUrl && submittedFileUrl && submittedScriptUrl !== submittedFileUrl) {
    throw new RemoteAssetPolicyError(
      "Conflicting script file references were submitted.",
      "CONFLICTING_SCRIPT_FILE_URLS"
    );
  }

  const candidate = submittedScriptUrl || submittedFileUrl;
  const stored = String(currentUrl || "").trim();
  if (!candidate) {
    let resolvedStored = stored;
    if (stored && validateStored) {
      try {
        resolvedStored = normalizeTrustedRemoteAssetUrl(stored);
      } catch {
        throw new RemoteAssetPolicyError(
          "The stored script file is no longer trusted. Re-upload the PDF before publishing.",
          "STORED_SCRIPT_ASSET_UNTRUSTED"
        );
      }
    }
    return {
      changed: false,
      url: resolvedStored,
      grant: null,
    };
  }

  const normalizedCandidate = normalizeTrustedRemoteAssetUrl(candidate);
  let normalizedStored = "";
  if (stored) {
    try {
      normalizedStored = normalizeTrustedRemoteAssetUrl(stored);
    } catch {
      normalizedStored = "";
    }
  }

  if (normalizedStored && normalizedCandidate === normalizedStored) {
    return { changed: false, url: normalizedStored, grant: null };
  }
  if (!fileGrant) {
    throw new RemoteAssetPolicyError(
      "This script file was not issued by the upload service. Upload the PDF again.",
      "MISSING_ASSET_GRANT"
    );
  }

  const grant = verifyRemoteAssetGrant(fileGrant, {
    url: normalizedCandidate,
    ownerId,
    purpose: "script-source",
  });
  if (String(grant.format || "").toLowerCase() !== "pdf") {
    throw new RemoteAssetPolicyError(
      "Only uploaded PDF files can be attached as the script source.",
      "UNSUPPORTED_SCRIPT_ASSET_FORMAT"
    );
  }

  return { changed: true, url: normalizedCandidate, grant };
};

const sanitizeArchiveSegment = (value = "", fallback = "item") => {
  const normalized = String(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || fallback;
};

const fetchTrustedPdfBuffer = async (url) => {
  const { buffer } = await fetchTrustedPdfAsset(url);
  return buffer;
};

const fetchArchivePdfBuffer = async (script) => {
  const remoteUrl = String(script?.fileUrl || "").trim();
  if (remoteUrl) {
    try {
      return await fetchTrustedPdfBuffer(remoteUrl);
    } catch (error) {
      console.error("[fetchArchivePdfBuffer] Remote file download failed:", error?.message || error);
    }
  }

  const summaryPublicId = String(script?.submissionSummaryPdf?.publicId || "").trim();
  const summaryUrl = String(script?.submissionSummaryPdf?.url || "").trim();

  if (summaryPublicId) {
    try {
      const signedUrl = buildPrivateDownloadUrl(summaryPublicId, "pdf", {
        resource_type: "raw",
        type: "upload",
        expires_at: Math.floor(Date.now() / 1000) + 10 * 60,
        attachment: false,
      });
      return await fetchTrustedPdfBuffer(signedUrl);
    } catch (error) {
      console.error("[fetchArchivePdfBuffer] Submission summary PDF download by publicId failed:", error?.message || error);
    }
  }

  if (summaryUrl) {
    try {
      return await fetchTrustedPdfBuffer(summaryUrl);
    } catch (error) {
      console.error("[fetchArchivePdfBuffer] Submission summary PDF download by url failed:", error?.message || error);
    }
  }

  return null;
};

const archiveScriptSubmissionForAdmin = async ({ script, writer, approvalSource = "" }) => {
  if (!script?._id) return null;

  const archiveRoot = path.resolve(ADMIN_APPROVAL_ARCHIVE_DIR);
  const writerName = sanitizeArchiveSegment(writer?.name || writer?.email || "unknown-writer", "unknown-writer");
  const titleSegment = sanitizeArchiveSegment(script?.title || "untitled-script", "untitled-script");
  const approvalType = sanitizeArchiveSegment(script?.approvalRequestType || "submission", "submission");
  const scriptId = sanitizeArchiveSegment(script._id.toString(), "script");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const folderName = `${timestamp}__${writerName}__${titleSegment}__${scriptId}__${approvalType}`;
  const targetDir = path.join(archiveRoot, folderName);

  await fs.mkdir(targetDir, { recursive: true });

  const metadata = {
    archivedAt: new Date().toISOString(),
    archiveSource: approvalSource,
    scriptId: script._id.toString(),
    sid: script.sid || "",
    title: script.title || "",
    writerId: writer?._id?.toString?.() || script?.creator?.toString?.() || "",
    writerName: writer?.name || "",
    writerEmail: writer?.email || "",
    status: script.status || "",
    approvalRequestType: script.approvalRequestType || "",
    scriptPreviewAccess: hasViewableScriptPreview(script) ? script.scriptPreviewAccess || null : null,
    scriptPreviewSummary: hasViewableScriptPreview(script) ? getScriptPreviewLabel(script.scriptPreviewAccess) : "",
    scriptPreviewPageTexts: hasViewableScriptPreview(script) ? getScriptPreviewPageTexts(script) : [],
    fileUrl: script.fileUrl || "",
    projectSource: script.projectSource || "",
  };

  await fs.writeFile(
    path.join(targetDir, "metadata.json"),
    JSON.stringify(metadata, null, 2),
    "utf8"
  );

  const pdfBuffer = await fetchArchivePdfBuffer(script);
  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new Error(`Unable to create PDF archive for script ${scriptId}`);
  }

  const archiveName = sanitizePdfFileName(titleSegment);
  await fs.writeFile(path.join(targetDir, archiveName), pdfBuffer);
  return { targetDir, archiveName, mode: "pdf" };
};

const hydrateScriptTextFromStoredPdf = async (script, { source = "unknown" } = {}) => {
  if (!script) return { text: "", strategy: "missing-script" };

  const currentText = String(script.textContent || "").trim();
  const hasPreviewPages = getScriptPreviewPageTexts(script).length > 0;
  if (currentText && hasPreviewPages) {
    return { text: script.textContent, strategy: "already-present" };
  }

  const remoteUrl = String(script.fileUrl || "").trim();
  if (!remoteUrl) {
    return { text: "", strategy: "missing-file-url" };
  }

  try {
    const extraction = await extractTextFromPdfUrl(remoteUrl);
    const extractedText = String(extraction?.text || "").trim();

    if (!extractedText) {
      return extraction;
    }

    script.textContent = extraction.text;
    if (!Number(script.pageCount) && Number(extraction?.numItems) > 0) {
      script.pageCount = Number(extraction.numItems);
    }
    if (Array.isArray(extraction?.pageTexts) && extraction.pageTexts.length > 0) {
      script.scriptPreviewPageTexts = extraction.pageTexts;
    }
    await script.save();

    return extraction;
  } catch (error) {
    console.warn(`[hydrateScriptTextFromStoredPdf] ${source} failed:`, error?.message || error);
    return { text: "", strategy: "hydrate-failed" };
  }
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return Boolean(value);
};

const toNonNegativeInteger = (value, fallback = 0) => {
  if (value === undefined || value === null || value === "") return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.round(num));
};

const normalizeScriptCompletionInput = (incoming = {}, fallback = {}) => {
  const fallbackStatus = SCRIPT_COMPLETION_STATUS_OPTIONS.has(fallback?.status)
    ? fallback.status
    : "complete";
  const nextStatus = SCRIPT_COMPLETION_STATUS_OPTIONS.has(incoming?.status)
    ? incoming.status
    : fallbackStatus;

  let completedParts = incoming?.completedParts !== undefined
    ? toNonNegativeInteger(incoming.completedParts, 0)
    : toNonNegativeInteger(fallback?.completedParts, 0);
  let totalParts = incoming?.totalParts !== undefined
    ? toNonNegativeInteger(incoming.totalParts, 0)
    : toNonNegativeInteger(fallback?.totalParts, 0);

  if (totalParts > 0 && completedParts > totalParts) {
    completedParts = totalParts;
  }

  if (nextStatus === "complete") {
    if (totalParts > 0 && completedParts === 0) {
      completedParts = totalParts;
    } else if (completedParts > 0 && totalParts === 0) {
      totalParts = completedParts;
    }
  }

  return {
    status: nextStatus,
    completedParts,
    totalParts,
    futurePlans: String(
      incoming?.futurePlans !== undefined
        ? incoming.futurePlans
        : (fallback?.futurePlans || "")
    ).trim().slice(0, MAX_SCRIPT_COMPLETION_FUTURE_PLANS_LENGTH),
  };
};

const validateScriptCompletionPayload = (scriptCompletion = {}) => {
  const errors = [];
  const status = String(scriptCompletion?.status || "").trim();

  if (status && !SCRIPT_COMPLETION_STATUS_OPTIONS.has(status)) {
    errors.push("Script completion status is invalid.");
  }

  const completedRaw = scriptCompletion?.completedParts;
  if (completedRaw !== undefined && completedRaw !== null && completedRaw !== "") {
    const completedNum = Number(completedRaw);
    if (!Number.isInteger(completedNum) || completedNum < 0) {
      errors.push("Completed chapters/parts must be a whole number.");
    }
  }

  const totalRaw = scriptCompletion?.totalParts;
  if (totalRaw !== undefined && totalRaw !== null && totalRaw !== "") {
    const totalNum = Number(totalRaw);
    if (!Number.isInteger(totalNum) || totalNum < 0) {
      errors.push("Total planned chapters/parts must be a whole number.");
    }
  }

  if (
    completedRaw !== undefined && completedRaw !== null && completedRaw !== ""
    && totalRaw !== undefined && totalRaw !== null && totalRaw !== ""
  ) {
    const completedNum = Number(completedRaw);
    const totalNum = Number(totalRaw);
    if (Number.isInteger(completedNum) && Number.isInteger(totalNum) && totalNum > 0 && completedNum > totalNum) {
      errors.push("Completed chapters/parts cannot exceed the total planned parts.");
    }
  }

  if (String(scriptCompletion?.futurePlans || "").trim().length > MAX_SCRIPT_COMPLETION_FUTURE_PLANS_LENGTH) {
    errors.push(`Future update note must be ${MAX_SCRIPT_COMPLETION_FUTURE_PLANS_LENGTH} characters or fewer.`);
  }

  return errors;
};

const normalizeRightsLicensingInput = (incoming = {}, fallback = {}) => {
  const nextRightsType = RIGHTS_TYPE_OPTIONS.has(incoming?.rightsType)
    ? incoming.rightsType
    : (RIGHTS_TYPE_OPTIONS.has(fallback?.rightsType) ? fallback.rightsType : "custom_negotiation_required");

  const nextModificationRights = MODIFICATION_RIGHTS_OPTIONS.has(incoming?.modificationRights)
    ? incoming.modificationRights
    : (MODIFICATION_RIGHTS_OPTIONS.has(fallback?.modificationRights)
      ? fallback.modificationRights
      : "buyer_must_consult_writer");

  const nextPaymentStructure = PAYMENT_STRUCTURE_OPTIONS.has(incoming?.paymentStructure)
    ? incoming.paymentStructure
    : (PAYMENT_STRUCTURE_OPTIONS.has(fallback?.paymentStructure)
      ? fallback.paymentStructure
      : "one_time_upfront_payment");

  const nextNegotiationMode = NEGOTIATION_MODE_OPTIONS.has(incoming?.negotiationMode)
    ? incoming.negotiationMode
    : (NEGOTIATION_MODE_OPTIONS.has(fallback?.negotiationMode)
      ? fallback.negotiationMode
      : "fixed_terms_non_negotiable");

  const requestedDurationRaw = Number(incoming?.timeBound?.licenseDurationMonths);
  const fallbackDurationRaw = Number(fallback?.timeBound?.licenseDurationMonths);
  const requestedDuration = Number.isFinite(requestedDurationRaw)
    ? Math.max(0, Math.min(MAX_LICENSE_DURATION_MONTHS, Math.round(requestedDurationRaw)))
    : 0;
  const fallbackDuration = Number.isFinite(fallbackDurationRaw)
    ? Math.max(0, Math.min(MAX_LICENSE_DURATION_MONTHS, Math.round(fallbackDurationRaw)))
    : 0;
  let licenseDurationMonths = 0;
  if (nextRightsType === "exclusive_license") {
    if (requestedDuration >= MIN_LICENSE_DURATION_MONTHS) {
      licenseDurationMonths = requestedDuration;
    } else if (fallbackDuration >= MIN_LICENSE_DURATION_MONTHS) {
      licenseDurationMonths = fallbackDuration;
    } else {
      licenseDurationMonths = 12;
    }
  }

  const rawCustomConditions = String(
    incoming?.customConditions !== undefined
      ? incoming?.customConditions
      : (fallback?.customConditions || "")
  ).trim();

  const royaltyPercentageRaw = Number(
    incoming?.royaltySettings?.percentage !== undefined
      ? incoming?.royaltySettings?.percentage
      : fallback?.royaltySettings?.percentage
  );
  const royaltyPercentage = Number.isFinite(royaltyPercentageRaw)
    ? Math.min(100, Math.max(0, royaltyPercentageRaw))
    : 0;

  const requestedDurationType = String(
    incoming?.royaltySettings?.durationType !== undefined
      ? incoming?.royaltySettings?.durationType
      : (fallback?.royaltySettings?.durationType || "none")
  ).trim();
  const royaltyDurationType = ["none", "years", "project_lifetime"].includes(requestedDurationType)
    ? requestedDurationType
    : "none";

  const royaltyYearsRaw = Number(
    incoming?.royaltySettings?.durationYears !== undefined
      ? incoming?.royaltySettings?.durationYears
      : fallback?.royaltySettings?.durationYears
  );
  const royaltyDurationYears = Number.isFinite(royaltyYearsRaw)
    ? Math.max(0, Math.min(99, Math.round(royaltyYearsRaw)))
    : 0;

  const nextLegalAckIncoming = incoming?.legalAcknowledgement || {};
  const nextLegalAckFallback = fallback?.legalAcknowledgement || {};

  const normalized = {
    rightsType: nextRightsType,
    exclusivity: true,
    modificationRights: nextModificationRights,
    paymentStructure: nextPaymentStructure,
    royaltySettings: {
      percentage: royaltyPercentage,
      durationType: royaltyDurationType,
      durationYears: royaltyDurationType === "years" ? royaltyDurationYears : 0,
    },
    timeBound: {
      licenseDurationMonths,
      autoRevertToWriter: toBoolean(
        incoming?.timeBound?.autoRevertToWriter,
        toBoolean(fallback?.timeBound?.autoRevertToWriter, false)
      ),
    },
    negotiationMode: nextNegotiationMode,
    customConditions: rawCustomConditions.slice(0, MAX_RIGHTS_CUSTOM_CONDITIONS_LENGTH),
    legalAcknowledgement: {
      ownershipConfirmed: toBoolean(
        nextLegalAckIncoming?.ownershipConfirmed,
        toBoolean(nextLegalAckFallback?.ownershipConfirmed, false)
      ),
      platformTermsAccepted: toBoolean(
        nextLegalAckIncoming?.platformTermsAccepted,
        toBoolean(nextLegalAckFallback?.platformTermsAccepted, false)
      ),
      exclusivityUnderstood: toBoolean(
        nextLegalAckIncoming?.exclusivityUnderstood,
        toBoolean(nextLegalAckFallback?.exclusivityUnderstood, false)
      ),
      acknowledgedAt: nextLegalAckIncoming?.acknowledgedAt
        || nextLegalAckFallback?.acknowledgedAt
        || undefined,
      ipAddress: String(nextLegalAckIncoming?.ipAddress || nextLegalAckFallback?.ipAddress || "").trim(),
    },
    termsVersion: String(incoming?.termsVersion || fallback?.termsVersion || SCRIPT_UPLOAD_TERMS_VERSION).trim(),
    termsVersionNumber: Number(incoming?.termsVersionNumber || fallback?.termsVersionNumber || 1) || 1,
    lastUpdatedAt: new Date(),
  };

  const isRoyaltyStructure = ["lower_upfront_plus_royalty_percent", "revenue_sharing_model"].includes(nextPaymentStructure);
  if (!isRoyaltyStructure) {
    normalized.royaltySettings = {
      percentage: 0,
      durationType: "none",
      durationYears: 0,
    };
  }

  return normalized;
};

const validateRightsLicensingPayload = (rightsLicensing = {}) => {
  const errors = [];
  const legalAcknowledgement = rightsLicensing?.legalAcknowledgement || {};

  if (!RIGHTS_TYPE_OPTIONS.has(rightsLicensing?.rightsType)) {
    errors.push("Rights type is required.");
  }
  if (!MODIFICATION_RIGHTS_OPTIONS.has(rightsLicensing?.modificationRights)) {
    errors.push("Modification rights selection is required.");
  }
  if (!PAYMENT_STRUCTURE_OPTIONS.has(rightsLicensing?.paymentStructure)) {
    errors.push("Payment structure selection is required.");
  }
  if (!NEGOTIATION_MODE_OPTIONS.has(rightsLicensing?.negotiationMode)) {
    errors.push("Negotiation mode selection is required.");
  }

  if (rightsLicensing?.rightsType === "exclusive_license") {
    const months = Number(rightsLicensing?.timeBound?.licenseDurationMonths);
    if (!Number.isInteger(months) || months < MIN_LICENSE_DURATION_MONTHS || months > MAX_LICENSE_DURATION_MONTHS) {
      errors.push(`Exclusive license duration must be between ${MIN_LICENSE_DURATION_MONTHS} and ${MAX_LICENSE_DURATION_MONTHS} months.`);
    }
  }

  const royaltyBased = ["lower_upfront_plus_royalty_percent", "revenue_sharing_model"]
    .includes(rightsLicensing?.paymentStructure);
  if (royaltyBased) {
    const percentage = Number(rightsLicensing?.royaltySettings?.percentage);
    if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
      errors.push("Royalty percentage must be greater than 0 and no more than 100.");
    }
    const durationType = rightsLicensing?.royaltySettings?.durationType;
    if (!["none", "years", "project_lifetime"].includes(durationType)) {
      errors.push("Royalty duration type is invalid.");
    }
    if (durationType === "years") {
      const durationYears = Number(rightsLicensing?.royaltySettings?.durationYears);
      if (!Number.isInteger(durationYears) || durationYears < 1 || durationYears > 99) {
        errors.push("Royalty duration must be between 1 and 99 years.");
      }
    }
  }

  if (String(rightsLicensing?.customConditions || "").trim().length > MAX_RIGHTS_CUSTOM_CONDITIONS_LENGTH) {
    errors.push(`Rights conditions must be ${MAX_RIGHTS_CUSTOM_CONDITIONS_LENGTH} characters or fewer.`);
  }
  if (!toBoolean(legalAcknowledgement.platformTermsAccepted, false)) {
    errors.push("Platform terms acknowledgement is required.");
  }

  return errors;
};

const buildRightsLabels = (rights = {}) => {
  const durationMonths = Number(rights?.timeBound?.licenseDurationMonths || 0);
  return {
    rightsTypeLabel: RIGHTS_TYPE_LABELS[rights?.rightsType] || rights?.rightsType || "-",
    modificationRightsLabel: MODIFICATION_RIGHTS_LABELS[rights?.modificationRights] || rights?.modificationRights || "-",
    paymentStructureLabel: PAYMENT_STRUCTURE_LABELS[rights?.paymentStructure] || rights?.paymentStructure || "-",
    negotiationModeLabel: NEGOTIATION_MODE_LABELS[rights?.negotiationMode] || rights?.negotiationMode || "-",
    licenseDurationLabel:
      rights?.rightsType === "exclusive_license"
        ? (durationMonths ? `${durationMonths} months` : "Time-bound")
        : "Not time-bound",
  };
};

const getRequestIpAddress = (req) =>
  String(req.ip || req.connection?.remoteAddress || req.headers?.["x-forwarded-for"] || "").trim();

const getRequestUserAgent = (req) => String(req.get("user-agent") || "").trim();

const sanitizePdfFileName = (value = "script-submission-summary") => {
  const normalized = String(value || "script-submission-summary")
    .replace(/[\\/]/g, "-")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .trim();
  if (!normalized) return "script-submission-summary.pdf";
  return normalized.toLowerCase().endsWith(".pdf") ? normalized : `${normalized}.pdf`;
};

const attachSubmissionSummaryPdfToScript = async ({ script, creator }) => {
  if (!script?._id) return script;

  const creatorDoc = creator?._id
    ? creator
    : await User.findById(script.creator).select("name email sid");

  if (!creatorDoc) {
    throw new Error("Writer record not found for submission PDF generation.");
  }

  const submissionSummaryPdf = await generateAndUploadScriptSubmissionPdf({
    script,
    creator: creatorDoc,
  });

  script.submissionSummaryPdf = {
    url: submissionSummaryPdf.url || "",
    publicId: submissionSummaryPdf.publicId || "",
    generatedAt: submissionSummaryPdf.generatedAt || new Date(),
  };
  script.markModified("submissionSummaryPdf");
  await script.save();
  return script;
};

const attachPurchaseRequestAcceptancePdf = async ({
  purchaseRequest,
  script,
  investor,
  writer,
  agreementPdfUrl = "",
}) => {
  if (!purchaseRequest?._id) return purchaseRequest;

  const [scriptDoc, investorDoc, writerDoc] = await Promise.all([
    script?._id ? script : Script.findById(purchaseRequest.script).select("title sid price"),
    investor?._id ? investor : User.findById(purchaseRequest.investor).select("name email sid role"),
    writer?._id ? writer : User.findById(purchaseRequest.writer).select("name email sid role"),
  ]);

  if (!scriptDoc || !investorDoc || !writerDoc) {
    throw new Error("Unable to load purchase request PDF participants.");
  }

  const acceptancePdf = await generateAndUploadPurchaseRequestAcceptancePdf({
    purchaseRequest,
    script: scriptDoc,
    investor: investorDoc,
    writer: writerDoc,
    agreementPdfUrl,
  });

  purchaseRequest.acceptancePdf = {
    url: acceptancePdf.url || "",
    publicId: acceptancePdf.publicId || "",
    generatedAt: acceptancePdf.generatedAt || new Date(),
  };
  purchaseRequest.markModified("acceptancePdf");
  await purchaseRequest.save();
  return purchaseRequest;
};

const markScriptAsLocked = async (script, buyerId) => {
  script.purchaseRequestLocked = true;
  script.purchaseRequestLockedBy = buyerId;
  script.purchaseRequestLockedAt = new Date();
  script.transactionStatus = "locked";
  await script.save();
};

const markScriptAsAvailable = async (script) => {
  script.purchaseRequestLocked = false;
  script.purchaseRequestLockedBy = null;
  script.purchaseRequestLockedAt = null;
  if (!script.isSold) {
    script.transactionStatus = "available";
  }
  await script.save();
};

const buildAgreementTermsSnapshot = ({
  script,
  writerUser,
  buyerUser,
  purchaseRequest,
  termsPolicy,
  pricing,
}) => {
  const rights = normalizeRightsLicensingInput(script?.rightsLicensing || {});
  const labels = buildRightsLabels(rights);
  const now = new Date();
  const licenseMonths = Number(rights?.timeBound?.licenseDurationMonths || 0);
  const expiresAt =
    rights?.rightsType === "exclusive_license" && licenseMonths > 0
      ? new Date(now.getTime() + licenseMonths * 30 * 24 * 60 * 60 * 1000)
      : null;

  const royaltyTerms = rights?.royaltySettings?.percentage > 0
    ? `${rights.royaltySettings.percentage}% (${rights.royaltySettings.durationType === "years"
      ? `${rights.royaltySettings.durationYears} years`
      : rights.royaltySettings.durationType === "project_lifetime"
        ? "project lifetime"
        : "no duration specified"
    })`
    : "Not applicable";

  return {
    script: {
      scriptId: String(script?._id || ""),
      sid: script?.sid || "",
      title: script?.title || "",
      genre: script?.genre || script?.primaryGenre || "",
    },
    writer: {
      userId: String(writerUser?._id || script?.creator || ""),
      sid: writerUser?.sid || "",
      name: writerUser?.name || "",
      email: writerUser?.email || "",
    },
    buyer: {
      userId: String(buyerUser?._id || purchaseRequest?.investor || ""),
      sid: buyerUser?.sid || "",
      name: buyerUser?.name || "",
      email: buyerUser?.email || "",
      role: getPurchaseRequesterLabel(buyerUser || {}),
    },
    rights: {
      ...rights,
      ...labels,
      exclusivityClause: "Exclusive transaction: no parallel sale/license while this agreement is active.",
      licenseExpiryAt: expiresAt,
      customConditions: rights?.customConditions || "",
    },
    payment: {
      paymentStructure: rights?.paymentStructure,
      paymentStructureLabel: labels.paymentStructureLabel,
      baseAmount: pricing?.baseAmount || 0,
      baseAmountLabel: `INR ${Number(pricing?.baseAmount || 0).toFixed(2)}`,
      platformCharges: pricing?.platformFeeAmount || 0,
      platformChargesLabel: `INR ${Number(pricing?.platformFeeAmount || 0).toFixed(2)} (${Number(pricing?.platformFeePercent || 0)}%)`,
      taxes: pricing?.taxAmount || 0,
      taxesLabel: pricing?.taxAmount ? `INR ${Number(pricing.taxAmount).toFixed(2)} (${Number(pricing.taxPercent || 18)}%)` : "",
      totalAmount: pricing?.grossAmount || pricing?.totalAmount || pricing?.baseAmount || 0,
      totalAmountLabel: `INR ${Number(pricing?.grossAmount || pricing?.totalAmount || pricing?.baseAmount || 0).toFixed(2)}`,
      royaltyTerms,
    },
    consentTimestamp: purchaseRequest?.termsAcceptance?.acceptedAt || now,
    legalDisclaimer: LEGAL_MARKETPLACE_DISCLAIMER,
    platformTermsVersion: termsPolicy?.version || "",
    platformTermsTitle: termsPolicy?.title || "",
    platformTermsContent: termsPolicy?.content || "",
  };
};

const createAgreementForSettledPurchase = async ({
  script,
  purchaseRequest,
  writerUser,
  buyerUser,
  pricing,
  req,
}) => {
  const termsPolicy = await getCurrentPurchaseTermsPolicy();
  const termsSnapshot = buildAgreementTermsSnapshot({
    script,
    writerUser,
    buyerUser,
    purchaseRequest,
    termsPolicy,
    pricing,
  });

  const expiresAt = termsSnapshot?.rights?.licenseExpiryAt || null;
  const agreement = await Agreement.create({
    script_id: script._id,
    writer_id: purchaseRequest.writer,
    buyer_id: purchaseRequest.investor,
    terms_json: termsSnapshot,
    status: "active",
    terms_policy_version: termsPolicy?.version || "",
    terms_policy_title: termsPolicy?.title || "",
    expires_at: expiresAt,
    activated_at: new Date(),
    consent_logs: {
      writer: {
        acknowledgedAt:
          script?.rightsLicensing?.legalAcknowledgement?.acknowledgedAt
          || script?.legal?.timestamp
          || script?.updatedAt
          || script?.createdAt
          || new Date(),
        ipAddress: script?.rightsLicensing?.legalAcknowledgement?.ipAddress || script?.legal?.ipAddress || "",
        userAgent: "",
      },
      buyer: {
        acknowledgedAt: purchaseRequest?.termsAcceptance?.acceptedAt || new Date(),
        ipAddress: purchaseRequest?.termsAcceptance?.acceptedIp || getRequestIpAddress(req),
        userAgent: purchaseRequest?.termsAcceptance?.acceptedUserAgent || getRequestUserAgent(req),
        acceptedPlatformTerms: Boolean(purchaseRequest?.termsAcceptance?.platformTermsAccepted),
        acceptedWriterTerms: Boolean(purchaseRequest?.termsAcceptance?.writerTermsAccepted),
        acceptedCustomWriterTerms: Boolean(purchaseRequest?.termsAcceptance?.customWriterTermsAccepted),
      },
      disclaimerAcknowledged: Boolean(purchaseRequest?.termsAcceptance?.legalDisclaimerAccepted),
    },
  });

  const pdfResult = await generateAndUploadAgreementPdfs({ agreement });

  agreement.writer_pdf_url = pdfResult?.writerPdfUrl || "";
  agreement.buyer_pdf_url = pdfResult?.buyerPdfUrl || "";
  await agreement.save();

  return agreement;
};

const expireActiveExclusiveLicenses = async ({ scriptId } = {}) => {
  const now = new Date();
  if (scriptId && !mongoose.isValidObjectId(scriptId)) {
    return;
  }

  const query = {
    status: "active",
    expires_at: { $lte: now },
    "terms_json.rights.rightsType": "exclusive_license",
    "terms_json.rights.timeBound.autoRevertToWriter": true,
  };
  if (scriptId) {
    query.script_id = scriptId;
  }

  const expiredAgreements = await Agreement.find(query).lean();
  if (!expiredAgreements.length) return;

  const agreementIds = expiredAgreements.map((row) => row._id);
  await Agreement.updateMany(
    { _id: { $in: agreementIds } },
    { $set: { status: "expired" } }
  );

  for (const row of expiredAgreements) {
    const script = await Script.findById(row.script_id);
    if (!script) continue;
    if (script.isDeleted) continue;

    const buyerId = String(row.buyer_id || "");
    if (buyerId) {
      script.unlockedBy = (script.unlockedBy || []).filter((id) => String(id) !== buyerId);
      script.purchasedBy = (script.purchasedBy || []).filter((id) => String(id) !== buyerId);
    }

    script.isSold = false;
    script.purchaseRequestLocked = false;
    script.purchaseRequestLockedBy = null;
    script.purchaseRequestLockedAt = null;
    script.transactionStatus = "available";
    await script.save();
  }
};

const roundCurrencyAmount = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * A script sale or hold in INR major units, PRE-TAX: the writer's price and the 5% platform fee.
 * `totalAmount` is price + fee; taxes come on top (see scriptSaleLines and the tax snapshot).
 */
const getScriptPurchasePricing = (baseAmount) => {
  const cleanBaseAmount = roundCurrencyAmount(baseAmount);
  const platformFeeAmount = roundCurrencyAmount(cleanBaseAmount * SCRIPT_PURCHASE_PLATFORM_FEE_RATE);
  const totalAmount = roundCurrencyAmount(cleanBaseAmount + platformFeeAmount);

  return {
    baseAmount: cleanBaseAmount,
    platformFeeRate: SCRIPT_PURCHASE_PLATFORM_FEE_RATE,
    platformFeePercent: Math.round(SCRIPT_PURCHASE_PLATFORM_FEE_RATE * 100),
    platformFeeAmount,
    totalAmount,
  };
};

/**
 * The sale as priced lines in the CHARGED currency, pre-tax: the price and the platform fee. Taxes (18%)
 * are then added on their sum — on the full amount, by decision. The INR total is converted ONCE (as the
 * order always was) and split across the two lines, so the parts can never disagree with the whole.
 */
const scriptSaleLines = async (pricing, currency, { priceKind = "script_price", feeKind = "script_platform_fee", priceLabel = "" } = {}) => {
  const cur = String(currency || "INR").toUpperCase();
  let totalMinor = Math.round(Number(pricing.totalAmount || 0) * 100);
  let fxRate = 1;
  if (cur !== "INR") {
    const converted = await convertInrToCurrency(pricing.totalAmount, cur);
    totalMinor = toSubunits(converted.amount, cur);
    fxRate = converted.fxRate;
  }
  const [priceMinor, feeMinor] = allocate(totalMinor, [
    Math.round(Number(pricing.baseAmount || 0) * 100),
    Math.round(Number(pricing.platformFeeAmount || 0) * 100),
  ]);
  return {
    fxRate,
    lines: [
      lineFor(priceKind, priceMinor, priceLabel),
      lineFor(feeKind, feeMinor, `Platform fee (${pricing.platformFeePercent}%)`),
    ],
  };
};

/** INR display figures for an agreement or notification, from a captured snapshot (or none). */
const withTaxFigures = (pricing, tax) => {
  if (!tax) return pricing;
  const inr = tax.inr || {};
  const taxMinor = Number(inr.cgstMinor || 0) + Number(inr.sgstMinor || 0) + Number(inr.igstMinor || 0);
  return {
    ...pricing,
    taxAmount: taxMinor / 100,
    taxPercent: Number(tax.rateBps || 0) / 100,
    grossAmount: Number(inr.grossMinor || 0) / 100 || roundCurrencyAmount(Number(pricing.totalAmount || 0) + taxMinor / 100),
  };
};

/**
 * A writer-entered price in INR major units, rounded to paise, or null when it is not a usable amount.
 * Empty means 0 (free). updateScript and uploadScript used to store Number(price) and the raw holdFee,
 * so a negative, NaN or string price could reach a checkout.
 */
const MAX_WRITER_PRICE_INR = 10000000;
const sanitizeWriterPrice = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_WRITER_PRICE_INR) return null;
  return Math.round(amount * 100) / 100;
};

/** The hold fee the writer set, or the platform default. One definition — it was written out five times. */
const DEFAULT_HOLD_FEE_INR = 200;
const scriptHoldFee = (script) => {
  const fee = Number(script?.holdFee);
  return Number.isFinite(fee) && fee > 0 ? roundCurrencyAmount(fee) : DEFAULT_HOLD_FEE_INR;
};

const sanitizeCustomInvestorTerms = (value = "") => String(value || "").trim();

const getContentTypeFromFormat = (format = "", explicitContentType = "") => {
  if (explicitContentType) return explicitContentType;

  const raw = String(format || "").toLowerCase().trim();
  if (!raw) return "movie";
  if (raw.includes("song")) return "songs";
  if (raw.includes("standup") || raw.includes("stand-up")) return "standup_comedy";
  if (raw.includes("dialogue")) return "dialogues";
  if (raw.includes("poet") || raw.includes("poetry")) return "poet";
  if (raw.includes("web")) return "web_series";
  if (raw.includes("documentary")) return "documentary";
  if (raw.includes("anime") || raw.includes("cartoon") || raw.includes("animation")) return "anime";
  if (raw.includes("short")) return "short_film";
  if (raw.includes("tv") || raw.includes("series")) return "tv_series";
  if (raw.includes("book")) return "book";
  if (raw.includes("startup")) return "startup";
  return "movie";
};

const getInvalidRoleAgeRangeMessage = (roles = []) => {
  if (!Array.isArray(roles)) return "";

  for (let i = 0; i < roles.length; i += 1) {
    const role = roles[i] || {};
    const min = role?.ageRange?.min;
    const max = role?.ageRange?.max;

    if (min === undefined || min === null || min === "" || max === undefined || max === null || max === "") {
      continue;
    }

    const minAge = Number(min);
    const maxAge = Number(max);
    if (!Number.isFinite(minAge) || !Number.isFinite(maxAge) || minAge > maxAge) {
      return `Role ${i + 1}: Max age must be greater than or equal to min age.`;
    }
  }

  return "";
};

const requireProjectCreatorAccess = (req, res) => {
  if (!hasProjectCreatorAccess(req.user)) {
    res.status(403).json({ message: "Only writer accounts can create or submit projects." });
    return false;
  }

  return true;
};

const isSpotlightActive = (script, now = new Date()) => {
  const endAt = script?.promotion?.spotlightEndAt;
  return Boolean(endAt && new Date(endAt) >= now);
};

const shouldAutoSyncUploadSpotlight = (script, now = new Date()) => {
  if (!script) return false;
  if (script.status !== "published") return false;
  if (isSpotlightActive(script, now)) return false;
  if (script.promotion?.lastSpotlightPurchaseAt) return false;
  // Without credits, if spotlight service was selected at upload, we consider it pending activation
  return Boolean(script.services?.spotlight);
};

const isAdminUploadedTrailer = (script) => {
  const hasUploadedTrailer = Boolean(script?.uploadedTrailerUrl && script?.trailerSource === "uploaded");
  if (!hasUploadedTrailer) return false;
  return (script?.trailerWriterFeedback?.note || "").trim() === "Trailer uploaded by admin";
};

const shouldQueueSpotlightAiTrailer = (script) => {
  const hasAiTrailer = Boolean(script?.trailerUrl);
  if (hasAiTrailer) return false;
  return !isAdminUploadedTrailer(script);
};

const applySpotlightPackageState = (script, now = new Date()) => {
  const spotlightEndsAt = new Date(now.getTime() + PROJECT_SPOTLIGHT_DURATION_DAYS * 24 * 60 * 60 * 1000);

  script.premium = true;
  script.isFeatured = true;
  script.verifiedBadge = true;
  script.services = {
    hosting: true,
    evaluation: true,
    aiTrailer: true,
    spotlight: true,
  };
  script.evaluationStatus = script.scriptScore?.overall ? "completed" : "requested";

  if (shouldQueueSpotlightAiTrailer(script) && !["requested", "generating"].includes(script.trailerStatus)) {
    script.trailerStatus = "requested";
  }

  script.promotion = {
    ...(script.promotion || {}),
    spotlightActive: true,
    pendingSpotlightActivation: false,
    spotlightStartAt: now,
    spotlightEndAt: spotlightEndsAt,
    lastSpotlightPurchaseAt: now,
  };

  script.billing = {
    ...(script.billing || {}),
    lastSpotlightActivatedAt: now,
  };

  script.markModified("services");
  script.markModified("promotion");
  script.markModified("billing");
};

const getBlockedUserIdsForViewer = async (viewerId) => {
  if (!viewerId) return [];
  const currentUser = await User.findById(viewerId).select("blockedUsers").lean();
  const usersWhoBlockedCurrent = await User.find({ blockedUsers: viewerId }).select("_id").lean();
  return [
    ...(currentUser?.blockedUsers || []),
    ...usersWhoBlockedCurrent.map((u) => u._id),
  ];
};

const hasUserInIdArray = (arr = [], userId) =>
  Array.isArray(arr) && arr.some((id) => id?.toString?.() === userId?.toString?.());

const getPublicCollaboratorRank = (entry) => {
  if (!entry) return -1;
  if (entry.isActive === true && entry.status === "accepted") return 2;
  if (entry.status === "accepted") return 1;
  return 0;
};

const getAcceptedCollaboratorSummaries = (script) => {
  const bestByUserId = new Map();

  (Array.isArray(script?.collaborators) ? script.collaborators : []).forEach((entry) => {
    if (String(entry?.status || "").trim().toLowerCase() !== "accepted") return;

    const userId = normalizeObjectId(entry?.userId);
    if (!userId) return;

    const current = bestByUserId.get(userId);
    if (!current || getPublicCollaboratorRank(entry) >= getPublicCollaboratorRank(current)) {
      bestByUserId.set(userId, entry);
    }
  });

  return [...bestByUserId.values()].map((entry) => ({
    userId: normalizeObjectId(entry?.userId),
    name: String(
      entry?.userId?.name
      || entry?.userId?.writerProfile?.username
      || entry?.userId?.username
      || "Collaborator"
    ).trim(),
    role: String(entry?.role || "").trim().toLowerCase(),
    accessLevel: String(entry?.accessLevel || "").trim().toLowerCase(),
    isActive: entry?.isActive === true,
    status: String(entry?.status || "").trim().toLowerCase(),
    joinedAt: entry?.joinedAt || null,
  }));
};

const getPublicCollaborationSummary = (script) => {
  const creatorId = normalizeObjectId(script?.creator);
  const creatorName = String(
    script?.creator?.name
    || script?.creator?.writerProfile?.username
    || script?.creator?.username
    || "Writer"
  ).trim();

  const acceptedCollaborators = getAcceptedCollaboratorSummaries(script);
  const writersWorked = [
    {
      userId: creatorId,
      name: creatorName,
      role: "writer",
      accessLevel: "full_access",
      isActive: true,
      status: "accepted",
      isCreator: true,
    },
    ...acceptedCollaborators,
  ];

  return {
    writersWorked,
    activeWriters: writersWorked.filter((entry) => entry?.isCreator || entry?.isActive === true),
  };
};

const getCollaborationStats = (script) => {
  const acceptedCollaborators = getAcceptedCollaboratorSummaries(script);
  const activeCollaborators = acceptedCollaborators.filter((entry) => entry?.isActive === true);

  return {
    totalWritersWorked: 1 + acceptedCollaborators.length,
    activeWritersWorking: 1 + activeCollaborators.length,
    acceptedCollaborators: acceptedCollaborators.length,
    activeCollaborators: activeCollaborators.length,
  };
};

const safeDecodePathSegment = (value = "") => {
  try {
    return decodeURIComponent(String(value || ""));
  } catch (_error) {
    return String(value || "");
  }
};

const normalizeProjectHeadingSegment = (value = "") =>
  safeDecodePathSegment(value)
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeWriterUsernameSegment = (value = "") =>
  safeDecodePathSegment(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]+/g, "");

const resolveScriptIdByPath = async ({ projectHeading, writerUsername }) => {
  const normalizedHeading = normalizeProjectHeadingSegment(projectHeading);
  const normalizedWriterUsername = normalizeWriterUsernameSegment(writerUsername);

  if (!normalizedHeading || !normalizedWriterUsername) {
    return "";
  }

  const creators = await User.find({
    $or: [
      { "writerProfile.username": normalizedWriterUsername },
      { username: normalizedWriterUsername },
    ],
  }).select("_id").lean();

  if (!creators.length) {
    return "";
  }

  const scripts = await Script.find({
    creator: { $in: creators.map((creator) => creator._id) },
  })
    .select("_id title createdAt")
    .sort({ createdAt: -1 })
    .lean();

  const matchedScript = scripts.find(
    (scriptDoc) => normalizeProjectHeadingSegment(scriptDoc?.title) === normalizedHeading
  );

  return matchedScript?._id ? String(matchedScript._id) : "";
};

const resolveClientOriginFromRequest = (req) => {
  const originHeader = String(req.get("origin") || "").trim();
  if (originHeader) return originHeader;

  const refererHeader = String(req.get("referer") || "").trim();
  if (refererHeader) {
    try {
      return new URL(refererHeader).origin;
    } catch (_error) {
      // Ignore malformed referer headers and fall back to env-based URL resolution.
    }
  }

  return "";
};

const getPurchaseRequesterLabel = (user = {}) => {
  const rawRole = String(user?.industryProfile?.subRole || user?.role || "").trim().toLowerCase();
  if (rawRole === "producer") return "Producer";
  if (rawRole === "director") return "Director";
  if (rawRole === "investor") return "Investor";
  if (rawRole === "industry" || rawRole === "professional") return "Industry Professional";
  return "Buyer";
};

const PURCHASE_INVOICE_PREFIX = "INV-SCP";

const buildScriptPurchaseInvoiceNumber = (paymentId = "") => {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const paymentSuffix = String(paymentId || "").replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase() || Date.now().toString().slice(-8);
  return `${PURCHASE_INVOICE_PREFIX}-${stamp}-${paymentSuffix}`;
};

const getSettledPurchaseQuery = (extra = {}) => ({
  ...extra,
  status: "approved",
  $or: [
    { paymentStatus: "released" },
    { amount: { $lte: 0 } },
  ],
});

const APPROVED_UNPAID_EXPIRY_HOURS = 72;
const APPROVED_UNPAID_EXPIRY_MS = APPROVED_UNPAID_EXPIRY_HOURS * 60 * 60 * 1000;
const APPROVED_UNPAID_EXPIRY_NOTE = `Auto-cancelled: buyer did not complete payment within ${APPROVED_UNPAID_EXPIRY_HOURS} hours of approval.`;
const APPROVED_UNPAID_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastApprovedUnpaidSweepAt = 0;

const getApprovedUnpaidExpiryCutoff = (now = new Date()) =>
  new Date(now.getTime() - APPROVED_UNPAID_EXPIRY_MS);

const getApprovedPaymentDueAt = (approvedAt = new Date()) =>
  new Date(new Date(approvedAt).getTime() + APPROVED_UNPAID_EXPIRY_MS);

const getApprovedUnpaidActiveClause = (now = new Date()) => ({
  status: "approved",
  paymentStatus: { $ne: "released" },
  amount: { $gt: 0 },
  $or: [
    { paymentDueAt: { $gt: now } },
    { paymentDueAt: { $exists: false }, updatedAt: { $gt: getApprovedUnpaidExpiryCutoff(now) } },
  ],
});

const expireApprovedUnpaidRequests = async ({ scriptId, userId, force = false } = {}) => {
  const now = new Date();
  const shouldRunGlobalSweep = !scriptId && !userId;
  if (shouldRunGlobalSweep && !force && Date.now() - lastApprovedUnpaidSweepAt < APPROVED_UNPAID_SWEEP_INTERVAL_MS) {
    return;
  }
  if (shouldRunGlobalSweep) {
    lastApprovedUnpaidSweepAt = Date.now();
  }

  const filters = [
    { status: "approved" },
    { paymentStatus: { $ne: "released" } },
    { amount: { $gt: 0 } },
    { $or: [{ paymentDueAt: { $exists: false } }, { paymentDueAt: { $lte: now } }] },
  ];
  if (scriptId) filters.push({ script: scriptId });
  if (userId) filters.push({ $or: [{ investor: userId }, { writer: userId }] });

  const requestsToProcess = await ScriptPurchaseRequest.find({ $and: filters })
    .select("_id script paymentDueAt updatedAt createdAt note")
    .lean();

  if (requestsToProcess.length === 0) {
    return;
  }

  const bulkOps = [];
  const scriptIdsToCheck = new Set();

  requestsToProcess.forEach((request) => {
    const approvedAt = request?.updatedAt || request?.createdAt || now;
    const dueAt = request?.paymentDueAt ? new Date(request.paymentDueAt) : getApprovedPaymentDueAt(approvedAt);
    const expiresNow = dueAt <= now;

    if (expiresNow) {
      const existingNote = String(request?.note || "").trim();
      const nextNote = existingNote.includes(APPROVED_UNPAID_EXPIRY_NOTE)
        ? existingNote
        : existingNote
          ? `${existingNote}\n${APPROVED_UNPAID_EXPIRY_NOTE}`
          : APPROVED_UNPAID_EXPIRY_NOTE;

      bulkOps.push({
        updateOne: {
          filter: { _id: request._id },
          update: {
            $set: {
              status: "cancelled",
              paymentStatus: "failed",
              settledAt: now,
              paymentDueAt: dueAt,
              note: nextNote,
            },
          },
        },
      });
      scriptIdsToCheck.add(request.script.toString());
      return;
    }

    if (!request?.paymentDueAt) {
      bulkOps.push({
        updateOne: {
          filter: { _id: request._id },
          update: {
            $set: {
              paymentDueAt: dueAt,
            },
          },
        },
      });
    }
  });

  if (bulkOps.length > 0) {
    await ScriptPurchaseRequest.bulkWrite(bulkOps);
  }

  if (scriptId) {
    scriptIdsToCheck.add(scriptId.toString());
  }

  const expiryCutoff = getApprovedUnpaidExpiryCutoff(now);
  for (const sid of scriptIdsToCheck) {
    const hasActiveRequests = await ScriptPurchaseRequest.exists({
      script: sid,
      $or: [
        { status: "pending" },
        {
          status: "approved",
          paymentStatus: { $ne: "released" },
          amount: { $gt: 0 },
          $or: [
            { paymentDueAt: { $gt: now } },
            { paymentDueAt: { $exists: false }, updatedAt: { $gt: expiryCutoff } },
          ],
        },
      ],
    });

    if (!hasActiveRequests) {
      const targetScript = await Script.findById(sid).select("isSold purchaseRequestLocked purchaseRequestLockedBy purchaseRequestLockedAt transactionStatus");
      if (targetScript) {
        targetScript.purchaseRequestLocked = false;
        targetScript.purchaseRequestLockedBy = null;
        targetScript.purchaseRequestLockedAt = null;
        if (!targetScript.isSold) {
          targetScript.transactionStatus = "available";
        }
        await targetScript.save();
      }
    }
  }
};

const getPurchasedUserIdSet = async (script) => {
  const approvedPurchaseRequests = await ScriptPurchaseRequest.find(
    getSettledPurchaseQuery({ script: script._id })
  ).select("investor").lean();

  const convertedOptions = await ScriptOption.find({
    script: script._id,
    status: "converted",
  }).select("holder").lean();

  return new Set(
    [
      ...(Array.isArray(script.unlockedBy) ? script.unlockedBy.map((id) => id?.toString?.()) : []),
      ...(Array.isArray(script.purchasedBy) ? script.purchasedBy.map((id) => id?.toString?.()) : []),
      ...approvedPurchaseRequests.map((row) => row?.investor?.toString?.()),
      ...convertedOptions.map((row) => row?.holder?.toString?.()),
    ].filter(Boolean)
  );
};

const detectUploadedDocType = (file) => {
  const name = String(file?.originalname || "").toLowerCase();
  const mime = String(file?.mimetype || "").toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) return "docx";
  if (mime === "application/msword" || name.endsWith(".doc")) return "doc";
  return "";
};

export const extractPdfText = async (req, res) => {
  try {
    if (!requireProjectCreatorAccess(req, res)) {
      return;
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file provided" });
    }

    const docType = detectUploadedDocType(req.file);
    if (!docType) {
      return res.status(400).json({ message: "Unsupported file type. Please upload a PDF, DOCX, or DOC file." });
    }

    const require = createRequire(import.meta.url);
    let text = "";
    let numItems = 0;
    let pageTexts = [];

    if (docType === "pdf") {
      try {
        const extraction = await extractTextFromPdfBuffer(req.file.buffer);
        text = extraction?.text || "";
        numItems = Number(extraction?.numItems) || 0;
        pageTexts = Array.isArray(extraction?.pageTexts) ? extraction.pageTexts : [];
      } catch (parseError) {
        console.warn("[extractPdfText] PDF extraction failed:", parseError?.message || parseError);
        text = "";
      }
    } else if (docType === "docx") {
      try {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        text = formatScreenplayLikeText(normalizeExtractedPdfText(result?.value || ""));
      } catch (docxError) {
        console.error("[extractPdfText] docx parse failed:", docxError?.message || docxError);
        return res.status(422).json({
          message: "We couldn't extract readable text from this DOCX file.",
        });
      }
    } else if (docType === "doc") {
      return res.status(415).json({
        message: "Legacy .doc files aren't supported. Please save your file as .docx or .pdf and try again.",
      });
    }

    const trimmedText = text.trim();
    if (!trimmedText) {
      return res.status(400).json({
        message: "We couldn't extract readable text from this PDF. It may be scanned, image-based, or protected. Please upload a text-based PDF.",
      });
    }

    let uploadedPdfUrl = "";
    let fileGrant = "";
    let uploadWarning = "";
    if (docType === "pdf") {
      try {
        const uploadOptions = {
          folder: "scriptbridge/scripts",
          resource_type: "raw",
          public_id: `script-${req.user?._id || "user"}-${Date.now()}`,
          format: "pdf",
        };
        const uploadResult = await uploadToCloudinary(req.file.buffer, uploadOptions);
        uploadedPdfUrl = normalizeTrustedRemoteAssetUrl(uploadResult?.secure_url || "");
        fileGrant = createRemoteAssetGrant({
          url: uploadedPdfUrl,
          ownerId: req.user?._id,
          publicId: uploadResult?.public_id || "",
          purpose: "script-source",
          format: "pdf",
        });
      } catch (uploadError) {
        console.error("File upload to Cloudinary failed:", uploadError?.message || uploadError);
        uploadedPdfUrl = "";
        fileGrant = "";
        // Told to the writer rather than swallowed. The text still imported, so failing the whole
        // request would throw away work that succeeded — but answering a bare 200 meant a storage
        // outage looked identical to a success, and "upload isn't working" was the only signal
        // anyone got. They can carry on editing; they just should not believe the PDF was kept.
        uploadWarning = "Your script text imported successfully, but the original PDF could not be stored. "
          + "You can keep editing — re-upload later if you need the source file attached.";
      }
    }

    // Strip the source PDF's page furniture (running header, page numbers, "(CONTINUED)") before
    // the editor receives it — otherwise it lands in the script body, surfaces as content in the
    // viewable-script preview, and skews pagination. Conservative by design: character cues repeat
    // exactly like a running header, so only unambiguous furniture is removed.
    const cleanedText = stripPdfPageFurniture(text, { title: req.body?.title || "" });
    const cleanedPageTexts = Array.isArray(pageTexts)
      ? pageTexts.map((page) => stripPdfPageFurniture(String(page || ""), { title: req.body?.title || "" }))
      : [];

    res.json({
      text: cleanedText,
      numItems,
      pageTexts: cleanedPageTexts,
      fileUrl: uploadedPdfUrl,
      fileGrant,
      sourceMode: uploadedPdfUrl ? "uploaded-pdf" : "imported-text",
      extractedTextAvailable: true,
      // A storage failure outranks the docx note: it is the one the writer has to act on.
      extractionWarning: uploadWarning || (docType === "docx"
        ? "Word documents are imported as editable script text. The full script PDF is generated from the editor."
        : ""),
    });
  } catch (error) {
    console.error("Document Extraction Error:", error);
    res.status(500).json({ message: "Failed to extract text from document", error: error.message });
  }
};

// GET /scripts/script-limit → the caller's current writer script-limit status, so the create/
// upload UI can show the gate UPFRONT and block progression instead of only erroring at submit.
export const getScriptLimit = async (req, res) => {
  try {
    if (!writerLimitApplies(req.user.role)) {
      return res.json({ applies: false, limitReached: false });
    }
    const cycleStart = getScriptUploadCycleStart(req.user);
    const usedQuery = { creator: req.user._id, status: { $ne: "draft" }, isDeleted: { $ne: true } };
    if (cycleStart) {
      usedQuery.createdAt = { $gte: cycleStart };
    }
    const used = await Script.countDocuments(usedQuery);
    return res.json({ applies: true, ...buildScriptLimitStatus(req.user.subscription?.plan, used, { verb: "create" }) });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to read script limit." });
  }
};

// Body fields a `content_only` co-writer may change during a duet autosave. Everything else on the
// draft is listing metadata and stays owner/full_access-only.
const CO_WRITER_CONTENT_FIELDS = new Set(["fountainContent", "sceneSynopses", "outlineNotes", "titlePage"]);

export const saveDraft = async (req, res) => {
  try {
    if (!requireProjectCreatorAccess(req, res)) {
      return;
    }

    const { scriptId, title, textContent, baseContent, ...otherData } = req.body;
    const hasScriptId = scriptId !== undefined && scriptId !== null && scriptId !== "";
    const draftObjectId = hasScriptId ? parseMongoObjectId(scriptId) : null;
    if (hasScriptId && !draftObjectId) {
      return res.status(400).json({ message: "Invalid draft ID." });
    }

    // Enforce Writer limits for new drafts (shared rule — see utils/scriptLimits.js)
    if (!draftObjectId && writerLimitApplies(req.user.role)) {
      const cycleStart = getScriptUploadCycleStart(req.user);
      const usedQuery = { creator: req.user._id, status: { $ne: "draft" }, isDeleted: { $ne: true } };
      if (cycleStart) {
        usedQuery.createdAt = { $gte: cycleStart };
      }
      const used = await Script.countDocuments(usedQuery);
      const status = buildScriptLimitStatus(req.user.subscription?.plan, used, { verb: "create" });
      if (status.limitReached) {
        return res.status(402).json({ message: status.message, limitReached: true, requiredPlan: status.requiredPlan });
      }
    }

    // If we have an ID, update the existing draft
    if (draftObjectId) {
      const script = await Script.findById(draftObjectId);
      if (!script) return res.status(404).json({ message: "Script not found" });

      // Duet co-writing: the owner OR an accepted collaborator with write access may save the shared
      // draft. This lookup used to be creator-only, so an invited co-writer's every autosave 404'd and
      // their work was silently lost.
      const isDraftOwner = String(script.creator) === String(req.user._id);
      let canEditDraftMetadata = true;
      if (!isDraftOwner) {
        if (!hasScriptPermission(script, req.user._id, "write")) {
          return res.status(404).json({ message: "Script not found" });
        }
        canEditDraftMetadata = resolveCollaboratorAccessLevel(script, req.user._id) !== "content_only";
        if (!canEditDraftMetadata) {
          for (const key of Object.keys(otherData)) {
            if (!CO_WRITER_CONTENT_FIELDS.has(key)) delete otherData[key];
          }
        }
      }

      if (script.isDeleted) {
        return res.status(410).json({ message: "This project was deleted by creator and can no longer be edited." });
      }

      // A competition submission is final. The entry also stores a frozen snapshot, so this guard is
      // belt-and-braces — but it must exist on every write path or "submitted" would not mean final.
      if (script.competitionLocked) {
        return res.status(409).json({ message: "This script was submitted to a competition and is locked." });
      }

      if (script.status !== "draft") {
        if (script.status === "pending_approval" && script.approvalRequestType === "edit_submission") {
          return res.status(409).json({ message: "Your edited project is already under admin review. You can edit again after approval or rejection." });
        }
        return res.status(409).json({ message: "Only draft projects can be autosaved as drafts." });
      }

      if (canEditDraftMetadata) script.title = title || script.title;

      // Duet-safe content write. Each co-writer edits their own full copy of the script, so a plain
      // assignment means whoever saves last silently wipes the other's scenes. When the script has
      // co-writers we instead replay this client's delta (baseContent -> proposed) onto the stored
      // content, so independent saves converge. Solo drafts keep the original overwrite path.
      const hasCoWriters = (script.collaborators || []).some(
        (collab) => collab?.isActive === true && collab?.status === "accepted"
      );
      const mergeContentField = (currentValue, proposedValue) => {
        if (proposedValue === undefined) return currentValue;
        if (!hasCoWriters || typeof baseContent !== "string" || !baseContent) return proposedValue;
        return applyThreeWayMerge({
          currentContent: String(currentValue || ""),
          baseContent,
          proposedContent: proposedValue,
        }).mergedContent;
      };

      script.textContent = mergeContentField(script.textContent, textContent);
      if (otherData.fountainContent !== undefined) {
        script.fountainContent = mergeContentField(script.fountainContent, otherData.fountainContent);
      }
      if (otherData.sceneSynopses !== undefined) {
        // Corkboard synopses: a plain map of normalized-heading -> one-line summary. Coerce to
        // strings and cap each line so it stays lightweight metadata.
        const incoming = otherData.sceneSynopses && typeof otherData.sceneSynopses === "object" ? otherData.sceneSynopses : {};
        const cleaned = {};
        for (const [k, v] of Object.entries(incoming)) {
          if (k && String(v || "").trim()) cleaned[k] = String(v).slice(0, 300);
        }
        script.sceneSynopses = cleaned;
        script.markModified("sceneSynopses");
      }
      if (otherData.outlineNotes !== undefined) {
        script.outlineNotes = String(otherData.outlineNotes || "").slice(0, 50000);
      }
      if (otherData.titlePage !== undefined) {
        // Title page: a small map of known fields. null/empty clears it. Coerce + cap each value.
        const tp = otherData.titlePage && typeof otherData.titlePage === "object" ? otherData.titlePage : null;
        const cleaned = {};
        if (tp) for (const [k, v] of Object.entries(tp)) { if (k && String(v || "").trim()) cleaned[k] = String(v).slice(0, 300); }
        script.titlePage = Object.keys(cleaned).length ? cleaned : undefined;
        script.markModified("titlePage");
      }
      // Authorship credits — listing metadata, so a content_only co-writer cannot rewrite them
      // (`writers` is deliberately absent from CO_WRITER_CONTENT_FIELDS).
      if (otherData.writers !== undefined && canEditDraftMetadata) {
        script.writers = normalizeWriterCredits(otherData.writers);
        script.markModified("writers");
      }
      if (otherData.companyName !== undefined) script.companyName = String(otherData.companyName || "").trim();
      if (otherData.logline !== undefined) script.logline = otherData.logline;
      if (otherData.synopsis !== undefined) {
        script.synopsis = otherData.synopsis;
        script.description = otherData.synopsis;
      }
      if (otherData.format !== undefined) {
        script.format = otherData.format;
        if (otherData.format !== "other") {
          script.formatOther = "";
        }
        script.contentType = getContentTypeFromFormat(otherData.format);
      }
      if (otherData.contentType !== undefined) script.contentType = otherData.contentType;
      if (otherData.formatOther !== undefined) {
        script.formatOther = String(otherData.formatOther || "").trim();
      }
      if (otherData.pageCount !== undefined) script.pageCount = Number(otherData.pageCount) || 0;
      if (otherData.fileUrl !== undefined || otherData.scriptUrl !== undefined) {
        const submittedFile = resolveSubmittedScriptFile({
          scriptUrl: otherData.scriptUrl,
          fileUrl: otherData.fileUrl,
          fileGrant: otherData.fileGrant,
          ownerId: req.user._id,
          currentUrl: script.fileUrl,
        });
        script.fileUrl = submittedFile.url;
      }
      script.projectSource = String(script.fileUrl || "").trim() ? "uploaded" : "editor";
      if (otherData.collabVisibility !== undefined) {
        const normalizedCollabVisibility = String(otherData.collabVisibility || "").trim().toLowerCase();
        if (["open", "private"].includes(normalizedCollabVisibility)) {
          script.collabVisibility = normalizedCollabVisibility;
        }
      }
      if (otherData.primaryGenre !== undefined) script.primaryGenre = otherData.primaryGenre;
      if (otherData.tags !== undefined) script.tags = Array.isArray(otherData.tags) ? otherData.tags : [];
      if (otherData.roles !== undefined) {
        const nextRoles = Array.isArray(otherData.roles) ? otherData.roles : [];
        const ageRangeError = getInvalidRoleAgeRangeMessage(nextRoles);
        if (ageRangeError) {
          return res.status(400).json({ message: ageRangeError });
        }
        script.roles = nextRoles;
      }
      if (otherData.classification !== undefined) {
        script.classification = {
          primaryGenre: otherData.classification?.primaryGenre ?? script.classification?.primaryGenre,
          secondaryGenre: otherData.classification?.secondaryGenre ?? script.classification?.secondaryGenre,
          tones: otherData.classification?.tones ?? script.classification?.tones ?? [],
          themes: otherData.classification?.themes ?? script.classification?.themes ?? [],
          settings: otherData.classification?.settings ?? script.classification?.settings ?? [],
        };
        script.markModified("classification");
      }
      if (otherData.scriptCompletion !== undefined) {
        const completionErrors = validateScriptCompletionPayload(otherData.scriptCompletion || {});
        if (completionErrors.length > 0) {
          return res.status(400).json({ message: completionErrors[0] });
        }
        script.scriptCompletion = normalizeScriptCompletionInput(
          otherData.scriptCompletion || {},
          script.scriptCompletion || {}
        );
        script.markModified("scriptCompletion");
      }
      if (otherData.viewableScript !== undefined) {
        script.viewableScript = Boolean(otherData.viewableScript);
      }
      if (otherData.scriptPreviewAccess !== undefined) {
        script.scriptPreviewAccess = normalizeScriptPreviewAccess(otherData.scriptPreviewAccess || {}, {
          mode: otherData.scriptPreviewAccess?.mode || script.scriptPreviewAccess?.mode || "pages",
          start: otherData.scriptPreviewAccess?.start || script.scriptPreviewAccess?.start || 1,
          end: otherData.scriptPreviewAccess?.end || script.scriptPreviewAccess?.end || 8,
          // Clamp against the preview PAGES the window slices — not pageCount, which comes from a
          // different estimator and, when it lagged (estimate 1, real pages 3), silently shrank the
          // writer's saved window. Incoming texts first: they are assigned just below this call.
          maxUnits: Number(
            (Array.isArray(otherData.scriptPreviewPageTexts) && otherData.scriptPreviewPageTexts.length)
            || (Array.isArray(script.scriptPreviewPageTexts) && script.scriptPreviewPageTexts.length)
            || script.pageCount
            || 0
          ),
        });
        script.markModified("scriptPreviewAccess");
      }
      if (otherData.scriptPreviewPageTexts !== undefined) {
        script.scriptPreviewPageTexts = Array.isArray(otherData.scriptPreviewPageTexts)
          ? otherData.scriptPreviewPageTexts.map((page) => String(page || ""))
          : [];
      }
      // Same backfill as updateScript: a viewable editor script must never be left with no preview
      // pages, since there is no PDF to fall back on.
      if (script.viewableScript && !(script.scriptPreviewPageTexts || []).some((page) => String(page || "").trim())) {
        const derived = derivePreviewPageTexts(script);
        if (derived.length) {
          script.scriptPreviewPageTexts = derived;
          script.markModified("scriptPreviewPageTexts");
        }
      }
      if (otherData.services !== undefined) {
        const incomingServices = otherData.services || {};
        script.services = {
          hosting: incomingServices.hosting !== undefined ? Boolean(incomingServices.hosting) : true,
          evaluation: Boolean(incomingServices.evaluation),
          aiTrailer: Boolean(incomingServices.aiTrailer),
          spotlight: Boolean(incomingServices.spotlight),
        };
        script.markModified("services");
      }
      if (otherData.filmDetails !== undefined) {
        const incomingFilmDetails = otherData.filmDetails || {};
        script.filmDetails = {
          filmLanguage: String(incomingFilmDetails.filmLanguage || "").trim().slice(0, 100),
          dialoguesPresent: ["yes", "no", "partial"].includes(incomingFilmDetails.dialoguesPresent)
            ? incomingFilmDetails.dialoguesPresent
            : (script.filmDetails?.dialoguesPresent || "yes"),
          wantToDirect: Boolean(incomingFilmDetails.wantToDirect),
          wantToProduce: Boolean(incomingFilmDetails.wantToProduce),
          scriptStyle: Array.isArray(incomingFilmDetails.scriptStyle)
            ? incomingFilmDetails.scriptStyle.map((style) => String(style || "")).filter(Boolean).slice(0, 8)
            : [],
        };
        script.markModified("filmDetails");
      }
      if (otherData.premium !== undefined || otherData.price !== undefined) {
        const nextPrice = Math.max(0, Number(otherData.price ?? script.price ?? 0) || 0);
        script.premium = Boolean(otherData.premium) && nextPrice > 0;
        script.price = script.premium ? nextPrice : 0;
      }

      if (otherData.legal !== undefined) {
        const incomingLegal = otherData.legal || {};
        const nextCustomInvestorTerms = sanitizeCustomInvestorTerms(incomingLegal.customInvestorTerms);
        if (nextCustomInvestorTerms.length > MAX_CUSTOM_INVESTOR_TERMS_LENGTH) {
          return res.status(400).json({ message: `Custom investor terms must be ${MAX_CUSTOM_INVESTOR_TERMS_LENGTH} characters or fewer.` });
        }

        const previousCustomInvestorTerms = sanitizeCustomInvestorTerms(script.legal?.customInvestorTerms);
        const hasChangedCustomTerms = previousCustomInvestorTerms !== nextCustomInvestorTerms;

        script.legal = {
          ...(script.legal || {}),
          agreedToTerms: incomingLegal.agreedToTerms ?? script.legal?.agreedToTerms ?? false,
          termsVersion: incomingLegal.termsVersion || script.legal?.termsVersion || SCRIPT_UPLOAD_TERMS_VERSION,
          customInvestorTerms: nextCustomInvestorTerms,
          customInvestorTermsUpdatedAt: hasChangedCustomTerms
            ? new Date()
            : (script.legal?.customInvestorTermsUpdatedAt || undefined),
        };
      }

      if (otherData.rightsLicensing !== undefined) {
        const normalizedRights = normalizeRightsLicensingInput(
          otherData.rightsLicensing || {},
          script.rightsLicensing || {}
        );
        script.rightsLicensing = {
          ...(script.rightsLicensing || {}),
          ...normalizedRights,
        };
        script.markModified("rightsLicensing");
      }

      // Publishing layer fields
      if (otherData.targetIndustry !== undefined) {
        script.targetIndustry = Array.isArray(otherData.targetIndustry) ? otherData.targetIndustry : ["film"];
      }
      if (otherData.publishingDetails !== undefined) {
        const pd = otherData.publishingDetails || {};
        script.publishingDetails = {
          enabled: Boolean(pd.enabled),
          storyFormat: Array.isArray(pd.storyFormat) ? pd.storyFormat : [],
          writingStyle: Array.isArray(pd.writingStyle) ? pd.writingStyle : [],
          targetAudience: Array.isArray(pd.targetAudience) ? pd.targetAudience : [],
          estimatedWordCount: String(pd.estimatedWordCount || "").trim().slice(0, 60),
          seriesPotential: pd.seriesPotential || undefined,
          bookPitch: String(pd.bookPitch || "").trim().slice(0, 2500),
          proseSample: String(pd.proseSample || "").trim().slice(0, 5000),
          proseSampleGeneratedAt: pd.proseSampleGeneratedAt ? new Date(pd.proseSampleGeneratedAt) : script.publishingDetails?.proseSampleGeneratedAt,
          previewContent: pd.previewContent || "none",
          publishingRights: pd.publishingRights ? {
            rightsBundle: pd.publishingRights.rightsBundle || "custom",
            bookPublishing: Boolean(pd.publishingRights.bookPublishing),
            digitalPublishing: Boolean(pd.publishingRights.digitalPublishing),
            audiobookRights: Boolean(pd.publishingRights.audiobookRights),
            territory: Array.isArray(pd.publishingRights.territory) ? pd.publishingRights.territory : [],
            territorySpecific: String(pd.publishingRights.territorySpecific || "").trim().slice(0, 300),
            languages: Array.isArray(pd.publishingRights.languages) ? pd.publishingRights.languages : [],
            adaptationRights: Array.isArray(pd.publishingRights.adaptationRights) ? pd.publishingRights.adaptationRights : [],
            exclusivity: pd.publishingRights.exclusivity || "non_exclusive",
            durationYears: String(pd.publishingRights.durationYears || "").trim().slice(0, 60),
            paymentType: pd.publishingRights.paymentType || "one_time_upfront",
            modificationRights: pd.publishingRights.modificationRights || "buyer_must_consult_writer",
          } : (script.publishingDetails?.publishingRights || {}),
        };
        script.markModified("publishingDetails");
      }

      await script.save();
      return res.json(script);
    }

    // Otherwise create a new draft
    const {
      _id,
      id,
      sid,
      fileUrl: submittedFileUrl,
      scriptUrl: submittedScriptUrl,
      fileGrant,
      projectSource: ignoredProjectSource,
      ...safeOtherData
    } = otherData || {};
    const submittedFile = resolveSubmittedScriptFile({
      scriptUrl: submittedScriptUrl,
      fileUrl: submittedFileUrl,
      fileGrant,
      ownerId: req.user._id,
    });
    safeOtherData.fileUrl = submittedFile.url;
    safeOtherData.projectSource = submittedFile.url ? "uploaded" : "editor";

    if (safeOtherData.legal !== undefined) {
      const incomingLegal = safeOtherData.legal || {};
      const nextCustomInvestorTerms = sanitizeCustomInvestorTerms(incomingLegal.customInvestorTerms);
      if (nextCustomInvestorTerms.length > MAX_CUSTOM_INVESTOR_TERMS_LENGTH) {
        return res.status(400).json({ message: `Custom investor terms must be ${MAX_CUSTOM_INVESTOR_TERMS_LENGTH} characters or fewer.` });
      }

      safeOtherData.legal = {
        ...(incomingLegal || {}),
        customInvestorTerms: nextCustomInvestorTerms,
        customInvestorTermsUpdatedAt: nextCustomInvestorTerms ? new Date() : undefined,
      };
    }

    if (safeOtherData.rightsLicensing !== undefined) {
      safeOtherData.rightsLicensing = normalizeRightsLicensingInput(
        safeOtherData.rightsLicensing || {},
        {}
      );
    }

    if (safeOtherData.titlePage !== undefined) {
      const tp = safeOtherData.titlePage && typeof safeOtherData.titlePage === "object" ? safeOtherData.titlePage : null;
      const cleaned = {};
      if (tp) for (const [k, v] of Object.entries(tp)) { if (k && String(v || "").trim()) cleaned[k] = String(v).slice(0, 300); }
      safeOtherData.titlePage = Object.keys(cleaned).length ? cleaned : undefined;
    }

    if (safeOtherData.scriptCompletion !== undefined) {
      const completionErrors = validateScriptCompletionPayload(safeOtherData.scriptCompletion || {});
      if (completionErrors.length > 0) {
        return res.status(400).json({ message: completionErrors[0] });
      }
      safeOtherData.scriptCompletion = normalizeScriptCompletionInput(
        safeOtherData.scriptCompletion || {},
        {}
      );
    }
    if (safeOtherData.viewableScript !== undefined) {
      safeOtherData.viewableScript = Boolean(safeOtherData.viewableScript);
    }
    if (safeOtherData.scriptPreviewAccess !== undefined) {
      safeOtherData.scriptPreviewAccess = normalizeScriptPreviewAccess(safeOtherData.scriptPreviewAccess || {}, {
        mode: safeOtherData.scriptPreviewAccess?.mode || "pages",
        start: safeOtherData.scriptPreviewAccess?.start || 1,
        end: safeOtherData.scriptPreviewAccess?.end || 8,
        maxUnits: Number(
          (Array.isArray(safeOtherData.scriptPreviewPageTexts) && safeOtherData.scriptPreviewPageTexts.length)
          || safeOtherData.pageCount
          || 0
        ),
      });
    }
    if (safeOtherData.scriptPreviewPageTexts !== undefined) {
      safeOtherData.scriptPreviewPageTexts = Array.isArray(safeOtherData.scriptPreviewPageTexts)
        ? safeOtherData.scriptPreviewPageTexts.map((page) => String(page || ""))
        : [];
    }
    if (safeOtherData.services !== undefined) {
      const incomingServices = safeOtherData.services || {};
      safeOtherData.services = {
        hosting: incomingServices.hosting !== undefined ? Boolean(incomingServices.hosting) : true,
        evaluation: Boolean(incomingServices.evaluation),
        aiTrailer: Boolean(incomingServices.aiTrailer),
        spotlight: Boolean(incomingServices.spotlight),
      };
    }
    if (safeOtherData.filmDetails !== undefined) {
      const incomingFilmDetails = safeOtherData.filmDetails || {};
      safeOtherData.filmDetails = {
        filmLanguage: String(incomingFilmDetails.filmLanguage || "").trim().slice(0, 100),
        dialoguesPresent: ["yes", "no", "partial"].includes(incomingFilmDetails.dialoguesPresent)
          ? incomingFilmDetails.dialoguesPresent
          : "yes",
        wantToDirect: Boolean(incomingFilmDetails.wantToDirect),
        wantToProduce: Boolean(incomingFilmDetails.wantToProduce),
        scriptStyle: Array.isArray(incomingFilmDetails.scriptStyle)
          ? incomingFilmDetails.scriptStyle.map((style) => String(style || "")).filter(Boolean).slice(0, 8)
          : [],
      };
    }
    if (safeOtherData.premium !== undefined || safeOtherData.price !== undefined) {
      const nextPrice = Math.max(0, Number(safeOtherData.price || 0) || 0);
      safeOtherData.premium = Boolean(safeOtherData.premium) && nextPrice > 0;
      safeOtherData.price = safeOtherData.premium ? nextPrice : 0;
    }

    const newDraft = await Script.create({
      creator: req.user._id,
      title: title || "Untitled Draft",
      textContent: textContent || "",
      status: "draft",
      ...safeOtherData,
      contentType: getContentTypeFromFormat(safeOtherData.format, safeOtherData.contentType),
    });

    res.status(201).json(newDraft);
  } catch (error) {
    console.error("[saveDraft] failed:", error.message);
    if (error instanceof RemoteAssetPolicyError) {
      return sendRemoteAssetError(res, error);
    }
    res.status(500).json({ message: error.message });
  }
};

export const deleteScript = async (req, res) => {
  try {
    const script = await Script.findById(req.params.id);
    if (!script) return res.status(404).json({ message: "Script not found" });
    if (script.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (script.isDeleted) {
      return res.json({ message: "Project already deleted", softDeleted: true });
    }

    // A submitted competition entry is evidence in a judged event — deleting it would leave the entry
    // pointing at a dead script and let a writer withdraw after the deadline.
    if (script.competitionLocked) {
      return res.status(409).json({ message: "This script was submitted to a competition and cannot be deleted." });
    }

    const purchasedUserIds = await getPurchasedUserIdSet(script);
    if (purchasedUserIds.size > 0) {
      const mergedIds = Array.from(purchasedUserIds).map((id) => new mongoose.Types.ObjectId(id));
      script.unlockedBy = mergedIds;
      script.purchasedBy = mergedIds;
    }

    script.isDeleted = true;
    script.deletedAt = new Date();
    script.purchaseRequestLocked = false;
    script.purchaseRequestLockedBy = null;
    script.purchaseRequestLockedAt = null;
    await script.save();

    console.info("[AUDIT] Script soft deleted", {
      scriptId: script._id.toString(),
      scriptSid: script.sid || "",
      deletedBy: req.user._id.toString(),
      purchasedUserCount: purchasedUserIds.size,
      deletedAt: script.deletedAt.toISOString(),
    });

    if (script.status !== "draft") {
      await notifyAdminWorkflowEvent({
        title: "Writer Project Deleted",
        section: "approvals",
        actorId: req.user._id,
        scriptId: script._id,
        message: `Project "${script.title}" was deleted by the creator (soft-delete).`,
        metadata: {
          scriptId: script._id,
          scriptSid: script.sid || "",
          writerId: req.user._id,
          isDeleted: true,
          purchasedUserCount: purchasedUserIds.size,
        },
      }).catch(() => null);
    }

    return res.json({
      message: purchasedUserIds.size > 0
        ? "Project removed from platform listings. Existing buyers retain access."
        : "Project removed from platform listings.",
      softDeleted: true,
      isDeleted: true,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getMyDrafts = async (req, res) => {
  try {
    // Include drafts the user co-writes (accepted, active collaborator) — otherwise an invited
    // co-writer has no way back into the shared script after closing the editor.
    const drafts = await Script.find({
      status: "draft",
      isDeleted: { $ne: true },
      // A competition entry is reached from the challenge dashboard while the event is running, so
      // it stays out of the normal drafts list. Once the competition releases it (results declared)
      // it becomes an ordinary draft again and belongs here — otherwise the writer could not find
      // the script they have just been given back.
      $nor: [{ competitionId: { $ne: null }, competitionReleasedAt: null }],
      $or: [
        { creator: req.user._id },
        {
          collaborators: {
            $elemMatch: { userId: req.user._id, status: "accepted", isActive: true },
          },
        },
      ],
    })
      .sort({ updatedAt: -1 })
      .lean();
    res.json(drafts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getMyScripts = async (req, res) => {
  try {
    const includeCollaborations = ["1", "true", "yes"].includes(
      String(req.query.includeCollaborations || "").trim().toLowerCase()
    );

    const query = includeCollaborations
      ? {
        isDeleted: { $ne: true },
        $or: [
          { creator: req.user._id },
          {
            collaborators: {
              $elemMatch: {
                userId: req.user._id,
                status: "accepted",
                isActive: true,
              },
            },
          },
        ],
      }
      : { creator: req.user._id, isDeleted: { $ne: true } };

    const scripts = await Script.find(query)
      .sort({ createdAt: -1 })
      .select("_id title logline description synopsis genre contentType coverImage premium price views services scriptScore platformScore status adminApproved rejectionReason creator collaborators collabVisibility format formatOther billing promotion verifiedBadge createdAt publishedAt updatedAt")
  .populate("creator", "name profileImage username writerProfile.username")
      .lean();

    const response = includeCollaborations
      ? scripts.map((script) => {
        const creatorId = String(script?.creator?._id || script?.creator || "");
        const isCreatorOwned = creatorId === String(req.user._id);
        const collaboratorEntry = Array.isArray(script?.collaborators)
          ? script.collaborators.find((entry) =>
            String(entry?.userId?._id || entry?.userId || "") === String(req.user._id)
            && entry?.status === "accepted"
            && entry?.isActive === true
          )
          : null;

        return {
          ...script,
          isCreatorOwned,
          isCollaborator: !isCreatorOwned && Boolean(collaboratorEntry),
          collaboratorRole: collaboratorEntry?.role || null,
          collaboratorAccessLevel: collaboratorEntry?.accessLevel || null,
          // Mirror PERMISSIONS.write (full_admin + editor) — hardcoding "editor" here dropped
          // Co-owners, who do have write access, so their scripts looked read-only in this list.
          canEditScript: isCreatorOwned || hasScriptPermission(script, req.user._id, "write"),
          canEditMetadata: isCreatorOwned,
        };
      })
      : scripts;

    res.json(response);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateScript = async (req, res) => {
  try {
    const scriptObjectId = parseMongoObjectId(req.params.id);
    if (!scriptObjectId) {
      return res.status(400).json({ message: "Invalid script ID." });
    }
    const script = await Script.findById(scriptObjectId);
    if (!script) return res.status(404).json({ message: "Script not found" });

    if (script.competitionLocked) {
      return res.status(409).json({ message: "This script was submitted to a competition and is locked." });
    }

    const isOwner = script.creator.toString() === req.user._id.toString();
    const canCollaboratorWrite = hasScriptPermission(script, req.user._id, "write");
    const canEditMetadata = canEditScriptMetadata(script, req.user._id);
    const isContentOnlyCollaborator = !isOwner;

    if (!isOwner && !canCollaboratorWrite && !canEditMetadata) {
      return res.status(403).json({ message: "Not authorized to edit this script" });
    }

    if (script.isDeleted) {
      return res.status(410).json({ message: "This project was deleted by creator and can no longer be edited." });
    }
    if (script.status === "pending_approval" && script.approvalRequestType === "edit_submission") {
      return res.status(409).json({ message: "Your edited project is already under admin review. You can edit again after approval or rejection." });
    }

    const {
      title, logline, format, pageCount, classification,
      formatOther,
      scriptUrl, description, synopsis, textContent, fileUrl, fileGrant,
      coverImage, genre, contentType, premium, price, roles, tags, budget, holdFee, services, legal, collabVisibility,
      scriptPreviewAccess,
      viewableScript,
      scriptPreviewPageTexts,
      rightsLicensing,
      scriptCompletion,
      // Publishing layer
      targetIndustry,
      publishingDetails,
      filmDetails,
    } = req.body;

    // Enforce Free Tier restrictions on premium services (adding new ones)
    if (!isContentOnlyCollaborator && services && ["writer", "creator"].includes(String(req.user.role).toLowerCase())) {
      const plan = String(req.user.subscription?.plan || "free").toLowerCase();
      if (plan === "free" || plan === "none") {
        const tryingToAddEvaluation = services.evaluation && !script.services?.evaluation;
        const tryingToAddTrailer = services.aiTrailer && !script.services?.aiTrailer;
        const tryingToAddSpotlight = services.spotlight && !script.services?.spotlight;
        
        if (tryingToAddEvaluation || tryingToAddTrailer || tryingToAddSpotlight) {
          return res.status(403).json({
            message: "Premium services (Evaluation, AI Trailer, Spotlight) are not available on the Free plan. Please upgrade your plan.",
            requiresUpgrade: true
          });
        }
      }
    }

    // Co-writers edit the shared script directly (live collaboration), so a content change from a
    // non-owner is applied in place rather than parked as a revision for approval. Settings remain
    // owner-only.
    const collaboratorEditingContent = !isOwner
      && textContent !== undefined
      && String(textContent) !== String(script.textContent || "");

    if (!isOwner && !collaboratorEditingContent) {
      return res.status(403).json({
        message: "Only the project owner can edit project settings. Collaborators can edit script content.",
      });
    }

    if (collaboratorEditingContent) {
      if (!canCollaboratorWrite) {
        return res.status(403).json({ message: "Not authorized to edit script content" });
      }
    }

    if (!isContentOnlyCollaborator && !legal?.agreedToTerms) {
      return res.status(400).json({ message: "Script Upload Terms & Conditions acceptance is required." });
    }

    let normalizedRights = script.rightsLicensing || {};
    // Declared out here because two separate `if (!isContentOnlyCollaborator)` blocks below both
    // need it — scoping it to the first one made the second throw ReferenceError.
    let resolvedPreviewPageTexts = [];

    if (!isContentOnlyCollaborator) {
      resolvedPreviewPageTexts = Array.isArray(scriptPreviewPageTexts)
        ? scriptPreviewPageTexts.map((value) => String(value || "").trim())
        : [];
      if (!resolvedPreviewPageTexts.length && typeof scriptPreviewPageTexts === "string" && scriptPreviewPageTexts.trim()) {
        try {
          const parsedPreviewTexts = JSON.parse(scriptPreviewPageTexts);
          if (Array.isArray(parsedPreviewTexts)) {
            resolvedPreviewPageTexts = parsedPreviewTexts.map((value) => String(value || "").trim());
          }
        } catch {
          resolvedPreviewPageTexts = [];
        }
      }
      const rawRightsLicensing = rightsLicensing || script.rightsLicensing || {};
      const rightsValidationErrors = validateRightsLicensingPayload(rawRightsLicensing);
      if (rightsValidationErrors.length > 0) {
        return res.status(400).json({ message: rightsValidationErrors[0] });
      }
      normalizedRights = normalizeRightsLicensingInput(
        rawRightsLicensing,
        script.rightsLicensing || {}
      );
      normalizedRights.legalAcknowledgement = {
        ...(normalizedRights.legalAcknowledgement || {}),
        acknowledgedAt: normalizedRights?.legalAcknowledgement?.acknowledgedAt || new Date(),
        ipAddress: normalizedRights?.legalAcknowledgement?.ipAddress || getRequestIpAddress(req),
      };
    }

    const completionValidationErrors = validateScriptCompletionPayload(
      scriptCompletion || script.scriptCompletion || {}
    );
    if (completionValidationErrors.length > 0) {
      return res.status(400).json({ message: completionValidationErrors[0] });
    }

    if (logline !== undefined && String(logline).trim().length > 500) {
      return res.status(400).json({ message: "Logline must be 500 characters or fewer" });
    }

    if (format === "other" && !String(formatOther || script.formatOther || "").trim()) {
      return res.status(400).json({ message: "Please specify the format when selecting Other." });
    }

    if (!isContentOnlyCollaborator) {
      if (title !== undefined) script.title = title;
      if (logline !== undefined) script.logline = logline;
      if (format) {
        script.format = format;
        if (format !== "other") {
          script.formatOther = "";
        }
        if (contentType === undefined) {
          script.contentType = getContentTypeFromFormat(format);
        }
      }
      if (contentType !== undefined) script.contentType = contentType;
      if (formatOther !== undefined) {
        script.formatOther = String(formatOther || "").trim();
      }
      if (pageCount !== undefined) script.pageCount = Number(pageCount);
      if (viewableScript !== undefined) {
        script.viewableScript = Boolean(viewableScript);
      }
      if (scriptPreviewAccess !== undefined) {
        script.scriptPreviewAccess = normalizeScriptPreviewAccess(scriptPreviewAccess || {}, {
          mode: scriptPreviewAccess?.mode || script.scriptPreviewAccess?.mode || "pages",
          start: scriptPreviewAccess?.start || script.scriptPreviewAccess?.start || 1,
          end: scriptPreviewAccess?.end || script.scriptPreviewAccess?.end || 8,
          maxUnits: Number(
            String(scriptPreviewAccess?.mode || script.scriptPreviewAccess?.mode || "pages").toLowerCase() === "episodes"
              ? (script.scriptCompletion?.totalParts || 0)
              : (resolvedPreviewPageTexts.length
                || (Array.isArray(script.scriptPreviewPageTexts) && script.scriptPreviewPageTexts.length)
                || script.pageCount
                || Number(pageCount || 0)
                || 0)
          ),
        });
        script.markModified("scriptPreviewAccess");
      }
      const fileReferenceSubmitted = scriptUrl !== undefined || fileUrl !== undefined;
      const submittedFile = resolveSubmittedScriptFile({
        scriptUrl,
        fileUrl,
        fileGrant,
        ownerId: req.user._id,
        currentUrl: script.fileUrl,
      });
      const realUrl = submittedFile.url;
      if (fileReferenceSubmitted) {
        script.fileUrl = realUrl;
        script.projectSource = realUrl ? "uploaded" : "editor";
      }
      if (scriptPreviewPageTexts !== undefined) {
        script.scriptPreviewPageTexts = resolvedPreviewPageTexts;
      } else if (!resolvedPreviewPageTexts.length && fileReferenceSubmitted && realUrl) {
        try {
          const extraction = await extractTextFromPdfUrl(realUrl);
          if (Array.isArray(extraction?.pageTexts) && extraction.pageTexts.length > 0) {
            script.scriptPreviewPageTexts = extraction.pageTexts;
          }
          if (!Number(script.pageCount) && Number(extraction?.numItems) > 0) {
            script.pageCount = Number(extraction.numItems);
          }
          if (!String(script.textContent || "").trim() && String(extraction?.text || "").trim()) {
            script.textContent = extraction.text;
          }
        } catch (error) {
          console.warn("[updateScript] Failed to refresh preview page texts:", error?.message || error);
        }
      }

      // Editor-authored scripts have no PDF to extract from, so if the client never sent preview
      // pages the script would end up viewable with nothing to show. Derive them from the
      // screenplay text using the same line-based pagination the editor and PDF use.
      if (script.viewableScript && !(script.scriptPreviewPageTexts || []).some((page) => String(page || "").trim())) {
        const derived = derivePreviewPageTexts(script);
        if (derived.length) {
          script.scriptPreviewPageTexts = derived;
          script.markModified("scriptPreviewPageTexts");
        }
      }
      if (coverImage !== undefined) script.coverImage = coverImage;
      if (premium !== undefined) script.premium = premium;
      if (price !== undefined) {
        // A price is money a buyer will be charged (plus fee and taxes): never negative, never NaN.
        const nextPrice = sanitizeWriterPrice(price);
        if (nextPrice === null) return res.status(400).json({ message: "Enter a price between 0 and 1,00,00,000." });
        script.price = nextPrice;
      }
      if (collabVisibility !== undefined) {
        const normalizedCollabVisibility = String(collabVisibility || "").trim().toLowerCase();
        if (["open", "private"].includes(normalizedCollabVisibility)) {
          script.collabVisibility = normalizedCollabVisibility;
        }
      }
      if (roles !== undefined) {
        const nextRoles = Array.isArray(roles) ? roles : [];
        const ageRangeError = getInvalidRoleAgeRangeMessage(nextRoles);
        if (ageRangeError) {
          return res.status(400).json({ message: ageRangeError });
        }
        script.roles = nextRoles;
      }
      if (tags !== undefined) script.tags = Array.isArray(tags) ? tags : [];
      if (budget !== undefined) script.budget = budget;
      if (holdFee !== undefined) {
        const nextHoldFee = sanitizeWriterPrice(holdFee);
        if (nextHoldFee === null || nextHoldFee <= 0) return res.status(400).json({ message: "Enter a hold fee greater than 0." });
        script.holdFee = nextHoldFee;
      }
    }
    if (isOwner && textContent !== undefined) script.textContent = textContent;
    if (isOwner && req.body.fountainContent !== undefined) script.fountainContent = req.body.fountainContent;
    if (!isContentOnlyCollaborator && description !== undefined) script.description = description;
    if (!isContentOnlyCollaborator && synopsis !== undefined) script.synopsis = synopsis;

    if (!isContentOnlyCollaborator && classification) {
      const g = classification.primaryGenre || script.classification?.primaryGenre;
      script.genre = genre || g;
      script.primaryGenre = g;
      script.classification = {
        primaryGenre: classification.primaryGenre ?? script.classification?.primaryGenre,
        secondaryGenre: classification.secondaryGenre ?? script.classification?.secondaryGenre,
        tones: classification.tones ?? script.classification?.tones ?? [],
        themes: classification.themes ?? script.classification?.themes ?? [],
        settings: classification.settings ?? script.classification?.settings ?? [],
      };
      script.markModified("classification");
    } else if (!isContentOnlyCollaborator && genre) {
      script.genre = genre;
    }

    if (!isContentOnlyCollaborator && filmDetails) {
      script.filmDetails = {
        filmLanguage: String(filmDetails.filmLanguage || "").trim().slice(0, 100),
        dialoguesPresent: ["yes", "no", "partial"].includes(filmDetails.dialoguesPresent) ? filmDetails.dialoguesPresent : (script.filmDetails?.dialoguesPresent || "yes"),
        wantToDirect: Boolean(filmDetails.wantToDirect),
        wantToProduce: Boolean(filmDetails.wantToProduce),
        scriptStyle: Array.isArray(filmDetails.scriptStyle) ? filmDetails.scriptStyle.slice(0, 8) : (script.filmDetails?.scriptStyle || []),
      };
      script.markModified("filmDetails");
    }

    if (!isContentOnlyCollaborator && services) {
      script.services = {
        hosting: services.hosting ?? script.services?.hosting ?? true,
        evaluation: services.evaluation ?? script.services?.evaluation ?? false,
        aiTrailer: services.aiTrailer ?? script.services?.aiTrailer ?? false,
        spotlight: services.spotlight ?? script.services?.spotlight ?? false,
      };
      script.markModified("services");
    }

    if (!isContentOnlyCollaborator && scriptCompletion !== undefined) {
      script.scriptCompletion = normalizeScriptCompletionInput(
        scriptCompletion || {},
        script.scriptCompletion || {}
      );
      script.markModified("scriptCompletion");
    }

    if (!isContentOnlyCollaborator && legal?.agreedToTerms !== undefined) {
      const nextCustomInvestorTerms = sanitizeCustomInvestorTerms(legal?.customInvestorTerms);
      if (nextCustomInvestorTerms.length > MAX_CUSTOM_INVESTOR_TERMS_LENGTH) {
        return res.status(400).json({ message: `Custom investor terms must be ${MAX_CUSTOM_INVESTOR_TERMS_LENGTH} characters or fewer.` });
      }

      const previousCustomInvestorTerms = sanitizeCustomInvestorTerms(script.legal?.customInvestorTerms);
      const hasChangedCustomTerms = previousCustomInvestorTerms !== nextCustomInvestorTerms;

      script.legal = {
        agreedToTerms: legal.agreedToTerms,
        timestamp: legal.timestamp || script.legal?.timestamp || new Date(),
        ipAddress: req.ip || req.connection.remoteAddress,
        termsVersion: legal.termsVersion || script.legal?.termsVersion || SCRIPT_UPLOAD_TERMS_VERSION,
        customInvestorTerms: nextCustomInvestorTerms,
        customInvestorTermsUpdatedAt: hasChangedCustomTerms
          ? new Date()
          : (script.legal?.customInvestorTermsUpdatedAt || undefined),
      };
    }

    if (!isContentOnlyCollaborator) {
      script.rightsLicensing = normalizedRights;
      script.markModified("rightsLicensing");
    }


    // Publishing layer fields
    if (!isContentOnlyCollaborator && targetIndustry !== undefined) {
      script.targetIndustry = Array.isArray(targetIndustry) && targetIndustry.length > 0 ? targetIndustry : ["film"];
    }
    if (!isContentOnlyCollaborator && publishingDetails !== undefined) {
      const pd = publishingDetails || {};
      script.publishingDetails = {
        enabled: Boolean(pd.enabled),
        storyFormat: Array.isArray(pd.storyFormat) ? pd.storyFormat : [],
        writingStyle: Array.isArray(pd.writingStyle) ? pd.writingStyle : [],
        targetAudience: Array.isArray(pd.targetAudience) ? pd.targetAudience : [],
        estimatedWordCount: String(pd.estimatedWordCount || "").trim().slice(0, 60),
        seriesPotential: pd.seriesPotential || undefined,
        bookPitch: String(pd.bookPitch || "").trim().slice(0, 2500),
        proseSample: String(pd.proseSample || "").trim().slice(0, 5000),
        proseSampleGeneratedAt: pd.proseSampleGeneratedAt ? new Date(pd.proseSampleGeneratedAt) : script.publishingDetails?.proseSampleGeneratedAt,
        previewContent: pd.previewContent || "none",
        publishingRights: pd.publishingRights ? {
          rightsBundle: pd.publishingRights.rightsBundle || "custom",
          bookPublishing: Boolean(pd.publishingRights.bookPublishing),
          digitalPublishing: Boolean(pd.publishingRights.digitalPublishing),
          audiobookRights: Boolean(pd.publishingRights.audiobookRights),
          territory: Array.isArray(pd.publishingRights.territory) ? pd.publishingRights.territory : [],
          territorySpecific: String(pd.publishingRights.territorySpecific || "").trim().slice(0, 300),
          languages: Array.isArray(pd.publishingRights.languages) ? pd.publishingRights.languages : [],
          adaptationRights: Array.isArray(pd.publishingRights.adaptationRights) ? pd.publishingRights.adaptationRights : [],
          exclusivity: pd.publishingRights.exclusivity || "non_exclusive",
          durationYears: String(pd.publishingRights.durationYears || "").trim().slice(0, 60),
          paymentType: pd.publishingRights.paymentType || "one_time_upfront",
          modificationRights: pd.publishingRights.modificationRights || "buyer_must_consult_writer",
        } : (script.publishingDetails?.publishingRights || {}),
      };
      script.markModified("publishingDetails");
    }

    const wasPendingApproval = script.status === "pending_approval";
    const hasEvaluationEntitlement = Boolean(script.services?.evaluation);
    const hasAiTrailerEntitlement = Boolean(
      script.services?.aiTrailer || script.services?.spotlight
    );

    if (hasEvaluationEntitlement) {
      script.evaluationStatus = "none";
      script.evaluationRequestedAt = undefined;
      script.scriptScore = undefined;
    }

    if (hasAiTrailerEntitlement) {
      script.trailerStatus = "none";
      if (script.trailerWriterFeedback) {
        script.trailerWriterFeedback = {
          ...(script.trailerWriterFeedback || {}),
          status: "pending",
          note: "",
          updatedAt: new Date(),
        };
      }
    }

    script.status = "pending_approval";
    script.adminApproved = false;
    script.approvalRequestType = "edit_submission";
    script.rejectionReason = undefined;
    await script.save();
    try {
      await attachSubmissionSummaryPdfToScript({ script, creator: req.user });
    } catch (pdfError) {
      console.error("[updateScript] Failed to generate submission summary PDF:", pdfError.message);
    }

    res.json(script);

    // Non-critical notifications run after response to reduce submit latency.
    (async () => {
      const tasks = [];

      tasks.push(
        archiveScriptSubmissionForAdmin({
          script,
          writer: req.user,
          approvalSource: "update-script",
        })
      );

      if (!wasPendingApproval) {
        tasks.push(
          notifyAdminWorkflowEvent({
            title: "Writer Project Edit Submitted For Approval",
            section: "approvals",
            actorId: req.user._id,
            scriptId: script._id,
            message: `Project "${script.title}" edit was submitted for admin approval by ${req.user.name || "a writer"}.`,
            metadata: {
              scriptId: script._id,
              writerId: req.user._id,
              writerEmail: req.user.email || "",
              approvalRequestType: "edit_submission",
              source: "update-script",
            },
          })
        );
      }

      if (script.services?.aiTrailer && ["requested", "generating"].includes(script.trailerStatus)) {
        tasks.push(
          notifyAdminWorkflowEvent({
            title: "AI Trailer Approval Request",
            section: "trailers",
            actorId: req.user._id,
            scriptId: script._id,
            message: `AI trailer requested for "${script.title}" and is waiting in admin queue.`,
            metadata: {
              scriptId: script._id,
              writerId: req.user._id,
              trailerStatus: script.trailerStatus,
              source: "update-script",
            },
          })
        );
      }

      if (tasks.length) {
        const results = await Promise.allSettled(tasks);
        const rejected = results.filter((r) => r.status === "rejected");
        if (rejected.length > 0) {
          console.error(`[updateScript] ${rejected.length} post-submit notification task(s) failed`);
        }
      }
    })();
  } catch (error) {
    if (error instanceof RemoteAssetPolicyError) {
      return sendRemoteAssetError(res, error);
    }
    res.status(500).json({ message: error.message });
  }
};

export const uploadScript = async (req, res) => {
  try {
    if (!requireProjectCreatorAccess(req, res)) {
      return;
    }

    const {
      scriptId,
      title,
      companyName,
      logline,
      format,
      formatOther,
      pageCount,
      classification,
      scriptUrl,
      services,
      legal,
      collabVisibility,
      scriptPreviewAccess,
      viewableScript,
      rightsLicensing,
      scriptCompletion,
      // Publishing layer
      targetIndustry,
      publishingDetails,
      // Legacy fields for backward compatibility
      description,
      synopsis,
      fullContent,
      textContent,
      fountainContent,
      fileUrl,
      fileGrant,
      scriptPreviewPageTexts,
      coverImage,
      genre,
      contentType,
      isPremium,
      premium,
      price,
      roles,
      tags,
      budget,
      holdFee,
      filmDetails,
    } = req.body;

    let existingDraft = null;
    const hasScriptId = scriptId !== undefined && scriptId !== null && scriptId !== "";
    const draftObjectId = hasScriptId ? parseMongoObjectId(scriptId) : null;
    if (hasScriptId && !draftObjectId) {
      return res.status(400).json({ message: "Invalid draft ID." });
    }
    if (draftObjectId) {
      existingDraft = await Script.findOne({
        _id: { $eq: draftObjectId },
        creator: { $eq: req.user._id },
      });
      if (!existingDraft) {
        return res.status(404).json({ message: "Draft not found" });
      }
      if (existingDraft.isDeleted) {
        return res.status(410).json({ message: "This draft was deleted and cannot be published." });
      }
      if (existingDraft.status !== "draft") {
        return res.status(409).json({ message: "This project is already submitted." });
      }
    }

    const submittedFile = resolveSubmittedScriptFile({
      scriptUrl,
      fileUrl,
      fileGrant,
      ownerId: req.user._id,
      currentUrl: existingDraft?.fileUrl || "",
      validateStored: true,
    });

    let resolvedTextContent = typeof textContent === "string" ? textContent : "";
    let resolvedPageCount = Number(pageCount) || 0;
    let resolvedPreviewPageTexts = Array.isArray(scriptPreviewPageTexts)
      ? scriptPreviewPageTexts.map((value) => String(value || "").trim())
      : [];
    if (!resolvedPreviewPageTexts.length && typeof scriptPreviewPageTexts === "string" && scriptPreviewPageTexts.trim()) {
      try {
        const parsedPreviewTexts = JSON.parse(scriptPreviewPageTexts);
        if (Array.isArray(parsedPreviewTexts)) {
          resolvedPreviewPageTexts = parsedPreviewTexts.map((value) => String(value || "").trim());
        }
      } catch {
        resolvedPreviewPageTexts = [];
      }
    }
    const uploadedScriptUrl = submittedFile.url;

    if (uploadedScriptUrl && (!resolvedTextContent.trim() || !resolvedPageCount || !resolvedPreviewPageTexts.length)) {
      try {
        const extraction = await extractTextFromPdfUrl(uploadedScriptUrl);
        if (String(extraction?.text || "").trim()) {
          resolvedTextContent = extraction.text;
        }
        if (!resolvedPageCount && Number(extraction?.numItems) > 0) {
          resolvedPageCount = Number(extraction.numItems);
        }
        if (!resolvedPreviewPageTexts.length && Array.isArray(extraction?.pageTexts) && extraction.pageTexts.length > 0) {
          resolvedPreviewPageTexts = extraction.pageTexts;
        }
      } catch (extractionError) {
        console.warn("[uploadScript] Server-side PDF extraction failed:", extractionError?.message || extractionError);
      }
    }

    // Enforce Writer limits for new uploads (shared rule — see utils/scriptLimits.js)
    if (!draftObjectId && writerLimitApplies(req.user.role)) {
      const cycleStart = getScriptUploadCycleStart(req.user);
      const usedQuery = { creator: req.user._id, status: { $ne: "draft" }, isDeleted: { $ne: true } };
      if (cycleStart) {
        usedQuery.createdAt = { $gte: cycleStart };
      }
      const used = await Script.countDocuments(usedQuery);
      const status = buildScriptLimitStatus(req.user.subscription?.plan, used, { verb: "upload" });
      if (status.limitReached) {
        return res.status(402).json({ message: status.message, limitReached: true, requiredPlan: status.requiredPlan });
      }
    }

    // Validate required fields
    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }
    if (logline !== undefined && String(logline).trim().length > 500) {
      return res.status(400).json({ message: "Logline must be 500 characters or fewer" });
    }
    if (format === "other" && !String(formatOther || "").trim()) {
      return res.status(400).json({ message: "Please specify the format when selecting Other." });
    }
    if (!synopsis || String(synopsis).trim().length === 0) {
      return res.status(400).json({ message: "Synopsis is required" });
    }
    if (!uploadedScriptUrl && !resolvedTextContent) {
      return res.status(400).json({ message: "Script file or text content is required" });
    }
    const ageRangeError = getInvalidRoleAgeRangeMessage(roles);
    if (ageRangeError) {
      return res.status(400).json({ message: ageRangeError });
    }

    const customInvestorTerms = sanitizeCustomInvestorTerms(legal?.customInvestorTerms);
    if (customInvestorTerms.length > MAX_CUSTOM_INVESTOR_TERMS_LENGTH) {
      return res.status(400).json({ message: `Custom investor terms must be ${MAX_CUSTOM_INVESTOR_TERMS_LENGTH} characters or fewer.` });
    }

    const rightsValidationErrors = validateRightsLicensingPayload(rightsLicensing || {});
    if (rightsValidationErrors.length > 0) {
      return res.status(400).json({ message: rightsValidationErrors[0] });
    }

    const normalizedRights = normalizeRightsLicensingInput(rightsLicensing || {}, {});
    normalizedRights.legalAcknowledgement = {
      ...(normalizedRights.legalAcknowledgement || {}),
      acknowledgedAt: normalizedRights?.legalAcknowledgement?.acknowledgedAt || new Date(),
      ipAddress: normalizedRights?.legalAcknowledgement?.ipAddress || getRequestIpAddress(req),
    };

    const completionValidationErrors = validateScriptCompletionPayload(scriptCompletion || {});
    if (completionValidationErrors.length > 0) {
      return res.status(400).json({ message: completionValidationErrors[0] });
    }
    const normalizedScriptPreviewAccess = normalizeScriptPreviewAccess(scriptPreviewAccess || {}, {
      mode: scriptPreviewAccess?.mode || "pages",
      start: scriptPreviewAccess?.start || 1,
      end: scriptPreviewAccess?.end || 8,
      maxUnits: Number(
        String(scriptPreviewAccess?.mode || "pages").toLowerCase() === "episodes"
          ? (scriptCompletion?.totalParts || 0)
          : ((Array.isArray(scriptPreviewPageTexts) && scriptPreviewPageTexts.length)
            || pageCount || resolvedPageCount || 0)
      ),
    });
    const viewableScriptEnabled = Boolean(viewableScript);

    const isPremiumAccess = Boolean(isPremium || premium) && Number(price || 0) > 0;
    const effectivePrice = isPremiumAccess ? Number(price || 0) : 0;

    // Enforce Free Tier restrictions on premium services
    if ((services?.evaluation || services?.aiTrailer || services?.spotlight) && ["writer", "creator"].includes(String(req.user.role).toLowerCase())) {
      const plan = String(req.user.subscription?.plan || "free").toLowerCase();
      if (plan === "free" || plan === "none") {
        return res.status(403).json({
          message: "Premium services (Evaluation, AI Trailer, Spotlight) are not available on the Free plan. Please upgrade your plan.",
          requiresUpgrade: true
        });
      }
    }


    const inferredProjectSource = uploadedScriptUrl ? "uploaded" : "editor";

    // Build the script document
    const scriptData = {
      creator: req.user._id,
      title,
      companyName: String(companyName || "").trim(),
      logline: logline ? String(logline).trim() : "",
      description: synopsis,
      synopsis: synopsis,
      fullContent,
      textContent: resolvedTextContent,
      fountainContent: typeof fountainContent === "string" ? fountainContent : undefined,
      fileUrl: uploadedScriptUrl,
      pageCount: resolvedPageCount,
      viewableScript: viewableScriptEnabled,
      scriptPreviewPageTexts: resolvedPreviewPageTexts,
      scriptPreviewAccess: normalizedScriptPreviewAccess,
      scriptCompletion: normalizeScriptCompletionInput(scriptCompletion || {}, {}),
      coverImage,
      genre: genre || classification?.primaryGenre,
      contentType: getContentTypeFromFormat(format, contentType),
      premium: isPremium || premium || false,
      price: sanitizeWriterPrice(price) ?? 0,
      roles: roles || [],
      tags: tags || [],
      budget,
      holdFee: sanitizeWriterPrice(holdFee) || DEFAULT_HOLD_FEE_INR,
      collabVisibility: ["open", "private"].includes(String(collabVisibility || "").trim().toLowerCase())
        ? String(collabVisibility).trim().toLowerCase()
        : "private",

      // New fields from the 5-step wizard
      format: format || "feature_film",
      formatOther: format === "other" ? String(formatOther || "").trim() : "",
      primaryGenre: classification?.primaryGenre || genre,
      classification: classification ? {
        primaryGenre: classification.primaryGenre,
        secondaryGenre: classification.secondaryGenre,
        tones: classification.tones || [],
        themes: classification.themes || [],
        settings: classification.settings || []
      } : undefined,

      // Check for included evaluation based on premium plans
      ...( () => {
        const hasIncludedEvaluation = ["silver", "gold", "pro", "premium"].includes(String(req.user.subscription?.plan).toLowerCase());
        const shouldEvaluate = services?.evaluation || hasIncludedEvaluation;
        return {
          services: {
            hosting: services?.hosting !== undefined ? services.hosting : true,
            evaluation: shouldEvaluate,
            aiTrailer: services?.aiTrailer || false,
            spotlight: services?.spotlight || false,
          },
          evaluationStatus: shouldEvaluate ? "requested" : "none",
          evaluationRequestedAt: shouldEvaluate ? new Date() : undefined,
        };
      })(),
      
      promotion: services?.spotlight
        ? {
            spotlightActive: false,
            pendingSpotlightActivation: true,
          }
        : undefined,

      // Legal compliance
      legal: legal ? {
        agreedToTerms: legal.agreedToTerms || false,
        timestamp: legal.timestamp || new Date(),
        ipAddress: req.ip || req.connection.remoteAddress,
        termsVersion: legal.termsVersion || SCRIPT_UPLOAD_TERMS_VERSION,
        customInvestorTerms,
        customInvestorTermsUpdatedAt: customInvestorTerms ? new Date() : undefined,
      } : undefined,

      rightsLicensing: {
        ...normalizedRights,
        termsVersion: normalizedRights.termsVersion || legal?.termsVersion || SCRIPT_UPLOAD_TERMS_VERSION,
      },

      // AI Trailer status initialization
      trailerStatus: services?.aiTrailer ? "generating" : "none",

      projectSource: inferredProjectSource,

      approvalRequestType: "new_submission",

      status: "pending_approval", // Requires admin approval before publishing

      // Film production details
      filmDetails: filmDetails ? {
        filmLanguage: String(filmDetails.filmLanguage || "").trim().slice(0, 100),
        dialoguesPresent: ["yes", "no", "partial"].includes(filmDetails.dialoguesPresent) ? filmDetails.dialoguesPresent : "yes",
        wantToDirect: Boolean(filmDetails.wantToDirect),
        wantToProduce: Boolean(filmDetails.wantToProduce),
        scriptStyle: Array.isArray(filmDetails.scriptStyle) ? filmDetails.scriptStyle.slice(0, 8) : [],
      } : undefined,

      // Publishing layer
      targetIndustry: Array.isArray(targetIndustry) && targetIndustry.length > 0 ? targetIndustry : ["film"],
      publishingDetails: publishingDetails ? {
        enabled: Boolean(publishingDetails.enabled),
        storyFormat: Array.isArray(publishingDetails.storyFormat) ? publishingDetails.storyFormat : [],
        writingStyle: Array.isArray(publishingDetails.writingStyle) ? publishingDetails.writingStyle : [],
        targetAudience: Array.isArray(publishingDetails.targetAudience) ? publishingDetails.targetAudience : [],
        estimatedWordCount: String(publishingDetails.estimatedWordCount || "").trim().slice(0, 60),
        seriesPotential: publishingDetails.seriesPotential || undefined,
        bookPitch: String(publishingDetails.bookPitch || "").trim().slice(0, 2500),
        proseSample: String(publishingDetails.proseSample || "").trim().slice(0, 5000),
        previewContent: publishingDetails.previewContent || "none",
        publishingRights: publishingDetails.publishingRights ? {
          rightsBundle: publishingDetails.publishingRights.rightsBundle || "custom",
          bookPublishing: Boolean(publishingDetails.publishingRights.bookPublishing),
          digitalPublishing: Boolean(publishingDetails.publishingRights.digitalPublishing),
          audiobookRights: Boolean(publishingDetails.publishingRights.audiobookRights),
          territory: Array.isArray(publishingDetails.publishingRights.territory) ? publishingDetails.publishingRights.territory : [],
          territorySpecific: String(publishingDetails.publishingRights.territorySpecific || "").trim().slice(0, 300),
          languages: Array.isArray(publishingDetails.publishingRights.languages) ? publishingDetails.publishingRights.languages : [],
          adaptationRights: Array.isArray(publishingDetails.publishingRights.adaptationRights) ? publishingDetails.publishingRights.adaptationRights : [],
          exclusivity: publishingDetails.publishingRights.exclusivity || "non_exclusive",
          durationYears: String(publishingDetails.publishingRights.durationYears || "").trim().slice(0, 60),
          paymentType: publishingDetails.publishingRights.paymentType || "one_time_upfront",
          modificationRights: publishingDetails.publishingRights.modificationRights || "buyer_must_consult_writer",
        } : {},
      } : { enabled: false },
    };

    let script;

    if (draftObjectId) {
      existingDraft.set(scriptData);
      script = await existingDraft.save();
    } else {
      script = await Script.create(scriptData);
    }
    const creator = req.user;

    try {
      script = await attachSubmissionSummaryPdfToScript({ script, creator });
    } catch (pdfError) {
      console.error("[uploadScript] Failed to generate submission summary PDF:", pdfError.message);
    }

    res.status(201).json(script);

    // Run non-critical tasks post-response to keep submit API fast.
    (async () => {
      const tasks = [
        archiveScriptSubmissionForAdmin({
          script,
          writer: creator,
          approvalSource: "upload-script",
        }),
        notifyAdminWorkflowEvent({
          title: "Writer Project Submitted For Approval",
          section: "approvals",
          actorId: req.user._id,
          scriptId: script._id,
          message: `Project "${script.title}" was submitted for admin approval by ${creator.name || "a writer"}.`,
          metadata: {
            scriptId: script._id,
            writerId: req.user._id,
            writerEmail: creator.email || "",
            aiTrailerRequested: Boolean(services?.aiTrailer),
            source: "upload-script",
          },
        }),
      ];

      if (["silver", "gold", "pro", "premium"].includes(String(req.user.subscription?.plan).toLowerCase())) {
        tasks.push(
          runScriptScoreGeneration({ scriptId: script._id, userId: req.user._id }).catch(e => {
            console.error("[uploadScript] Included AI evaluation failed to start:", e.message);
          })
        );
      }

      if (services?.aiTrailer) {
        tasks.push(
          notifyAdminWorkflowEvent({
            title: "AI Trailer Approval Request",
            section: "trailers",
            actorId: req.user._id,
            scriptId: script._id,
            message: `AI trailer requested for "${script.title}" and is waiting in admin queue.`,
            metadata: {
              scriptId: script._id,
              writerId: req.user._id,
              trailerStatus: script.trailerStatus,
              source: "upload-script",
            },
          })
        );
      }

      // --- Async Service Processing ---
      // TODO: Implement these async workflows:
      if (services?.hosting) {
        console.log(`[SERVICE] Hosting activated for script ${script._id}`);
      }
      if (services?.evaluation) {
        console.log(`[SERVICE] Evaluation requested for script ${script._id}`);
      }
      if (services?.aiTrailer) {
        console.log(`[SERVICE] AI Trailer generation started for script ${script._id}`);
        console.log(`Logline: ${logline}`);
        console.log(`Genre: ${classification?.primaryGenre}`);
        console.log(`Tones: ${classification?.tones?.join(', ')}`);
      }

      const results = await Promise.allSettled(tasks);
      const rejected = results.filter((r) => r.status === "rejected");
      if (rejected.length > 0) {
        console.error(`[uploadScript] ${rejected.length} post-submit task(s) failed`);
      }
    })();
  } catch (error) {
    console.error("Script upload error:", error);
    if (error instanceof RemoteAssetPolicyError) {
      return sendRemoteAssetError(res, error);
    }
    res.status(500).json({ message: error.message });
  }
};

export const getScripts = async (req, res) => {
  try {
    await expireApprovedUnpaidRequests();
    await expireActiveExclusiveLicenses();

    const { genre, contentType, budget, sort, search, premium, minPrice, maxPrice, goldOnly } = req.query;
    const { page, limit, paged, limited } = parseScriptListPaging(req.query);
    const query = { ...PUBLIC_SCRIPT_FILTER };

    if (goldOnly === "true") {
      const User = mongoose.model("User");
      const goldUsers = await User.find({
        $or: [
          { role: { $nin: ["writer", "creator"] } },
          { "subscription.plan": "gold" },
          { "subscription.accessTier": "writer_gold" },
        ]
      }).select("_id").lean();
      query.creator = { $in: goldUsers.map((u) => u._id) };
    }
    // Each facet is an equality match, so it has to reach the query as a string. An object here would
    // be read by Mongo as an operator rather than as a value to compare.
    const genreFilter = asTrimmedString(genre);
    const contentTypeFilter = asTrimmedString(contentType);
    const budgetFilter = asTrimmedString(budget);
    if (genreFilter) query.genre = genreFilter;
    if (contentTypeFilter) query.contentType = contentTypeFilter;
    if (budgetFilter) query.budget = budgetFilter;
    if (premium === "true") query.premium = true;
    else if (premium === "false") query.premium = { $ne: true };
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }
    const searchRegex = asSearchRegex(search);
    if (searchRegex) {
      query.$or = [
        { sid: searchRegex },
        { title: searchRegex },
        { description: searchRegex },
        { tags: searchRegex },
      ];
    }

    // Use aggregation pipeline for computed sort fields (engagement, platform)
    if (sort === "engagement" || sort === "platform") {
      const pipeline = [
        { $match: query },
        {
          $addFields: {
            unlockCount: { $size: { $ifNull: ["$unlockedBy", []] } },
            engagementScore: {
              $min: [
                100,
                {
                  $add: [
                    { $multiply: [{ $divide: [{ $ifNull: ["$views", 0] }, 500] }, 40] },
                    { $multiply: [{ $divide: [{ $size: { $ifNull: ["$unlockedBy", []] } }, 50] }, 40] },
                    {
                      $cond: [
                        { $gt: [{ $ifNull: ["$views", 0] }, 0] },
                        { $multiply: [{ $divide: [{ $size: { $ifNull: ["$unlockedBy", []] } }, { $ifNull: ["$views", 1] }] }, 100] },
                        0,
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      ];

      if (sort === "platform") {
        // Platform score = weighted combo of AI score (60%) + engagement (40%)
        pipeline.push({
          $addFields: {
            platformScore: {
              $add: [
                { $multiply: [{ $ifNull: ["$scriptScore.overall", 0] }, 0.6] },
                { $multiply: ["$engagementScore", 0.4] },
              ],
            },
          },
        });
        pipeline.push({ $sort: { platformScore: -1 } });
      } else {
        pipeline.push({ $sort: { engagementScore: -1 } });
      }

      // Populate creator
      pipeline.push({
        $lookup: {
          from: "users",
          localField: "creator",
          foreignField: "_id",
          as: "creator",
          pipeline: [{ $project: { name: 1, profileImage: 1, role: 1 } }],
        },
      });
      pipeline.push({ $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } });
      // DEF-21: a list response must never carry a screenplay or a private
      // asset URL. Applied on both the legacy and the paged path, because the
      // leak was never specific to paging.
      pipeline.push({ $project: SCRIPT_LIST_RESULT_EXCLUDE });

      if (paged) {
        pipeline.push({
          $facet: {
            scripts: [{ $skip: (page - 1) * limit }, { $limit: limit }],
            meta: [{ $count: "total" }],
          },
        });
      } else if (limited) {
        // DEF-22: `limit` has always been accepted here and never read.
        pipeline.push({ $limit: limit });
      }

      const rows = await Script.aggregate(pipeline);
      const result = paged ? unpackScriptListFacet(rows, { page, limit }) : { scripts: rows };
      // Strip full synopsis from list view
      const sanitized = result.scripts.map(s => ({
        ...s,
        synopsis: s.synopsis ? s.synopsis.substring(0, 120) + (s.synopsis.length > 120 ? '...' : '') : null,
      }));
      if (paged) return res.json({ ...result, scripts: sanitized });
      return res.json(sanitized);
    }

    let sortObj = { createdAt: -1 };
    if (sort === "views") sortObj = { views: -1 };
    if (sort === "score") sortObj = { "scriptScore.overall": -1 };
    if (sort === "price_low") sortObj = { price: 1 };
    if (sort === "price_high") sortObj = { price: -1 };

    /*
     * The documents are fetched WHOLE and stripped after `toObject()` rather
     * than `.select()`-ed: the `sid` backfill below calls `doc.save()`, and
     * saving a document with unselected paths is how a partial write happens.
     * The projection is applied to the serialized copy instead, which is the
     * only thing that leaves the process.
     */
    const cursor = Script.find(query)
      .populate("creator", "name profileImage role")
      .sort(sortObj);
    if (paged) cursor.skip((page - 1) * limit).limit(limit);
    else if (limited) cursor.limit(limit);

    // An authoritative count, not the length of the page just fetched.
    const [scripts, total] = await Promise.all([
      cursor,
      paged ? Script.countDocuments(query) : Promise.resolve(0),
    ]);

    await Promise.all(
      scripts.map(async (doc) => {
        if (!doc.sid) {
          await doc.save();
        }
      })
    );

    // Strip full synopsis and every script body from list view (DEF-21)
    const sanitized = scripts.map(s => {
      const obj = stripScriptBody(s.toObject());
      return {
        ...obj,
        synopsis: obj.synopsis ? obj.synopsis.substring(0, 120) + (obj.synopsis.length > 120 ? '...' : '') : null,
      };
    });
    if (paged) {
      return res.json({
        scripts: sanitized,
        pagination: buildScriptListPagination({ page, limit, total }),
      });
    }
    res.json(sanitized);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getScriptSubmissionSummaryPdf = async (req, res) => {
  try {
    const script = await Script.findById(req.params.id)
      .select("title creator submissionSummaryPdf")
      .lean();

    if (!script) {
      return res.status(404).json({ message: "Script not found" });
    }

    const isOwner = String(script.creator || "") === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Not authorized to access this submission PDF." });
    }

    const pdfUrl = String(script?.submissionSummaryPdf?.url || "").trim();
    if (!pdfUrl) {
      return res.status(404).json({ message: "Submission summary PDF not available." });
    }

    const fileBuffer = await fetchTrustedPdfBuffer(pdfUrl);
    const shouldDownload = String(req.query.download || "") === "1";
    const disposition = shouldDownload ? "attachment" : "inline";
    const filename = sanitizePdfFileName(`${script.title || "script"}-submission-summary.pdf`);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
    return res.send(fileBuffer);
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to load submission summary PDF." });
  }
};

export const getPurchaseRequestAcceptancePdf = async (req, res) => {
  try {
    const purchaseRequest = await ScriptPurchaseRequest.findById(req.params.id)
      .select("acceptancePdf investor writer script")
      .lean();

    if (!purchaseRequest) {
      return res.status(404).json({ message: "Purchase request not found." });
    }

    const userId = req.user._id.toString();
    const isBuyer = String(purchaseRequest.investor || "") === userId;
    const isWriter = String(purchaseRequest.writer || "") === userId;
    const isAdmin = req.user.role === "admin";

    if (!isBuyer && !isWriter && !isAdmin) {
      return res.status(403).json({ message: "Not authorized to access this acceptance PDF." });
    }

    const pdfUrl = String(purchaseRequest?.acceptancePdf?.url || "").trim();
    if (!pdfUrl) {
      return res.status(404).json({ message: "Acceptance PDF not available." });
    }

    const fileBuffer = await fetchTrustedPdfBuffer(pdfUrl);
    const shouldDownload = String(req.query.download || "") === "1";
    const disposition = shouldDownload ? "attachment" : "inline";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="purchase-request-${purchaseRequest._id}-acceptance.pdf"`
    );
    return res.send(fileBuffer);
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to load acceptance PDF." });
  }
};

export const getScriptPdf = async (req, res) => {
  try {
    const scriptId = String(req.params.id || "").trim();
    if (!mongoose.isValidObjectId(scriptId)) {
      return res.status(404).json({ message: "Script not found" });
    }

    const script = await Script.findById(scriptId)
      .populate("creator", "name email role")
      .populate("heldBy", "name role");

    if (!script) {
      return res.status(404).json({ message: "Script not found" });
    }

    // Accepted collaborators are exempt from the marketplace business-email/plan gate on the script
    // they were invited to (see the same carve-out in getScriptById).
    const canCollaboratorRead = hasScriptPermission(script, req.user._id, "read");

    if (
      isIndustryProfessionalWithPersonalEmail(req.user) &&
      !hasActiveFilmIndustryProfessionalAccess(req.user) &&
      !canCollaboratorRead &&
      String(script.creator?._id || script.creator || "") !== String(req.user?._id || "")
    ) {
      return res.status(403).json({
        message: "To view scripts and writer profiles, sign up with a business email. To access writer contact details, purchase a Film Industry Professional plan.",
        requiresBusinessEmail: true,
      });
    }

    const isOwner = String(script.creator?._id || script.creator || "") === String(req.user?._id || "");
    const isAdmin = req.user.role === "admin";
    const collaboratorRole = resolveScriptRole(script, req.user._id);
    const isAcceptedCollaborator = !isOwner && Boolean(collaboratorRole);
    let isBuyer = hasUserInIdArray(script.unlockedBy, req.user._id) || hasUserInIdArray(script.purchasedBy, req.user._id);

    if (!isBuyer) {
      const [approvedPurchase, convertedOption] = await Promise.all([
        ScriptPurchaseRequest.exists(getSettledPurchaseQuery({ script: script._id, investor: req.user._id })),
        ScriptOption.exists({ script: script._id, holder: req.user._id, status: "converted" }),
      ]);
      isBuyer = Boolean(approvedPurchase || convertedOption);
    }

    if (script.isDeleted && !isAdmin && !isBuyer) {
      return res.status(404).json({ message: "Script not found" });
    }

    if (script.status === "draft" && !isOwner && !isAcceptedCollaborator && !canCollaboratorRead && !isAdmin) {
      return res.status(403).json({ message: "This draft is private" });
    }

    if (script.isSold && !isOwner && !isBuyer && !isAdmin && !canCollaboratorRead) {
      return res.status(403).json({ message: "This script has been purchased and is no longer publicly available" });
    }

    // This endpoint returns the COMPLETE stored document. Listing visibility, a business email,
    // and the writer's preview switch are not full-content grants. Preview-only clients render
    // `scriptPreviewPageTexts` / `previewExcerpt` from getScriptById instead; enforcing that split
    // here closes DEF-27 at the only boundary that can actually protect the file.
    if (!canReadFullScript({ isOwner, isAdmin, isBuyer, canCollaboratorRead })) {
      return res.status(403).json({ message: FULL_SCRIPT_ACCESS_MESSAGE, previewOnly: true });
    }
    const pdfUrl = String(script.fileUrl || "").trim();
    if (!pdfUrl) {
      return res.status(404).json({ message: "PDF file not available." });
    }

    const fileBuffer = await fetchTrustedPdfBuffer(pdfUrl);
    const shouldDownload = String(req.query.download || "") === "1";
    const disposition = shouldDownload ? "attachment" : "inline";
    const filename = sanitizePdfFileName(`${script.title || "script"}-full.pdf`);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
    return res.send(fileBuffer);
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to load script PDF." });
  }
};

export const getScriptById = async (req, res) => {
  try {
    const scriptId = String(req.params.id || "").trim();
    if (!mongoose.isValidObjectId(scriptId)) {
      return res.status(404).json({ message: "Script not found" });
    }

    // Script detail payload is personalized (e.g. myPendingRequest), so avoid serving cached variants across users.
    res.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
    res.set("Pragma", "no-cache");

    await expireApprovedUnpaidRequests({ scriptId });
    await expireActiveExclusiveLicenses({ scriptId });

    // DEF-26: `email` and `phone` are deliberately absent from this select — see
    // SCRIPT_DETAIL_CREATOR_SELECT for why. The writer's contact details are released by the
    // quota-charging `writerContact` block at the bottom of this handler, not by this populate.
    const script = await Script.findById(scriptId)
      .populate("creator", SCRIPT_DETAIL_CREATOR_SELECT)
      // Credits link to profiles where the credited person is a Ckript user (non-users stay name-only).
      .populate("writers.userId", "name profileImage username writerProfile.username")
      .populate("heldBy", "name role");

    if (!script) return res.status(404).json({ message: "Script not found" });

    // Someone explicitly invited onto THIS script keeps access regardless of the business-email/plan
    // gate below — that gate exists to stop industry pros browsing the marketplace, not to lock out
    // an accepted collaborator from the one script they were invited to.
    const canCollaboratorRead = hasScriptPermission(script, req.user._id, "read");

    if (
      isIndustryProfessionalWithPersonalEmail(req.user) &&
      !hasActiveFilmIndustryProfessionalAccess(req.user) &&
      !canCollaboratorRead &&
      String(script.creator?._id || script.creator || "") !== String(req.user?._id || "")
    ) {
      return res.status(403).json({
        message: "To view scripts and writer profiles, sign up with a business email. To access writer contact details, purchase a Film Industry Professional plan.",
        requiresBusinessEmail: true,
      });
    }

    await hydrateScriptTextFromStoredPdf(script, { source: "getScriptById" });

    const now = new Date();
    if (shouldAutoSyncUploadSpotlight(script, now)) {
      applySpotlightPackageState(script, now);
      await script.save();
    }

    const isOwner = script.creator._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";
    const collaboratorRole = resolveScriptRole(script, req.user._id);
    const isAcceptedCollaborator = !isOwner && Boolean(collaboratorRole);
    const canCollaboratorWrite = hasScriptPermission(script, req.user._id, "write");
    let isBuyer = hasUserInIdArray(script.unlockedBy, req.user._id) || hasUserInIdArray(script.purchasedBy, req.user._id);

    if (!isBuyer) {
      const [approvedPurchase, convertedOption] = await Promise.all([
        ScriptPurchaseRequest.exists(getSettledPurchaseQuery({ script: script._id, investor: req.user._id })),
        ScriptOption.exists({ script: script._id, holder: req.user._id, status: "converted" }),
      ]);
      isBuyer = Boolean(approvedPurchase || convertedOption);
    }

    // Deleted projects are hidden from writer/public but remain visible to purchasers and admins.
    if (script.isDeleted && !isAdmin && !isBuyer) {
      // The OWNER is told it was deleted rather than that it does not exist. Both are 404, but the
      // editor cannot otherwise tell this apart from "you have no permission", and it was rendering
      // "the project owner has removed your collaboration permissions" at someone who had simply
      // deleted their own project — sending them to ask about access instead of about a deletion.
      //
      // Scoped to the owner deliberately: for anyone else, a deleted script must stay
      // indistinguishable from one that never existed, or this becomes an enumeration signal.
      if (isOwner) {
        return res.status(404).json({
          message: "You deleted this project.",
          reason: "deleted",
          deletedAt: script.deletedAt || null,
        });
      }
      return res.status(404).json({ message: "Script not found" });
    }

    if (script.status === "draft" && !isOwner && !canCollaboratorRead && !isAdmin) {
      const pendingCollab = script.collaborators?.find((c) =>
        String(c.userId?._id || c.userId || "") === String(req.user._id) &&
        c.status === "pending" &&
        c.isActive !== false
      );
      if (pendingCollab) {
        return res.status(403).json({ message: "Invitation pending", reason: "pending_invite" });
      }
      return res.status(403).json({ message: "This draft is private" });
    }

    // Block access to sold scripts — only allow creator, buyer, and admins
    if (script.isSold && !isOwner && !isBuyer && !isAdmin && !canCollaboratorRead) {
      return res.status(403).json({ message: "This script has been purchased and is no longer publicly available" });
    }

    // Block access while an investor purchase request is pending.
    // Allow creator, admin, current buyer, or the investor who owns the pending request.
    if (script.purchaseRequestLocked) {
      const lockOwnerId = script.purchaseRequestLockedBy?.toString?.() || "";
      const isLockOwner = lockOwnerId && lockOwnerId === req.user._id.toString();
      let hasMyPendingRequest = false;
      const nowForLockCheck = new Date();
      const activeApprovedClause = getApprovedUnpaidActiveClause(nowForLockCheck);

      if (!isLockOwner && !isOwner && !isAdmin && !isBuyer && !canCollaboratorRead) {
        hasMyPendingRequest = Boolean(
          await ScriptPurchaseRequest.findOne({
            script: script._id,
            investor: req.user._id,
            $or: [
              { status: "pending" },
              activeApprovedClause,
            ],
          }).select("_id").lean()
        );
      }

      if (!isOwner && !isAdmin && !isBuyer && !isLockOwner && !hasMyPendingRequest && !canCollaboratorRead) {
        return res.status(403).json({ message: "This script is temporarily unavailable while a purchase request is under review." });
      }
    }
    // Track valid views: count only unique viewers (same user should not increase views again).
    script.viewedBy = Array.isArray(script.viewedBy) ? script.viewedBy : [];
    const viewedByBeforeCount = script.viewedBy.length;
    const viewerId = req.user._id.toString();
    const creatorId = script.creator?._id?.toString?.() || script.creator?.toString?.();

    const uniqueViewerIds = new Set(
      script.viewedBy
        .map((entry) => entry?.user?.toString?.())
        .filter(Boolean)
    );

    const alreadyViewed = uniqueViewerIds.has(viewerId);
    if (!alreadyViewed && !isAcceptedCollaborator) {
      script.viewedBy.push({ user: req.user._id });
    }

    // Exclude creator self-view from the public views metric.
    if (creatorId) {
      uniqueViewerIds.delete(creatorId);
    }
    if (!alreadyViewed && viewerId !== creatorId && !isAcceptedCollaborator) {
      uniqueViewerIds.add(viewerId);
    }

    const validViews = uniqueViewerIds.size;
    const currentViews = Number(script.views || 0);
    const viewsChanged = currentViews !== validViews;
    if (viewsChanged) {
      script.views = validViews;
    }

    if (script.viewedBy.length !== viewedByBeforeCount || viewsChanged) {
      await script.save();
    }

    // Notify writer if an industry professional views their script
    if (!isOwner && !isAcceptedCollaborator && hasActiveFilmIndustryProfessionalAccess(req.user) && creatorId) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentNotif = await Notification.findOne({
        user: creatorId,
        from: viewerId,
        type: "script_view",
        script: script._id,
        createdAt: { $gte: twentyFourHoursAgo }
      });
      if (!recentNotif) {
        await Notification.create({
          user: creatorId,
          from: viewerId,
          type: "script_view",
          script: script._id,
          message: `${req.user.name || "A film industry professional"} viewed your script "${script.title}".`
        });
      }
    }

    // Update viewer's viewHistory so investor dashboard stats are accurate
    if (!isOwner && !isAcceptedCollaborator) {
      await User.findByIdAndUpdate(req.user._id, {
        $push: {
          viewHistory: {
            $each: [{ script: script._id, viewedAt: new Date() }],
            $slice: -200, // keep last 200 entries
          },
        },
      });

      // Track recommendation interaction signals for personalized investor feed.
      trackInvestorInteraction({
        userId: req.user._id,
        scriptId: script._id,
        type: "view",
        source: "script_detail",
      }).catch(() => null);
    }

    // Check if user has unlocked this script
    const isUnlocked = isBuyer || hasUserInIdArray(script.unlockedBy, req.user._id) || hasUserInIdArray(script.purchasedBy, req.user._id);
    const isCreator = script.creator._id.toString() === req.user._id.toString();
    const canViewFullScript = canReadFullScript({
      isOwner: isCreator,
      isAdmin,
      isBuyer: isUnlocked,
      canCollaboratorRead,
    });
    const userRole = req.user.role;
    const isWriter = userRole === 'writer' || userRole === 'creator';
    const canPurchase = !canCollaboratorRead && ['investor', 'producer', 'director', 'industry', 'professional'].includes(userRole);
    let hasViewablePreview = hasViewableScriptPreview(script);
    
    // Explicit block for Free FIPs with personal email
    if (
      !canViewFullScript &&
      hasActiveFilmIndustryProfessionalAccess(req.user) &&
      (req.user.subscription?.plan || "free") === "free" &&
      !hasBusinessEmail(req.user.email)
    ) {
      hasViewablePreview = false;
    }
    const normalizedPreviewAccess = hasViewablePreview
      ? normalizeScriptPreviewAccess(script.scriptPreviewAccess || {}, {
          mode: script.scriptPreviewAccess?.mode || "pages",
          start: script.scriptPreviewAccess?.start || 1,
          end: script.scriptPreviewAccess?.end || 8,
          maxUnits: Number(
            String(script.scriptPreviewAccess?.mode || "pages").toLowerCase() === "episodes"
              ? (script.scriptCompletion?.totalParts || 0)
              : ((Array.isArray(script.scriptPreviewPageTexts) && script.scriptPreviewPageTexts.length)
                || script.pageCount || 0)
          ),
        })
      : null;
    const previewSummary = hasViewablePreview ? getScriptPreviewLabel(normalizedPreviewAccess) : "";
    const previewExcerpt = hasViewablePreview ? getScriptPreviewExcerpt(script, normalizedPreviewAccess) : "";

    // Get audition count
    const Audition = (await import("../models/Audition.js")).default;
    const auditionCount = await Audition.countDocuments({ script: script._id });

    // Keep synopsis fully visible; lock applies to full script content, not synopsis text.
    const isSynopsisLocked = !canViewFullScript;

    // Check if the viewer has a pending purchase request for this script
    let myPendingRequest = null;
    if (canPurchase && !isUnlocked) {
      const nowForPendingRequest = new Date();
      const activeApprovedClause = getApprovedUnpaidActiveClause(nowForPendingRequest);
      myPendingRequest = await ScriptPurchaseRequest.findOne({
        script: script._id,
        investor: req.user._id,
        $or: [
          { status: "pending" },
          activeApprovedClause,
        ],
      })
        .select("_id script investor writer status amount paymentStatus paymentDueAt note createdAt updatedAt")
        .sort({ createdAt: -1 })
        .lean();

      if (myPendingRequest && String(myPendingRequest.investor || "") !== String(req.user._id || "")) {
        myPendingRequest = null;
      }
    }

    let myCollabRequest = null;
    if (
      !isCreator
      && !isAcceptedCollaborator
      && script.collabVisibility === "open"
    ) {
      myCollabRequest = await CollabRequest.findOne({
        scriptId: script._id,
        requesterId: req.user._id,
        status: { $in: ["pending", "rejected"] },
      })
        .select("_id requestedRole status message createdAt respondedAt")
        .sort({ createdAt: -1 })
        .lean();
    }

    // For creators, count how many pending purchase requests exist for this script
    let pendingRequestsCount = 0;
    if (isCreator) {
      pendingRequestsCount = await ScriptPurchaseRequest.countDocuments({
        script: script._id,
        status: "pending",
      });
    }

    const viewBreakdown = {
      reader: 0,
      writer: 0,
      investor: 0,
    };

    const reviewBreakdown = {
      reader: 0,
      writer: 0,
      investor: 0,
    };

    const uniqueViewedUserIds = [
      ...new Set(
        (script.viewedBy || [])
          .map((entry) => entry?.user?.toString?.() || "")
          .filter(Boolean)
      ),
    ];

    if (uniqueViewedUserIds.length > 0) {
      const viewerRoles = await User.find({ _id: { $in: uniqueViewedUserIds } })
        .select("role")
        .lean();

      viewerRoles.forEach((viewer) => {
        const role = String(viewer?.role || "").toLowerCase();
        if (role === "reader") {
          viewBreakdown.reader += 1;
          return;
        }
        if (role === "writer" || role === "creator") {
          viewBreakdown.writer += 1;
          return;
        }
        if (["investor", "producer", "director", "industry", "professional"].includes(role)) {
          viewBreakdown.investor += 1;
        }
      });
    }

    const reviewRoleStats = await Review.aggregate([
      { $match: { script: script._id } },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "reviewer",
        },
      },
      { $unwind: "$reviewer" },
      {
        $project: {
          role: { $toLower: { $ifNull: ["$reviewer.role", ""] } },
        },
      },
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 },
        },
      },
    ]);

    reviewRoleStats.forEach((item) => {
      const role = String(item?._id || "");
      const count = Number(item?.count || 0);
      if (role === "reader") {
        reviewBreakdown.reader += count;
        return;
      }
      if (role === "writer" || role === "creator") {
        reviewBreakdown.writer += count;
        return;
      }
      if (["investor", "producer", "director", "industry", "professional"].includes(role)) {
        reviewBreakdown.investor += count;
      }
    });

    const writerId = String(script.creator?._id || script.creator || "");
    const viewerCanSeeWriterContact = canViewerAccessWriterContact(req.user, writerId);

    let writerContact = null;
    let writerContactRevealStatus = null;

    if (viewerCanSeeWriterContact) {
      const alreadyRevealed = hasRevealedContact(req.user, writerId);
      if (alreadyRevealed) {
        writerContact = buildWriterContactPayload(
          await User.findById(writerId).select("email phone writerProfile.links").lean()
        );
      }
      writerContactRevealStatus = {
        canReveal: !hasReachedContactLimit(req.user) || alreadyRevealed,
        alreadyRevealed,
        remainingContacts: getRemainingContacts(req.user),
        contactsLimit: getContactsLimit(req.user),
        contactsUsed: getRevealedContactCount(req.user),
      };
    }

    const response = {
      ...script.toObject(),
      collaborationStats: getCollaborationStats(script),
      isUnlocked,
      isCreator,
      isAdmin,
      isCollaborator: isAcceptedCollaborator,
      collaboratorRole: isAcceptedCollaborator ? collaboratorRole : null,
      collaboratorAccessLevel: isAcceptedCollaborator ? resolveCollaboratorAccessLevel(script, req.user._id) : null,
      canEditScript: isCreator || canCollaboratorWrite,
      canEditMetadata: isCreator,
      canViewFullScript,
      isSynopsisLocked,
      canPurchase,
      canRequestCollab: script.collabVisibility === "open" && !isCreator && !isAcceptedCollaborator,
      isWriter: isWriter && !isCreator,
      auditionCount,
      myPendingRequest,
      myCollabRequest,
      pendingRequestsCount,
      viewBreakdown,
      reviewBreakdown,
      writerContact,
      writerContactRevealStatus,
      viewableScript: hasViewablePreview,
      scriptPreviewAccess: normalizedPreviewAccess,
      scriptPreviewSummary: previewSummary,
      previewExcerpt,
      scriptPreviewPageTexts: hasViewablePreview ? getScriptPreviewPageTexts(script) : [],
      // Always return full synopsis. Only script body/content remains gated.
      synopsis: script.synopsis,
      // DEF-25: all FOUR body fields are gated together now. `fullContent` and `textContent` were
      // gated here from the start; `fountainContent` (the canonical screenplay, which the client
      // reader prefers over textContent) and `fileUrl` (the private URL of the stored PDF) rode
      // out on the `...script.toObject()` spread above and defeated that gate. One decision, in
      // one file, pinned by scriptDetailPayload.test.js.
      ...buildScriptDetailBodyAccess({ script, canViewFullScript }),
      canonicalPath: buildScriptCanonicalPath(script),
      shareMeta: buildScriptShareMeta(req, script),
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getScriptByPath = async (req, res) => {
  try {
    const scriptId = await resolveScriptIdByPath({
      projectHeading: req.params.projectHeading,
      writerUsername: req.params.writerUsername,
    });

    if (!scriptId) {
      return res.status(404).json({ message: "Script not found" });
    }

    req.params.id = scriptId;
    return getScriptById(req, res);
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to resolve script path" });
  }
};

export const getPublicScriptById = async (req, res) => {
  try {
    const scriptId = String(req.params.id || "").trim();
    if (!scriptId || !mongoose.isValidObjectId(scriptId)) {
      return res.status(404).json({ message: "Script not found" });
    }

    await expireActiveExclusiveLicenses({ scriptId });

    const script = await Script.findById(scriptId)
      .populate("creator", "name email phone profileImage role bio isPrivate isDeactivated writerProfile.username writerProfile.links")
      .populate("collaborators.userId", "name username writerProfile.username");

    if (!script) {
      return res.status(404).json({ message: "Script not found" });
    }

    const creator = script.creator || {};

    if (
      isIndustryProfessionalWithPersonalEmail(req.user) &&
      !hasActiveFilmIndustryProfessionalAccess(req.user) &&
      String(creator?._id || creator || "") !== String(req.user?._id || "")
    ) {
      return res.status(403).json({
        message: "To view scripts and writer profiles, sign up with a business email. To access writer contact details, purchase a Film Industry Professional plan.",
        requiresBusinessEmail: true,
      });
    }
    const isCreatorPrivate = Boolean(creator.isPrivate);
    const isCreatorDeactivated = Boolean(creator.isDeactivated);

    const isPubliclyViewable =
      script.status === "published" &&
      !script.isDeleted &&
      !script.isSold &&
      !isCreatorDeactivated &&
      !isCreatorPrivate;

    if (!isPubliclyViewable) {
      return res.status(404).json({ message: "Script not found" });
    }

    await hydrateScriptTextFromStoredPdf(script, { source: "getPublicScriptById" });

    const synopsis = String(script.synopsis || "");
    const synopsisTeaser = synopsis
      ? `${synopsis.slice(0, 320)}${synopsis.length > 320 ? "..." : ""}`
      : "";
    const collaborationSummary = getPublicCollaborationSummary(script);
    const publicWriterId = String(creator?._id || script.creator || "");
    const viewerCanSeeWriterContact = canViewerAccessWriterContact(req.user, publicWriterId);

    let writerContact = null;
    let writerContactRevealStatus = null;

    if (viewerCanSeeWriterContact) {
      const alreadyRevealed = hasRevealedContact(req.user, publicWriterId);
      if (alreadyRevealed) {
        writerContact = buildWriterContactPayload(
          await User.findById(publicWriterId).select("email phone writerProfile.links").lean()
        );
      }
      writerContactRevealStatus = {
        canReveal: !hasReachedContactLimit(req.user) || alreadyRevealed,
        alreadyRevealed,
        remainingContacts: getRemainingContacts(req.user),
        contactsLimit: getContactsLimit(req.user),
        contactsUsed: getRevealedContactCount(req.user),
      };
    }
    const hasViewablePreview = hasViewableScriptPreview(script);
    const normalizedPreviewAccess = hasViewablePreview
      ? normalizeScriptPreviewAccess(script.scriptPreviewAccess || {}, {
          mode: script.scriptPreviewAccess?.mode || "pages",
          start: script.scriptPreviewAccess?.start || 1,
          end: script.scriptPreviewAccess?.end || 8,
          maxUnits: Number(
            String(script.scriptPreviewAccess?.mode || "pages").toLowerCase() === "episodes"
              ? (script.scriptCompletion?.totalParts || 0)
              : ((Array.isArray(script.scriptPreviewPageTexts) && script.scriptPreviewPageTexts.length)
                || script.pageCount || 0)
          ),
        })
      : null;
    const previewSummary = hasViewablePreview ? getScriptPreviewLabel(normalizedPreviewAccess) : "";
    const previewExcerpt = hasViewablePreview ? getScriptPreviewExcerpt(script, normalizedPreviewAccess) : "";

    const publicScript = {
      _id: script._id,
      sid: script.sid,
      title: script.title,
      companyName: script.companyName || "",
      logline: script.logline || "",
      description: script.description || "",
      synopsis: synopsisTeaser,
      genre: script.genre || "",
      primaryGenre: script.primaryGenre || "",
      subGenres: Array.isArray(script.subGenres) ? script.subGenres : [],
      format: script.format || "",
      formatOther: script.formatOther || "",
      price: Number(script.price || 0),
      pageCount: Number(script.pageCount || 0),
      budget: script.budget || "",
      views: Number(script.views || 0),
      collabVisibility: script.collabVisibility || "private",
      canRequestCollab: script.collabVisibility === "open",
      tags: Array.isArray(script.tags) ? script.tags.slice(0, 20) : [],
      classification: {
        primaryGenre: script.classification?.primaryGenre || "",
        secondaryGenre: script.classification?.secondaryGenre || "",
        tones: Array.isArray(script.classification?.tones) ? script.classification.tones.slice(0, 8) : [],
        themes: Array.isArray(script.classification?.themes) ? script.classification.themes.slice(0, 8) : [],
        settings: Array.isArray(script.classification?.settings) ? script.classification.settings.slice(0, 8) : [],
      },
      contentIndicators: {
        bechdelTest: Boolean(script.contentIndicators?.bechdelTest),
        basedOnTrueStory: Boolean(script.contentIndicators?.basedOnTrueStory),
        adaptation: Boolean(script.contentIndicators?.adaptation),
        adaptationSource: script.contentIndicators?.adaptationSource || "",
      },
      scriptCompletion: normalizeScriptCompletionInput(script.scriptCompletion || {}, {}),
      viewableScript: hasViewablePreview,
      scriptPreviewAccess: normalizedPreviewAccess,
      scriptPreviewSummary: previewSummary,
      previewExcerpt,
      scriptPreviewStartText: hasViewablePreview ? getScriptPreviewPageTextByNumber(script, normalizedPreviewAccess.start) : "",
      scriptPreviewEndText: hasViewablePreview ? getScriptPreviewPageTextByNumber(script, normalizedPreviewAccess.end) : "",
      evaluation: script.scriptScore?.overall
        ? {
            overall: Number(script.scriptScore.overall || 0),
            plot: Number(script.scriptScore.plot || 0),
            characters: Number(script.scriptScore.characters || 0),
            dialogue: Number(script.scriptScore.dialogue || 0),
            pacing: Number(script.scriptScore.pacing || 0),
            marketability: Number(script.scriptScore.marketability || 0),
            feedback: script.scriptScore.feedback || "",
          }
        : null,
      roles: Array.isArray(script.roles)
        ? script.roles.slice(0, 30).map((role) => ({
            _id: role?._id,
            characterName: role?.characterName || "",
            description: role?.description || "",
            type: role?.type || "",
            ageRange: {
              min: Number(role?.ageRange?.min || 0) || undefined,
              max: Number(role?.ageRange?.max || 0) || undefined,
            },
            gender: role?.gender || "",
          }))
        : [],
      coverImage: script.coverImage || "",
      trailerUrl: script.trailerUrl || "",
      uploadedTrailerUrl: script.uploadedTrailerUrl || "",
      trailerSource: script.trailerSource || "none",
      createdAt: script.createdAt,
      publishedAt: script.publishedAt,
      collaborationStats: getCollaborationStats(script),
      collaborationSummary,
      writerContact,
      creator: {
        _id: creator._id,
        name: creator.name || "",
        role: creator.role || "",
        profileImage: creator.profileImage || "",
        bio: creator.bio || "",
        username: creator.writerProfile?.username || "",
      },
      writerContactRevealStatus,
      canonicalPath: buildScriptCanonicalPath(script),
      shareMeta: buildScriptShareMeta(req, script),
    };

    return res.json(publicScript);
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to fetch shared project" });
  }
};

export const unlockScript = async (req, res) => {
  try {
    const scriptObjectId = parseMongoObjectId(req.body.scriptId);
    if (!scriptObjectId) {
      return res.status(400).json({ message: "Invalid script ID." });
    }
    const script = await Script.findById(scriptObjectId);
    if (!script) return res.status(404).json({ message: "Script not found" });
    if (script.isDeleted) {
      return res.status(410).json({ message: "This project was deleted by creator and is no longer available for new purchases." });
    }

    await expireApprovedUnpaidRequests({ scriptId: script._id });
    await expireActiveExclusiveLicenses({ scriptId: script._id });

    // Only investors, producers, directors, and industry professionals can unlock
    const allowedRoles = ['investor', 'producer', 'director', 'industry', 'professional'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Only investors, producers, and directors can unlock scripts. Writers cannot purchase synopsis access."
      });
    }

    // Cannot unlock own script
    if (script.creator.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: "You already have access to your own script" });
    }

    return res.status(409).json({
      message: "Direct unlock is disabled. Submit a purchase request and complete legal acceptance in the payment flow.",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── PURCHASE REQUEST WORKFLOW ────────────────────────────────────────────────

// Investor submits a purchase request for a script (no upfront payment)
export const requestScriptPurchase = async (req, res) => {
  try {
    const { scriptId, note } = req.body;
    const defaultRequestNote = "I like your synopsis and I want to buy your project.";

    const allowedRoles = ["investor", "producer", "director", "industry", "professional"];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Only investors and industry professionals can request script purchases." });
    }

    const scriptObjectId = parseMongoObjectId(scriptId);
    if (!scriptObjectId) {
      return res.status(400).json({ message: "Invalid script ID." });
    }

    const script = await Script.findById(scriptObjectId).populate("creator", "name email");
    if (!script) return res.status(404).json({ message: "Script not found" });
    if (script.isDeleted) {
      return res.status(410).json({ message: "This project was deleted by creator and is no longer available for new purchases." });
    }

    if (script.creator._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: "You cannot purchase your own script." });
    }

    if (hasUserInIdArray(script.unlockedBy, req.user._id) || hasUserInIdArray(script.purchasedBy, req.user._id)) {
      return res.status(400).json({ message: "You already have access to this script." });
    }

    if (script.isSold || script.transactionStatus === "sold_licensed") {
      return res.status(409).json({ message: "This script is no longer available for additional buyers." });
    }

    await expireApprovedUnpaidRequests({ scriptId: script._id });
    const now = new Date();
    const activeApprovedClause = getApprovedUnpaidActiveClause(now);

    // Prevent duplicate active request flows for same investor/script.
    const existing = await ScriptPurchaseRequest.findOne({
      script: scriptObjectId,
      investor: req.user._id,
      $or: [
        { status: "pending" },
        activeApprovedClause,
      ],
    }).sort({ createdAt: -1 });

    if (existing) {
      if (existing.status === "approved" && existing.paymentStatus !== "released" && Number(existing.amount || 0) > 0) {
        return res.status(400).json({ message: "Your request is already approved. Complete payment to unlock full script access." });
      }
      return res.status(400).json({ message: "You already have a pending purchase request for this script." });
    }

    const investor = await User.findById(req.user._id).select("name email role industryProfile.subRole");
    const amount = Number(script.price || 0);
    const sanitizedNote = String(note || defaultRequestNote).trim() || defaultRequestNote;

    const purchaseRequest = await ScriptPurchaseRequest.create({
      script: scriptObjectId,
      investor: req.user._id,
      writer: script.creator._id,
      amount,
      frozenAmount: 0,
      paymentMethod: "manual",
      paymentStatus: "pending",
      note: sanitizedNote,
    });

    const requesterType = getPurchaseRequesterLabel(investor);

    // Notify writer in-app
    await Notification.create({
      user: script.creator._id,
      type: "purchase_request",
      from: req.user._id,
      script: script._id,
      message: `${investor.name} (${requesterType}) requested to buy "${script.title}"${amount > 0 ? ` for ₹${amount.toLocaleString("en-IN")}` : ""}. Request message: "${sanitizedNote}". Review in your dashboard.`,
    });

    // Email writer
    sendPurchaseRequestEmail(
      script.creator.email,
      script.creator.name,
      investor.name,
      requesterType,
      script.title,
      amount,
      sanitizedNote,
      {
        clientBaseUrl: resolveClientOriginFromRequest(req),
      }
    ).catch((err) => console.error("[Purchase] Failed to send request email:", err.message));

    res.status(201).json({
      message: amount > 0
        ? "Purchase request sent. Complete payment after writer approval."
        : "Purchase request submitted successfully.",
      purchaseRequest,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Writer approves a purchase request
export const approveScriptPurchase = async (req, res) => {
  try {
    const purchaseRequest = await ScriptPurchaseRequest.findById(req.params.id)
      .populate("script")
      .populate("investor", "name email wallet");

    if (!purchaseRequest) return res.status(404).json({ message: "Purchase request not found." });
    if (purchaseRequest.writer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the script writer can approve this request." });
    }
    if (purchaseRequest.status !== "pending") {
      return res.status(400).json({ message: "This request has already been processed." });
    }

    const script = purchaseRequest.script;
    await expireApprovedUnpaidRequests({ scriptId: script?._id });

    if (script.isDeleted) {
      return res.status(410).json({ message: "This project was deleted by creator and cannot be approved for new purchase." });
    }
    if (script.isSold || script.transactionStatus === "sold_licensed") {
      return res.status(409).json({ message: "This script has already been sold to another professional." });
    }

    const alreadyApprovedRequest = await ScriptPurchaseRequest.findOne({
      script: script._id,
      _id: { $ne: purchaseRequest._id },
      status: "approved",
      paymentStatus: { $ne: "released" },
    }).select("_id investor paymentStatus paymentDueAt updatedAt createdAt").lean();

    if (alreadyApprovedRequest) {
      const nowForWait = new Date();
      const approvedAt = alreadyApprovedRequest?.updatedAt || alreadyApprovedRequest?.createdAt || nowForWait;
      const waitUntil = alreadyApprovedRequest?.paymentDueAt
        ? new Date(alreadyApprovedRequest.paymentDueAt)
        : getApprovedPaymentDueAt(approvedAt);
      const hoursRemaining = Math.max(0, Math.ceil((new Date(waitUntil).getTime() - nowForWait.getTime()) / (60 * 60 * 1000)));

      return res.status(409).json({
        code: "APPROVAL_LOCK_ACTIVE",
        waitUntil,
        hoursRemaining,
        message: "You have already approved another film industry professional for this script. You may approve a different professional only after 3 days if the previously approved professional does not complete the payment.",
      });
    }

    const investor = purchaseRequest.investor;
    const writer = await User.findById(req.user._id);
    const amountToRelease = Number(purchaseRequest.frozenAmount || purchaseRequest.amount || 0);
    const payableAmount = amountToRelease > 0
      ? getScriptPurchasePricing(amountToRelease).totalAmount
      : 0;
    const paymentMethod = purchaseRequest.paymentMethod || "wallet";
    const hasEscrowHold = amountToRelease > 0 && purchaseRequest.paymentStatus === "escrow_held";

    // New request-first flow: approve first, then ask buyer to pay.
    if (!hasEscrowHold && amountToRelease > 0) {
      const paymentDueAt = getApprovedPaymentDueAt(new Date());
      purchaseRequest.status = "approved";
      purchaseRequest.paymentStatus = "pending";
      purchaseRequest.paymentMethod = "manual";
      purchaseRequest.frozenAmount = 0;
      purchaseRequest.paymentDueAt = paymentDueAt;
      purchaseRequest.settledAt = undefined;
      await purchaseRequest.save();

      await Notification.create({
        user: investor._id,
        type: "purchase_approved",
        from: req.user._id,
        script: script._id,
        message: `${writer.name} approved your request for "${script.title}". Please pay ₹${payableAmount.toLocaleString("en-IN")} (includes 5% platform commission) within ${APPROVED_UNPAID_EXPIRY_HOURS} hours to unlock full script access.`,
      });

      sendPurchaseApprovedEmail(
        investor.email,
        investor.name,
        writer.name,
        script.title,
        script._id.toString(),
        {
          requiresPayment: true,
          amount: payableAmount,
          paymentDueAt,
          clientBaseUrl: resolveClientOriginFromRequest(req),
        }
      ).catch((err) => console.error("[Purchase] Failed to send approval email:", err.message));

      return res.json({
        message: "Purchase request approved. Buyer has been notified to complete payment for access.",
        purchaseRequest,
      });
    }

    const investorDoc = await User.findById(investor._id);
    if (!investorDoc) {
      return res.status(404).json({ message: "Investor account not found." });
    }

    if (!investorDoc.wallet) {
      investorDoc.wallet = {
        balance: 0,
        currency: "INR",
        pendingBalance: 0,
        totalEarnings: 0,
        totalWithdrawals: 0,
      };
    }

    if (!writer.wallet) {
      writer.wallet = {
        balance: 0,
        currency: "INR",
        pendingBalance: 0,
        totalEarnings: 0,
        totalWithdrawals: 0,
      };
    }

    if (amountToRelease > 0) {
      if (paymentMethod === "wallet") {
        if ((investorDoc.wallet.pendingBalance || 0) < amountToRelease) {
          return res.status(409).json({
            message: "Escrow amount is unavailable. Please contact support.",
          });
        }
        investorDoc.wallet.pendingBalance -= amountToRelease;
      }

      const writerBalanceBefore = writer.wallet.balance || 0;
      writer.wallet.balance = writerBalanceBefore + amountToRelease;
      writer.wallet.totalEarnings = (writer.wallet.totalEarnings || 0) + amountToRelease;

      await investorDoc.save();
      await writer.save();

      const pendingEscrowTx = await Transaction.findOne({
        user: investor._id,
        relatedScript: script._id,
        status: "pending",
        "metadata.purchaseRequestId": purchaseRequest._id.toString(),
      }).sort({ createdAt: -1 });

      if (pendingEscrowTx) {
        const existingMetadata = pendingEscrowTx.metadata instanceof Map
          ? Object.fromEntries(pendingEscrowTx.metadata)
          : (pendingEscrowTx.metadata || {});
        pendingEscrowTx.status = "completed";
        pendingEscrowTx.description = `Purchased script: "${script.title}"`;
        pendingEscrowTx.metadata = {
          ...existingMetadata,
          stage: "settled_to_writer",
          settledAt: new Date().toISOString(),
          settlementMethod: paymentMethod,
          writerId: writer._id.toString(),
        };
        await pendingEscrowTx.save();
      }

      await Transaction.create({
        user: writer._id,
        type: "credit",
        amount: amountToRelease,
        currency: "INR",
        status: "completed",
        description: `Script purchase payout: "${script.title}"`,
        reference: `PRP-${Date.now()}-${purchaseRequest._id.toString().slice(-6).toUpperCase()}`,
        paymentMethod: paymentMethod === "razorpay" ? "razorpay" : "wallet",
        relatedScript: script._id,
        balanceBefore: writerBalanceBefore,
        balanceAfter: writer.wallet.balance,
        metadata: {
          purchaseRequestId: purchaseRequest._id.toString(),
          investorId: investor._id.toString(),
          scriptId: script._id.toString(),
        },
      });
    }

    // Grant access to the script
    if (!hasUserInIdArray(script.unlockedBy, investor._id)) {
      script.unlockedBy.push(investor._id);
    }
    script.purchasedBy = Array.isArray(script.purchasedBy) ? script.purchasedBy : [];
    if (!hasUserInIdArray(script.purchasedBy, investor._id)) {
      script.purchasedBy.push(investor._id);
    }

    script.isSold = true;
    script.purchaseRequestLocked = false;
    script.purchaseRequestLockedBy = null;
    script.purchaseRequestLockedAt = null;
    script.transactionStatus = "sold_licensed";
    await script.save();

    purchaseRequest.status = "approved";
    purchaseRequest.paymentStatus = "released";
    purchaseRequest.paymentDueAt = undefined;
    purchaseRequest.settledAt = new Date();
    await purchaseRequest.save();

    try {
      await createAgreementForSettledPurchase({
        script,
        purchaseRequest,
        writerUser: writer,
        buyerUser: investor,
        pricing: getScriptPurchasePricing(amountToRelease),
        req,
      });
    } catch (agreementError) {
      console.error("[Purchase] Agreement generation failed on legacy settlement path:", agreementError?.message || agreementError);
    }

    // Notify investor in-app
    await Notification.create({
      user: investor._id,
      type: "purchase_approved",
      from: req.user._id,
      script: script._id,
      message: `${writer.name} approved your purchase request for "${script.title}". You now have full access${amountToRelease > 0 ? " and escrow was released to the writer" : ""}!`,
    });

    // Email investor
    sendPurchaseApprovedEmail(
      investor.email,
      investor.name,
      writer.name,
      script.title,
      script._id.toString(),
      {
        requiresPayment: false,
        amount: amountToRelease,
        clientBaseUrl: resolveClientOriginFromRequest(req),
      }
    ).catch((err) => console.error("[Purchase] Failed to send approval email:", err.message));

    const pendingSiblingRequests = await ScriptPurchaseRequest.find({
      script: script._id,
      _id: { $ne: purchaseRequest._id },
      status: "pending",
    })
      .populate("investor", "_id name email")
      .select("_id investor")
      .lean();

    if (pendingSiblingRequests.length > 0) {
      const siblingRequestIds = pendingSiblingRequests.map((row) => row._id);
      const autoRejectNote = `Request closed automatically: writer approved another professional for \"${script.title}\".`;

      await ScriptPurchaseRequest.updateMany(
        { _id: { $in: siblingRequestIds } },
        {
          $set: {
            status: "rejected",
            settledAt: new Date(),
            note: autoRejectNote,
          },
        }
      );

      const rejectionNotifications = pendingSiblingRequests
        .filter((row) => row?.investor?._id)
        .map((row) => ({
          user: row.investor._id,
          type: "purchase_rejected",
          from: req.user._id,
          script: script._id,
          message: `${writer.name} approved another professional for \"${script.title}\". Your request was closed.`,
        }));

      if (rejectionNotifications.length > 0) {
        await Notification.insertMany(rejectionNotifications);
      }

      pendingSiblingRequests.forEach((row) => {
        if (!row?.investor?.email) return;
        sendPurchaseRejectedEmail(
          row.investor.email,
          row.investor.name || "Professional",
          writer.name,
          script.title,
          autoRejectNote,
          {
            refundAmount: 0,
            clientBaseUrl: resolveClientOriginFromRequest(req),
          }
        ).catch((err) => console.error("[Purchase] Failed to send sibling rejection email:", err.message));
      });
    }

    res.json({
      message: "Purchase request approved. Investor now has full script access and funds were transferred to the writer.",
      purchaseRequest,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Writer rejects a purchase request
export const rejectScriptPurchase = async (req, res) => {
  try {
    const { note } = req.body;

    const purchaseRequest = await ScriptPurchaseRequest.findById(req.params.id)
      .populate("script")
      .populate("investor", "name email wallet");

    if (!purchaseRequest) return res.status(404).json({ message: "Purchase request not found." });
    if (purchaseRequest.writer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the script writer can reject this request." });
    }
    if (purchaseRequest.status !== "pending") {
      return res.status(400).json({ message: "This request has already been processed." });
    }

    const script = purchaseRequest.script;
    const investor = purchaseRequest.investor;
    const writer = await User.findById(req.user._id);
    const hasEscrowHold = Number(purchaseRequest.frozenAmount || 0) > 0 && purchaseRequest.paymentStatus === "escrow_held";
    const amountToRefund = hasEscrowHold ? Number(purchaseRequest.frozenAmount || purchaseRequest.amount || 0) : 0;
    const paymentMethod = purchaseRequest.paymentMethod || "wallet";
    let gatewayRefundId = "";

    if (amountToRefund > 0) {
      if (paymentMethod === "wallet") {
        const investorDoc = await User.findById(investor._id);
        if (!investorDoc) {
          return res.status(404).json({ message: "Investor account not found." });
        }

        if (!investorDoc.wallet) {
          investorDoc.wallet = {
            balance: 0,
            currency: "INR",
            pendingBalance: 0,
            totalEarnings: 0,
            totalWithdrawals: 0,
          };
        }

        const pendingBefore = investorDoc.wallet.pendingBalance || 0;
        const balanceBefore = investorDoc.wallet.balance || 0;

        investorDoc.wallet.pendingBalance = Math.max(0, pendingBefore - amountToRefund);
        investorDoc.wallet.balance = balanceBefore + amountToRefund;
        const balanceAfter = investorDoc.wallet.balance;
        await investorDoc.save();

        await Transaction.create({
          user: investor._id,
          type: "refund",
          amount: amountToRefund,
          currency: "INR",
          status: "completed",
          description: `Refund for rejected purchase request: "${script.title}"`,
          reference: `PRR-${Date.now()}-${purchaseRequest._id.toString().slice(-6).toUpperCase()}`,
          paymentMethod: "wallet",
          relatedScript: script._id,
          balanceBefore,
          balanceAfter,
          metadata: {
            purchaseRequestId: purchaseRequest._id.toString(),
            writerId: writer._id.toString(),
            scriptId: script._id.toString(),
            rejectionNote: note || "",
          },
        });
      } else if (paymentMethod === "razorpay") {
        if (!purchaseRequest.paymentGatewayPaymentId) {
          return res.status(409).json({ message: "Payment reference missing for refund. Please contact support." });
        }

        // The one refund path: Razorpay refund + credit note + ledger reversal (a NEW entry pointing at
        // the original, never an edit of it), with the taxes reversed pro rata. The whole captured
        // amount — taxes included — goes back. With no ledger original on file (an escrow from before
        // the ledger), the frozen amount is refunded and no standalone negative row is invented.
        const refunded = await refundPayment({
          razorpay: getRazorpay(),
          paymentId: purchaseRequest.paymentGatewayPaymentId,
          // An escrow paid before the ledger existed is not on the books; refund what was frozen.
          fallbackAmountMinor: Math.round(amountToRefund * 100),
          reason: "Purchase request denied by writer",
          notes: {
            purchaseRequestId: purchaseRequest._id.toString(),
            scriptId: script._id.toString(),
            writerId: writer._id.toString(),
          },
          source: "scriptController.rejectScriptPurchase",
        });
        if (!refunded.ok) {
          return res.status(refunded.status || 502).json({ message: refunded.message });
        }
        gatewayRefundId = refunded.refund?.id || "";

        // What actually went back — the whole captured amount, taxes included, in the currency paid —
        // rather than the pre-tax escrow figure.
        await Transaction.create({
          user: investor._id,
          type: "refund",
          amount: refunded.amountMinor ? refunded.amountMinor / 100 : amountToRefund,
          currency: refunded.currency || "INR",
          status: "completed",
          description: `Refund to original payment method for rejected request: "${script.title}"`,
          reference: `PRR-RZP-${purchaseRequest.paymentGatewayPaymentId}`,
          paymentMethod: "razorpay",
          relatedScript: script._id,
          metadata: {
            purchaseRequestId: purchaseRequest._id.toString(),
            writerId: writer._id.toString(),
            scriptId: script._id.toString(),
            gatewayPaymentId: purchaseRequest.paymentGatewayPaymentId,
            gatewayOrderId: purchaseRequest.paymentGatewayOrderId || "",
            gatewayRefundId,
            taxMinor: refunded.taxMinor || 0,
            rejectionNote: note || "",
          },
        });
      }

      const pendingEscrowTx = await Transaction.findOne({
        user: investor._id,
        relatedScript: script._id,
        status: "pending",
        "metadata.purchaseRequestId": purchaseRequest._id.toString(),
      }).sort({ createdAt: -1 });

      if (pendingEscrowTx) {
        const existingMetadata = pendingEscrowTx.metadata instanceof Map
          ? Object.fromEntries(pendingEscrowTx.metadata)
          : (pendingEscrowTx.metadata || {});
        pendingEscrowTx.status = "cancelled";
        pendingEscrowTx.description = `Escrow released back to wallet: "${script.title}"`;
        pendingEscrowTx.metadata = {
          ...existingMetadata,
          stage: "refunded_to_investor",
          refundedAt: new Date().toISOString(),
          refundMethod: paymentMethod,
          gatewayRefundId,
          rejectionNote: note || "",
        };
        await pendingEscrowTx.save();
      }
    }

    purchaseRequest.status = "rejected";
    purchaseRequest.paymentStatus = amountToRefund > 0 ? "refunded" : purchaseRequest.paymentStatus;
    purchaseRequest.settledAt = new Date();
    if (note) purchaseRequest.note = note;
    await purchaseRequest.save();

    const hasPendingRequests = await ScriptPurchaseRequest.exists({
      script: script._id,
      status: "pending",
    });

    if (!hasPendingRequests) {
      script.purchaseRequestLocked = false;
      script.purchaseRequestLockedBy = null;
      script.purchaseRequestLockedAt = null;
      if (!script.isSold) {
        script.transactionStatus = "available";
      }
      await script.save();
    }

    // Notify investor in-app
    await Notification.create({
      user: investor._id,
      type: "purchase_rejected",
      from: req.user._id,
      script: script._id,
      message: `${writer.name} denied your request to buy "${script.title}"${amountToRefund > 0 ? ` and ₹${amountToRefund} was refunded` : ""}.`,
    });

    // Email investor
    sendPurchaseRejectedEmail(
      investor.email,
      investor.name,
      writer.name,
      script.title,
      note || "",
      {
        refundAmount: amountToRefund,
        clientBaseUrl: resolveClientOriginFromRequest(req),
      }
    ).catch((err) => console.error("[Purchase] Failed to send rejection email:", err.message));

    res.json({
      message: amountToRefund > 0
        ? "Purchase request rejected. Payment was refunded to the investor."
        : "Purchase request rejected. Buyer was notified.",
      purchaseRequest,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get purchase requests — writers see incoming requests, investors see their own
export const getMyPurchaseRequests = async (req, res) => {
  try {
    await expireApprovedUnpaidRequests({ userId: req.user._id });

    const { role } = req.user;
    const isWriterRole = ["writer", "creator"].includes(role);
    const isInvestorRole = ["investor", "producer", "director", "industry", "professional"].includes(role);

    let requests;
    const requestedLimit = Number.parseInt(req.query?.limit, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(50, Math.max(1, requestedLimit)) : 50;

    if (isWriterRole) {
      requests = await ScriptPurchaseRequest.find({ writer: req.user._id })
        .populate("script", "title price thumbnailUrl isDeleted deletedAt")
        .populate("investor", "name profileImage role")
        .sort({ createdAt: -1 })
        .limit(limit);
    } else if (isInvestorRole) {
      requests = await ScriptPurchaseRequest.find({ investor: req.user._id })
        .populate("script", "title price thumbnailUrl creator isDeleted deletedAt")
        .populate("writer", "name profileImage role")
        .sort({ createdAt: -1 })
        .limit(limit);
    } else {
      return res.status(403).json({ message: "Access denied." });
    }

    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

// Release a hold
export const releaseHold = async (req, res) => {
  try {
    const optionObjectId = parseMongoObjectId(req.body?.optionId);
    const scriptObjectId = parseMongoObjectId(req.body?.scriptId);
    if (!optionObjectId && !scriptObjectId) {
      return res.status(400).json({ message: "A valid option or script ID is required." });
    }

    const identity = optionObjectId ? { _id: optionObjectId } : { script: scriptObjectId };
    const option = await ScriptOption.findOneAndUpdate(
      { ...identity, holder: req.user._id, status: "active", endDate: { $gt: new Date() } },
      { $set: { status: "cancelled" } },
      { new: true }
    );
    if (!option) {
      const existing = await ScriptOption.findOne({ ...identity, holder: req.user._id }).select("status endDate");
      return res.status(existing ? 409 : 404).json({
        message: existing ? "This option is no longer active." : "Option not found.",
      });
    }

    // The option is the money record and remains authoritative even if the writer deleted the
    // project. Only clear a project that is still held by this exact account.
    await Script.updateOne(
      { _id: option.script, heldBy: req.user._id },
      { $set: { holdStatus: "available", heldBy: null, holdStartDate: null, holdEndDate: null } }
    );

    res.json({
      message: "Hold released",
      option: { id: option._id, status: option.status, scriptId: option.script },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get script options/holds for current user
export const getMyHolds = async (req, res) => {
  try {
    if (!isFilmIndustryProfessionalRole(req.user)) {
      return res.status(403).json({ message: "Only industry professionals can view holds." });
    }
    const limit = asInt(req.query?.limit, { min: 1, max: 100, fallback: 100 });
    const options = await ScriptOption.find({ holder: req.user._id })
      .select("script fee platformCut creatorPayout startDate endDate status convertedToSale createdAt updatedAt")
      .populate({
        path: "script",
        select: "title genre coverImage creator price trailerThumbnail",
        populate: { path: "creator", select: "name profileImage" }
      })
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json(options);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Add roles to a script
export const addRoles = async (req, res) => {
  try {
    const { scriptId, roles } = req.body;
    const scriptObjectId = parseMongoObjectId(scriptId);
    if (!scriptObjectId) {
      return res.status(400).json({ message: "Invalid script ID." });
    }
    const script = await Script.findById(scriptObjectId);

    if (!script) return res.status(404).json({ message: "Script not found" });
    if (script.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the creator can add roles" });
    }

    script.roles.push(...roles);
    await script.save();

    res.json({ message: "Roles added", roles: script.roles });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Reader Endpoints ───

export const getFeaturedScripts = async (req, res) => {
  try {
    const { page, limit, paged } = parseScriptListPaging(req.query);
    const now = new Date();
    const featuredFilter = {
      $or: [
        {
          "promotion.spotlightActive": true,
          "promotion.spotlightEndAt": { $gte: now },
        },
        { isFeatured: true },
      ],
    };

    // Step 1: rank published scripts by trendScore via aggregation
    const ranked = await Script.aggregate([
      { $match: { ...PUBLIC_SCRIPT_FILTER, ...featuredFilter } },
      {
        $lookup: {
          from: "users",
          localField: "creator",
          foreignField: "_id",
          as: "creatorDoc",
        },
      },
      { $unwind: { path: "$creatorDoc", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          $or: [
            { "creatorDoc.role": { $nin: ["writer", "creator"] } },
            { "creatorDoc.subscription.plan": "gold" },
            { "creatorDoc.subscription.accessTier": "writer_gold" },
          ],
        },
      },
      {
        $addFields: {
          verifiedPriority: {
            $cond: [{ $eq: [{ $ifNull: ["$verifiedBadge", false] }, true] }, 1, 0],
          },
          aiTrailerPriority: {
            $cond: [{ $eq: [{ $ifNull: ["$services.aiTrailer", false] }, true] }, 1, 0],
          },
          evaluationPriority: {
            $cond: [{ $eq: [{ $ifNull: ["$services.evaluation", false] }, true] }, 1, 0],
          },
          spotlightPriority: {
            $cond: [
              {
                $and: [
                  { $ifNull: ["$promotion.spotlightActive", false] },
                  { $gte: ["$promotion.spotlightEndAt", now] },
                ],
              },
              1,
              0,
            ],
          },
          trendScore: {
            $add: [
              { $multiply: [{ $ifNull: ["$reviewCount", 0] }, 3] },
              { $multiply: [{ $ifNull: ["$readsCount", 0] }, 2] },
              { $ifNull: ["$views", 0] },
            ],
          },
        },
      },
      { $sort: { verifiedPriority: -1, aiTrailerPriority: -1, evaluationPriority: -1, spotlightPriority: -1, trendScore: -1, rating: -1, createdAt: -1 } },
      /*
       * A caller asking for a page gets an authoritative count and its own
       * slice; the historical caller keeps the hard 12-item editorial set it
       * has always received. Both branches read the same ranking, so a paged
       * page 1 and the legacy response agree on order.
       */
      ...(paged
        ? [{
          $facet: {
            ids: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { _id: 1 } }],
            meta: [{ $count: "total" }],
          },
        }]
        : [{ $limit: 12 }, { $project: { _id: 1 } }]),
    ]);

    const facet = paged ? (ranked[0] || {}) : null;
    const rankedIds = paged ? (facet.ids || []) : ranked;
    const total = paged ? Math.max(0, Number(facet.meta?.[0]?.total || 0)) : rankedIds.length;

    if (!rankedIds.length) {
      if (paged) {
        return res.json({ scripts: [], pagination: buildScriptListPagination({ page, limit, total }) });
      }
      return res.json([]);
    }

    const ids = rankedIds.map((s) => s._id);

    // Step 2: fetch the display documents with populated creator (preserving
    // sort order). Script bodies and private asset URLs are excluded here as
    // well — this is a discovery list, not a reader response (DEF-21).
    const docs = await Script.find({ _id: { $in: ids }, ...PUBLIC_SCRIPT_FILTER, ...featuredFilter })
      .select(SCRIPT_LIST_BODY_FIELDS.map((field) => `-${field}`).join(" "))
      .populate("creator", "name profileImage role");

    const idStr = (id) => id.toString();
    const docMap = Object.fromEntries(docs.map((d) => [idStr(d._id), d]));
    const ordered = ids.map((id) => docMap[idStr(id)]).filter(Boolean);

    if (paged) {
      return res.json({
        scripts: ordered,
        pagination: buildScriptListPagination({ page, limit, total }),
      });
    }
    res.json(ordered);
  } catch (error) {
    console.error("getFeaturedScripts error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const getTopScripts = async (req, res) => {
  try {
    const now = new Date();
    const blockedUserIds = await getBlockedUserIdsForViewer(req.user._id);
    const sortBy = req.query.sort || "rating";
    let sortObj = { rating: -1, _id: -1 };
    if (sortBy === "reads") sortObj = { readsCount: -1, _id: -1 };
    if (sortBy === "purchases") sortObj = { "unlockedBy": -1, _id: -1 };
    const query = { ...PUBLIC_SCRIPT_FILTER };
    if (blockedUserIds.length > 0) {
      query.creator = { $nin: blockedUserIds };
    }
    const scriptsAggregation = await Script.aggregate([
      { $match: query },
      {
        $lookup: {
          from: "users",
          localField: "creator",
          foreignField: "_id",
          as: "creatorDoc",
        },
      },
      { $unwind: { path: "$creatorDoc", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          $or: [
            { "creatorDoc.role": { $ne: "writer" } },
            { "creatorDoc.subscription.plan": { $in: ["silver", "gold"] } },
            { "creatorDoc.subscription.accessTier": { $in: ["writer_silver", "writer_gold"] } },
          ],
        },
      },
      { $sort: sortObj },
      { $limit: 20 },
      { $project: { _id: 1 } },
    ]);

    const ids = scriptsAggregation.map((s) => s._id);

    const scripts = await Script.find({ _id: { $in: ids } })
      .populate("creator", "name profileImage role")
      .sort(sortObj);

    const boostedFirst = [...scripts].sort((a, b) => {
      const aVerified = a?.verifiedBadge ? 1 : 0;
      const bVerified = b?.verifiedBadge ? 1 : 0;
      if (aVerified !== bVerified) return bVerified - aVerified;

      const aTrailer = a?.services?.aiTrailer ? 1 : 0;
      const bTrailer = b?.services?.aiTrailer ? 1 : 0;
      if (aTrailer !== bTrailer) return bTrailer - aTrailer;

      const aEvaluation = a?.services?.evaluation ? 1 : 0;
      const bEvaluation = b?.services?.evaluation ? 1 : 0;
      if (aEvaluation !== bEvaluation) return bEvaluation - aEvaluation;

      const aBoost = isSpotlightActive(a, now) ? 1 : 0;
      const bBoost = isSpotlightActive(b, now) ? 1 : 0;
      if (aBoost !== bBoost) return bBoost - aBoost;
      return 0;
    });

    res.json(boostedFirst);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const searchScriptsReader = async (req, res) => {
  try {
    if (String(req.user?.role || "").toLowerCase() !== "reader") {
      return res.status(403).json({ message: "Reader discovery is available only to reader accounts." });
    }
    const { q, category, genre, page = 1, limit = 20 } = req.query;
    const query = { ...PUBLIC_SCRIPT_FILTER };
    const blockedUserIds = await getBlockedUserIdsForViewer(req.user._id);
    if (blockedUserIds.length > 0) {
      query.creator = { $nin: blockedUserIds };
    }
    const regex = asSearchRegex(q);
    if (regex) {
      query.$or = [{ sid: regex }, { title: regex }, { description: regex }, { logline: regex }, { tags: regex }];
    }
    // Equality facets must arrive as strings; an object would be read by Mongo as an operator.
    const categoryFilter = asTrimmedString(category);
    const genreFilter = asTrimmedString(genre);
    if (categoryFilter) query.contentType = categoryFilter;
    if (genreFilter) query.genre = genreFilter;
    const pageNumber = asInt(page, { min: 1, max: 1000, fallback: 1 });
    const pageSize = asInt(limit, { min: 1, max: 24, fallback: 12 });
    const total = await Script.countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(pageNumber, totalPages);
    const scripts = await Script.find(query)
      .select([...VISITOR_PROFILE_SCRIPT_FIELDS, "readsCount", "rating", "verifiedBadge"].join(" "))
      .populate("creator", "name profileImage role writerProfile.username")
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize)
      .lean();

    res.json({ scripts, totalPages, page: currentPage, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getLatestScripts = async (req, res) => {
  try {
    const scripts = await Script.find({ ...PUBLIC_SCRIPT_FILTER })
      .populate("creator", "name profileImage role")
      .sort({ createdAt: -1 })
      .limit(18);
    res.json(scripts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const recordRead = async (req, res) => {
  try {
    const updatedScript = await Script.findByIdAndUpdate(
      req.params.id,
      { $inc: { readsCount: 1 } },
      { new: true, select: "_id" }
    );
    
    if (!updatedScript) return res.status(404).json({ message: "Script not found" });
    
    await User.findByIdAndUpdate(req.user._id, { $addToSet: { scriptsRead: updatedScript._id } });

    trackInvestorInteraction({
      userId: req.user._id,
      scriptId: updatedScript._id,
      type: "read",
      source: "script_reader",
    }).catch(() => null);

    res.json({ message: "Read recorded" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const toggleFavorite = async (req, res) => {
  try {
    const userId = req.user._id;
    const scriptId = req.params.id;

    // Check if the script exists fast before mutating arrays
    const scriptExists = await Script.exists({ _id: scriptId });
    if (!scriptExists) return res.status(404).json({ message: "Script not found" });

    // Use MongoDB atomic updates. Try removing first.
    const userWithRemoved = await User.findOneAndUpdate(
      { _id: userId, favoriteScripts: scriptId },
      { $pull: { favoriteScripts: scriptId } },
      { new: true }
    );

    if (userWithRemoved) {
      // It was in the array, so we removed it.
      return res.json({ favorited: false });
    } else {
      // It wasn't in the array, so add it.
      await User.findByIdAndUpdate(
        userId,
        { $addToSet: { favoriteScripts: scriptId } }
      );

      trackInvestorInteraction({
        userId: userId,
        scriptId: scriptId,
        type: "save",
        source: "favorite_toggle",
      }).catch(() => null);

      return res.json({ favorited: true });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const trackScriptInteraction = async (req, res) => {
  try {
    const { type, timeSpentMs, source, metadata } = req.body || {};
    const allowedTypes = new Set(["view", "like", "save", "click", "time_spent", "read"]);
    if (!allowedTypes.has(type)) {
      return res.status(400).json({ message: "Invalid interaction type" });
    }

    const script = await Script.findById(req.params.id).select("_id status");
    if (!script || script.status !== "published") {
      return res.status(404).json({ message: "Script not found" });
    }

    if (type === "read") {
      await User.findByIdAndUpdate(req.user._id, {
        $addToSet: { scriptsRead: script._id },
      });
    }

    await trackInvestorInteraction({
      userId: req.user._id,
      scriptId: req.params.id,
      type,
      timeSpentMs: Number(timeSpentMs) > 0 ? Number(timeSpentMs) : 0,
      source: source || "client",
      metadata: metadata || {},
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getCategories = async (req, res) => {
  try {
    const contentTypes = await Script.distinct("contentType", { ...PUBLIC_SCRIPT_FILTER });
    const genres = await Script.distinct("genre", { ...PUBLIC_SCRIPT_FILTER });
    res.json({ contentTypes: contentTypes.filter(Boolean), genres: genres.filter(Boolean) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const normalizeGenre = (value = "") => {
  const raw = String(value || "").toLowerCase().trim();
  if (!raw) return "";
  const compact = raw.replace(/[\s_]+/g, "-");
  const aliases = {
    "science-fiction": "sci-fi",
    scifi: "sci-fi",
    "sci fi": "sci-fi",
    thriller: "thriller",
    drama: "drama",
    horror: "horror",
    comedy: "comedy",
    romance: "romance",
    action: "action",
    mystery: "mystery",
    fantasy: "fantasy",
    documentary: "documentary",
    crime: "crime",
    animation: "animation",
    adventure: "adventure",
    historical: "historical",
    musical: "musical",
  };
  return aliases[compact] || compact;
};

const normalizeFormat = (value = "") => {
  const raw = String(value || "").toLowerCase().trim();
  if (!raw) return "";
  if (raw.includes("song")) return "songs";
  if (raw.includes("standup") || raw.includes("stand-up")) return "standup-comedy";
  if (raw.includes("dialogue")) return "dialogues";
  if (raw.includes("poet") || raw.includes("poetry")) return "poet";
  if (raw.includes("feature")) return "feature";
  if (raw.includes("short")) return "short";
  if (raw.includes("limited")) return "limited-series";
  if (raw.includes("web")) return "web-series";
  if (raw.includes("documentary")) return "documentary";
  if (raw.includes("animation")) return "animation";
  if (raw.includes("tv")) return "tv-series";
  return raw.replace(/[\s_]+/g, "-");
};

const normalizeBudgetTier = (value = "") => {
  const raw = String(value || "").toLowerCase().trim();
  if (!raw) return "";
  if (raw.includes("micro")) return "micro";
  if (raw.includes("low")) return "low";
  if (raw.includes("mid") || raw.includes("medium")) return "medium";
  if (raw.includes("high")) return "high";
  if (raw.includes("tentpole") || raw.includes("blockbuster")) return "blockbuster";
  return raw;
};

const formatMatches = (script = {}, preferred = []) => {
  if (!preferred.length) return false;
  const scriptFormats = [script?.format, script?.contentType]
    .map(normalizeFormat)
    .filter(Boolean);
  return preferred.some((f) => scriptFormats.includes(f));
};

const budgetMatches = (script = {}, preferred = []) => {
  if (!preferred.length) return false;
  const sb = normalizeBudgetTier(script?.budget || "");
  if (!sb) return false;
  return preferred.includes(sb);
};

const inferGenresFromProfileText = (text = "") => {
  const source = String(text || "").toLowerCase();
  if (!source) return [];

  const keywordMap = {
    horror: ["horror", "slasher", "supernatural", "haunted"],
    drama: ["drama", "dramatic", "family drama", "emotional"],
    thriller: ["thriller", "suspense", "psychological thriller", "crime thriller"],
    comedy: ["comedy", "comic", "satire", "humor"],
    romance: ["romance", "romantic", "love story"],
    action: ["action", "adventure action", "high-octane"],
    mystery: ["mystery", "detective", "whodunit"],
    "sci-fi": ["sci-fi", "science fiction", "scifi", "futuristic"],
    fantasy: ["fantasy", "mythic", "magic"],
    documentary: ["documentary", "docu"],
  };

  const inferred = [];
  for (const [genre, keywords] of Object.entries(keywordMap)) {
    if (keywords.some((k) => source.includes(k))) inferred.push(genre);
  }
  return inferred;
};

const inferFormatsFromProfileText = (text = "") => {
  const source = String(text || "").toLowerCase();
  if (!source) return [];

  const inferred = [];
  if (source.includes("song")) inferred.push("songs");
  if (source.includes("standup") || source.includes("stand-up") || source.includes("comedy special")) inferred.push("standup-comedy");
  if (source.includes("dialogue")) inferred.push("dialogues");
  if (source.includes("poet") || source.includes("poetry")) inferred.push("poet");
  if (source.includes("feature")) inferred.push("feature");
  if (source.includes("short")) inferred.push("short");
  if (source.includes("web series") || source.includes("web-series")) inferred.push("web-series");
  if (source.includes("limited series") || source.includes("limited-series")) inferred.push("limited-series");
  if (source.includes("tv") || source.includes("series")) inferred.push("tv-series");
  if (source.includes("documentary")) inferred.push("documentary");
  if (source.includes("animation") || source.includes("animated")) inferred.push("animation");
  return [...new Set(inferred)];
};

const inferBudgetsFromInvestmentRange = (range = "") => {
  const r = String(range || "").toLowerCase();
  if (!r) return [];
  if (r.includes("under_50k")) return ["micro", "low"];
  if (r.includes("50k_250k")) return ["low", "medium"];
  if (r.includes("250k_1m")) return ["medium", "high"];
  if (r.includes("1m_5m")) return ["high", "blockbuster"];
  if (r.includes("over_5m")) return ["blockbuster", "high"];
  return [];
};

const scoreScriptByInvestorProfile = (
  script,
  { preferredGenres = [], preferredFormats = [], preferredBudgets = [] } = {}
) => {
  const ordered = preferredGenres.map(normalizeGenre).filter(Boolean);
  const orderIndex = new Map(ordered.map((g, idx) => [g, idx]));

  const primary = normalizeGenre(
    script?.genre || script?.primaryGenre || script?.classification?.primaryGenre || ""
  );

  const secondary = [
    script?.classification?.secondaryGenre,
    ...(script?.subGenres || []),
    ...(script?.classification?.themes || []),
    ...(script?.classification?.tones || []),
  ]
    .map(normalizeGenre)
    .filter(Boolean);

  let score = 0;
  if (orderIndex.has(primary)) {
    score += 1000 - orderIndex.get(primary) * 40;
  }

  const bestSecondaryBoost = secondary.reduce((acc, g) => {
    if (!orderIndex.has(g)) return acc;
    const boost = 240 - orderIndex.get(g) * 20;
    return Math.max(acc, boost);
  }, 0);
  score += bestSecondaryBoost;

  score += (script?.rating || 0) * 10;
  score += Math.min(80, (script?.readsCount || 0) * 0.2);
  score += Math.min(80, (script?.views || 0) * 0.05);

  if (formatMatches(script, preferredFormats)) score += 180;
  if (budgetMatches(script, preferredBudgets)) score += 160;

  return score;
};

const rankScriptsForInvestor = (
  scripts = [],
  profileSignals = { preferredGenres: [], preferredFormats: [], preferredBudgets: [] }
) => {
  if (!Array.isArray(scripts) || scripts.length === 0) return [];
  const hasSignals =
    profileSignals?.preferredGenres?.length ||
    profileSignals?.preferredFormats?.length ||
    profileSignals?.preferredBudgets?.length;
  if (!hasSignals) return scripts;

  return scripts
    .map((script, idx) => ({
      script,
      idx,
      score: scoreScriptByInvestorProfile(script, profileSignals),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.idx - b.idx;
    })
    .map((item) => item.script);
};

// ═══════════════════════════════════════════════════════════
//  INVESTOR HOME FEED — Personalised by genre / mandate prefs
// ═══════════════════════════════════════════════════════════
export const getInvestorHomeFeed = async (req, res) => {
  try {
    const feed = await buildInvestorFeed(req.user._id);
    res.json(feed);
  } catch (error) {
    console.error("getInvestorHomeFeed error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
//  TOP LIST — merged Top Ranked + Featured + Trending
// ═══════════════════════════════════════════════════════════
export const getTopList = async (req, res) => {
  try {
    const {
      genre,
      contentType,
      budget,
      sort,
      premium,
      page,
      limit,
      paged,
    } = parseTopListQuery(req.query);
    const now = new Date();
    const blockedUserIds = await getBlockedUserIdsForViewer(req.user?._id);
    const match = { ...PUBLIC_SCRIPT_FILTER };
    if (genre) match.genre = genre;
    if (contentType) match.contentType = contentType;
    if (budget) match.budget = budget;
    if (premium === "true") match.premium = true;
    else if (premium === "false") match.premium = { $ne: true };
    if (blockedUserIds.length > 0) {
      match.creator = { $nin: blockedUserIds };
    }

    // AI Score tab should only show scripts with paid/included evaluation and a generated score.
    if (sort === "score") {
      match["scriptScore.overall"] = { $gt: 0 };
      match.$or = [
        { "services.evaluation": true },
        { "services.spotlight": true },
        { "billing.evaluationCreditsCharged": { $gt: 0 } },
        { "billing.evaluationCreditsChargedAtUpload": { $gt: 0 } },
      ];
    }

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: "users",
          localField: "creator",
          foreignField: "_id",
          as: "creatorDoc",
        },
      },
      { $unwind: { path: "$creatorDoc", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          $or: [
            { "creatorDoc.role": { $ne: "writer" } },
            { "creatorDoc.subscription.plan": { $in: ["silver", "gold"] } },
            { "creatorDoc.subscription.accessTier": { $in: ["writer_silver", "writer_gold"] } },
          ],
        },
      },
      {
        $addFields: {
          verifiedPriority: {
            $cond: [{ $eq: [{ $ifNull: ["$verifiedBadge", false] }, true] }, 1, 0],
          },
          aiTrailerPriority: {
            $cond: [{ $eq: [{ $ifNull: ["$services.aiTrailer", false] }, true] }, 1, 0],
          },
          evaluationPriority: {
            $cond: [{ $eq: [{ $ifNull: ["$services.evaluation", false] }, true] }, 1, 0],
          },
          spotlightPriority: {
            $cond: [
              {
                $and: [
                  { $ifNull: ["$promotion.spotlightActive", false] },
                  { $gte: ["$promotion.spotlightEndAt", now] },
                ],
              },
              1,
              0,
            ],
          },
          unlockCount: { $size: { $ifNull: ["$unlockedBy", []] } },
          trendScore: {
            $add: [
              { $multiply: [{ $ifNull: ["$reviewCount", 0] }, 3] },
              { $multiply: [{ $ifNull: ["$readsCount", 0] }, 2] },
              { $ifNull: ["$views", 0] },
            ],
          },
          engagementScore: {
            $min: [
              100,
              {
                $add: [
                  { $multiply: [{ $divide: [{ $ifNull: ["$views", 0] }, 500] }, 40] },
                  { $multiply: [{ $divide: [{ $size: { $ifNull: ["$unlockedBy", []] } }, 50] }, 40] },
                  {
                    $cond: [
                      { $gt: [{ $ifNull: ["$views", 0] }, 0] },
                      { $multiply: [{ $divide: [{ $size: { $ifNull: ["$unlockedBy", []] } }, { $ifNull: ["$views", 1] }] }, 100] },
                      0,
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $addFields: {
          platformScore: {
            $add: [
              { $multiply: [{ $ifNull: ["$scriptScore.overall", 0] }, 0.6] },
              { $multiply: ["$engagementScore", 0.4] },
            ],
          },
        },
      },
    ];

    // Sort based on tab
    if (sort === "trending") pipeline.push({ $sort: { verifiedPriority: -1, aiTrailerPriority: -1, evaluationPriority: -1, spotlightPriority: -1, trendScore: -1, _id: -1 } });
    else if (sort === "featured") pipeline.push({ $sort: { verifiedPriority: -1, aiTrailerPriority: -1, evaluationPriority: -1, spotlightPriority: -1, engagementScore: -1, trendScore: -1, _id: -1 } });
    else if (sort === "score") pipeline.push({ $sort: { verifiedPriority: -1, aiTrailerPriority: -1, evaluationPriority: -1, spotlightPriority: -1, "scriptScore.overall": -1, _id: -1 } });
    else if (sort === "views") pipeline.push({ $sort: { verifiedPriority: -1, aiTrailerPriority: -1, evaluationPriority: -1, spotlightPriority: -1, views: -1, _id: -1 } });
    else pipeline.push({ $sort: { verifiedPriority: -1, aiTrailerPriority: -1, evaluationPriority: -1, spotlightPriority: -1, platformScore: -1, _id: -1 } }); // default: platform

    const populateCreator = [
      {
        $lookup: {
          from: "users",
          localField: "creator",
          foreignField: "_id",
          as: "creator",
          pipeline: [{ $project: { name: 1, username: 1, profileImage: 1, role: 1, "writerProfile.username": 1 } }],
        },
      },
      { $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } },
      // The qualification lookup uses a full User document. It must never
      // escape through this discovery endpoint, nor may a project summary
      // become a second script-reader response merely because Script grows a
      // new body or asset field.
      { $project: TOP_LIST_RESULT_EXCLUDE },
    ];

    if (paged) {
      pipeline.push({
        $facet: {
          scripts: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            ...populateCreator,
          ],
          meta: [{ $count: "total" }],
        },
      });
    } else {
      pipeline.push(...populateCreator, { $limit: limit });
    }

    const rows = await Script.aggregate(pipeline);
    const result = paged ? unpackTopListFacet(rows, { page, limit }) : { scripts: rows };
    const sanitized = result.scripts.map((s) => ({
      ...s,
      synopsis: s.synopsis ? s.synopsis.substring(0, 120) + (s.synopsis.length > 120 ? "..." : "") : null,
    }));
    if (paged) {
      res.json({ ...result, scripts: sanitized });
      return;
    }
    res.json(sanitized);
  } catch (error) {
    console.error("getTopList error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
//  RAZORPAY PAYMENT INTEGRATION FOR SCRIPTS
// ═══════════════════════════════════════════════════════════

// @desc    Create Razorpay order for script purchase after writer approval
// @route   POST /api/scripts/purchase/create-order
// @access  Private
export const createScriptPurchaseOrder = async (req, res) => {
  try {
    const {
      scriptId,
      acceptedPlatformTerms,
      acceptedWriterTerms,
      acceptedCustomWriterTerms,
      acceptedRightsSummary,
      acceptedLegalDisclaimer,
    } = req.body;

    const scriptObjectId = parseMongoObjectId(scriptId);
    if (!scriptObjectId) {
      return res.status(400).json({ message: "Invalid script ID." });
    }

    const script = await Script.findById(scriptObjectId).populate("creator", "name");
    if (!script) {
      return res.status(404).json({ message: "Script not found" });
    }
    if (script.isDeleted) {
      return res.status(410).json({ message: "This project was deleted by creator and is no longer available for new purchases." });
    }

    await expireActiveExclusiveLicenses({ scriptId: script._id });

    // Check if already purchased
    if (hasUserInIdArray(script.unlockedBy, req.user._id) || hasUserInIdArray(script.purchasedBy, req.user._id)) {
      return res.status(400).json({ message: "You already have full access to this script." });
    }

    // Check if trying to buy own script
    if (script.creator._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: "You cannot purchase your own script" });
    }

    if (script.isSold || script.transactionStatus === "sold_licensed") {
      return res.status(409).json({ message: "This script is no longer available for payment." });
    }

    const now = new Date();
    const activeApprovedClause = getApprovedUnpaidActiveClause(now);
    const purchaseRequest = await ScriptPurchaseRequest.findOne({
      script: scriptObjectId,
      investor: req.user._id,
      $or: [{ status: "pending" }, activeApprovedClause],
    }).sort({ createdAt: -1 });

    if (!purchaseRequest) {
      return res.status(400).json({
        message: "Send a purchase request first. If approved, payment must be completed within 72 hours.",
      });
    }

    if (purchaseRequest.status === "pending") {
      return res.status(409).json({
        message: "Your request is still pending writer approval. Payment will unlock after approval.",
      });
    }

    if (purchaseRequest.paymentStatus === "released") {
      return res.status(400).json({
        message: "Payment is already completed for this approved request.",
      });
    }

    const paymentDueAt = purchaseRequest.paymentDueAt
      ? new Date(purchaseRequest.paymentDueAt)
      : getApprovedPaymentDueAt(purchaseRequest.updatedAt || purchaseRequest.createdAt || now);

    if (paymentDueAt <= now) {
      await expireApprovedUnpaidRequests({ scriptId: script._id, force: true });
      return res.status(410).json({
        message: "Payment window expired for this approved request. Send a new purchase request.",
      });
    }

    if (!acceptedPlatformTerms || !acceptedWriterTerms) {
      return res.status(400).json({
        message: "Accept Platform and Writer terms before proceeding to payment.",
      });
    }

    if (!acceptedRightsSummary) {
      return res.status(400).json({
        message: "Accept rights summary before proceeding to payment.",
      });
    }

    if (!acceptedLegalDisclaimer) {
      return res.status(400).json({
        message: LEGAL_MARKETPLACE_DISCLAIMER,
      });
    }

    const customInvestorTerms = sanitizeCustomInvestorTerms(script.legal?.customInvestorTerms);
    if (customInvestorTerms && !acceptedCustomWriterTerms) {
      return res.status(400).json({
        message: "Accept writer custom terms before proceeding to payment.",
      });
    }

    const currentTermsPolicy = await getCurrentPurchaseTermsPolicy();
    const normalizedRights = normalizeRightsLicensingInput(script.rightsLicensing || {}, {});
    const rightsLabels = buildRightsLabels(normalizedRights);

    purchaseRequest.termsAcceptance = {
      platformTermsAccepted: true,
      writerTermsAccepted: true,
      customWriterTermsAccepted: Boolean(customInvestorTerms && acceptedCustomWriterTerms),
      rightsSummaryAccepted: true,
      legalDisclaimerAccepted: true,
      customWriterTermsSnapshot: customInvestorTerms,
      rightsTermsSnapshot: {
        ...normalizedRights,
        ...rightsLabels,
      },
      termsPolicyVersion: currentTermsPolicy?.version || "",
      acceptedAt: new Date(),
      acceptedIp: req.ip || req.connection.remoteAddress || "",
      acceptedUserAgent: getRequestUserAgent(req),
    };
    await purchaseRequest.save();

    try {
      await attachPurchaseRequestAcceptancePdf({
        purchaseRequest,
        script,
      });
    } catch (pdfError) {
      console.error("[Purchase] Acceptance PDF generation failed during order creation:", pdfError?.message || pdfError);
    }

    const baseAmount = Number(purchaseRequest.amount || script.price || 0);
    const pricing = getScriptPurchasePricing(Math.max(0, baseAmount));

    if (baseAmount <= 0) {
      return res.json({
        success: true,
        noPaymentRequired: true,
        amount: 0,
        currency: "INR",
        scriptDetails: {
          id: script._id,
          title: script.title,
          price: 0,
          creator: script.creator.name,
        },
        pricing,
        purchaseRequestId: purchaseRequest._id,
        paymentDueAt,
        rightsSummary: {
          ...rightsLabels,
          exclusivity: "Exclusive transaction enforced",
        },
        legalDisclaimer: LEGAL_MARKETPLACE_DISCLAIMER,
        message: "No payment required. Confirm free access to unlock full script.",
      });
    }

    // Check if Razorpay is configured for paid requests.
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({
        message: "Payment system not configured. Please contact support.",
        error: "Razorpay credentials missing"
      });
    }

    // Create Razorpay order after writer approval. The INR total is server-authoritative; only the
    // buyer's currency is taken from the client, then converted live (with an INR fallback if a USD
    // order is rejected by the gateway).
    const billing = await billingFromRequest(req, req.user);
    if (billing.error) return res.status(400).json({ message: billing.error, errors: billing.errors });
    const buyer = await User.findById(req.user._id).select("name email address billingProfile preferredCurrency");
    const currency = resolveCurrency(req.body?.currency, buyer?.preferredCurrency || req.user?.preferredCurrency);
    // The price and the 5% platform fee, then 18% taxes on the FULL amount (by decision). With taxes
    // switched off this is exactly the old price + fee.
    const saleKinds = { priceLabel: `Script price · ${script.title}` };
    const { lines, fxRate } = await scriptSaleLines(pricing, currency, saleKinds);
    const { lines: inrLines } = await scriptSaleLines(pricing, "INR", saleKinds);
    const priced = await priceWithInrFallback({
      user: buyer || req.user,
      currency,
      lines,
      inrLines,
      billingOverride: billing.override,
      ip: requestIp(req),
    });
    const razorpay = getRazorpay();
    const { order, fellBackToINR } = await createOrderWithUsdFallback(razorpay, {
      amount: priced.requested.grossMinor,
      currency,
      inrAmount: priced.inr.grossMinor,
      receipt: `script_purchase_${Date.now()}`,
      notes: {
        userId: req.user._id.toString(),
        scriptId: scriptId,
        scriptTitle: script.title,
        creatorId: script.creator._id.toString(),
        purchaseRequestId: purchaseRequest._id.toString(),
        baseAmountInr: pricing.baseAmount.toFixed(2),
        totalAmountInr: pricing.totalAmount.toFixed(2),
        fxRate: String(fxRate),
        type: "script_purchase_after_approval",
      }
    });

    const chosen = pickPriced(priced, order.currency);
    await saveQuote({
      order,
      user: buyer || req.user,
      purpose: "script_purchase_after_approval",
      subjectId: String(purchaseRequest._id),
      priced: chosen,
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      fxRate,
      fellBackToINR,
      keyId: process.env.RAZORPAY_KEY_ID,
      scriptDetails: {
        id: script._id,
        title: script.title,
        price: pricing.baseAmount,
        creator: script.creator.name
      },
      pricing,
      breakdown: checkoutBreakdown(chosen, {
        currency: order.currency,
        lines: String(order.currency).toUpperCase() === "INR" ? inrLines : lines,
      }),
      purchaseRequestId: purchaseRequest._id,
      paymentDueAt,
      rightsSummary: {
        ...rightsLabels,
        exclusivity: "Exclusive transaction enforced",
      },
      legalDisclaimer: LEGAL_MARKETPLACE_DISCLAIMER,
    });
  } catch (error) {
    console.error("Razorpay order creation error:", error);
    res.status(500).json({ message: "Failed to create payment order", error: error.message });
  }
};

// Price a script sale or hold for DISPLAY in the buyer's currency (no order created): the price, the
// platform fee and — when taxes are on — "Taxes (18%)" on their sum, with the total actually charged.
const buildCurrencyQuote = async (pricing, currency, { user, req, kinds = {} } = {}) => {
  const { lines, fxRate } = await scriptSaleLines(pricing, currency, kinds);
  const priced = await priceCheckout({ user, lines, currency, ip: req ? requestIp(req) : "" });
  const breakdown = checkoutBreakdown(priced, { currency, lines });
  return {
    currency,
    fxRate,
    baseAmount: lines[0].amountMinor / 100,
    platformFeeAmount: lines[1].amountMinor / 100,
    platformFeePercent: pricing.platformFeePercent,
    taxAmount: breakdown.taxMinor / 100,
    totalAmount: breakdown.totalMinor / 100,
    baseAmountInr: pricing.baseAmount,
    totalAmountInr: pricing.totalAmount,
    breakdown,
  };
};

// @desc    Price quote for a script PURCHASE in the buyer's currency (display only; no order created)
// @route   POST /api/scripts/purchase/quote
// @access  Private
export const getScriptPurchaseQuote = async (req, res) => {
  try {
    const { scriptId } = req.body;
    const scriptObjectId = parseMongoObjectId(scriptId);
    if (!scriptObjectId) return res.status(400).json({ message: "Invalid script ID." });
    const script = await Script.findById(scriptObjectId).select("price title");
    if (!script) return res.status(404).json({ message: "Script not found" });
    // The price the buyer will actually be charged: their approved request's amount when there is one.
    const approved = await ScriptPurchaseRequest.findOne({
      script: scriptObjectId,
      investor: req.user._id,
      status: "approved",
      paymentStatus: { $ne: "released" },
    }).sort({ createdAt: -1 }).select("amount");
    const pricing = getScriptPurchasePricing(Math.max(0, Number(approved?.amount || script.price || 0)));
    const currency = resolveCurrency(req.body?.currency, req.user?.preferredCurrency);
    const buyer = await User.findById(req.user._id).select("name email address billingProfile");
    return res.json(await buildCurrencyQuote(pricing, currency, { user: buyer, req, kinds: { priceLabel: `Script price · ${script.title}` } }));
  } catch (error) {
    console.error("Purchase quote error:", error);
    return res.status(500).json({ message: "Failed to get price quote" });
  }
};

// @desc    Price quote for a script HOLD in the buyer's currency (display only; no order created)
// @route   POST /api/scripts/hold/quote
// @access  Private
export const getScriptHoldQuote = async (req, res) => {
  try {
    if (!isFilmIndustryProfessionalRole(req.user)) {
      return res.status(403).json({ message: "Only industry professionals can hold scripts." });
    }
    const { scriptId } = req.body;
    const scriptObjectId = parseMongoObjectId(scriptId);
    if (!scriptObjectId) return res.status(400).json({ message: "Invalid script ID." });
    const script = await Script.findById(scriptObjectId).select("holdFee title");
    if (!script) return res.status(404).json({ message: "Script not found" });
    const pricing = getScriptPurchasePricing(scriptHoldFee(script));
    const currency = resolveCurrency(req.body?.currency, req.user?.preferredCurrency);
    const buyer = await User.findById(req.user._id).select("name email address billingProfile");
    return res.json(await buildCurrencyQuote(pricing, currency, {
      user: buyer,
      req,
      kinds: { priceKind: "hold_price", feeKind: "hold_platform_fee", priceLabel: `30-day hold · ${script.title}` },
    }));
  } catch (error) {
    console.error("Hold quote error:", error);
    return res.status(500).json({ message: "Failed to get price quote" });
  }
};

// @desc    Activate project spotlight package for a script
// @route   POST /api/scripts/:id/activate-spotlight
// @access  Private (script owner)
export const activateProjectSpotlight = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let script;
    let user;
    let endAt;
    let isExtensionPurchase = false;

    const scriptId = req.params?.id || req.body?.scriptId || req.query?.scriptId;

    if (!scriptId) {
      return res.status(400).json({ message: "Script ID is required" });
    }

    const scriptObjectId = parseMongoObjectId(scriptId);
    if (!scriptObjectId) {
      return res.status(400).json({ message: "Invalid script ID" });
    }

    await session.withTransaction(async () => {
      script = await Script.findById(scriptObjectId).session(session);
      if (!script) {
        const error = new Error("Script not found");
        error.statusCode = 404;
        throw error;
      }

      if (script.isDeleted) {
        const error = new Error("This project was deleted and spotlight cannot be activated.");
        error.statusCode = 410;
        throw error;
      }

      if (script.isSold || script.holdStatus === "sold") {
        const error = new Error("Spotlight cannot be activated after this project is sold.");
        error.statusCode = 400;
        throw error;
      }

      if (script.creator.toString() !== req.user._id.toString()) {
        const error = new Error("Only the script creator can activate spotlight");
        error.statusCode = 403;
        throw error;
      }

      if (script.services?.spotlight && script.promotion?.pendingSpotlightActivation && script.status !== "published") {
        const error = new Error("Spotlight is already purchased for this project and will auto-activate after admin approval.");
        error.statusCode = 409;
        throw error;
      }

      if (script.status !== "published") {
        const error = new Error("Publish the project before activating spotlight");
        error.statusCode = 400;
        throw error;
      }

      user = await User.findById(req.user._id).session(session);
      if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      const now = new Date();
      const spotlightCurrentlyActive = isSpotlightActive(script, now);
      isExtensionPurchase = spotlightCurrentlyActive;

      const currentEnd = script.promotion?.spotlightEndAt ? new Date(script.promotion.spotlightEndAt) : null;
      const extensionStart = currentEnd && currentEnd > now ? currentEnd : now;
      endAt = new Date(extensionStart.getTime() + PROJECT_SPOTLIGHT_DURATION_DAYS * 24 * 60 * 60 * 1000);

      script.premium = true;
      script.isFeatured = true;
      script.verifiedBadge = true;
      script.services = {
        ...(script.services || {}),
        hosting: true,
        evaluation: true,
        aiTrailer: true,
        spotlight: true,
      };
      script.evaluationStatus = script.scriptScore?.overall ? "completed" : "requested";

      if (shouldQueueSpotlightAiTrailer(script) && !["requested", "generating"].includes(script.trailerStatus)) {
        script.trailerStatus = "requested";
      }

      script.promotion = {
        ...(script.promotion || {}),
        spotlightActive: true,
        pendingSpotlightActivation: false,
        spotlightStartAt: now,
        spotlightEndAt: endAt,
        lastSpotlightPurchaseAt: now,
      };
      script.billing = {
        ...(script.billing || {}),
        lastSpotlightActivatedAt: now,
      };
      script.markModified("services");
      script.markModified("promotion");
      script.markModified("billing");
      await script.save({ session });
    });

    await notifyAdminWorkflowEvent({
      title: isExtensionPurchase ? "Project Spotlight Extended" : "Project Spotlight Activated",
      section: "approvals",
      actorId: req.user._id,
      scriptId: script._id,
      message: `Project Spotlight ${isExtensionPurchase ? "extended" : "activated"} for "${script.title}". Featured placement is active for 1 month and verified badge remains permanent once unlocked.`,
      metadata: {
        scriptId: script._id,
        writerId: req.user._id,
        spotlightEndAt: endAt.toISOString(),
      },
    });

    res.json({
      message: isExtensionPurchase
        ? "Project Spotlight extended successfully"
        : "Project Spotlight activated successfully",
      package: {
        name: "Project Spotlight",
        isExtension: isExtensionPurchase,
        spotlightEndAt: endAt,
        benefits: [
          "Verified project badge (permanent once unlocked)",
          "Free script evaluation",
          "Free AI trailer",
          "Featured and top placement for 1 month",
        ],
      },

      script,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      message: error.message,
      ...(error.payload || {}),
    });
  } finally {
    await session.endSession();
  }
};

// @desc    Verify Razorpay payment for approved request and unlock script
// @route   POST /api/scripts/purchase/verify-payment
// @access  Private
export const verifyScriptPurchase = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      scriptId,
      freeAccess,
    } = req.body;

    console.log("Script purchase verification:", { razorpay_order_id, razorpay_payment_id, scriptId });

    if (!scriptId) {
      return res.status(400).json({
        message: "Script id is required.",
        success: false,
      });
    }

    const scriptObjectId = parseMongoObjectId(scriptId);
    if (!scriptObjectId) {
      return res.status(400).json({
        message: "Invalid script id.",
        success: false,
      });
    }

    const script = await Script.findById(scriptObjectId).populate("creator", "name email");
    if (!script) {
      console.error("Script not found:", scriptId);
      return res.status(404).json({
        message: "Script not found",
        success: false
      });
    }
    if (script.isDeleted) {
      return res.status(410).json({
        message: "This project was deleted by creator and is no longer available for new purchases.",
        success: false,
      });
    }

    await expireActiveExclusiveLicenses({ scriptId: script._id });

    await expireApprovedUnpaidRequests({ scriptId: script._id });

    // Check if already unlocked
    if (hasUserInIdArray(script.unlockedBy, req.user._id) || hasUserInIdArray(script.purchasedBy, req.user._id)) {
      return res.status(400).json({
        message: "Script already purchased",
        success: false
      });
    }

    if (script.isSold || script.transactionStatus === "sold_licensed") {
      return res.status(409).json({
        message: "This script is already sold/licensed and unavailable for duplicate purchases.",
        success: false,
      });
    }

    const alreadyReleased = await ScriptPurchaseRequest.findOne({
      script: script._id,
      investor: req.user._id,
      status: "approved",
      paymentStatus: "released",
    }).select("_id");

    if (alreadyReleased) {
      const existingInvoice = await Invoice.findOne({
        creator: req.user._id,
        script: script._id,
      })
        .sort({ createdAt: -1 })
        .select("_id invoiceNumber pdfPath");

      return res.json({
        success: true,
        message: existingInvoice ? "Payment already completed. Full access is already active." : "Access already granted for this request.",
        purchaseRequestId: alreadyReleased._id,
        invoice: existingInvoice
          ? {
              _id: existingInvoice._id,
              invoiceNumber: existingInvoice.invoiceNumber,
              pdfPath: existingInvoice.pdfPath || "",
            }
          : null,
      });
    }

    const pendingRequest = await ScriptPurchaseRequest.findOne({
      script: script._id,
      investor: req.user._id,
      status: "pending",
    }).select("_id");

    if (pendingRequest) {
      return res.status(409).json({
        message: "Your request is still pending writer approval. Complete payment after approval.",
        success: false,
      });
    }

    const now = new Date();
    const activeApprovedClause = getApprovedUnpaidActiveClause(now);
    const purchaseRequest = await ScriptPurchaseRequest.findOne({
      script: script._id,
      investor: req.user._id,
      ...activeApprovedClause,
    });

    if (!purchaseRequest) {
      return res.status(400).json({
        message: "No approved purchase request found for payment.",
        success: false,
      });
    }

    if (!purchaseRequest?.termsAcceptance?.platformTermsAccepted || !purchaseRequest?.termsAcceptance?.writerTermsAccepted) {
      return res.status(400).json({
        message: "Required legal terms were not accepted for this purchase request.",
        success: false,
      });
    }

    if (!purchaseRequest?.termsAcceptance?.rightsSummaryAccepted) {
      return res.status(400).json({
        message: "Rights summary acceptance is missing for this request.",
        success: false,
      });
    }

    if (!purchaseRequest?.termsAcceptance?.legalDisclaimerAccepted) {
      return res.status(400).json({
        message: LEGAL_MARKETPLACE_DISCLAIMER,
        success: false,
      });
    }

    const paymentDueAt = purchaseRequest.paymentDueAt
      ? new Date(purchaseRequest.paymentDueAt)
      : getApprovedPaymentDueAt(purchaseRequest.updatedAt || purchaseRequest.createdAt || now);

    if (paymentDueAt <= now) {
      await expireApprovedUnpaidRequests({ scriptId: script._id, force: true });
      return res.status(410).json({
        message: "Payment window expired for this approved request. Send a new purchase request.",
        success: false,
      });
    }

    const baseAmount = Number(purchaseRequest.amount || script.price || 0);
    const isFreeAccessRequest = baseAmount <= 0;

    // The verified capture (paid requests only): what Razorpay took, for this request, by this buyer.
    let verifiedCapture = null;

    if (isFreeAccessRequest) {
      const hasAcceptedCoreTerms = Boolean(
        purchaseRequest?.termsAcceptance?.platformTermsAccepted &&
        purchaseRequest?.termsAcceptance?.writerTermsAccepted
      );

      if (!hasAcceptedCoreTerms) {
        return res.status(400).json({
          message: "Accept Platform and Writer terms before confirming free access.",
          success: false,
        });
      }

      if (!purchaseRequest?.termsAcceptance?.rightsSummaryAccepted) {
        return res.status(400).json({
          message: "Accept rights summary before confirming free access.",
          success: false,
        });
      }

      if (!purchaseRequest?.termsAcceptance?.legalDisclaimerAccepted) {
        return res.status(400).json({
          message: LEGAL_MARKETPLACE_DISCLAIMER,
          success: false,
        });
      }

      const customInvestorTerms = sanitizeCustomInvestorTerms(script.legal?.customInvestorTerms);
      if (customInvestorTerms && !purchaseRequest?.termsAcceptance?.customWriterTermsAccepted) {
        return res.status(400).json({
          message: "Accept writer custom terms before confirming free access.",
          success: false,
        });
      }

      if (!freeAccess && !razorpay_order_id && !razorpay_payment_id && !razorpay_signature) {
        return res.status(400).json({
          message: "Use free access confirmation from the payment page.",
          success: false,
        });
      }
    } else {
      if (!process.env.RAZORPAY_KEY_SECRET) {
        console.error("RAZORPAY_KEY_SECRET not found in environment");
        return res.status(500).json({
          message: "Payment system not configured",
          success: false
        });
      }

      // A valid signature proves only that SOME payment on this account succeeded — a genuine ₹98
      // competition payment used to satisfy this check. Prove from Razorpay's own records that it is the
      // payment for THIS approved request, by this buyer, captured in full.
      verifiedCapture = await readVerifiedOrder(getRazorpay(), {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
        expectNotes: {
          type: "script_purchase_after_approval",
          userId: String(req.user._id),
          scriptId: String(script._id),
          purchaseRequestId: String(purchaseRequest._id),
        },
      });
      if (!verifiedCapture.ok) {
        return res.status(verifiedCapture.status || 400).json({
          message: verifiedCapture.message,
          success: false,
          paymentPending: Boolean(verifiedCapture.pending),
        });
      }
    }

    const pricing = getScriptPurchasePricing(baseAmount);
    const paymentReference = isFreeAccessRequest ? "" : `RZP-${razorpay_payment_id}`;

    const [investorDoc, writerDoc] = await Promise.all([
      User.findById(req.user._id).select("name email sid role industryProfile address billingProfile"),
      User.findById(purchaseRequest.writer).select("name wallet"),
    ]);

    if (!writerDoc) {
      return res.status(404).json({
        message: "Writer account not found.",
        success: false,
      });
    }

    if (!writerDoc.wallet) {
      writerDoc.wallet = {
        balance: 0,
        currency: "INR",
        pendingBalance: 0,
        totalEarnings: 0,
        totalWithdrawals: 0,
      };
    }

    // Hoisted: both the buyer's Transaction row below and the ledger entry further down read it.
    let charge = null;
    // The taxes inside what the buyer paid (null with taxes off, or a free request).
    let purchaseTax = null;

    if (!isFreeAccessRequest) {
      const writerBalanceBefore = writerDoc.wallet.balance || 0;
      writerDoc.wallet.balance = writerBalanceBefore + pricing.baseAmount;
      writerDoc.wallet.totalEarnings = (writerDoc.wallet.totalEarnings || 0) + pricing.baseAmount;
      await writerDoc.save();

      // What the buyer was actually charged (their currency), from the verified capture; the writer
      // payout above stays the INR price, untouched by taxes.
      charge = verifiedCapture.charge;
      purchaseTax = await resolveCapturedTax({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        paidMinor: charge.amountMinor,
        currency: charge.currency,
        paidAt: charge.paidAt,
        user: investorDoc || req.user,
        lines: (await scriptSaleLines(pricing, charge.currency, { priceLabel: `Script price · ${script.title}` })).lines,
      });

      await Transaction.create([
        {
          user: req.user._id,
          type: "payment",
          amount: -charge.chargedTotal,
          currency: charge.currency,
          baseCurrency: "INR",
          baseAmount: -pricing.totalAmount,
          fxRate: charge.fxRate,
          status: "completed",
          description: `Purchased script after approval: "${script.title}"`,
          reference: `PRP-RZP-${razorpay_payment_id}`,
          paymentMethod: "razorpay",
          relatedScript: script._id,
          metadata: {
            purchaseRequestId: purchaseRequest._id.toString(),
            writerId: purchaseRequest.writer.toString(),
            scriptId: script._id.toString(),
            razorpay_order_id,
            razorpay_payment_id,
            taxMinor: purchaseTax?.totals?.taxMinor || 0,
          },
        },
        {
          user: purchaseRequest.writer,
          type: "credit",
          amount: pricing.baseAmount,
          currency: "INR",
          status: "completed",
          description: `Script purchase payout: "${script.title}"`,
          reference: `PRP-${Date.now()}-${purchaseRequest._id.toString().slice(-6).toUpperCase()}`,
          paymentMethod: "razorpay",
          relatedScript: script._id,
          balanceBefore: writerBalanceBefore,
          balanceAfter: writerDoc.wallet.balance,
          metadata: {
            purchaseRequestId: purchaseRequest._id.toString(),
            investorId: req.user._id.toString(),
            scriptId: script._id.toString(),
            razorpay_order_id,
            razorpay_payment_id,
          },
        },
      ]);
    }

    if (!hasUserInIdArray(script.unlockedBy, req.user._id)) {
      script.unlockedBy.push(req.user._id);
    }
    script.purchasedBy = Array.isArray(script.purchasedBy) ? script.purchasedBy : [];
    if (!hasUserInIdArray(script.purchasedBy, req.user._id)) {
      script.purchasedBy.push(req.user._id);
    }
    script.isSold = true;
    script.purchaseRequestLocked = false;
    script.purchaseRequestLockedBy = null;
    script.purchaseRequestLockedAt = null;
    script.transactionStatus = "sold_licensed";
    await script.save();

    purchaseRequest.frozenAmount = isFreeAccessRequest ? 0 : pricing.totalAmount;
    purchaseRequest.paymentMethod = isFreeAccessRequest ? "free_access" : "razorpay";
    purchaseRequest.paymentStatus = "released";
    purchaseRequest.paymentDueAt = undefined;
    purchaseRequest.paymentGatewayOrderId = isFreeAccessRequest ? undefined : razorpay_order_id;
    purchaseRequest.paymentGatewayPaymentId = isFreeAccessRequest ? undefined : razorpay_payment_id;
    purchaseRequest.paymentGatewaySignature = isFreeAccessRequest ? undefined : razorpay_signature;
    purchaseRequest.settledAt = new Date();
    await purchaseRequest.save();

    // The books. A free-access request is still recorded — as a grant carrying the list price, so
    // the revenue foregone is visible without ever being counted as revenue. Both calls are
    // non-fatal by design: a ledger outage must not fail a purchase the buyer already paid for.
    if (isFreeAccessRequest) {
      await recordGrant({
        kind: "script_purchase",
        user: req.user._id,
        listPriceMinor: Math.round(Number(script.price || 0) * 100),
        subjectType: "Script",
        subjectId: script._id,
        label: script.title,
        reason: "free access request approved by writer",
        source: "scriptController.verifyScriptPurchase",
        metadata: { purchaseRequestId: String(purchaseRequest._id), writerId: String(purchaseRequest.writer) },
      });
    } else {
      // `charge` is what Razorpay says the buyer was charged in their own currency; `pricing` is the
      // INR list side. Recording the provider's figure is the whole point — a USD order that fell
      // back to INR must not be booked at the USD price.
      await recordPayment({
        kind: "script_purchase",
        user: req.user._id,
        amountMinor: charge.amountMinor,
        currency: charge.currency,
        listPriceMinor: Math.round(pricing.totalAmount * 100),
        providerOrderId: razorpay_order_id,
        providerPaymentId: razorpay_payment_id,
        subjectType: "Script",
        subjectId: script._id,
        label: script.title,
        source: "scriptController.verifyScriptPurchase",
        tax: purchaseTax,
        creatorPayoutMinor: Math.round(pricing.baseAmount * 100),
        gatewayFeeMinor: charge.fee,
        gatewayTaxMinor: charge.feeTax,
        metadata: {
          purchaseRequestId: String(purchaseRequest._id),
          writerId: String(purchaseRequest.writer),
          writerPayoutInr: pricing.baseAmount,
          platformFeeInr: pricing.platformFeeAmount,
        },
      });
    }

    let agreementRecord = null;
    try {
      agreementRecord = await createAgreementForSettledPurchase({
        script,
        purchaseRequest,
        writerUser: script.creator,
        buyerUser: investorDoc || req.user,
        pricing: withTaxFigures(pricing, purchaseTax),
        req,
      });
    } catch (agreementError) {
      console.error("[Purchase] Agreement generation failed:", agreementError?.message || agreementError);
    }

    try {
      await attachPurchaseRequestAcceptancePdf({
        purchaseRequest,
        script,
        investor: investorDoc || req.user,
        agreementPdfUrl: agreementRecord?.buyer_pdf_url || agreementRecord?.writer_pdf_url || "",
      });
    } catch (pdfError) {
      console.error("[Purchase] Acceptance PDF refresh failed after settlement:", pdfError?.message || pdfError);
    }

    let purchaseInvoice = null;
    if (!isFreeAccessRequest) {
      // The paid purchase goes through the shared issuer like every other surface: a tax invoice
      // (CK/<FY>/<seq>) when taxes applied, the old-format document otherwise. It used to be built right
      // here with its own numbering and no currency or amount — a USD buyer's invoice said "INR 0" — and
      // it printed the writer's earnings on the buyer's document. Neither survives.
      const rowSplit = purchaseTax
        ? null
        : allocate(charge.amountMinor, [Math.round(pricing.baseAmount * 100), Math.round(pricing.platformFeeAmount * 100)]);
      const issued = await issueInvoice({
        kind: "script",
        user: investorDoc || req.user,
        paymentReference,
        providerPaymentId: razorpay_payment_id,
        tax: purchaseTax,
        supplyDate: charge.paidAt,
        currency: charge.currency,
        amountCharged: charge.chargedTotal,
        accessType: "premium",
        script: script._id,
        scriptSid: script.sid || "",
        scriptPrice: pricing.baseAmount,
        detailLines: [
          script.title,
          `SID ${script.sid || "-"}`,
          `Buyer: ${getPurchaseRequesterLabel(investorDoc || req.user)}`,
          `Payment Ref: ${razorpay_payment_id}`,
        ],
        detailByKind: { script_price: `Full access to "${script.title}".` },
        rows: rowSplit
          ? [
            {
              item: "Script price",
              type: "Payment",
              detail: `Full access to "${script.title}".`,
              amountLabel: formatInvoiceMoney(rowSplit[0] / 100, charge.currency),
              amountValue: rowSplit[0] / 100,
            },
            {
              item: `Platform fee (${pricing.platformFeePercent}%)`,
              type: "Fee",
              detail: "Platform fee on the script purchase.",
              amountLabel: formatInvoiceMoney(rowSplit[1] / 100, charge.currency),
              amountValue: rowSplit[1] / 100,
            },
            totalRow(charge.chargedTotal, charge.currency),
            gatewayRow(razorpay_payment_id),
          ]
          : [],
        source: "scriptController.verifyScriptPurchase",
      });
      purchaseInvoice = issued
        ? { _id: issued._id, invoiceNumber: issued.invoiceNumber, pdfPath: issued.pdfPath || "" }
        : null;
    }

    await Notification.create({
      user: req.user._id,
      type: "purchase_approved",
      from: purchaseRequest.writer,
      script: script._id,
      message: isFreeAccessRequest
        ? `Free access confirmed for "${script.title}". Full script access is now unlocked.`
        : `Payment successful for "${script.title}". Full script access is now unlocked.`,
    });

    await Notification.create({
      user: purchaseRequest.writer,
      type: "purchase",
      from: req.user._id,
      script: script._id,
      message: isFreeAccessRequest
        ? `${investorDoc?.name || "An investor"} confirmed free access for "${script.title}" after approval.`
        : `${investorDoc?.name || "A buyer"} completed payment for "${script.title}". Payout of ₹${pricing.baseAmount.toLocaleString("en-IN")} has been credited to your wallet.`,
    });

    // Free access still gets a document. It is not a tax invoice — nothing was charged — but it is
    // the record of what was granted, to whom and when, which is exactly what a buyer needs when
    // the writer later asks on what basis they hold the script.
    if (isFreeAccessRequest && !purchaseInvoice) {
      purchaseInvoice = await issueInvoice({
        kind: "script",
        user: investorDoc || req.user,
        paymentReference: `FREE-${purchaseRequest._id}`,
        currency: "INR",
        amountCharged: 0,
        accessType: "free",
        script: script._id,
        scriptSid: script.sid || "",
        detailLines: [
          script.title,
          `SID ${script.sid || "-"}`,
          "Access: Free (approved by writer)",
          `Request: ${purchaseRequest._id}`,
        ],
        rows: [
          {
            item: "Script Access",
            type: "Grant",
            detail: `Free full access to "${script.title}", approved by the writer.`,
            amountLabel: "INR 0.00",
            amountValue: 0,
          },
          {
            item: "Total Paid",
            type: "Total",
            detail: "No payment was required for this project.",
            amountLabel: "INR 0.00",
            amountValue: 0,
          },
        ],
        source: "scriptController.verifyScriptPurchase (free access)",
      });
    }
    console.log("Script purchase settled:", {
      scriptId,
      buyerId: req.user._id,
      baseAmount: pricing.baseAmount,
      platformFeeAmount: pricing.platformFeeAmount,
      totalAmount: pricing.totalAmount,
      taxMinor: purchaseTax?.totals?.taxMinor || 0,
      freeAccess: isFreeAccessRequest,
    });

    res.json({
      success: true,
      message: isFreeAccessRequest
        ? "Access granted. This project is free — your access record is available as a document."
        : "Payment successful. Full script access granted.",
      purchaseRequest: {
        id: purchaseRequest._id,
        status: purchaseRequest.status,
        paymentStatus: purchaseRequest.paymentStatus,
        acceptancePdfAvailable: Boolean(purchaseRequest?.acceptancePdf?.url),
      },
      invoice: purchaseInvoice || null,
      agreement: agreementRecord
        ? {
            id: agreementRecord._id,
            writerPdfUrl: agreementRecord.writer_pdf_url,
            buyerPdfUrl: agreementRecord.buyer_pdf_url,
            status: agreementRecord.status,
          }
        : null,
    });
  } catch (error) {
    console.error("Script purchase verification error:", error);
    res.status(500).json({
      message: "Failed to verify payment",
      error: error.message,
      success: false
    });
  }
};

// @desc    Create Razorpay order for script hold/option
// @route   POST /api/scripts/hold/create-order
// @access  Private
export const createScriptHoldOrder = async (req, res) => {
  try {
    // Check if Razorpay is configured
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({
        message: "Payment system not configured. Please contact support.",
        error: "Razorpay credentials missing"
      });
    }

    const { scriptId } = req.body;
    const scriptObjectId = parseMongoObjectId(scriptId);
    if (!scriptObjectId) {
      return res.status(400).json({ message: "Invalid script ID." });
    }

    const script = await Script.findById(scriptObjectId).populate("creator", "name");
    if (!script) {
      return res.status(404).json({ message: "Script not found" });
    }

    // Check if already held
    if (script.holdStatus === "held") {
      return res.status(400).json({ message: "This script is already on hold by another party" });
    }
    if (script.holdStatus === "sold") {
      return res.status(400).json({ message: "This script has been sold" });
    }

    const user = await User.findById(req.user._id);
    if (!isFilmIndustryProfessionalRole(user)) {
      return res.status(403).json({ message: "Only industry professionals can hold scripts" });
    }

    const holdFee = scriptHoldFee(script);
    const holdPricing = getScriptPurchasePricing(holdFee);

    const billing = await billingFromRequest(req, user);
    if (billing.error) return res.status(400).json({ message: billing.error, errors: billing.errors });

    // Create Razorpay order. The INR price + fee is server-authoritative; the buyer currency is converted
    // live (with an INR fallback if a USD order is rejected), and 18% taxes are added on the full amount.
    const currency = resolveCurrency(req.body?.currency, user?.preferredCurrency);
    const holdKinds = { priceKind: "hold_price", feeKind: "hold_platform_fee", priceLabel: `30-day hold · ${script.title}` };
    const { lines, fxRate } = await scriptSaleLines(holdPricing, currency, holdKinds);
    const { lines: inrLines } = await scriptSaleLines(holdPricing, "INR", holdKinds);
    const priced = await priceWithInrFallback({
      user,
      currency,
      lines,
      inrLines,
      billingOverride: billing.override,
      ip: requestIp(req),
    });
    const razorpay = getRazorpay();
    const { order, fellBackToINR } = await createOrderWithUsdFallback(razorpay, {
      amount: priced.requested.grossMinor,
      currency,
      inrAmount: priced.inr.grossMinor,
      receipt: `script_hold_${Date.now()}`,
      notes: {
        userId: req.user._id.toString(),
        scriptId: scriptId,
        scriptTitle: script.title,
        creatorId: script.creator._id.toString(),
        holdFeeInr: holdPricing.baseAmount,
        totalAmountInr: holdPricing.totalAmount.toFixed(2),
        fxRate: String(fxRate),
        type: "script_hold"
      }
    });

    const chosen = pickPriced(priced, order.currency);
    await saveQuote({ order, user, purpose: "script_hold", subjectId: String(script._id), priced: chosen });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      fxRate,
      fellBackToINR,
      keyId: process.env.RAZORPAY_KEY_ID,
      scriptDetails: {
        id: script._id,
        title: script.title,
        holdFee: holdPricing.baseAmount,
        creator: script.creator.name
      },
      pricing: holdPricing,
      breakdown: checkoutBreakdown(chosen, {
        currency: order.currency,
        lines: String(order.currency).toUpperCase() === "INR" ? inrLines : lines,
      }),
    });
  } catch (error) {
    console.error("Razorpay hold order creation error:", error);
    res.status(500).json({ message: "Failed to create payment order", error: error.message });
  }
};

// @desc    Verify Razorpay payment and place hold on script
// @route   POST /api/scripts/hold/verify-payment
// @access  Private
export const verifyScriptHold = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      scriptId
    } = req.body;

    console.log("Script hold verification:", { razorpay_order_id, razorpay_payment_id, scriptId });

    if (![razorpay_order_id, razorpay_payment_id, razorpay_signature, scriptId].every((value) => String(value || "").trim())) {
      return res.status(400).json({ message: "Payment verification payload is incomplete.", success: false });
    }

    // Check if Razorpay key secret is available
    if (!process.env.RAZORPAY_KEY_SECRET) {
      console.error("RAZORPAY_KEY_SECRET not found in environment");
      return res.status(500).json({
        message: "Payment system not configured",
        success: false
      });
    }

    const isAuthentic = verifyRazorpaySignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });

    if (!isAuthentic) {
      console.error("Signature verification failed");
      return res.status(400).json({
        message: "Payment verification failed - Invalid signature",
        success: false
      });
    }

    const scriptObjectId = parseMongoObjectId(scriptId);
    if (!scriptObjectId) {
      return res.status(400).json({
        message: "Invalid script id.",
        success: false
      });
    }

    // Payment verified successfully, place hold on script
    const script = await Script.findById(scriptObjectId).populate("creator", "name email");
    if (!script) {
      console.error("Script not found:", scriptId);
      return res.status(404).json({
        message: "Script not found",
        success: false
      });
    }

    const user = await User.findById(req.user._id);
    if (!user || !isFilmIndustryProfessionalRole(user)) {
      return res.status(403).json({ message: "Only industry professionals can hold scripts.", success: false });
    }
    const fee = scriptHoldFee(script);
    const pricing = getScriptPurchasePricing(fee);
    const razorpay = getRazorpay();
    const [order, payment] = await Promise.all([
      razorpay.orders.fetch(razorpay_order_id),
      razorpay.payments.fetch(razorpay_payment_id),
    ]);
    const paymentCheck = validateScriptHoldPayment({
      order,
      payment,
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      userId: req.user._id,
      scriptId: scriptObjectId,
      expectedTotalInr: pricing.totalAmount,
    });
    if (!paymentCheck.ok) {
      return res.status(paymentCheck.pending ? 409 : 400).json({ message: paymentCheck.message, success: false });
    }

    const existingOption = await ScriptOption.findOne({
      $or: [{ paymentId: razorpay_payment_id }, { orderId: razorpay_order_id }],
    });
    if (existingOption) {
      const sameOwner = String(existingOption.holder) === String(req.user._id);
      const sameScript = String(existingOption.script) === String(scriptObjectId);
      if (!sameOwner || !sameScript) {
        return res.status(409).json({ message: "This payment has already been used.", success: false });
      }
      return res.json({ success: true, message: "Hold already placed.", option: existingOption, recovered: true });
    }

    // Provider validation happens before this availability check: a captured callback for a hold
    // lost to a concurrent buyer must be reconciled/refunded, never mistaken for an unpaid attempt.
    if (script.holdStatus === "held" || script.holdStatus === "sold" || script.isSold) {
      return res.status(409).json({ message: "This script is no longer available for a hold.", success: false, paymentCaptured: true });
    }
    const platformCut = pricing.platformFeeAmount;
    const creatorPayout = pricing.baseAmount;
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Create option record
    const option = await ScriptOption.create({
      script: scriptObjectId,
      holder: req.user._id,
      fee,
      platformCut,
      creatorPayout,
      endDate,
      status: "active",
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id
    });

    // Update script
    script.holdStatus = "held";
    script.heldBy = req.user._id;
    script.holdStartDate = new Date();
    script.holdEndDate = endDate;
    await script.save();

    const reference = `SCRIPT-HOLD-${razorpay_payment_id}`;

    // The buyer may have paid in a non-INR currency; read what was actually charged from the order so
    // the buyer transaction records the real currency/amount. Creator payout stays INR (see below).
    const charge = paymentCheck.charge;
    const holdTax = await resolveCapturedTax({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      paidMinor: charge.amountMinor,
      currency: charge.currency,
      paidAt: charge.paidAt,
      user,
      lines: (await scriptSaleLines(pricing, charge.currency, { priceKind: "hold_price", feeKind: "hold_platform_fee", priceLabel: `30-day hold · ${script.title}` })).lines,
    });

    // Create transaction record for holder (payment)
    await Transaction.create({
      user: req.user._id,
      type: "payment",
      amount: -charge.chargedTotal,
      currency: charge.currency,
      baseCurrency: "INR",
      baseAmount: -pricing.totalAmount,
      fxRate: charge.fxRate,
      status: "completed",
      description: `Placed hold on script: "${script.title}" (30 days)`,
      reference,
      paymentMethod: "razorpay",
      relatedScript: script._id,
      metadata: {
        razorpay_order_id,
        razorpay_payment_id,
        holdEndDate: endDate,
        platformFeeAmount: platformCut,
        creatorPayout,
        totalPaidInr: pricing.totalAmount,
        taxMinor: holdTax?.totals?.taxMinor || 0,
      }
    });

    // Credit the creator
    const creator = await User.findById(script.creator._id);
    if (!creator.wallet) {
      creator.wallet = { balance: 0, totalEarnings: 0 };
    }
    creator.wallet.balance += creatorPayout;
    creator.wallet.totalEarnings += creatorPayout;
    await creator.save();

    // Create transaction record for creator (earnings)
    await Transaction.create({
      user: creator._id,
      type: "credit",
      amount: creatorPayout,
      currency: "INR",
      status: "completed",
      description: `Earned from script hold: "${script.title}"`,
      reference: `SCRIPT-HOLD-EARNING-${razorpay_payment_id}`,
      paymentMethod: "razorpay",
      relatedScript: script._id,
      metadata: {
        holderId: req.user._id.toString(),
        platformFeeAmount: platformCut,
        originalAmount: pricing.baseAmount,
        holdEndDate: endDate
      }
    });

    // Notify the creator
    await Notification.create({
      user: script.creator._id,
      type: "hold",
      from: req.user._id,
      script: script._id,
      message: `${user.name} has placed a 30-day hold on "${script.title}". You earn ₹${creatorPayout.toFixed(2)}.`,
    });

    await recordPayment({
      kind: "script_hold",
      user: req.user._id,
      tax: holdTax,
      creatorPayoutMinor: Math.round(creatorPayout * 100),
      amountMinor: charge.amountMinor,
      currency: charge.currency,
      listPriceMinor: Math.round(pricing.totalAmount * 100),
      providerOrderId: razorpay_order_id,
      providerPaymentId: razorpay_payment_id,
      subjectType: "Script",
      subjectId: script._id,
      label: script.title,
      source: "scriptController.verifyScriptHold",
      metadata: {
        creatorId: String(script.creator?._id || script.creator || ""),
        creatorPayoutInr: creatorPayout,
        platformFeeInr: platformCut,
        holdEndDate: endDate,
      },
    });

    // A hold is a real purchase — thirty days of exclusivity, paid for — and it produced no
    // document at all. Non-fatal: the money is captured, so a missing invoice is something to fix
    // later, never a reason to tell the buyer their payment failed.
    const holdRowSplit = holdTax
      ? null
      : allocate(charge.amountMinor, [Math.round(pricing.baseAmount * 100), Math.round(platformCut * 100)]);
    await issueInvoice({
      kind: "script_hold",
      user,
      paymentReference: `RZP-HOLD-${razorpay_payment_id}`,
      providerPaymentId: razorpay_payment_id,
      tax: holdTax,
      supplyDate: charge.paidAt,
      currency: charge.currency,
      amountCharged: charge.chargedTotal,
      script: script._id,
      scriptSid: script.sid || "",
      scriptPrice: pricing.baseAmount,
      detailLines: [
        script.title,
        `SID ${script.sid || "-"}`,
        `Hold until: ${new Date(endDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
        `Payment Ref: ${razorpay_payment_id}`,
      ],
      detailByKind: { hold_price: `Exclusive 30-day hold on "${script.title}".` },
      // Rows only for the old-format document (taxes off); a tax invoice builds its rows from the snapshot.
      // Both lines are in the CHARGED currency now — they used to be INR next to a USD total.
      rows: holdRowSplit
        ? [
          {
            item: "Script Hold (30 days)",
            type: "Payment",
            detail: `Exclusive hold on "${script.title}".`,
            amountLabel: formatInvoiceMoney(holdRowSplit[0] / 100, charge.currency),
            amountValue: holdRowSplit[0] / 100,
          },
          {
            item: "Platform fee (5%)",
            type: "Fee",
            detail: "Platform fee on the hold.",
            amountLabel: formatInvoiceMoney(holdRowSplit[1] / 100, charge.currency),
            amountValue: holdRowSplit[1] / 100,
          },
          totalRow(charge.chargedTotal, charge.currency),
          gatewayRow(razorpay_payment_id),
        ]
        : [],
      source: "scriptController.verifyScriptHold",
    });
    console.log("Script hold completed:", { scriptId, holderId: req.user._id, fee });

    res.json({
      success: true,
      message: "Hold placed successfully!",
      option,
      holdDetails: {
        fee: pricing.baseAmount,
        platformFee: platformCut,
        taxes: (holdTax?.totals?.taxMinor || 0) / 100,
        currency: charge.currency,
        totalPaid: charge.chargedTotal,
        platformCut,
        creatorPayout,
        expiresAt: endDate,
      },
      transaction: {
        reference,
        amount: pricing.totalAmount,
      }
    });
  } catch (error) {
    console.error("Script hold verification error:", error);
    res.status(500).json({
      message: "Failed to verify payment",
      error: error.message,
      success: false
    });
  }
};

// ── Multer Configuration for Thumbnail & Trailer Uploads (Memory Storage → Cloudinary) ──

// File filters
const imageFileFilter = (req, file, cb) => {
  const allowed = [
    "image/jpeg",
    "image/jpg",
    "image/pjpeg",
    "image/png",
    "image/x-png",
    "image/webp",
    "image/gif",
  ];
  const ext = path.extname(file.originalname || "").toLowerCase();
  const extensionAllowed = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext);

  if (allowed.includes(file.mimetype) || extensionAllowed) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG, WebP and GIF images are allowed"), false);
  }
};

const videoFileFilter = (req, file, cb) => {
  const allowed = ["video/mp4", "video/mpeg", "video/quicktime", "video/webm", "video/x-m4v"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only MP4, MPEG, MOV, M4V and WebM videos are allowed"), false);
  }
};

// Export multer upload instances (memory storage for Cloudinary)
export const uploadThumbnail = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

export const uploadTrailer = multer({
  storage: multer.memoryStorage(),
  fileFilter: videoFileFilter,
  limits: { fileSize: 250 * 1024 * 1024 } // 250MB limit
});

export const uploadPitchVideo = multer({
  storage: multer.memoryStorage(),
  fileFilter: videoFileFilter,
  limits: { fileSize: 90 * 1024 * 1024 } // 90MB limit
});

// ── Upload Thumbnail Controller (Cloudinary) ──
export const uploadScriptThumbnail = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No thumbnail file provided" });
    }

    const scriptId = req.params.id;
    const script = await Script.findById(scriptId);

    if (!script) {
      return res.status(404).json({ message: "Script not found" });
    }

    if (script.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the script creator can upload a thumbnail" });
    }

    // Upload to Cloudinary
    const result = await uploadToCloudinary(req.file.buffer, {
      folder: "scriptbridge/thumbnails",
      resource_type: "image",
      public_id: `thumb-${scriptId}-${Date.now()}`,
    });

    const thumbnailUrl = result.secure_url;
    script.coverImage = thumbnailUrl;
    await script.save();

    res.json({
      message: "Thumbnail uploaded successfully",
      thumbnailUrl,
      script
    });
  } catch (error) {
    console.error("Thumbnail upload error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ── Upload Trailer Controller (Cloudinary) ──
export const uploadScriptTrailer = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No trailer file provided" });
    }

    const scriptId = req.params.id;
    const script = await Script.findById(scriptId);

    if (!script) {
      return res.status(404).json({ message: "Script not found" });
    }

    if (script.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the script creator can upload a trailer" });
    }

    // Upload to Cloudinary
    const result = await uploadToCloudinary(req.file.buffer, {
      folder: "scriptbridge/trailers",
      resource_type: "video",
      public_id: `trailer-${scriptId}-${Date.now()}`,
    });

    const mediaResult = attachUploadedScriptMedia(script, {
      kind: "trailer",
      secureUrl: result.secure_url,
    });
    await script.save();

    res.json({
      ...mediaResult,
      script
    });
  } catch (error) {
    console.error("Trailer upload error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ── Upload Pitch Video Controller (Cloudinary) ──
export const uploadScriptPitchVideo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No pitch video file provided" });
    }

    const scriptId = req.params.id;
    const script = await Script.findById(scriptId);

    if (!script) {
      return res.status(404).json({ message: "Script not found" });
    }

    if (script.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the script creator can upload a pitch video" });
    }

    if (!canUploadPitchVideo(req.user)) {
      return res.status(403).json({
        message: "Pitch video uploads are a premium feature. Please upgrade your plan to unlock this.",
        requiresUpgrade: true
      });
    }

    const result = await uploadToCloudinary(req.file.buffer, {
      folder: "scriptbridge/pitch-videos",
      resource_type: "video",
      public_id: `pitch-${scriptId}-${Date.now()}`,
    });

    const mediaResult = attachUploadedScriptMedia(script, {
      kind: "pitchVideo",
      secureUrl: result.secure_url,
    });
    await script.save();

    res.json({
      ...mediaResult,
      script,
    });
  } catch (error) {
    console.error("Pitch video upload error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ── Writer Requests AI Trailer from Platform ──
// Writer Feedback for Platform AI Trailer
export const createScriptTrailerOrder = async (req, res) => {
  try {
    const scriptId = req.params.id;
    const { duration, quality, format, currency } = req.body || {};

    const script = await Script.findById(scriptId).populate("creator", "_id name");
    if (!script) {
      return res.status(404).json({ message: "Script not found" });
    }

    const creatorId = String(script.creator?._id || script.creator || "");
    if (creatorId !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the script creator can request an AI trailer" });
    }

    if (script.trailerStatus === "ready" && (script.trailerUrl || script.uploadedTrailerUrl)) {
      return res.status(400).json({ message: "AI trailer is already ready for this script" });
    }

    const selectedDuration = String(duration || "").trim();
    const selectedQuality = String(quality || "").trim();
    const selectedFormat = normalizeTrailerLayout(format);
    const pricing = getTrailerPackagePricing(selectedDuration, selectedQuality);

    if (!pricing.INR || !pricing.USD) {
      return res.status(400).json({ message: "Invalid trailer package selected" });
    }

    const billing = await billingFromRequest(req, req.user);
    if (billing.error) return res.status(400).json({ message: billing.error, errors: billing.errors });
    const buyer = await User.findById(req.user._id).select("name email address billingProfile preferredCurrency");
    const buyerCurrency = resolveCurrency(currency, buyer?.preferredCurrency || req.user?.preferredCurrency);
    const trailerLabel = trailerLineLabel(selectedDuration, selectedQuality, selectedFormat);
    const lines = [lineFor("ai_trailer", pricing[buyerCurrency], trailerLabel)];
    const inrLines = [lineFor("ai_trailer", pricing.INR, trailerLabel)];
    const priced = await priceWithInrFallback({
      user: buyer || req.user,
      currency: buyerCurrency,
      lines,
      inrLines,
      billingOverride: billing.override,
      ip: requestIp(req),
    });
    const razorpay = getRazorpay();
    const { order, fellBackToINR } = await createOrderWithUsdFallback(razorpay, {
      amount: priced.requested.grossMinor,
      currency: buyerCurrency,
      inrAmount: priced.inr.grossMinor,
      receipt: `trailer_${script._id.toString().slice(-8)}_${Date.now()}`,
      notes: {
        userId: req.user._id.toString(),
        scriptId: script._id.toString(),
        scriptTitle: script.title,
        creatorId: script.creator._id.toString(),
        duration: selectedDuration,
        quality: selectedQuality,
        format: selectedFormat,
        type: "script_ai_trailer",
      },
    });

    const chosen = pickPriced(priced, order.currency);
    await saveQuote({ order, user: buyer || req.user, purpose: "script_ai_trailer", subjectId: String(script._id), priced: chosen });

    return res.json({
      orderId: order.id,
      breakdown: checkoutBreakdown(chosen, {
        currency: order.currency,
        lines: String(order.currency).toUpperCase() === "INR" ? inrLines : lines,
      }),
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
      keyId: process.env.RAZORPAY_KEY_ID,
      fellBackToINR,
      pricing,
      selection: {
        duration: selectedDuration,
        quality: selectedQuality,
        format: selectedFormat,
      },
    });
  } catch (error) {
    console.error("Trailer order creation error:", error);
    return res.status(500).json({ message: error.message || "Failed to create trailer payment order" });
  }
};

// @desc    What an AI trailer package costs, for the checkout step: price, Taxes (18%), total
// @route   POST /api/scripts/:id/request-ai-trailer/quote
// @access  Private (script owner)
export const getScriptTrailerQuote = async (req, res) => {
  try {
    const { duration, quality, format, currency } = req.body || {};
    const selectedDuration = String(duration || "").trim();
    const selectedQuality = String(quality || "").trim();
    const pricing = getTrailerPackagePricing(selectedDuration, selectedQuality);
    if (!pricing.INR || !pricing.USD) return res.status(400).json({ message: "Invalid trailer package selected" });
    const buyer = await User.findById(req.user._id).select("name email address billingProfile preferredCurrency");
    const buyerCurrency = resolveCurrency(currency, buyer?.preferredCurrency || req.user?.preferredCurrency);
    const lines = [lineFor("ai_trailer", pricing[buyerCurrency], trailerLineLabel(selectedDuration, selectedQuality, format))];
    const priced = await priceCheckout({ user: buyer || req.user, lines, currency: buyerCurrency, ip: requestIp(req) });
    return res.json({
      currency: buyerCurrency,
      listedMinor: pricing[buyerCurrency],
      breakdown: checkoutBreakdown(priced, { currency: buyerCurrency, lines }),
    });
  } catch (error) {
    console.error("Trailer quote error:", error);
    return res.status(500).json({ message: "Failed to price this trailer package" });
  }
};

export const verifyScriptTrailerPayment = async (req, res) => {
  try {
    const scriptId = req.params.id;
    // Only the writer's note and the payment ids come from the body. The package, the currency and the
    // amount are read from the verified Razorpay order — they used to be taken from the request, so a
    // client could claim any duration, quality or price it liked.
    const {
      note,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing payment details" });
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ message: "Payment system not configured" });
    }

    const script = await Script.findById(scriptId);
    if (!script) {
      return res.status(404).json({ message: "Script not found" });
    }

    const creatorId = String(script.creator?._id || script.creator || "");
    if (creatorId !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the script creator can request an AI trailer" });
    }

    if (script.trailerStatus === "ready" && (script.trailerUrl || script.uploadedTrailerUrl)) {
      return res.status(400).json({ message: "AI trailer is already ready for this script" });
    }

    // Prove this is the payment for a trailer on THIS script by THIS writer, captured in full.
    const verifiedTrailer = await readVerifiedOrder(getRazorpay(), {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
      expectNotes: { type: "script_ai_trailer", userId: String(req.user._id), scriptId: String(script._id) },
    });
    if (!verifiedTrailer.ok) {
      return res.status(verifiedTrailer.status || 400).json({ message: verifiedTrailer.message, paymentPending: Boolean(verifiedTrailer.pending) });
    }
    const orderNotes = verifiedTrailer.order?.notes || {};
    const selectedDuration = String(orderNotes.duration || "").trim();
    const selectedQuality = String(orderNotes.quality || "").trim();
    const selectedFormat = normalizeTrailerLayout(orderNotes.format);
    const pricing = getTrailerPackagePricing(selectedDuration, selectedQuality);
    const trailerCharge = verifiedTrailer.charge;
    const paymentCurrency = trailerCharge.currency;
    const paymentAmount = trailerCharge.chargedTotal;
    const trailerBuyer = await User.findById(req.user._id).select("name email sid address billingProfile");
    const trailerTax = await resolveCapturedTax({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      paidMinor: trailerCharge.amountMinor,
      currency: trailerCharge.currency,
      paidAt: trailerCharge.paidAt,
      user: trailerBuyer || req.user,
      lines: [lineFor("ai_trailer", pricing[trailerCharge.currency] || pricing.INR, trailerLineLabel(selectedDuration, selectedQuality, selectedFormat))],
    });

    script.services = {
      hosting: script.services?.hosting ?? true,
      evaluation: script.services?.evaluation ?? false,
      aiTrailer: true,
      spotlight: script.services?.spotlight ?? false,
    };
    script.trailerStatus = "requested";
    script.trailerRequestPayment = {
      status: "paid",
      provider: "razorpay",
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
      currency: paymentCurrency,
      amount: paymentAmount,
      duration: selectedDuration,
      quality: selectedQuality,
      format: selectedFormat,
      paidAt: new Date(),
    };
    script.trailerWriterFeedback = {
      status: "pending",
      note: note?.trim() || buildTrailerRequestNote({
        duration: selectedDuration,
        quality: selectedQuality,
        format: selectedFormat,
        currency: paymentCurrency,
        amount: paymentAmount,
      }),
      updatedAt: new Date(),
    };
    await script.save();

    // The ledger reads the verified ORDER — what Razorpay captured is the only number an accountant
    // can rely on.
    await recordPayment({
      kind: "ai_trailer",
      user: req.user._id,
      tax: trailerTax,
      gatewayFeeMinor: trailerCharge.fee,
      gatewayTaxMinor: trailerCharge.feeTax,
      amountMinor: trailerCharge.amountMinor,
      currency: trailerCharge.currency,
      listPriceMinor: Number(pricing[trailerCharge.currency] || pricing.INR || 0),
      providerOrderId: razorpay_order_id,
      providerPaymentId: razorpay_payment_id,
      subjectType: "Script",
      subjectId: script._id,
      label: script.title,
      source: "scriptController.verifyScriptTrailerPayment",
      metadata: {
        duration: selectedDuration,
        quality: selectedQuality,
        format: selectedFormat,
      },
    });

    // The writer paid for this trailer; until now the only trace was a Transaction row they cannot
    // see. Same non-fatal contract as every other invoice call.
    await issueInvoice({
      kind: "ai_trailer",
      user: trailerBuyer || req.user,
      paymentReference: `RZP-TRL-${razorpay_payment_id}`,
      providerPaymentId: razorpay_payment_id,
      tax: trailerTax,
      supplyDate: trailerCharge.paidAt,
      currency: trailerCharge.currency,
      amountCharged: trailerCharge.chargedTotal,
      script: script._id,
      scriptSid: script.sid || "",
      detailLines: [
        script.title,
        `SID ${script.sid || "-"}`,
        `${selectedDuration}s · ${selectedQuality}px · ${normalizeTrailerLayout(selectedFormat) === "portrait" ? "Portrait" : "Landscape"}`,
        `Payment Ref: ${razorpay_payment_id}`,
      ],
      rows: [
        {
          item: "AI Trailer Generation",
          type: "Payment",
          detail: `${selectedDuration}s at ${selectedQuality}px for "${script.title}".`,
          amountLabel: formatInvoiceMoney(trailerCharge.chargedTotal, trailerCharge.currency),
          amountValue: trailerCharge.chargedTotal,
        },
        totalRow(trailerCharge.chargedTotal, trailerCharge.currency),
        gatewayRow(razorpay_payment_id),
      ],
      source: "scriptController.verifyScriptTrailerPayment",
    });
    await notifyAdminWorkflowEvent({
      title: "AI Trailer Approval Request",
      section: "trailers",
      actorId: req.user._id,
      scriptId: script._id,
      message: `AI trailer requested by writer for "${script.title}"`,
      metadata: {
        scriptId: script._id,
        writerId: req.user._id,
        writerNote: script.trailerWriterFeedback.note || "",
        paymentProvider: "razorpay",
        paymentId: razorpay_payment_id,
      },
    });

    res.json({
      message: "AI trailer request submitted to platform",
      script,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const submitTrailerFeedback = async (req, res) => {
  try {
    const scriptId = req.params.id;
    const { action, note, trailerUrl: requestedTrailerUrlRaw } = req.body || {};
    const requestedTrailerUrl = String(requestedTrailerUrlRaw || "").trim();

    if (!["approved", "revision_requested"].includes(action)) {
      return res.status(400).json({ message: "action must be approved or revision_requested" });
    }

    const script = await Script.findById(scriptId);
    if (!script) {
      return res.status(404).json({ message: "Script not found" });
    }

    if (script.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the script creator can submit trailer feedback" });
    }

    const aiTrailerUrl = String(script.trailerUrl || "").trim();
    const uploadedTrailerUrl = String(script.uploadedTrailerUrl || "").trim();
    const hasAnyKnownTrailer = Boolean(aiTrailerUrl || uploadedTrailerUrl || requestedTrailerUrl);

    if (!hasAnyKnownTrailer) {
      return res.status(400).json({ message: "No AI trailer available for feedback" });
    }

    if (requestedTrailerUrl) {
      const shouldUseUploadedTrailer =
        script.trailerSource === "uploaded" || (!aiTrailerUrl && Boolean(uploadedTrailerUrl));

      if (shouldUseUploadedTrailer) {
        script.uploadedTrailerUrl = requestedTrailerUrl;
        script.trailerSource = "uploaded";
      } else {
        script.trailerUrl = requestedTrailerUrl;
        script.trailerSource = "ai";
      }
    }

    script.trailerWriterFeedback = {
      status: action,
      note: note?.trim() || "",
      updatedAt: new Date(),
    };

    if (action === "revision_requested") {
      script.trailerStatus = "requested";
    } else {
      script.trailerStatus = "ready";
    }

    await script.save();

    if (action === "revision_requested") {
      await notifyAdminWorkflowEvent({
        title: "AI Trailer Revision Requested",
        section: "trailers",
        actorId: req.user._id,
        scriptId: script._id,
        message: `Writer requested a better AI trailer version for "${script.title}"${note?.trim() ? `. Note: ${note.trim()}` : ""}`,
        metadata: {
          scriptId: script._id,
          writerId: req.user._id,
          writerNote: note?.trim() || "",
        },
      });
    }

    res.json({
      message:
        action === "approved"
          ? "Trailer marked as approved"
          : "Trailer revision request submitted",
      script,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Generate an AI Cover Thumbnail (Fallback to pollinations.ai)
export const generateAiCover = async (req, res) => {
  try {
    const { title, genre, logline } = req.body;
    
    const prompt = `A cinematic movie poster for a film titled "${title || 'Untitled'}", genre: ${genre || 'Drama'}. ${logline || ''}. Professional, high quality, 4k. No text other than the title.`;
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=1024&nologo=true`;
    
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error("Failed to generate image from external service.");
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = `data:${response.headers.get('content-type') || 'image/jpeg'};base64,${buffer.toString('base64')}`;
    
    res.json({ base64Image });
  } catch (error) {
    console.error("[generateAiCover] Error:", error);
    res.status(500).json({ message: "Failed to generate AI cover." });
  }
};

// ─── Suggestions Endpoints ───

export const getSimilarScripts = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[getSimilarScripts] Called for script ID: ${id}`);
    const script = await Script.findById(id).select("genre contentType");
    
    if (!script) {
      console.log(`[getSimilarScripts] Script not found for ID: ${id}`);
      return res.status(404).json({ message: "Script not found" });
    }

    const query = {
      ...PUBLIC_SCRIPT_FILTER,
      _id: { $ne: script._id },
    };

    if (script.genre) query.genre = script.genre;
    if (script.contentType) query.contentType = script.contentType;

    let similar = await Script.find(query)
      .populate("creator", "name profileImage role")
      .sort({ views: -1, createdAt: -1 })
      .limit(4)
      .lean();
    
    console.log(`[getSimilarScripts] Initial matches: ${similar.length}`);

    // If not enough scripts, fetch by just genre
    if (similar.length < 4 && script.contentType) {
      delete query.contentType;
      query._id = { $nin: [script._id, ...similar.map(s => s._id)] };
      const moreSimilar = await Script.find(query)
        .populate("creator", "name profileImage role")
        .sort({ views: -1, createdAt: -1 })
        .limit(4 - similar.length)
        .lean();
      similar = [...similar, ...moreSimilar];
      console.log(`[getSimilarScripts] Matches after genre fallback: ${similar.length}`);
    }

    // If still not enough scripts, fetch ANY published scripts
    if (similar.length < 4) {
      delete query.genre;
      query._id = { $nin: [script._id, ...similar.map(s => s._id)] };
      const evenMore = await Script.find(query)
        .populate("creator", "name profileImage role")
        .sort({ views: -1, createdAt: -1 })
        .limit(4 - similar.length)
        .lean();
      similar = [...similar, ...evenMore];
      console.log(`[getSimilarScripts] Matches after ANY fallback: ${similar.length}`);
    }

    console.log(`[getSimilarScripts] Returning ${similar.length} scripts`);

    // Strip fullContent to keep payload small
    similar = similar.map((s) => ({
      ...s,
      synopsis: s.synopsis ? s.synopsis.substring(0, 120) + (s.synopsis.length > 120 ? '...' : '') : null,
      fullContent: undefined,
    }));

    res.json(similar);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
