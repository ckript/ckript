import express from "express";
import protect from "../middleware/authMiddleware.js";
import {
  uploadScript, getScripts, getScriptById, getScriptByPath, getPublicScriptById, unlockScript,
  releaseHold, getMyHolds, addRoles,
  getFeaturedScripts, getTopScripts, searchScriptsReader,
  getLatestScripts, recordRead, toggleFavorite, getCategories,
  trackScriptInteraction,
  extractPdfText, saveDraft, getScriptLimit, deleteScript, getMyDrafts, getMyScripts, updateScript,
  getScriptSubmissionSummaryPdf,
  getPurchaseRequestAcceptancePdf,
  createScriptPurchaseOrder, verifyScriptPurchase, getScriptPurchaseQuote,
  createScriptHoldOrder, verifyScriptHold, getScriptHoldQuote,
  uploadThumbnail, uploadTrailer, uploadPitchVideo,
  uploadScriptThumbnail, uploadScriptTrailer, uploadScriptPitchVideo,
  createScriptTrailerOrder, getScriptTrailerQuote, verifyScriptTrailerPayment, submitTrailerFeedback,
  activateProjectSpotlight,
  getInvestorHomeFeed, getTopList,
  requestScriptPurchase, approveScriptPurchase, rejectScriptPurchase, getMyPurchaseRequests,
  getScriptPdf,
  getSimilarScripts
} from "../controllers/scriptController.js";
import {
  exportFountain,
  exportScreenplayPdf,
  importFountain,
} from "../controllers/screenplayController.js";
import {
  listVersions,
  createVersion,
  restoreVersion,
} from "../controllers/versionController.js";
import {
  listComments,
  createComment,
  updateComment,
  deleteComment,
} from "../controllers/commentController.js";
import { generateCoverImage } from "../controllers/aiController.js";
import {
  abortMediaUploadSession,
  completeMediaUploadSession,
  createMediaUploadSession,
  getMediaUploadSession,
  uploadMediaPart,
  SCRIPT_MEDIA_CHUNK_BYTES,
} from "../controllers/mediaUploadController.js";
import multer from "multer";

const router = express.Router();
const PDF_UPLOAD_MAX_BYTES = 30 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PDF_UPLOAD_MAX_BYTES },
});

const uploadPdfWithLimit = (req, res, next) => {
  upload.single("pdf")(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "File must be 30MB or smaller." });
    }
    if (err) {
      return res.status(400).json({ message: err.message || "File upload failed." });
    }
    next();
  });
};

const uploadThumbnailWithLimit = (req, res, next) => {
  uploadThumbnail.single("thumbnail")(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "Thumbnail must be 5MB or smaller." });
    }
    if (err) {
      return res.status(400).json({ message: err.message || "Thumbnail upload failed." });
    }
    next();
  });
};

const uploadTrailerWithLimit = (req, res, next) => {
  uploadTrailer.single("trailer")(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "Trailer must be 250MB or smaller." });
    }
    if (err) {
      return res.status(400).json({ message: err.message || "Trailer upload failed." });
    }
    next();
  });
};

router.post("/extract-pdf", protect, uploadPdfWithLimit, extractPdfText);
router.post("/draft", protect, saveDraft);
router.post("/upload", protect, uploadScript);

const uploadPitchVideoWithLimit = (req, res, next) => {
  uploadPitchVideo.single("pitchVideo")(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "Pitch video must be 90MB or smaller." });
    }
    if (err) {
      return res.status(400).json({ message: err.message || "Pitch video upload failed." });
    }
    next();
  });
};

const uploadMediaPartBody = express.raw({
  type: "application/octet-stream",
  limit: SCRIPT_MEDIA_CHUNK_BYTES,
});

const uploadMediaPartWithLimit = (req, res, next) => {
  uploadMediaPartBody(req, res, (err) => {
    if (err?.type === "entity.too.large") {
      return res.status(413).json({
        message: `Upload parts must be ${SCRIPT_MEDIA_CHUNK_BYTES / (1024 * 1024)} MiB or smaller.`,
      });
    }
    if (err) {
      return res.status(400).json({ message: err.message || "Upload part could not be read." });
    }
    next();
  });
};

