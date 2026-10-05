import express from "express";
import multer from "multer";
import protect from "../middleware/authMiddleware.js";
import adminOnly from "../middleware/adminMiddleware.js";
import {
  listExternalRegistrations,
  approveExternalRegistration,
  rejectExternalRegistration,
} from "../controllers/externalRegistrationController.js";
import {
    getStats,
    getUsers,
    getUserNotableCreditAttachmentFile,
    getDeletedAccountRequests,
    freezeUserAccount,
    unfreezeUserAccount,
    deleteUserAccountAsAdmin,
    grantPremiumModelToUser,
    removePremiumModelFromUser,
    removeWriterPlanFromUser,
    grantWriterPlanToUser,
    grantFipPlanToUser,
    getScripts,
    getAIUsageScripts,
    getEvaluationPurchases,
    getInvestorPurchases,
    getInvoices,
    getPayments,
    getAIScores,
    getPlatformScores,
    getReaderScores,
    getPendingScripts,
    approveScript,
    restoreScript,
    rejectScript,
    editScriptAsAdmin,
    scoreScript,
    getTrailerRequests,
    getAvailableTrailers,
    approveTrailer,
    uploadAdminTrailerFile,
    uploadTrailerAsAdmin,
    removeTrailerAsAdmin,
    loginAsUser,
    getScriptDetail,
    deleteScriptAsAdmin,
    getPendingInvestors,
    getPendingWriterMembershipReviews,
    getWriterMembershipProofAccessUrl,
    approveInvestor,
    rejectInvestor,
    reviewWriterMembership,
    getBankDetailReviews,
    approveBankDetailReview,
    rejectBankDetailReview,
    unblockBankDetailUpdates,
    getAdminAlertSummary,
    getAdminAgreements,
    getAdminAgreementById,
    getAdminAgreementPdf,
    getAdminPurchaseTermsCurrent,
    getAdminPurchaseTermsVersions,
    createAdminPurchaseTermsVersion,
    sendAudienceBroadcast,
    setFinanceRole,
} from "../controllers/adminController.js";
import { upload } from "../controllers/userController.js";
import { getContactSubmissions } from "../controllers/contactController.js";
import {
    adminListCompetitions,
    adminCreateCompetition,
    adminUpdateCompetition,
    adminPublishCompetition,
    adminArchiveCompetition,
    adminListEntries,
    adminRetryEntryAI,
    adminDeclareResults,
    adminReferralAnalytics,
    adminDeleteCompetition,
    adminUploadImage,
    adminUploadResource,
} from "../controllers/competitionAdminController.js";
import { getAdminAnalytics, getAdminAnalyticsAnonymousDetail, getAdminAnalyticsUserDetail } from "../controllers/analyticsController.js";
import {
    adminListJudges,
    adminCreateJudge,
    adminResendJudgeInvite,
    adminAssignJudge,
    adminRevokeJudge,
    adminGetJudging,
    adminSaveJudgingConfig,
    adminUnlockJudging,
    adminSetRanks,
    adminPreviewJudgeEntry,
    adminGetEntryAssignments,
    adminSetEntryAssignments,
    adminSetFinalScore,
} from "../controllers/competitionJudgingAdminController.js";
import {
    adminListConsultations,
    adminGetConsultationDetails,
    adminGetPendingPayouts,
    adminProcessPayout,
    adminGetRefunds,
} from "../controllers/consultationController.js";

const router = express.Router();

// All routes require auth + admin
router.use(protect, adminOnly);

// Dashboard
router.get("/stats", getStats);
router.get("/alerts/summary", getAdminAlertSummary);
router.get("/analytics", getAdminAnalytics);
router.get("/analytics/anonymous/:anonymousId", getAdminAnalyticsAnonymousDetail);
router.get("/analytics/users/:userId", getAdminAnalyticsUserDetail);

// Users
router.get("/users", getUsers);
router.get("/users/:id/industry-credit-attachments/file", getUserNotableCreditAttachmentFile);
router.get("/users/deleted-requests", getDeletedAccountRequests);
router.put("/users/:id/freeze", freezeUserAccount);
router.put("/users/:id/unfreeze", unfreezeUserAccount);
router.delete("/users/:id", deleteUserAccountAsAdmin);
router.post("/users/:id/grant-premium", grantPremiumModelToUser);
router.post("/users/:id/remove-premium", removePremiumModelFromUser);
// Writer Plan Management
router.post("/users/:id/grant-writer-plan", grantWriterPlanToUser);
router.post("/users/:id/remove-writer-plan", removeWriterPlanFromUser);
router.post("/users/:id/grant-fip-plan", grantFipPlanToUser);
router.post("/users/:id/finance-role", setFinanceRole);
const broadcastUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 250 * 1024 * 1024 } // 250MB limit to match MAX_ATTACHMENT_SIZE_BYTES
});
router.post("/broadcast/:audience", broadcastUpload.array("attachments", 10), sendAudienceBroadcast);