// Thumbnail, Trailer and Pitch Video upload routes
router.post("/:id/upload-thumbnail", protect, uploadThumbnailWithLimit, uploadScriptThumbnail);
router.post("/:id/upload-trailer", protect, uploadTrailerWithLimit, uploadScriptTrailer);
router.post("/:id/upload-pitch-video", protect, uploadPitchVideoWithLimit, uploadScriptPitchVideo);
// Resumable video transport. The legacy whole-file endpoints remain for older
// clients and thumbnails; native creation uses this session contract for both
// trailer and pitch video uploads.
router.post("/:id/media-uploads", protect, createMediaUploadSession);
router.get("/:id/media-uploads/:sessionId", protect, getMediaUploadSession);
router.put("/:id/media-uploads/:sessionId/parts/:partNumber", protect, uploadMediaPartWithLimit, uploadMediaPart);
router.post("/:id/media-uploads/:sessionId/complete", protect, completeMediaUploadSession);
router.delete("/:id/media-uploads/:sessionId", protect, abortMediaUploadSession);
router.post("/:id/request-ai-trailer/quote", protect, getScriptTrailerQuote);
router.post("/:id/request-ai-trailer/create-order", protect, createScriptTrailerOrder);
router.post("/:id/request-ai-trailer", protect, verifyScriptTrailerPayment);
router.post("/:id/trailer-feedback", protect, submitTrailerFeedback);
router.post("/:id/activate-spotlight", protect, activateProjectSpotlight);
router.post("/activate-spotlight", protect, activateProjectSpotlight);
router.post("/spotlight/activate", protect, activateProjectSpotlight);

// AI Cover Generation Route
router.post("/generate-ai-cover", protect, generateCoverImage);

// Razorpay payment routes for scripts
router.post("/purchase/quote", protect, getScriptPurchaseQuote);
router.post("/purchase/create-order", protect, createScriptPurchaseOrder);
router.post("/purchase/verify-payment", protect, verifyScriptPurchase);
router.post("/hold/quote", protect, getScriptHoldQuote);
router.post("/hold/create-order", protect, createScriptHoldOrder);
router.post("/hold/verify-payment", protect, verifyScriptHold);

router.get("/", protect, getScripts);
router.get("/holds", protect, getMyHolds);
router.get("/my-drafts", protect, getMyDrafts);
router.get("/mine", protect, getMyScripts);
router.get("/script-limit", protect, getScriptLimit);
// Reader static routes (must be before /:id)
router.get("/featured", protect, getFeaturedScripts);
router.get("/top", protect, getTopScripts);
router.get("/top-list", protect, getTopList);
router.get("/reader-search", protect, searchScriptsReader);
router.get("/latest", protect, getLatestScripts);
router.get("/categories", protect, getCategories);
router.get("/investor-home", protect, getInvestorHomeFeed);
router.get("/public/:id", getPublicScriptById);
router.get("/path/:projectHeading/:writerUsername", protect, getScriptByPath);
router.get("/:id/submission-summary-pdf", protect, getScriptSubmissionSummaryPdf);
// Screenplay import / export (Fountain + formatted PDF)
router.post("/import/fountain", protect, importFountain);
router.get("/:id/export/fountain", protect, exportFountain);
router.get("/:id/export/pdf", protect, exportScreenplayPdf);
// Final Draft (.fdx) import/export are handled client-side (see client fdx.js) — see §0.
// Version history (Module 4)
router.get("/:id/versions", protect, listVersions);
router.post("/:id/versions", protect, createVersion);
router.post("/:id/versions/:versionId/restore", protect, restoreVersion);
// Comments (Phase 3 — Slice 2)
router.get("/:id/comments", protect, listComments);
router.post("/:id/comments", protect, createComment);
router.patch("/:id/comments/:commentId", protect, updateComment);
router.delete("/:id/comments/:commentId", protect, deleteComment);
// NOTE: a second `router.post("/generate-ai-cover", protect, generateAiCover)` used to sit here.
// Express matches the FIRST registration, so the line above (line ~112, `generateCoverImage`) has
// always been the handler and this one never ran. It is removed rather than kept as a decoy —
// scriptController's `generateAiCover` export is now orphaned and is recorded as dead code in §19
// of NATIVE_APP_IMPLEMENTATION.md rather than deleted.
router.get("/:id/pdf", protect, getScriptPdf);
router.get("/purchase-request/:id/acceptance-pdf", protect, getPurchaseRequestAcceptancePdf);
// Purchase request routes (must be before /:id)
router.post("/purchase-request", protect, requestScriptPurchase);
router.get("/purchase-requests/mine", protect, getMyPurchaseRequests);
router.put("/purchase-request/:id/approve", protect, approveScriptPurchase);
router.put("/purchase-request/:id/reject", protect, rejectScriptPurchase);
router.get("/:id/similar", protect, getSimilarScripts);
router.get("/:id", protect, getScriptById);
router.post("/unlock", protect, unlockScript);
router.post("/release-hold", protect, releaseHold);
router.post("/add-roles", protect, addRoles);
router.post("/:id/read", protect, recordRead);
router.post("/:id/favorite", protect, toggleFavorite);
router.post("/:id/interactions", protect, trackScriptInteraction);
router.put("/:id", protect, updateScript);
router.delete("/:id", protect, deleteScript);

export default router;