// Scripts (admin auth from router.use(protect, adminOnly) above is the only gate — the extra
// script-section password has been removed)
router.get("/scripts", getScripts);
router.get("/scripts/ai-usage", getAIUsageScripts);
router.get("/scripts/evaluation-purchases", getEvaluationPurchases);
router.get("/scripts/investor-purchases", getInvestorPurchases);
router.get("/scripts/pending", getPendingScripts);
router.get("/scripts/trailer-requests", getTrailerRequests);
router.get("/scripts/ai-trailers", getAvailableTrailers);
router.get("/scripts/:id", getScriptDetail);
router.delete("/scripts/:id", deleteScriptAsAdmin);
router.put("/scripts/:id/approve", approveScript);
// Undo a writer's soft delete. The only path back — deleteScript keeps the document, but nothing
// in the product could clear isDeleted until this existed.
router.put("/scripts/:id/restore", restoreScript);
router.put("/scripts/:id/reject", rejectScript);
router.put("/scripts/:id/edit", editScriptAsAdmin);
router.put("/scripts/:id/score", scoreScript);
router.put("/scripts/:id/trailer-approve", approveTrailer);
router.post("/scripts/:id/upload-trailer", uploadAdminTrailerFile, uploadTrailerAsAdmin);
router.delete("/scripts/:id/remove-trailer", removeTrailerAsAdmin);

// Payments
router.get("/payments", getPayments);
router.get("/invoices", getInvoices);

// Scores
router.get("/scores/ai", getAIScores);
router.get("/scores/platform", getPlatformScores);
router.get("/scores/reader", getReaderScores);

// Impersonation
router.post("/login-as/:userId", loginAsUser);

// Investor Approval
router.get("/investors/pending", getPendingInvestors);
router.get("/writer-membership/pending", getPendingWriterMembershipReviews);
router.get("/writer-membership/:id/:membershipType/access-url", getWriterMembershipProofAccessUrl);
router.put("/investors/:id/approve", approveInvestor);
router.put("/investors/:id/reject", rejectInvestor);

// Writer membership proof review
router.put("/writer-membership/:id/:membershipType/:decision", reviewWriterMembership);

// Bank details review
// Third-party registration claims: somebody paid to enter on another platform and needs a human to
// confirm it. Approval creates the entry with no payment and records the foregone fee in the ledger.
router.get("/external-registrations", listExternalRegistrations);
router.put("/external-registrations/:id/approve", approveExternalRegistration);
router.put("/external-registrations/:id/reject", rejectExternalRegistration);

router.get("/bank-details/reviews", getBankDetailReviews);
router.put("/bank-details/reviews/:id/approve", approveBankDetailReview);
router.put("/bank-details/reviews/:id/reject", rejectBankDetailReview);
router.put("/bank-details/reviews/:id/unblock", unblockBankDetailUpdates);

// Legal agreements and terms management
router.get("/agreements", getAdminAgreements);
router.get("/agreements/:id", getAdminAgreementById);
router.get("/agreements/:id/pdf", getAdminAgreementPdf);
router.get("/legal/terms/current", getAdminPurchaseTermsCurrent);
router.get("/legal/terms/versions", getAdminPurchaseTermsVersions);
router.post("/legal/terms/versions", createAdminPurchaseTermsVersion);

// Competitions (auth comes from router.use(protect, adminOnly) above)
router.get("/competitions", adminListCompetitions);
router.post("/competitions", adminCreateCompetition);
router.put("/competitions/:id", adminUpdateCompetition);
router.post("/competitions/:id/publish", adminPublishCompetition);
router.post("/competitions/:id/archive", adminArchiveCompetition);
router.delete("/competitions/:id", adminDeleteCompetition);
router.get("/competitions/:id/entries", adminListEntries);
router.post("/competitions/:id/entries/:entryId/retry-ai", adminRetryEntryAI);
router.post("/competitions/:id/results", adminDeclareResults);
router.post("/competitions/upload", upload.single("image"), adminUploadImage);

const resourceUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }
});
router.post("/competitions/upload-resource", resourceUpload.single("file"), adminUploadResource);

// Referral analytics (?competitionId= scopes it, ?format=csv exports)
router.get("/referrals/analytics", adminReferralAnalytics);

// ── Judge panel ─────────────────────────────────────────────────────────────
// Judge ACCOUNTS and the per-competition rubric. The judge-facing API is a separate router
// (routes/judgeRoutes.js) behind its own role gate; nothing here is reachable by a judge.
router.get("/judges", adminListJudges);
router.post("/judges", adminCreateJudge);
router.post("/judges/:judgeId/resend-invite", adminResendJudgeInvite);

router.get("/competitions/:id/judging", adminGetJudging);
router.put("/competitions/:id/judging", adminSaveJudgingConfig);
router.post("/competitions/:id/judging/unlock", adminUnlockJudging);
router.put("/competitions/:id/judging/ranks", adminSetRanks);
router.post("/competitions/:id/judges", adminAssignJudge);
router.delete("/competitions/:id/judges/:judgeId", adminRevokeJudge);
// Proves the blind view is blind, by calling the judge's own projection from an admin route.
router.get("/competitions/:id/entries/:entryId/judge-preview", adminPreviewJudgeEntry);
// Which judge reads which script. A judge sees ONLY what is assigned here, so a panel of five is an
// allocation rather than five people reading everything.
router.get("/competitions/:id/assignments", adminGetEntryAssignments);
router.put("/competitions/:id/assignments", adminSetEntryAssignments);
// The admin's own score, decided after reading what every assigned judge said. Separate from the
// panel's computed mean, and separate again from declaring an award.
router.put("/competitions/:id/entries/:entryId/final-score", adminSetFinalScore);

// Contact Queries
router.get("/queries", getContactSubmissions);

// Consultations
router.get("/consultations", adminListConsultations);
router.get("/consultations/payouts", adminGetPendingPayouts);
router.get("/consultations/refunds", adminGetRefunds);
router.get("/consultations/:id", adminGetConsultationDetails);
router.post("/consultations/:id/payout", adminProcessPayout);

export default router;
