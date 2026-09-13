import User from "../models/User.js";
import { recordGrant } from "../utils/ledger.js";
import { planAmountMinor } from "../utils/planCheckout.js";
import { WRITER_PLAN_KEY } from "../config/pricing.js";
import Script from "../models/Script.js";
import ScriptOption from "../models/ScriptOption.js";
import ScriptPurchaseRequest from "../models/ScriptPurchaseRequest.js";
import Transaction from "../models/Transaction.js";
import Invoice from "../models/Invoice.js";
import Agreement from "../models/Agreement.js";
import Notification from "../models/Notification.js";
import Message from "../models/Message.js";
import ContactSubmission from "../models/ContactSubmission.js";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import multer from "multer";
import { uploadToCloudinary, buildPrivateDownloadUrl } from "../config/cloudinary.js";
import {
    createNewPurchaseTermsPolicyVersion,
    getCurrentPurchaseTermsPolicy,
    listPurchaseTermsPolicyVersions,
} from "../utils/termsPolicyService.js";
import {
    sendInvestorApprovalEmail,
    sendInvestorRejectionEmail,
    sendWriterMembershipDecisionEmail,
    sendAdminPremiumGrantedEmail,
    sendAdminPremiumRemovedEmail,
    sendAdminBroadcastEmail,
    sendWriterPlanGrantedEmail,
    sendFipPlanGrantedEmail,
} from "../utils/emailService.js";
import { extractTextFromPdfUrl } from "../utils/pdfTextExtraction.js";
import { fetchTrustedPdfAsset, getCloudinaryResourceTypeFromUrl } from "../utils/remoteAssetPolicy.js";
import { asTrimmedString } from "../utils/requestValue.js";
import {
    describeMembershipProofAsset,
    hasMembershipProofAsset,
} from "../utils/membershipProofAsset.js";
// Unsubscribe lives in its own controller because its endpoints are PUBLIC and sessionless — someone
// clicking a link in their inbox has no session and will not sign in to stop mail they did not want.
import { filterSubscribed } from "./unsubscribeController.js";
import { buildUnsubscribeUrl, resolveUnsubscribeBaseUrl } from "../utils/unsubscribeToken.js";

const buildChatId = (idA, idB) => {
    const sorted = [idA.toString(), idB.toString()].sort();
    return `${sorted[0]}_${sorted[1]}`;
};

const resolveClientOriginFromRequest = (req) => {
    const originHeader = String(req.get("origin") || "").trim();
    if (originHeader) return originHeader;

    const refererHeader = String(req.get("referer") || "").trim();
    if (refererHeader) {
        try {
            return new URL(refererHeader).origin;
        } catch (_error) {
            // Ignore malformed referer and fall back to env-based URL resolution.
        }
    }

    return "";
};

const maskAccountNumber = (accountNumber = "") => {
    if (!accountNumber) return "";
    return `****${String(accountNumber).slice(-4)}`;
};

const normalizeString = (value) => (typeof value === "string" ? value.trim() : "");
const WRITER_ROLE_LIST = ["writer", "creator"];
const FILM_PROFESSIONAL_ROLE_LIST = ["investor", "producer", "director", "industry", "professional"];
const ACTIVE_USER_FILTER = {
    isDeactivated: { $ne: true },
    isFrozen: { $ne: true },
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
        ? script.scriptPreviewPageTexts.map((pageText) => String(pageText || "").trim())
        : [];
};
const getScriptPreviewPageTextByNumber = (script, pageNumber) => {
    const pageTexts = getScriptPreviewPageTexts(script);
    const index = Math.max(0, Number(pageNumber || 0) - 1);
    return String(pageTexts[index] || "").trim();
};
const hasViewableScriptPreview = (script) => Boolean(script?.viewableScript);

const buildBroadcastAudienceConfig = (audience = "") => {
    const normalizedAudience = String(audience || "").trim().toLowerCase();
    if (normalizedAudience === "writers") {
        return {
            key: "writers",
            filter: {
                role: { $in: WRITER_ROLE_LIST },
                ...ACTIVE_USER_FILTER,
            },
            audienceLabel: "writers community",
        };
    }

    if (normalizedAudience === "film-professionals") {
        return {
            key: "film-professionals",
            filter: {
                role: { $in: FILM_PROFESSIONAL_ROLE_LIST },
                ...ACTIVE_USER_FILTER,
                approvalStatus: "approved",
            },
            audienceLabel: "film industry professional community",
        };
    }

    if (normalizedAudience === "script-uploaders") {
        return {
            key: "script-uploaders",
            audienceLabel: "writers who uploaded scripts",
            getRecipients: async () => {
                const creatorIds = await Script.distinct("creator", {
                    creator: { $exists: true, $ne: null },
                });

                if (!creatorIds.length) {
                    return [];
                }

                return User.find({
                    _id: { $in: creatorIds },
                    role: { $in: WRITER_ROLE_LIST },
                    ...ACTIVE_USER_FILTER,
                })
                    .select("_id name email")
                    .lean();
            },
        };
    }

    return null;
};

const buildArchivedUserProfileSnapshot = (userDoc) => {
    const source = typeof userDoc?.toObject === "function"
        ? userDoc.toObject({ depopulate: false })
        : { ...(userDoc || {}) };

    delete source.password;
    delete source.emailVerificationToken;
    delete source.emailVerificationExpires;
    delete source.emailVerificationResendAvailableAt;
    delete source.resetPasswordToken;
    delete source.resetPasswordExpires;
    delete source.pendingEmail;

    return source;
};

const sanitizeInlineFileName = (fileName = "attachment.pdf") => {
    const normalized = String(fileName || "attachment.pdf")
        .replace(/[\\/]/g, "-")
        .replace(/[^a-zA-Z0-9._ -]/g, "_")
        .trim();
    if (!normalized) return "attachment.pdf";
    return normalized.toLowerCase().endsWith(".pdf") ? normalized : `${normalized}.pdf`;
};

const resolveAttachmentCloudinaryResourceType = (attachment) =>
    normalizeString(attachment?.cloudinaryResourceType) ||
    getCloudinaryResourceTypeFromUrl(attachment?.url) ||
    (attachment?.resourceType === "video" ? "video" : attachment?.resourceType === "document" ? "raw" : "image");

const fetchPdfBufferFromCloudinary = async ({ publicId, attachmentUrl, preferredResourceType }) => {
    const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60;
    const resourceTypeCandidates = Array.from(new Set([
        preferredResourceType,
        "raw",
        "image",
    ].filter(Boolean)));

    for (const resourceType of resourceTypeCandidates) {
        try {
            const signedUrl = buildPrivateDownloadUrl(publicId, "pdf", {
                resource_type: resourceType,
                type: "upload",
                expires_at: expiresAt,
                attachment: false,
            });

            const { buffer } = await fetchTrustedPdfAsset(signedUrl);
            if (buffer.length > 0) return buffer;
        } catch {
            // Try fallback resource types.
        }
    }

    if (attachmentUrl) {
        try {
            const { buffer } = await fetchTrustedPdfAsset(attachmentUrl);
            if (buffer.length > 0) return buffer;
        } catch {
            // Final fallback failed; return null below.
        }
    }

    return null;
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

const NON_DELETED_SCRIPT_FILTER = { $nin: [true, "true", 1] };
const DELETED_SCRIPT_FILTER = { $in: [true, "true", 1] };
const LIVE_SCRIPT_STATUSES = ["published", "approved"];
const VISIBLE_ADMIN_SCRIPT_STATUSES = [...LIVE_SCRIPT_STATUSES, "pending_approval", "rejected"];

const getActiveAdminScriptFilter = (extra = {}) => ({
    isDeleted: NON_DELETED_SCRIPT_FILTER,
    ...extra,
});

const getPendingApprovalScriptFilter = () => getActiveAdminScriptFilter({
    status: "pending_approval",
});

const getAdminTrailerRequestFilter = () => ({
    isDeleted: NON_DELETED_SCRIPT_FILTER,
    "services.aiTrailer": true,
    trailerStatus: { $in: ["requested", "generating"] },
    "trailerRequestPayment.status": "paid",
});

const getAdminTrailerLibraryFilter = () => ({
    isDeleted: NON_DELETED_SCRIPT_FILTER,
    $or: [
        { trailerUrl: { $exists: true, $nin: ["", null] } },
        { uploadedTrailerUrl: { $exists: true, $nin: ["", null] } },
    ],
});

const getSettledPurchaseQuery = (extra = {}) => ({
    ...extra,
    status: "approved",
    $or: [
        { paymentStatus: "released" },
        { amount: { $lte: 0 } },
    ],
});

const getPurchasedUserIdSetForAdminDelete = async (script) => {
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

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const WRITER_ROLE_SET = new Set(["writer", "creator"]);

const MEMBERSHIP_TYPE_CONFIG = {
    wga: { verificationKey: "wga", memberField: "wgaMember", label: "WGA" },
    swa: { verificationKey: "swa", memberField: "sgaMember", label: "SWA" },
};

const createEmptyMembershipReview = () => ({
    requested: false,
    status: "not_submitted",
    proofUrl: "",
    proofPublicId: "",
    proofFileName: "",
    proofMimeType: "",
    submittedAt: undefined,
    reviewedAt: undefined,
    reviewedBy: undefined,
    adminNote: "",
});

const ensureWriterMembershipVerification = (user) => {
    if (!user.writerProfile) user.writerProfile = {};
    if (!user.writerProfile.membershipVerification) {
        user.writerProfile.membershipVerification = {
            wga: createEmptyMembershipReview(),
            swa: createEmptyMembershipReview(),
        };
    }
    if (!user.writerProfile.membershipVerification.wga) {
        user.writerProfile.membershipVerification.wga = createEmptyMembershipReview();
    }
    if (!user.writerProfile.membershipVerification.swa) {
        user.writerProfile.membershipVerification.swa = createEmptyMembershipReview();
    }
    return user.writerProfile.membershipVerification;
};

const buildAdminUserSearchQuery = (searchTerm) => {
    const normalizedSearch = String(searchTerm || "").trim();
    if (!normalizedSearch) return null;

    const safeSearch = escapeRegex(normalizedSearch);
    const regexFilter = { $regex: safeSearch, $options: "i" };

    return {
        $or: [
            { sid: regexFilter },
            { name: regexFilter },
            { email: regexFilter },
            { phone: regexFilter },
            { "address.street": regexFilter },
            { "address.city": regexFilter },
            { "address.state": regexFilter },
            { "address.zipCode": regexFilter },
            { "writerProfile.legalName": regexFilter },
            { "writerProfile.username": regexFilter },
            { "writerProfile.agencyName": regexFilter },
            { "writerProfile.genres": regexFilter },
            { "writerProfile.specializedTags": regexFilter },
            { "industryProfile.company": regexFilter },
            { "industryProfile.jobTitle": regexFilter },
            { "industryProfile.mandates.genres": regexFilter },
            { "preferences.genres": regexFilter },
        ],
    };
};

const rawUploadAdminTrailer = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 250 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file?.mimetype?.startsWith("video/")) return cb(null, true);
        return cb(new Error("Only video files are allowed for trailer upload."));
    },
}).single("trailer");

export const uploadAdminTrailerFile = (req, res, next) => {
    rawUploadAdminTrailer(req, res, (err) => {
        if (!err) return next();

        if (err instanceof multer.MulterError) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(413).json({ message: "Trailer must be 250MB or smaller." });
            }
            return res.status(400).json({ message: err.message || "Trailer upload failed." });
        }

        return res.status(400).json({ message: err.message || "Trailer upload failed." });
    });
};

// ─── Dashboard Stats ───
export const getStats = async (req, res) => {
    try {
        const [
            totalUsers,
            totalScripts,
            publishedScripts,
            deletedScripts,
            draftScripts,
            rejectedScripts,
            soldScripts,
            totalInvestors,
            totalWriters,
            totalReaders,
            pendingApprovals,
            pendingTrailerRequests,
            aiUsageScripts,
            evaluationScripts,
            pendingInvestors,
            pendingMembershipReviews,
            pendingBankReviews,
            lockedBankUsers,
            queries,
            deletedAccounts,
            deletedFilmProfessionals,
            deletedWriters,
            totalTransactions,
        ] = await Promise.all([
            User.countDocuments({ role: { $ne: "admin" } }),
            Script.countDocuments(),
            Script.countDocuments(getActiveAdminScriptFilter({ status: { $in: LIVE_SCRIPT_STATUSES } })),
            Script.countDocuments({ isDeleted: DELETED_SCRIPT_FILTER }),
            Script.countDocuments(getActiveAdminScriptFilter({ status: "draft" })),
            Script.countDocuments(getActiveAdminScriptFilter({ status: "rejected" })),
            Script.countDocuments(getActiveAdminScriptFilter({ isSold: true })),
            User.countDocuments({ role: "investor" }),
            User.countDocuments({ role: { $in: ["writer", "creator"] } }),
            User.countDocuments({ role: "reader" }),
            Script.countDocuments(getPendingApprovalScriptFilter()),
            Script.countDocuments(getAdminTrailerRequestFilter()),
            Script.countDocuments({
                $or: [
                    { "services.evaluation": true },
                    { "services.aiTrailer": true },
                    { "scriptScore.overall": { $exists: true, $ne: null } },
                ],
            }),
            Script.countDocuments({ "services.evaluation": true }),
            User.countDocuments({ role: "investor", approvalStatus: "pending" }),
            User.countDocuments({
                role: { $in: ["writer", "creator"] },
                $or: [
                    { "writerProfile.membershipVerification.wga.status": "pending" },
                    { "writerProfile.membershipVerification.swa.status": "pending" },
                ],
            }),
            User.countDocuments({ role: { $in: ["writer", "creator"] }, "bankDetailsReview.status": "pending" }),
            User.countDocuments({ role: { $in: ["writer", "creator"] }, "bankDetailsSecurity.isLocked": true }),
            ContactSubmission.countDocuments(),
            User.countDocuments({ role: { $ne: "admin" }, isDeactivated: true }),
            User.countDocuments({ role: "investor", isDeactivated: true }),
            User.countDocuments({ role: { $in: ["writer", "creator"] }, isDeactivated: true }),
            Transaction.countDocuments({ status: "completed" }),
        ]);

        const bankReviewAlerts = pendingBankReviews + lockedBankUsers;
        const openAdminActions = pendingApprovals + pendingTrailerRequests + pendingInvestors + pendingMembershipReviews + bankReviewAlerts + queries;

        const revenueResult = await Transaction.aggregate([
            { $match: { status: "completed", type: { $in: ["credit", "payment"] } } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
        ]);
        const totalRevenue = revenueResult[0]?.total || 0;

        res.json({
            totalUsers,
            totalScripts,
            publishedScripts,
            deletedScripts,
            draftScripts,
            rejectedScripts,
            soldScripts,
            totalInvestors,
            totalWriters,
            totalReaders,
            pendingApprovals,
            pendingTrailerRequests,
            aiUsageScripts,
            evaluationScripts,
            pendingInvestors,
            pendingMembershipReviews,
            pendingBankReviews,
            lockedBankUsers,
            bankReviewAlerts,
            queries,
            deletedAccounts,
            deletedFilmProfessionals,
            deletedWriters,
            openAdminActions,
            totalTransactions,
            totalRevenue,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── User Lists by Role ───
export const getUsers = async (req, res) => {
    try {
        const { role, search, page = 1, limit = 20, isPremium, hasActiveWriterPlan, isSwaApproved } = req.query;
        const pageNumber = Math.max(Number(page) || 1, 1);
        const pageLimit = Number(limit) === 0 ? 0 : Math.min(Math.max(Number(limit) || 20, 1), 100);
        const filter = { role: { $ne: "admin" }, isDeactivated: { $ne: true } };
        if (role && typeof role === 'string') filter.role = role;
        if (isPremium === 'true') {
            filter["subscription.accessTier"] = "film_industry_professional";
            filter["subscription.accessStatus"] = "active";
        }
        if (hasActiveWriterPlan === 'true') {
            filter.role = { $in: ["writer", "creator"] };
            filter["subscription.accessStatus"] = "active";
            filter["subscription.accessTier"] = { $in: ["writer_silver", "writer_gold", "standard"] };
        }
        if (isSwaApproved === 'true') {
            filter.role = { $in: ["writer", "creator"] };
            filter.$and = filter.$and || [];
            filter.$and.push({
                $or: [
                    { "writerProfile.membershipVerification.swa.status": "approved" },
                    { "writerProfile.membershipVerification.wga.status": "approved" },
                    { "writerProfile.wgaMember": true },
                    { "writerProfile.sgaMember": true }
                ]
            });
        }

        const searchFilter = buildAdminUserSearchQuery(search);
        if (searchFilter) {
            filter.$and = filter.$and || [];
            filter.$and.push(searchFilter);
        }

        const total = await User.countDocuments(filter);
        const users = await User.find(filter)
            .select("-password -emailVerificationToken -emailVerificationExpires -emailVerificationResendAvailableAt -activeSessions -passwordResetToken -passwordResetExpires -passwordResetResendAvailableAt -stripeAccountId -stripeCustomerId -googleId")
            .sort({ createdAt: -1 })
            .skip((pageNumber - 1) * pageLimit)
            .limit(pageLimit)
            .lean();

        res.json({
            users,
            total,
            page: pageNumber,
            totalPages: pageLimit === 0 ? 1 : Math.ceil(total / pageLimit),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getUserNotableCreditAttachmentFile = async (req, res) => {
    try {
        const userId = normalizeString(req.params?.id);
        const publicId = normalizeString(req.query?.publicId);
        const fileUrl = normalizeString(req.query?.url);

        if (!userId) {
            return res.status(400).json({ message: "User id is required" });
        }

        if (!publicId && !fileUrl) {
            return res.status(400).json({ message: "publicId or url is required" });
        }

        const targetUser = await User.findById(userId)
            .select("industryProfile.notableCreditAttachments")
            .lean();

        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        const attachments = Array.isArray(targetUser?.industryProfile?.notableCreditAttachments)
            ? targetUser.industryProfile.notableCreditAttachments
            : [];

        const attachment = attachments.find((item) => {
            const itemPublicId = normalizeString(item?.publicId);
            const itemUrl = normalizeString(item?.url);
            if (publicId && itemPublicId === publicId) return true;
            if (fileUrl && itemUrl === fileUrl) return true;
            return false;
        });

        if (!attachment) {
            return res.status(404).json({ message: "Attachment not found" });
        }

        const mimeType = String(attachment?.mimeType || "").toLowerCase();
        if (mimeType !== "application/pdf") {
            return res.redirect(attachment.url);
        }

        const attachmentPublicId = normalizeString(attachment?.publicId);
        if (!attachmentPublicId) {
            return res.redirect(attachment.url);
        }

        const pdfBuffer = await fetchPdfBufferFromCloudinary({
            publicId: attachmentPublicId,
            attachmentUrl: normalizeString(attachment?.url),
            preferredResourceType: resolveAttachmentCloudinaryResourceType(attachment),
        });

        if (!pdfBuffer) {
            return res.status(502).json({ message: "Unable to load PDF attachment" });
        }

        const fileName = sanitizeInlineFileName(attachment?.fileName || "attachment.pdf");
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
        return res.send(pdfBuffer);
    } catch (error) {
        return res.status(500).json({ message: error.message || "Failed to load attachment file" });
    }
};

const buildAdminManagedUserSummary = (user) => ({
    _id: user._id,
    sid: user.sid,
    name: user.name,
    email: user.email,
    role: user.role,
    isFrozen: Boolean(user.isFrozen),
    frozenAt: user.frozenAt,
    frozenReason: user.frozenReason || "",
    isDeactivated: Boolean(user.isDeactivated),
    deactivatedAt: user.deactivatedAt,
    accountDeletionReason: String(user?.accountDeletion?.reason || ""),
    accountDeletionSource: String(user?.accountDeletion?.source || ""),
    accountDeletionRequestedAt: user?.accountDeletion?.requestedAt,
    accountDeletionOriginalName: String(user?.accountDeletion?.originalName || ""),
    accountDeletionOriginalEmail: String(user?.accountDeletion?.originalEmail || ""),
});

const buildDeletedUserProfileSnapshotForAdmin = (user) => {
    const archivedProfile = user?.accountDeletion?.archivedProfile;
    const snapshot = archivedProfile && typeof archivedProfile === "object"
        ? { ...archivedProfile }
        : {};

    const originalName = String(user?.accountDeletion?.originalName || "").trim();
    const originalEmail = String(user?.accountDeletion?.originalEmail || "").trim();

    snapshot._id = snapshot._id || user?._id;
    snapshot.sid = snapshot.sid || user?.sid || "";
    snapshot.role = snapshot.role || user?.role || "";
    snapshot.name = snapshot.name || originalName || user?.name || "";
    snapshot.email = snapshot.email || originalEmail || user?.email || "";
    snapshot.phone = snapshot.phone || user?.phone || "";
    snapshot.isFrozen = typeof snapshot.isFrozen === "boolean" ? snapshot.isFrozen : Boolean(user?.isFrozen);
    snapshot.frozenAt = snapshot.frozenAt || user?.frozenAt;
    snapshot.frozenReason = snapshot.frozenReason || user?.frozenReason || "";
    snapshot.isDeactivated = true;
    snapshot.deactivatedAt = snapshot.deactivatedAt || user?.deactivatedAt;
    snapshot.deactivatedBy = snapshot.deactivatedBy || user?.deactivatedBy;
    snapshot.createdAt = snapshot.createdAt || user?.createdAt;
    snapshot.updatedAt = snapshot.updatedAt || user?.updatedAt;
    snapshot.writerProfile = snapshot.writerProfile || user?.writerProfile;
    snapshot.industryProfile = snapshot.industryProfile || user?.industryProfile;
    snapshot.preferences = snapshot.preferences || user?.preferences;
    snapshot.address = snapshot.address || user?.address;
    snapshot.approvalStatus = snapshot.approvalStatus || user?.approvalStatus;
    snapshot.approvalNote = snapshot.approvalNote || user?.approvalNote;
    snapshot.emailVerified = typeof snapshot.emailVerified === "boolean" ? snapshot.emailVerified : user?.emailVerified;
    snapshot.favoriteScripts = snapshot.favoriteScripts || user?.favoriteScripts || [];
    snapshot.scriptsRead = snapshot.scriptsRead || user?.scriptsRead || [];

    snapshot.accountDeletion = {
        ...(snapshot.accountDeletion || {}),
        reason: snapshot.accountDeletion?.reason || user?.accountDeletion?.reason || "",
        source: snapshot.accountDeletion?.source || user?.accountDeletion?.source || "user",
        requestedAt: snapshot.accountDeletion?.requestedAt || user?.accountDeletion?.requestedAt || user?.deactivatedAt,
        originalName: snapshot.accountDeletion?.originalName || originalName,
        originalEmail: snapshot.accountDeletion?.originalEmail || originalEmail,
        archivedAt: snapshot.accountDeletion?.archivedAt || user?.accountDeletion?.archivedAt,
        archivedBy: snapshot.accountDeletion?.archivedBy || user?.accountDeletion?.archivedBy,
    };

    return snapshot;
};

export const getDeletedAccountRequests = async (req, res) => {
    try {
        const { page = 1, limit = 20, search = "", role = "" } = req.query;
        const pageNumber = Math.max(Number(page) || 1, 1);
        const pageLimit = Number(limit) === 0 ? 0 : Math.min(Math.max(Number(limit) || 20, 1), 100);
        const normalizedRole = String(role || "").trim().toLowerCase();

        const filter = {
            role: { $ne: "admin" },
            isDeactivated: true,
        };

        if (normalizedRole === "investor") {
            filter.role = "investor";
        } else if (normalizedRole === "writer") {
            filter.role = { $in: ["writer", "creator"] };
        } else if (normalizedRole === "reader") {
            filter.role = "reader";
        }

        const trimmedSearch = String(search || "").trim();
        if (trimmedSearch) {
            filter.$or = [
                { sid: { $regex: trimmedSearch, $options: "i" } },
                { name: { $regex: trimmedSearch, $options: "i" } },
                { email: { $regex: trimmedSearch, $options: "i" } },
                { "accountDeletion.originalName": { $regex: trimmedSearch, $options: "i" } },
                { "accountDeletion.originalEmail": { $regex: trimmedSearch, $options: "i" } },
                { "accountDeletion.reason": { $regex: trimmedSearch, $options: "i" } },
            ];
        }

        const total = await User.countDocuments(filter);
        const users = await User.find(filter)
            .select("sid name email phone role deactivatedAt deactivatedBy accountDeletion isFrozen frozenAt frozenReason createdAt updatedAt writerProfile industryProfile preferences address approvalStatus approvalNote emailVerified favoriteScripts scriptsRead")
            .sort({ deactivatedAt: -1, updatedAt: -1 })
            .skip((pageNumber - 1) * pageLimit)
            .limit(pageLimit)
            .lean();

        const rows = users.map((user) => ({
            _id: user._id,
            sid: user.sid || "",
            role: user.role || "",
            name: user.accountDeletion?.originalName || user.name || "",
            email: user.accountDeletion?.originalEmail || user.email || "",
            reason: user.accountDeletion?.reason || "",
            source: user.accountDeletion?.source || "user",
            requestedAt: user.accountDeletion?.requestedAt || user.deactivatedAt,
            deactivatedAt: user.deactivatedAt,
            frozenReason: user.frozenReason || "",
            isFrozen: Boolean(user.isFrozen),
            profileSnapshot: buildDeletedUserProfileSnapshotForAdmin(user),
        }));

        res.json({
            requests: rows,
            total,
            page: pageNumber,
            totalPages: pageLimit === 0 ? 1 : Math.ceil(total / pageLimit),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const freezeUserAccount = async (req, res) => {
    try {
        const { reason } = req.body || {};
        const targetUser = await User.findById(req.params.id);
        if (!targetUser) return res.status(404).json({ message: "User not found" });

        if (!String(targetUser.email || "").trim()) {
            return res.status(400).json({ message: "User email is missing. Cannot send the account notification email." });
        }

        if (targetUser.role === "admin") {
            return res.status(403).json({ message: "Admin accounts cannot be frozen" });
        }

        if (targetUser.isDeactivated) {
            return res.status(400).json({ message: "This account is already deleted" });
        }

        targetUser.isFrozen = true;
        targetUser.frozenAt = new Date();
        targetUser.frozenReason = String(reason || "Account frozen by admin").trim();
        targetUser.frozenBy = req.user._id;
        await targetUser.save();

        await Notification.create({
            user: targetUser._id,
            type: "admin_alert",
            from: req.user._id,
            message: targetUser.frozenReason || "Your account has been frozen by admin",
        }).catch(() => null);

        res.json({
            message: "Account frozen successfully",
            user: buildAdminManagedUserSummary(targetUser),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const unfreezeUserAccount = async (req, res) => {
    try {
        const targetUser = await User.findById(req.params.id);
        if (!targetUser) return res.status(404).json({ message: "User not found" });

        if (targetUser.role === "admin") {
            return res.status(403).json({ message: "Admin accounts cannot be unfrozen from this endpoint" });
        }

        targetUser.isFrozen = false;
        targetUser.frozenAt = undefined;
        targetUser.frozenReason = "";
        targetUser.frozenBy = undefined;
        await targetUser.save();

        await Notification.create({
            user: targetUser._id,
            type: "admin_alert",
            from: req.user._id,
            message: "Your account has been unfrozen by admin",
        }).catch(() => null);

        res.json({
            message: "Account unfrozen successfully",
            user: buildAdminManagedUserSummary(targetUser),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const grantPremiumModelToUser = async (req, res) => {
    try {
        const targetUser = await User.findById(req.params.id);
        if (!targetUser) return res.status(404).json({ message: "User not found" });

        if (!FILM_PROFESSIONAL_ROLE_LIST.includes(targetUser.role)) {
            return res.status(403).json({ message: "Only film industry professionals can be granted the premium model." });
        }

        if (targetUser.isDeactivated) {
            return res.status(400).json({ message: "Cannot grant premium to a deleted account" });
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days as per FILM_INDUSTRY_PRO_MODEL

        targetUser.subscription = {
            plan: "pro",
            aiImagesGeneratedTotal: 0,
            accessTier: "film_industry_professional",
            checkoutMode: "live",
            checkoutProvider: "razorpay",
            accessStatus: "active",
            accessExpiresAt: expiresAt,
            lastAccessUpdate: now,
            isActive: true,
            revealedContacts: [],
            messagedWriters: [],
            contactsLimit: 10,
            messageWritersLimit: 10,
            meetingsLimit: 10,
        };

        targetUser.isPremium = true;

        await targetUser.save();

        // On the user record a granted plan is indistinguishable from a bought one: it writes the
        // same checkoutProvider and checkoutMode. This entry is the only thing that separates them,
        // and it carries the revenue foregone rather than any revenue.
        await recordGrant({
            kind: "plan_subscription",
            user: targetUser._id,
            listPriceMinor: planAmountMinor("film_industry_professional", "INR", "monthly") || 0,
            grantedBy: req.user?._id,
            reason: "admin grant",
            subjectType: "Plan",
            label: "Film Industry Professional (30 days)",
            source: "adminController.grantPremiumModelToUser",
            metadata: { planKey: "film_industry_professional", cycle: "monthly", expiresAt: expiresAt.toISOString() },
        });

        let emailResult = await sendAdminPremiumGrantedEmail(targetUser.email, targetUser.name, {
            adminName: req.user?.name || "Admin",
            clientBaseUrl: resolveClientOriginFromRequest(req),
        });

        if (!emailResult?.success) {
            emailResult = await sendAdminPremiumGrantedEmail(targetUser.email, targetUser.name, {
                adminName: req.user?.name || "Admin",
                clientBaseUrl: resolveClientOriginFromRequest(req),
            });
        }

        res.json({
            message: "Premium model granted successfully",
            user: buildAdminManagedUserSummary(targetUser),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const removePremiumModelFromUser = async (req, res) => {
    try {
        const targetUser = await User.findById(req.params.id);
        if (!targetUser) return res.status(404).json({ message: "User not found" });

        if (targetUser.isDeactivated) {
            return res.status(400).json({ message: "Cannot modify a deleted account" });
        }

        // Revert subscription back to standard defaults for a professional (or basic if needed)
        // Adjust these to standard defaults for film_industry_professional if they lose premium
        // Typically, we might just set plan to "free" or clear it.
        targetUser.subscription = {
            ...targetUser.subscription,
            plan: "free",
            isActive: false,
            accessTier: "none",
            accessStatus: "inactive",
            accessExpiresAt: undefined,
            lastAccessUpdate: new Date()
        };

        targetUser.isPremium = false;

        await targetUser.save();

        let emailResult = await sendAdminPremiumRemovedEmail(targetUser.email, targetUser.name, {
            adminName: req.user?.name || "Admin",
            clientBaseUrl: resolveClientOriginFromRequest(req),
        });

        if (!emailResult?.success) {
            emailResult = await sendAdminPremiumRemovedEmail(targetUser.email, targetUser.name, {
                adminName: req.user?.name || "Admin",
                clientBaseUrl: resolveClientOriginFromRequest(req),
            });
        }

        res.json({
            message: "Premium model removed successfully",
            user: buildAdminManagedUserSummary(targetUser),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const removeWriterPlanFromUser = async (req, res) => {
    try {
        const targetUser = await User.findById(req.params.id);
        if (!targetUser) return res.status(404).json({ message: "User not found" });

        if (targetUser.isDeactivated) {
            return res.status(400).json({ message: "Cannot modify a deleted account" });
        }

        // Revert writer subscription back to standard default "free"
        targetUser.subscription = {
            ...targetUser.subscription,
            plan: "free",
            isActive: false,
            accessTier: "none",
            accessStatus: "inactive",
            accessExpiresAt: undefined,
            lastAccessUpdate: new Date()
        };

        if (targetUser.writerProfile) {
            targetUser.writerProfile.plan = "free";
        }

        await targetUser.save();

        res.json({ message: "Writer plan successfully removed", user: buildAdminManagedUserSummary(targetUser) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const grantWriterPlanToUser = async (req, res) => {
    try {
        const { plan, cycle = "monthly" } = req.body;
        const targetUser = await User.findById(req.params.id);
        if (!targetUser) return res.status(404).json({ message: "User not found" });

        if (targetUser.isDeactivated) {
            return res.status(400).json({ message: "Cannot modify a deleted account" });
        }
        
        if (!["silver", "gold"].includes(plan)) {
            return res.status(400).json({ message: "Invalid plan specified" });
        }

        const durationDays = cycle === "annual" ? 365 : 30;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

        await User.updateOne(
            { _id: targetUser._id },
            {
                $set: {
                    "subscription.plan": plan,
                    "subscription.aiImagesGeneratedTotal": 0,
                    "subscription.isActive": true,
                    "subscription.accessTier": plan === "gold" ? "writer_gold" : "writer_silver",
                    "subscription.accessStatus": "active",
                    "subscription.accessActivatedAt": now,
                    "subscription.accessExpiresAt": expiresAt,
                    "subscription.lastAccessUpdate": now,
                    ...(targetUser.writerProfile ? { "writerProfile.plan": plan } : {})
                }
            }
        );

        await recordGrant({
            kind: "plan_subscription",
            user: targetUser._id,
            // The cycle decides the price, exactly as it does at checkout — an annual grant gives
            // away twelve discounted months, not one.
            listPriceMinor: planAmountMinor(WRITER_PLAN_KEY[plan], "INR", cycle) || 0,
            grantedBy: req.user?._id,
            reason: "admin grant",
            subjectType: "Plan",
            label: `Writer ${plan} (${cycle})`,
            source: "adminController.grantWriterPlanToUser",
            metadata: { planKey: WRITER_PLAN_KEY[plan], cycle, expiresAt: expiresAt.toISOString() },
        });

        // Send email
        await sendWriterPlanGrantedEmail(targetUser.email, {
            writerName: targetUser.name || "Writer",
            planName: plan,
        });

        res.json({ message: `Writer plan ${plan} successfully granted`, user: buildAdminManagedUserSummary(targetUser) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const grantFipPlanToUser = async (req, res) => {
    try {
        const targetUser = await User.findById(req.params.id);
        if (!targetUser) return res.status(404).json({ message: "User not found" });

        if (targetUser.isDeactivated) {
            return res.status(400).json({ message: "Cannot modify a deleted account" });
        }

        const durationDays = 365;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

        await User.updateOne(
            { _id: targetUser._id },
            {
                $set: {
                    "subscription.plan": "diamond",
                    "subscription.aiImagesGeneratedTotal": 0,
                    "subscription.isActive": true,
                    "subscription.accessTier": "film_industry_professional",
                    "subscription.accessStatus": "active",
                    "subscription.accessActivatedAt": now,
                    "subscription.accessExpiresAt": expiresAt,
                    "subscription.lastAccessUpdate": now,
                    "subscription.revealedContacts": [],
                    "subscription.messagedWriters": [],
                    "subscription.scheduledMeetings": [],
                    "subscription.contactsLimit": 10,
                    "subscription.messageWritersLimit": 10,
                    "subscription.meetingsLimit": 10,
                    ...(targetUser.industryProfile ? { "industryProfile.isVerified": true } : {})
                }
            }
        );

        await recordGrant({
            kind: "plan_subscription",
            user: targetUser._id,
            listPriceMinor: planAmountMinor("film_industry_professional", "INR", "annual") || 0,
            grantedBy: req.user?._id,
            reason: "admin grant",
            subjectType: "Plan",
            label: "Film Industry Professional Diamond (1 year)",
            source: "adminController.grantFipPlanToUser",
            metadata: { planKey: "film_industry_professional", cycle: "annual", expiresAt: expiresAt.toISOString() },
        });

        await Notification.create({
            user: targetUser._id,
            type: "admin_alert",
            message: "You have been granted a 1-year Diamond Film Industry Professional subscription by an administrator. Enjoy full access to Ckript!",
        });

        await sendFipPlanGrantedEmail(targetUser.email, {
            userName: targetUser.name || "Professional",
        });

        res.json({ message: "1-Year FIP plan successfully granted", user: buildAdminManagedUserSummary(targetUser) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const sendAudienceBroadcast = async (req, res) => {
    try {
        const audience = req.params.audience;
        let audienceConfig = null;

        if (audience === "direct-user") {
            const targetEmail = String(req.body?.targetEmail || "").trim();
            if (!targetEmail) return res.status(400).json({ message: "Target email is required for direct-user broadcast." });
            
            const emailList = targetEmail.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
            if (emailList.length === 0) return res.status(400).json({ message: "Valid target email is required." });
            
            audienceConfig = {
                key: "direct-user",
                audienceLabel: emailList.length === 1 ? `specific user (${emailList[0]})` : `specific users (${emailList.length})`,
                getRecipients: async () => {
                    const users = await User.find({ email: { $in: emailList } })
                        .select("_id name email notificationPrefs.emailPreferences")
                        .lean();
                    const foundEmails = new Set(users.map(u => u.email));
                    
                    const missingEmails = emailList.filter(e => !foundEmails.has(e));
                    const missingRecipients = missingEmails.map(e => ({ name: "User", email: e }));
                    
                    return [...users, ...missingRecipients];
                }
            };
        } else {
            audienceConfig = buildBroadcastAudienceConfig(audience);
        }

        if (!audienceConfig) {
            return res.status(400).json({ message: "Invalid audience. Use 'writers', 'film-professionals', or 'script-uploaders'." });
        }

        const title = String(req.body?.title || "").trim();
        const content = String(req.body?.content || "").trim();
        const actionUrl = String(req.body?.actionUrl || "").trim();
        const attachments = req.files ? req.files.map((file) => ({
            filename: file.originalname,
            content: file.buffer,
            contentType: file.mimetype,
        })) : [];

        if (!title) {
            return res.status(400).json({ message: "Title is required" });
        }
        if (!content) {
            return res.status(400).json({ message: "Content is required" });
        }

        const recipients = audienceConfig.getRecipients
            ? await audienceConfig.getRecipients()
            : await User.find(audienceConfig.filter)
                // notificationPrefs is not decoration here: without it filterSubscribed reads
                // undefined for every recipient, treats them all as subscribed, and silently does
                // nothing. A filter that cannot see the field it filters on is worse than none.
                .select("_id name email notificationPrefs.emailPreferences")
                .lean();

        if (recipients.length === 0) {
            return res.status(404).json({ message: `No active ${audienceConfig.key} found` });
        }

        // Removed in-app notification creation for admin emails as requested

        /*
         * Anyone who unsubscribed is dropped HERE, at the send, not at the audience query.
         *
         * Every audience builds its own filter, and adding a preference clause to each one would
         * mean the next audience someone writes silently mails people who opted out. One choke point
         * before the sender is the only shape where that cannot happen.
         *
         * `!== false` rather than `=== true`: the field defaults to true and predates this feature,
         * so millions of existing users have no value stored at all. Requiring an explicit true would
         * read every one of them as unsubscribed and silence the platform.
         */
        /*
         * direct-user is EXEMPT, deliberately.
         *
         * An admin addressing one named person is answering them, not marketing at them — and
         * silently dropping that mail would break support for anyone who ever unsubscribed. They are
         * still told below, so a deliberate reply stays possible and an accidental one is visible.
         *
         * Every other audience is bulk, and bulk is exactly what someone unsubscribing meant.
         */
        const isDirect = audience === "direct-user";
        const subscribed = isDirect ? recipients : filterSubscribed(recipients, "marketing");
        const suppressed = recipients.length - subscribed.length;
        const optedOutDirect = isDirect
            ? recipients.length - filterSubscribed(recipients, "marketing").length
            : 0;

        const emailRecipients = subscribed.filter((recipient) => String(recipient?.email || "").trim());
        
        // Start email sending in the background to prevent lagging
        Promise.allSettled(
            emailRecipients.map((recipient) =>
                sendAdminBroadcastEmail(recipient.email, recipient.name, {
                    // Per recipient, because the token identifies THEM. One shared link would let
                    // whoever clicked it unsubscribe somebody else.
                    // From the API's OWN origin, not the client's. /api/unsubscribe is a route on this
                    // server; in production the SPA lives elsewhere, and a link built from its origin
                    // lands on the front-end router and renders nothing.
                    unsubscribeUrl: buildUnsubscribeUrl(resolveUnsubscribeBaseUrl(req), recipient._id, "marketing"),
                    title,
                    content,
                    actionUrl,
                    audienceLabel: audienceConfig.audienceLabel,
                    adminName: req.user?.name || "ckript Admin",
                    clientBaseUrl: resolveClientOriginFromRequest(req),
                    attachments,
                })
            )
        ).then((emailResults) => {
            const emailSent = emailResults.filter((result) => result.status === "fulfilled" && result.value?.success).length;
            const emailFailed = emailResults.length - emailSent;
            console.log(`[admin] Broadcast to ${audienceConfig.key} finished: ${emailSent} sent, ${emailFailed} failed.`);
        }).catch((err) => {
            console.error("[admin] Background broadcast failed:", err);
        });

        return res.json({
            // Counts the people actually being mailed, not the audience size. Saying "started for
            // 4,000" when 300 unsubscribed would make the send look broken when it was working
            // exactly as intended.
            message: `Broadcast started for ${emailRecipients.length} ${audienceConfig.key}.`
                + (suppressed ? ` ${suppressed} unsubscribed and were skipped.` : "")
                + (optedOutDirect ? ` Note: ${optedOutDirect} of these recipients unsubscribed from announcements — sent anyway because this is a direct message.` : ""),
            audience: audienceConfig.key,
            notified: emailRecipients.length,
            // Surfaced rather than buried: an admin watching their audience shrink over time is
            // seeing something real, and it should not take a database query to notice.
            unsubscribed: suppressed,
            emailAttempted: emailRecipients.length,
            emailSent: "pending",
            emailFailed: "pending",
        });
    } catch (error) {
        // This was `require('fs').writeFileSync('last_broadcast_error.txt', ...)`. In an ESM module
        // `require` is not defined, so the line threw a ReferenceError from inside the catch — losing
        // the broadcast's real error and replacing it with a confusing one. It also wrote debug state
        // into the server's working directory on every failure.
        console.error("[admin] broadcast failed:", error?.stack || error?.message || error);
        return res.status(500).json({ message: error.message || "Failed to send broadcast" });
    }
};

export const deleteUserAccountAsAdmin = async (req, res) => {
    try {
        const reason = String(req.body?.reason || "").trim();
        const targetUser = await User.findById(req.params.id);
        if (!targetUser) return res.status(404).json({ message: "User not found" });

        if (targetUser.role === "admin") {
            return res.status(403).json({ message: "Admin accounts cannot be deleted" });
        }

        if (String(targetUser._id) === String(req.user._id)) {
            return res.status(400).json({ message: "You cannot delete your own admin account from this panel" });
        }

        if (targetUser.isDeactivated) {
            return res.json({
                message: "Account already deleted",
                user: buildAdminManagedUserSummary(targetUser),
            });
        }

        const now = new Date();
        const originalName = String(targetUser.name || "").trim();
        const originalEmail = String(targetUser.email || "").trim();
        const archivedProfile = buildArchivedUserProfileSnapshot(targetUser);

        archivedProfile.isDeactivated = true;
        archivedProfile.deactivatedAt = now;
        archivedProfile.deactivatedBy = req.user._id;
        archivedProfile.isFrozen = true;
        archivedProfile.frozenAt = now;
        archivedProfile.frozenReason = "Account deleted by admin";
        archivedProfile.frozenBy = req.user._id;
        archivedProfile.accountDeletion = {
            reason: reason || "Account deleted by admin",
            requestedAt: now,
            source: "admin",
            originalName,
            originalEmail,
            archivedAt: now,
            archivedBy: req.user._id,
        };

        targetUser.accountDeletion = {
            reason: reason || "Account deleted by admin",
            requestedAt: now,
            source: "admin",
            originalName,
            originalEmail,
            archivedAt: now,
            archivedBy: req.user._id,
            archivedProfile,
        };
        targetUser.isDeactivated = true;
        targetUser.deactivatedAt = now;
        targetUser.deactivatedBy = req.user._id;
        targetUser.isFrozen = true;
        targetUser.frozenAt = now;
        targetUser.frozenReason = "Account deleted by admin";
        targetUser.frozenBy = req.user._id;
        targetUser.isPrivate = true;
        targetUser.name = "Deleted User";
        targetUser.phone = "";
        targetUser.address = undefined;
        targetUser.bio = "";
        targetUser.skills = [];
        targetUser.profileImage = "";
        targetUser.coverImage = "";
        targetUser.followers = [];
        targetUser.following = [];
        targetUser.blockedUsers = [];
        targetUser.favoriteScripts = [];
        targetUser.pendingEmail = undefined;
        targetUser.emailVerified = false;
        targetUser.email = `deleted_${targetUser._id}@deleted.local`;

        await targetUser.save();

        await Promise.all([
            User.updateMany(
                { _id: { $ne: targetUser._id } },
                {
                    $pull: {
                        followers: targetUser._id,
                        following: targetUser._id,
                        blockedUsers: targetUser._id,
                    },
                }
            ),
            Script.updateMany(
                { creator: targetUser._id, isDeleted: { $ne: true } },
                {
                    $set: {
                        isDeleted: true,
                        deletedAt: now,
                    },
                }
            ),
        ]);

        res.json({
            message: "User account deleted successfully",
            user: buildAdminManagedUserSummary(targetUser),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── All Scripts ───
export const getScripts = async (req, res) => {
    try {
        const { search, status, page = 1, limit = 20 } = req.query;
        const normalizedStatus = String(status || "").trim();
        const filter = {};

        if (normalizedStatus.toLowerCase() === "deleted") {
            filter.isDeleted = DELETED_SCRIPT_FILTER;
        } else {
            filter.isDeleted = NON_DELETED_SCRIPT_FILTER;
            filter.status = normalizedStatus || { $in: VISIBLE_ADMIN_SCRIPT_STATUSES };
        }

        if (search) {
            filter.$or = [
                { sid: { $regex: search, $options: "i" } },
                { title: { $regex: search, $options: "i" } },
                { genre: { $regex: search, $options: "i" } },
            ];
        }
        const total = await Script.countDocuments(filter);
        const scripts = await Script.find(filter)
            .populate("creator", "name email role profileImage")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));
        const normalizedScripts = scripts.map((script) => {
            const scriptObject = typeof script?.toObject === "function" ? script.toObject() : script;
            return scriptObject?.status === "approved"
                ? { ...scriptObject, status: "published" }
                : scriptObject;
        });

        await Promise.all(
            scripts
                .filter((script) => !script.sid)
                .map(async (script) => {
                    script.markModified("sid");
                    await script.save();
                })
        );
        res.json({ scripts: normalizedScripts, total, page: Number(page), totalPages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── Scripts Using AI ───
export const getAIUsageScripts = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const filter = {
            $or: [
                { "services.evaluation": true },
                { "services.aiTrailer": true },
                { "scriptScore.overall": { $exists: true, $ne: null } },
            ],
        };
        const total = await Script.countDocuments(filter);
        const scripts = await Script.find(filter)
            .populate("creator", "name email role profileImage")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));
        res.json({ scripts, total, page: Number(page), totalPages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── Evaluation Purchases ───
export const getEvaluationPurchases = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const filter = {
            "services.evaluation": true,
            isDeleted: { $nin: [true, "true", 1] },
            status: { $ne: "rejected" },
        };
        const total = await Script.countDocuments(filter);
        const scripts = await Script.find(filter)
            .populate("creator", "name email role profileImage")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));
        res.json({ scripts, total, page: Number(page), totalPages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── Investor Purchases ───
export const getInvestorPurchases = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const scripts = await Script.find({ unlockedBy: { $exists: true, $not: { $size: 0 } } })
            .populate("creator", "name email role profileImage")
            .populate("unlockedBy", "name email role profileImage")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));
        const total = await Script.countDocuments({ unlockedBy: { $exists: true, $not: { $size: 0 } } });
        res.json({ scripts, total, page: Number(page), totalPages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── Payments Data ───
export const getPayments = async (req, res) => {
    try {
        const { type: rawType, status: rawStatus, page = 1, limit = 20 } = req.query;

        // A filter that arrives as an object or an array is never a transaction type or status. Refusing it
        // is what keeps a malformed filter from being answered with the unfiltered list.
        const isMalformedFilter = (value) => value !== undefined && typeof value !== "string";
        if (isMalformedFilter(rawType) || isMalformedFilter(rawStatus)) {
            return res.status(400).json({ message: "Invalid transaction filter" });
        }

        const type = asTrimmedString(rawType, 40);
        const status = asTrimmedString(rawStatus, 40);
        const filter = {};
        if (type) filter.type = type;
        if (status) filter.status = status;
        const total = await Transaction.countDocuments(filter);
        const transactions = await Transaction.find(filter)
            .populate("user", "name email role profileImage")
            .populate("relatedScript", "title")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));
        res.json({ transactions, total, page: Number(page), totalPages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── Invoices ───
export const getInvoices = async (req, res) => {
    try {
        const { page = 1, limit = 20, search = "" } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const pipeline = [
            {
                $lookup: {
                    from: "users",
                    localField: "creator",
                    foreignField: "_id",
                    as: "creator",
                },
            },
            { $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "scripts",
                    localField: "script",
                    foreignField: "_id",
                    as: "script",
                },
            },
            { $unwind: { path: "$script", preserveNullAndEmptyArrays: true } },
        ];

        if (search) {
            pipeline.push({
                $match: {
                    $or: [
                        { invoiceNumber: { $regex: search, $options: "i" } },
                        { "creator.name": { $regex: search, $options: "i" } },
                        { "script.title": { $regex: search, $options: "i" } },
                    ],
                },
            });
        }

        pipeline.push(
            { $sort: { createdAt: -1 } },
            {
                $facet: {
                    rows: [
                        { $skip: skip },
                        { $limit: Number(limit) },
                        {
                            $project: {
                                invoiceNumber: 1,
                                invoiceDate: 1,
                                accessType: 1,
                                scriptPrice: 1,
                                platformFeeRate: 1,
                                writerEarnsPerSale: 1,
                                services: 1,
                                totalCreditsRequired: 1,
                                creatorSid: 1,
                                scriptSid: 1,
                                rows: 1,
                                pdfPath: 1,
                                createdAt: 1,
                                creator: {
                                    _id: "$creator._id",
                                    sid: "$creator.sid",
                                    name: "$creator.name",
                                    email: "$creator.email",
                                    role: "$creator.role",
                                },
                                script: {
                                    _id: "$script._id",
                                    sid: "$script.sid",
                                    title: "$script.title",
                                },
                            },
                        },
                    ],
                    meta: [{ $count: "total" }],
                },
            }
        );

        const [result] = await Invoice.aggregate(pipeline);
        const invoices = result?.rows || [];
        const total = result?.meta?.[0]?.total || 0;

        res.json({ invoices, total, page: Number(page), totalPages: Math.max(1, Math.ceil(total / Number(limit))) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── Score Lists ───
export const getAIScores = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const filter = { "scriptScore.overall": { $exists: true, $ne: null } };
        const total = await Script.countDocuments(filter);
        const scripts = await Script.find(filter)
            .populate("creator", "name email role profileImage")
            .sort({ "scriptScore.overall": -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));
        res.json({ scripts, total, page: Number(page), totalPages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getPlatformScores = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const filter = { "platformScore.overall": { $exists: true, $ne: null } };
        const total = await Script.countDocuments(filter);
        const scripts = await Script.find(filter)
            .populate("creator", "name email role profileImage")
            .populate("platformScore.scoredBy", "name")
            .sort({ "platformScore.overall": -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));
        res.json({ scripts, total, page: Number(page), totalPages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getReaderScores = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const filter = { rating: { $gt: 0 }, reviewCount: { $gt: 0 } };
        const total = await Script.countDocuments(filter);
        const scripts = await Script.find(filter)
            .populate("creator", "name email role profileImage")
            .sort({ rating: -1, reviewCount: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));
        res.json({ scripts, total, page: Number(page), totalPages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── Script Approval ───
export const getPendingScripts = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const filter = getPendingApprovalScriptFilter();
        const total = await Script.countDocuments(filter);
        const scripts = await Script.find(filter)
            .populate("creator", "name email role profileImage")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .lean();

        const normalizedScripts = scripts.map((script) => {
            const inferredApprovalRequestType = script.approvalRequestType
                || (script.publishedAt ? "edit_submission" : "new_submission");

            return {
                ...script,
                approvalRequestType: inferredApprovalRequestType,
            };
        });
        res.json({ scripts: normalizedScripts, total, page: Number(page), totalPages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const approveScript = async (req, res) => {
    try {
        const script = await Script.findById(req.params.id);
        if (!script) return res.status(404).json({ message: "Script not found" });

        const spotlightChargedAtUpload = Number(script.billing?.spotlightCreditsChargedAtUpload || 0);
        const shouldAutoActivateSpotlight = Boolean(
            !script.promotion?.spotlightActive &&
            (
                (script.services?.spotlight && script.promotion?.pendingSpotlightActivation) ||
                spotlightChargedAtUpload > 0
            )
        );

        script.status = "published";
        script.adminApproved = true;
        if (!script.publishedAt) {
            script.publishedAt = new Date();
        }
        script.rejectionReason = undefined;

        // Auto-feature scripts for Gold Model users
        if (!script.isFeatured) {
            const creatorUser = await User.findById(script.creator).select("subscription");
            if (creatorUser?.subscription?.plan === "gold") {
                script.isFeatured = true;
            }
        }

        if (shouldAutoActivateSpotlight) {
            const now = new Date();
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
            const previousSpent = Number(script.promotion?.totalSpotlightCreditsSpent || 0);
            const spentAtUpload = spotlightChargedAtUpload;
            script.promotion = {
                spotlightActive: true,
                pendingSpotlightActivation: false,
                spotlightStartAt: now,
                spotlightEndAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
                lastSpotlightPurchaseAt: now,
                totalSpotlightCreditsSpent: previousSpent || spentAtUpload,
            };
            script.billing = {
                ...(script.billing || {}),
                spotlightCreditsSpent: Math.max(Number(script.billing?.spotlightCreditsSpent || 0), spentAtUpload || 310),
                lastSpotlightActivatedAt: now,
            };
            script.markModified("services");
            script.markModified("promotion");
            script.markModified("billing");
        }

        await script.save();

        // Notify the writer
        await Notification.create({
            user: script.creator,
            type: "script_approved",
            script: script._id,
            message: shouldAutoActivateSpotlight
                ? `Your project "${script.title}" has been approved and is now live. Spotlight purchased at upload is now active for 1 month.`
                : `Your project "${script.title}" has been approved and is now live on the platform.`,
        });

        res.json({ message: "Script approved and published", script });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const rejectScript = async (req, res) => {
    try {
        const { reason } = req.body;
        const script = await Script.findById(req.params.id);
        if (!script) return res.status(404).json({ message: "Script not found" });
        script.status = "rejected";
        script.adminApproved = false;
        if (reason) script.rejectionReason = reason;
        await script.save();

        // Notify the writer
        await Notification.create({
            user: script.creator,
            type: "script_rejected",
            script: script._id,
            message: `Your project "${script.title}" was not approved.${ reason ? ` Reason: ${reason}` : " Please review and resubmit." }`,
        });

        res.json({ message: "Script rejected", script, reason });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * PUT /admin/scripts/:id/restore — undo a writer's delete.
 *
 * Deleting a project is a SOFT delete (scriptController.deleteScript sets isDeleted + deletedAt and
 * leaves everything else alone), so the document, its content and any competition entry pointing at
 * it are all still there. Until now nothing could put it back: there was no restore path anywhere in
 * the product, so a writer who deleted a project by mistake had lost it for good.
 *
 * What the writer sees meanwhile is worth knowing, because it is why this arrives as a support
 * ticket about ACCESS rather than about a deletion: the editor's loader treats 403 and 404 alike and
 * says "Access Removed — the project owner has removed your collaboration permissions", which for
 * someone who deleted their own project is simply untrue.
 *
 * Restores exactly the two fields the delete set. Everything else it touched is deliberately left as
 * it is — deleting RELEASED any purchase-request lock, and re-applying a stale lock would be a
 * second bug on top of the first.
 */
export const restoreScript = async (req, res) => {
    try {
        const script = await Script.findById(req.params.id);
        if (!script) return res.status(404).json({ message: "Script not found" });

        // Not an error worth failing loudly on — two admins clicking the same row is a race with an
        // obviously correct answer, and the script is in the state the caller wanted either way.
        if (!script.isDeleted) {
            return res.json({ message: "This project is not deleted.", script, alreadyRestored: true });
        }

        script.isDeleted = false;
        script.deletedAt = null;
        await script.save();

        // Mirrors the "[AUDIT] Script soft deleted" line, so a restore is as traceable as the delete.
        console.info("[AUDIT] Script restored", {
            scriptId: script._id.toString(),
            scriptSid: script.sid || "",
            title: script.title || "",
            writerId: script.creator?.toString?.() || "",
            restoredBy: req.user?._id?.toString?.() || "",
            at: new Date().toISOString(),
        });

        // The writer is told, because from their side the project simply reappears and they would
        // otherwise have no idea it was deliberate. Best-effort: a failed notification must not undo
        // a successful restore.
        await Notification.create({
            user: script.creator,
            type: "script_approved",
            script: script._id,
            message: `Your project "${script.title}" has been restored and is back in your dashboard.`,
        }).catch(() => null);

        res.json({ message: "Project restored", script });
    } catch (error) {
        console.error("[admin] restoreScript failed:", error?.message || error);
        res.status(500).json({ message: "Failed to restore the project." });
    }
};

// ─── Admin Edit (at approval time or after) ───
const ADMIN_EDITABLE_TOP_LEVEL_FIELDS = [
    "title",
    "companyName",
    "logline",
    "description",
    "synopsis",
    "textContent",
    "fullContent",
    "genre",
    "contentType",
    "format",
    "formatOther",
    "styleMedium",
    "primaryGenre",
    "subGenres",
    "classification",
    "contentIndicators",
    "tagIds",
    "scriptCompletion",
    "scriptPreviewAccess",
    "price",
];

export const editScriptAsAdmin = async (req, res) => {
    try {
        const script = await Script.findById(req.params.id);
        if (!script) return res.status(404).json({ message: "Script not found" });

        const prevTextContent = String(script.textContent || "");

        for (const field of ADMIN_EDITABLE_TOP_LEVEL_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                script[field] = req.body[field];
                script.markModified(field);
            }
        }

        if (req.body.legal && typeof req.body.legal === "object") {
            script.legal = { ...(script.legal?.toObject?.() || script.legal || {}), ...req.body.legal };
            if (Object.prototype.hasOwnProperty.call(req.body.legal, "customInvestorTerms")) {
                script.legal.customInvestorTermsUpdatedAt = new Date();
            }
            script.markModified("legal");
        }

        if (req.body.rightsLicensing && typeof req.body.rightsLicensing === "object") {
            const incoming = req.body.rightsLicensing;
            const current = script.rightsLicensing?.toObject?.() || script.rightsLicensing || {};
            const merged = { ...current, ...incoming };
            if (incoming.royaltySettings && typeof incoming.royaltySettings === "object") {
                merged.royaltySettings = { ...(current.royaltySettings || {}), ...incoming.royaltySettings };
            }
            if (incoming.timeBound && typeof incoming.timeBound === "object") {
                merged.timeBound = { ...(current.timeBound || {}), ...incoming.timeBound };
            }
            if (incoming.legalAcknowledgement && typeof incoming.legalAcknowledgement === "object") {
                merged.legalAcknowledgement = { ...(current.legalAcknowledgement || {}), ...incoming.legalAcknowledgement };
            }
            merged.lastUpdatedAt = new Date();
            script.rightsLicensing = merged;
            script.markModified("rightsLicensing");
        }

        const newTextContent = String(script.textContent || "");
        if (newTextContent !== prevTextContent) {
            script.history = script.history || [];
            script.history.push({
                content: newTextContent,
                savedAt: new Date(),
                savedBy: req.user._id,
                prId: null,
            });
            script.markModified("history");
        }

        await script.save();
        res.json({ message: "Script updated by admin", script });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── Platform Scoring ───
export const scoreScript = async (req, res) => {
    try {
        const { content, trailer, title, synopsis, tags, feedback, strengths, weaknesses, prospects } = req.body;
        const script = await Script.findById(req.params.id);
        if (!script) return res.status(404).json({ message: "Script not found" });

        const scores = [content, trailer, title, synopsis, tags].filter((s) => s != null);
        const overall = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

        script.platformScore = {
            overall,
            content: content || 0,
            trailer: trailer || 0,
            title: title || 0,
            synopsis: synopsis || 0,
            tags: tags || 0,
            feedback: feedback || "",
            strengths: strengths || "",
            weaknesses: weaknesses || "",
            prospects: prospects || "",
            scoredBy: req.user._id,
            scoredAt: new Date(),
        };
        await script.save();
        res.json({ message: "Platform score saved", script });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── AI Trailer Requests ───
export const getTrailerRequests = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        // These were used below but never derived, so this handler threw a ReferenceError and 500'd
        // on every call — the AI Trailer Approvals list could not load at all. Same coercion the
        // other paginated admin handlers use, so the bounds behave identically.
        const pageNumber = Math.max(Number(page) || 1, 1);
        const pageLimit = Number(limit) === 0 ? 0 : Math.min(Math.max(Number(limit) || 20, 1), 100);
        const filter = getAdminTrailerRequestFilter();
        const total = await Script.countDocuments(filter);
        const scripts = await Script.find(filter)
            .populate("creator", "name email role profileImage")
            .sort({ createdAt: -1 })
            .skip((pageNumber - 1) * pageLimit)
            .limit(pageLimit);
        res.json({ scripts, total, page: pageNumber, totalPages: pageLimit === 0 ? 1 : Math.ceil(total / pageLimit) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getAvailableTrailers = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const pageNumber = Math.max(Number(page) || 1, 1);
        const pageLimit = Number(limit) === 0 ? 0 : Math.min(Math.max(Number(limit) || 20, 1), 100);
        const filter = getAdminTrailerLibraryFilter();

        const total = await Script.countDocuments(filter);
        const scripts = await Script.find(filter)
            .populate("creator", "name email role profileImage")
            .sort({ updatedAt: -1, createdAt: -1 })
            .skip((pageNumber - 1) * pageLimit)
            .limit(pageLimit);

        res.json({ scripts, total, page: pageNumber, totalPages: pageLimit === 0 ? 1 : Math.ceil(total / pageLimit) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const approveTrailer = async (req, res) => {
    try {
        const { trailerUrl, trailerThumbnail, caption } = req.body || {};

        if (!trailerUrl) {
            return res.status(400).json({ message: "trailerUrl is required" });
        }

        const script = await Script.findById(req.params.id).populate("creator", "_id");
        if (!script) return res.status(404).json({ message: "Script not found" });

        script.trailerUrl = trailerUrl;
        if (trailerThumbnail) script.trailerThumbnail = trailerThumbnail;
        script.trailerSource = "ai";
        script.trailerStatus = "ready";
        script.trailerWriterFeedback = {
            status: "pending",
            note: "",
            updatedAt: new Date(),
        };
        await script.save();

        const writerId = script.creator?._id || script.creator;

        await Notification.create({
            user: writerId,
            type: "trailer_ready",
            from: req.user._id,
            script: script._id,
            message: `Your AI trailer for "${script.title}" is ready. Check messages to view it.`,
        });

        await Message.create({
            chatId: buildChatId(req.user._id, writerId),
            sender: req.user._id,
            receiver: writerId,
            script: script._id,
            text: caption?.trim() || `Your AI trailer for "${script.title}" is ready.`,
            fileUrl: trailerUrl,
            fileType: "video",
            fileName: `${script.title} - AI Trailer`,
        });

        res.json({ message: "Trailer approved and sent to writer via message", script });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const uploadTrailerAsAdmin = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No trailer file provided" });
        }

        const script = await Script.findById(req.params.id).populate("creator", "_id name");
        if (!script) return res.status(404).json({ message: "Script not found" });

        const uploadResult = await uploadToCloudinary(req.file.buffer, {
            folder: "scriptbridge/trailers",
            resource_type: "video",
            public_id: `admin-trailer-${script._id}-${Date.now()}`,
            chunked: true,
        });

        const trailerUrl = uploadResult?.secure_url;
        if (!trailerUrl) {
            return res.status(500).json({ message: "Trailer upload failed" });
        }

        script.uploadedTrailerUrl = trailerUrl;
        script.trailerSource = "uploaded";
        script.trailerStatus = "ready";
        script.trailerWriterFeedback = {
            status: "approved",
            note: "Trailer uploaded by admin",
            updatedAt: new Date(),
        };
        await script.save();

        const writerId = script.creator?._id || script.creator;
        if (writerId) {
            await Notification.create({
                user: writerId,
                type: "trailer_ready",
                from: req.user._id,
                script: script._id,
                message: `Admin uploaded a trailer for "${script.title}". It is now visible on your script page.`,
            });

            await Message.create({
                chatId: buildChatId(req.user._id, writerId),
                sender: req.user._id,
                receiver: writerId,
                script: script._id,
                text: `Admin uploaded a trailer for "${script.title}" and made it visible to all viewers.`,
                fileUrl: trailerUrl,
                fileType: "video",
                fileName: `${script.title} - Trailer`,
            });
        }

        return res.json({
            message: "Trailer uploaded and published successfully",
            trailerUrl,
            script,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// ─── Login As User (Impersonation) ───
export const loginAsUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select("-password -activeSessions -passwordResetToken -passwordResetExpires -passwordResetResendAvailableAt -stripeAccountId -stripeCustomerId -googleId");
        if (!user) return res.status(404).json({ message: "User not found" });
        if (user.isDeactivated) {
            return res.status(400).json({ message: "Cannot login as a deleted account" });
        }
        if (user.isFrozen) {
            return res.status(400).json({ message: user.frozenReason || "Cannot login as a frozen account" });
        }

        const expiresIn = "2h";
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn });
        const decoded = jwt.decode(token);

        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token,
            expiresAt: decoded.exp * 1000,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const removeTrailerAsAdmin = async (req, res) => {
    try {
        const script = await Script.findById(req.params.id).populate("creator", "_id name");
        if (!script) return res.status(404).json({ message: "Script not found" });

        const hadTrailer = Boolean(String(script.trailerUrl || "").trim() || String(script.uploadedTrailerUrl || "").trim());

        script.trailerUrl = undefined;
        script.uploadedTrailerUrl = undefined;
        script.trailerThumbnail = undefined;
        script.trailerSource = "none";
        script.trailerStatus = "none";
        await script.save();

        if (script.creator?._id) {
            await Notification.create({
                user: script.creator._id,
                type: "trailer_ready",
                from: req.user._id,
                script: script._id,
                message: `The trailer for "${script.title}" was removed by admin.`,
            });
        }

        res.json({
            message: hadTrailer ? "Trailer removed successfully" : "Trailer was already empty",
            script,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── Get Single Script Detail (for admin review) ───
export const getScriptDetail = async (req, res) => {
    try {
        const script = await Script.findById(req.params.id)
            .populate("creator", "name email role profileImage bio")
            .populate("unlockedBy", "name email role")
            .populate("platformScore.scoredBy", "name");
        if (!script) return res.status(404).json({ message: "Script not found" });

        const hasPreviewPageTexts = Array.isArray(script.scriptPreviewPageTexts) && script.scriptPreviewPageTexts.some(Boolean);
        const needsPdfExtraction = String(script.fileUrl || "").trim() &&
            (!String(script.textContent || "").trim() || !hasPreviewPageTexts);
        if (needsPdfExtraction) {
            try {
                const extraction = await extractTextFromPdfUrl(script.fileUrl);
                let changed = false;
                if (!String(script.textContent || "").trim() && String(extraction?.text || "").trim()) {
                    script.textContent = extraction.text;
                    if (!Number(script.pageCount) && Number(extraction?.numItems) > 0) {
                        script.pageCount = Number(extraction.numItems);
                    }
                    changed = true;
                }
                if (!hasPreviewPageTexts && Array.isArray(extraction?.pageTexts) && extraction.pageTexts.length > 0) {
                    script.scriptPreviewPageTexts = extraction.pageTexts;
                    changed = true;
                }
                if (changed) {
                    await script.save();
                }
            } catch (error) {
                console.warn("[admin.getScriptDetail] Failed to hydrate script text from PDF:", error?.message || error);
            }
        }

        const [settledPurchaseRequests, agreements] = await Promise.all([
            ScriptPurchaseRequest.find({
                script: script._id,
                status: "approved",
                paymentStatus: "released",
            })
                .populate("investor", "name email role sid")
                .populate("writer", "name email role sid")
                .sort({ settledAt: -1, updatedAt: -1, createdAt: -1 })
                .lean(),
            Agreement.find({ script_id: script._id })
                .select("buyer_id writer_pdf_url buyer_pdf_url status createdAt")
                .sort({ createdAt: -1 })
                .lean(),
        ]);

        const agreementByBuyerId = new Map();
        agreements.forEach((agreement) => {
            const buyerId = agreement?.buyer_id?.toString?.();
            if (buyerId && !agreementByBuyerId.has(buyerId)) {
                agreementByBuyerId.set(buyerId, agreement);
            }
        });

        const response = script.toObject();
        const hasViewablePreview = hasViewableScriptPreview(script);
        // Always normalize preview access so admin always has start/end even when viewableScript:false
        const normalizedPreviewAccess = normalizeScriptPreviewAccess(script.scriptPreviewAccess || {}, {
            mode: script.scriptPreviewAccess?.mode || "pages",
            start: script.scriptPreviewAccess?.start || 1,
            end: script.scriptPreviewAccess?.end || 8,
            maxUnits: Array.isArray(script.scriptPreviewPageTexts) ? script.scriptPreviewPageTexts.length : 0,
        });
        const previewSummary = getScriptPreviewLabel(normalizedPreviewAccess);
        const previewExcerpt = getScriptPreviewExcerpt(script, normalizedPreviewAccess);
        const allPreviewPageTexts = getScriptPreviewPageTexts(script);
        response.settledPurchaseRequests = settledPurchaseRequests.map((request) => {
            const buyerId = request?.investor?._id?.toString?.() || request?.investor?.toString?.() || "";
            const agreement = agreementByBuyerId.get(buyerId) || null;
            return {
                ...request,
                agreement: agreement
                    ? {
                        _id: agreement._id,
                        status: agreement.status,
                        writerPdfUrl: agreement.writer_pdf_url || "",
                        buyerPdfUrl: agreement.buyer_pdf_url || "",
                }
                    : null,
            };
        });
        response.viewableScript = hasViewablePreview;
        response.scriptPreviewAccess = normalizedPreviewAccess;
        response.scriptPreviewSummary = previewSummary;
        response.previewExcerpt = previewExcerpt;
        // Always return page texts so admin preview works regardless of viewableScript flag
        response.scriptPreviewPageTexts = allPreviewPageTexts;
        response.scriptPreviewStartText = getScriptPreviewPageTextByNumber(script, normalizedPreviewAccess.start);
        response.scriptPreviewEndText = getScriptPreviewPageTextByNumber(script, normalizedPreviewAccess.end);

        res.json(response);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const deleteScriptAsAdmin = async (req, res) => {
    try {
        const script = await Script.findById(req.params.id);
        if (!script) return res.status(404).json({ message: "Script not found" });

        if (script.isDeleted) {
            return res.json({ message: "Project already deleted", softDeleted: true, isDeleted: true });
        }

        const purchasedUserIds = await getPurchasedUserIdSetForAdminDelete(script);
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

        console.info("[AUDIT] Script soft deleted by admin", {
            scriptId: script._id.toString(),
            scriptSid: script.sid || "",
            deletedByAdmin: req.user?._id?.toString?.() || "",
            purchasedUserCount: purchasedUserIds.size,
            deletedAt: script.deletedAt.toISOString(),
        });

        await Notification.create({
            user: script.creator,
            type: "admin_alert",
            from: req.user?._id,
            script: script._id,
            message: purchasedUserIds.size > 0
                ? `Your project "${script.title}" was removed by admin from platform listings. Existing buyers retain access.`
                : `Your project "${script.title}" was removed by admin from platform listings.`,
        }).catch(() => null);

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

// ─── Investor Approval ───
export const getPendingInvestors = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const filter = { role: "investor", approvalStatus: "pending" };
        const total = await User.countDocuments(filter);
        const investors = await User.find(filter)
            .select("-password")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));
        res.json({ investors, total, page: Number(page), totalPages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getPendingWriterMembershipReviews = async (req, res) => {
    try {
        const { page = 1, limit = 20, search = "" } = req.query;
        const pageNumber = Math.max(Number(page) || 1, 1);
        const pageLimit = Number(limit) === 0 ? 0 : Math.min(Math.max(Number(limit) || 20, 1), 100);

        const pendingMembershipFilter = {
            $or: [
                { "writerProfile.membershipVerification.wga.status": "pending" },
                { "writerProfile.membershipVerification.swa.status": "pending" },
            ],
        };

        const filter = {
            role: { $in: Array.from(WRITER_ROLE_SET) },
            ...pendingMembershipFilter,
        };

        const searchFilter = buildAdminUserSearchQuery(search);
        if (searchFilter) {
            delete filter.$or;
            filter.$and = [pendingMembershipFilter, searchFilter];
        }

        const total = await User.countDocuments(filter);
        const users = await User.find(filter)
            .select("name email sid role profileImage writerProfile.username writerProfile.membershipVerification writerProfile.wgaMember writerProfile.sgaMember createdAt")
            .sort({ updatedAt: -1, createdAt: -1 })
            .skip((pageNumber - 1) * pageLimit)
            .limit(pageLimit)
            .lean();

        const reviews = users.map((user) => {
            const wga = user?.writerProfile?.membershipVerification?.wga || {};
            const swa = user?.writerProfile?.membershipVerification?.swa || {};

            const pendingMemberships = [
                {
                    type: "wga",
                    label: "WGA",
                    status: String(wga?.status || "not_submitted"),
                    submittedAt: wga?.submittedAt,
                    hasProof: hasMembershipProofAsset(wga),
                    proofFileName: wga?.proofFileName || "",
                    adminNote: wga?.adminNote || "",
                },
                {
                    type: "swa",
                    label: "SWA",
                    status: String(swa?.status || "not_submitted"),
                    submittedAt: swa?.submittedAt,
                    hasProof: hasMembershipProofAsset(swa),
                    proofFileName: swa?.proofFileName || "",
                    adminNote: swa?.adminNote || "",
                },
            ].filter((item) => item.status === "pending");

            return {
                _id: user._id,
                name: user.name || "",
                email: user.email || "",
                sid: user.sid || "",
                role: user.role || "",
                profileImage: user.profileImage || "",
                username: user?.writerProfile?.username || "",
                pendingMemberships,
                createdAt: user.createdAt,
            };
        });

        res.json({
            reviews,
            total,
            page: pageNumber,
            totalPages: pageLimit === 0 ? 1 : Math.ceil(total / pageLimit),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getWriterMembershipProofAccessUrl = async (req, res) => {
    try {
        const membershipType = normalizeString(req.params.membershipType).toLowerCase();
        if (!MEMBERSHIP_TYPE_CONFIG[membershipType]) {
            return res.status(400).json({ message: "Invalid membership type. Use 'wga' or 'swa'." });
        }

        const user = await User.findOne({ _id: req.params.id, role: { $in: Array.from(WRITER_ROLE_SET) } }).lean();
        if (!user) {
            return res.status(404).json({ message: "Writer not found" });
        }

        const entry = user?.writerProfile?.membershipVerification?.[membershipType] || {};
        const asset = describeMembershipProofAsset(entry);

        if (!asset.fallbackUrl && !asset.publicId) {
            return res.status(404).json({ message: "Proof file not found" });
        }

        if (!asset.publicId) {
            res.set("Cache-Control", "private, no-store");
            return res.json({ url: asset.fallbackUrl });
        }

        const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60;
        const signedUrl = buildPrivateDownloadUrl(asset.publicId, asset.format, {
            resource_type: asset.resourceType,
            type: asset.deliveryType,
            expires_at: expiresAt,
            attachment: false,
        });

        res.set("Cache-Control", "private, no-store");
        return res.json({ url: signedUrl });
    } catch (error) {
        return res.status(500).json({ message: error.message || "Failed to build proof access URL" });
    }
};

export const approveInvestor = async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.params.id, role: "investor" });
        if (!user) return res.status(404).json({ message: "Investor not found" });
        user.approvalStatus = "approved";
        user.approvalNote = undefined;
        await user.save();

        // Create in-app notification
        await Notification.create({
            user: user._id,
            type: "investor_approved",
            message: "Your investor account has been approved! You can now log in and start exploring investment opportunities.",
        });

        res.json({ message: "Investor approved successfully", user: { _id: user._id, name: user.name, email: user.email, approvalStatus: user.approvalStatus } });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const rejectInvestor = async (req, res) => {
    try {
        const { note } = req.body;
        const user = await User.findOne({ _id: req.params.id, role: "investor" });
        if (!user) return res.status(404).json({ message: "Investor not found" });
        user.approvalStatus = "rejected";
        if (note) user.approvalNote = note;
        await user.save();

        res.json({ message: "Investor rejected", user: { _id: user._id, name: user.name, email: user.email, approvalStatus: user.approvalStatus } });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const reviewWriterMembership = async (req, res) => {
    try {
        const { note } = req.body || {};
        const membershipType = String(req.params.membershipType || "").toLowerCase();
        const decision = String(req.params.decision || "").toLowerCase();
        const membershipConfig = MEMBERSHIP_TYPE_CONFIG[membershipType];

        if (!membershipConfig) {
            return res.status(400).json({ message: "Invalid membership type. Use 'wga' or 'swa'." });
        }

        if (!["approve", "reject"].includes(decision)) {
            return res.status(400).json({ message: "Invalid decision. Use 'approve' or 'reject'." });
        }

        const user = await User.findOne({ _id: req.params.id, role: { $in: Array.from(WRITER_ROLE_SET) } });
        if (!user) return res.status(404).json({ message: "Writer not found" });

        const verification = ensureWriterMembershipVerification(user);
        const entry = verification[membershipConfig.verificationKey];

        if (!entry.requested) {
            return res.status(400).json({ message: `${membershipConfig.label} membership is not requested by this writer` });
        }

        if (entry.status !== "pending") {
            return res.status(400).json({ message: `No pending ${membershipConfig.label} membership review found` });
        }

        if (decision === "approve" && !hasMembershipProofAsset(entry)) {
            return res.status(400).json({ message: `${membershipConfig.label} proof is missing` });
        }

        entry.status = decision === "approve" ? "approved" : "rejected";
        entry.reviewedAt = new Date();
        entry.reviewedBy = req.user._id;
        entry.adminNote = note ? String(note).trim() : (decision === "approve" ? "Approved" : "Rejected");

        user.writerProfile[membershipConfig.memberField] = decision === "approve";
        user.markModified("writerProfile");
        await user.save();

        await Notification.create({
            user: user._id,
            type: "admin_alert",
            from: req.user?._id,
            message: decision === "approve"
                ? `${membershipConfig.label} membership approved${entry.adminNote ? `: ${entry.adminNote}` : ""}`
                : `${membershipConfig.label} membership rejected${entry.adminNote ? `: ${entry.adminNote}` : ""}`,
        }).catch(() => null);

        sendWriterMembershipDecisionEmail(
            user.email,
            user.name,
            membershipConfig.label,
            decision === "approve" ? "approved" : "rejected",
            entry.adminNote,
            { clientBaseUrl: resolveClientOriginFromRequest(req) }
        ).catch((err) =>
            console.error(`Failed to send ${membershipConfig.label} membership decision email:`, err.message)
        );

        res.json({
            message: `${membershipConfig.label} membership ${decision === "approve" ? "approved" : "rejected"}`,
            user: {
                _id: user._id,
                writerProfile: user.writerProfile,
            },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── Bank Details Review ───
export const getBankDetailReviews = async (req, res) => {
    try {
        const { status = "pending", page = 1, limit = 20, search = "" } = req.query;
        const filter = {
            role: { $in: ["writer", "creator"] },
        };

        if (status && status !== "all") {
            filter.$or = [
                {
                    "bankDetailsReview.status": status,
                    "bankDetailsReview.requestedDetails.accountNumber": { $exists: true, $ne: "" },
                },
                { "bankDetailsSecurity.isLocked": true },
            ];
        } else {
            filter.$or = [
                { "bankDetailsReview.requestedDetails.accountNumber": { $exists: true, $ne: "" } },
                { "bankDetailsSecurity.invalidAttempts": { $gt: 0 } },
                { "bankDetailsSecurity.isLocked": true },
            ];
        }

        if (search) {
            const searchFilter = [
                { sid: { $regex: search, $options: "i" } },
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { "bankDetailsReview.requestedDetails.bankName": { $regex: search, $options: "i" } },
            ];
            filter.$and = [{ $or: searchFilter }];
        }

        const total = await User.countDocuments(filter);
        const users = await User.find(filter)
            .select("sid name email role bankDetails bankDetailsReview bankDetailsSecurity")
            .sort({ "bankDetailsReview.submittedAt": 1, createdAt: -1 })
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit))
            .lean();

        const reviews = users.map((user) => {
            const requested = user?.bankDetailsReview?.requestedDetails || {};
            const active = user?.bankDetails || {};
            return {
                _id: user._id,
                sid: user.sid,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user?.bankDetailsReview?.status || "not_submitted",
                submittedAt: user?.bankDetailsReview?.submittedAt,
                dueAt: user?.bankDetailsReview?.dueAt,
                reviewedAt: user?.bankDetailsReview?.reviewedAt,
                adminNote: user?.bankDetailsReview?.adminNote || "",
                bankSecurity: {
                    invalidAttempts: Number(user?.bankDetailsSecurity?.invalidAttempts || 0),
                    isLocked: Boolean(user?.bankDetailsSecurity?.isLocked),
                    lockedAt: user?.bankDetailsSecurity?.lockedAt,
                    lastInvalidAttemptAt: user?.bankDetailsSecurity?.lastInvalidAttemptAt,
                    lastInvalidReason: user?.bankDetailsSecurity?.lastInvalidReason || "",
                },
                requestedDetails: {
                    ...requested,
                    accountNumber: requested.accountNumber || "",
                    maskedAccountNumber: maskAccountNumber(requested.accountNumber),
                },
                activeDetails: active?.accountNumber
                    ? {
                        ...active,
                        accountNumber: active.accountNumber,
                        maskedAccountNumber: maskAccountNumber(active.accountNumber),
                    }
                    : null,
            };
        });

        res.json({ reviews, total, page: Number(page), totalPages: Math.max(1, Math.ceil(total / Number(limit))) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const approveBankDetailReview = async (req, res) => {
    try {
        const { note } = req.body || {};
        const user = await User.findOne({ _id: req.params.id, role: { $in: ["writer", "creator"] } });
        if (!user) return res.status(404).json({ message: "Writer not found" });

        const requested = user?.bankDetailsReview?.requestedDetails;
        if (!requested?.accountNumber || user?.bankDetailsReview?.status !== "pending") {
            return res.status(400).json({ message: "No pending bank details review found" });
        }

        user.bankDetails = {
            accountHolderName: requested.accountHolderName,
            bankName: requested.bankName,
            accountNumber: requested.accountNumber,
            routingNumber: requested.routingNumber,
            accountType: requested.accountType || "checking",
            swiftCode: requested.swiftCode,
            iban: requested.iban,
            country: requested.country || "IN",
            currency: requested.country === "IN" ? "INR" : (requested.currency || "INR"),
            isVerified: true,
            verifiedAt: new Date(),
            addedAt: user.bankDetails?.addedAt || user?.bankDetailsReview?.submittedAt || new Date(),
        };

        user.bankDetailsReview.status = "approved";
        user.bankDetailsReview.reviewedAt = new Date();
        user.bankDetailsReview.reviewedBy = req.user._id;
        user.bankDetailsReview.adminNote = note ? String(note).trim() : "Approved";

        await user.save();

        try {
            await Notification.create({
                user: user._id,
                type: "admin_alert",
                from: req.user?._id,
                message: note
                    ? `Your bank details were approved. Admin note: ${String(note).trim()}`
                    : "Your bank details were approved. You can now receive payouts.",
            });
        } catch (notificationError) {
            console.error("Bank approval notification failed:", notificationError.message);
        }

        res.json({ message: "Bank details approved and activated" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const rejectBankDetailReview = async (req, res) => {
    try {
        const { note } = req.body || {};
        const user = await User.findOne({ _id: req.params.id, role: { $in: ["writer", "creator"] } });
        if (!user) return res.status(404).json({ message: "Writer not found" });

        if (user?.bankDetailsReview?.status !== "pending") {
            return res.status(400).json({ message: "No pending bank details review found" });
        }

        user.bankDetailsReview.status = "rejected";
        user.bankDetailsReview.reviewedAt = new Date();
        user.bankDetailsReview.reviewedBy = req.user._id;
        user.bankDetailsReview.adminNote = note ? String(note).trim() : "Rejected by admin";

        await user.save();

        try {
            await Notification.create({
                user: user._id,
                type: "admin_alert",
                from: req.user?._id,
                message: note
                    ? `Your bank details were rejected. Admin note: ${String(note).trim()}`
                    : "Your bank details were rejected. Please update and resubmit your details.",
            });
        } catch (notificationError) {
            console.error("Bank rejection notification failed:", notificationError.message);
        }

        res.json({ message: "Bank details request rejected" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const unblockBankDetailUpdates = async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.params.id, role: { $in: ["writer", "creator"] } });
        if (!user) return res.status(404).json({ message: "Writer not found" });

        if (!user.bankDetailsSecurity) {
            user.bankDetailsSecurity = {};
        }

        user.bankDetailsSecurity.invalidAttempts = 0;
        user.bankDetailsSecurity.isLocked = false;
        user.bankDetailsSecurity.lockedAt = undefined;
        user.bankDetailsSecurity.lastInvalidAttemptAt = undefined;
        user.bankDetailsSecurity.lastInvalidReason = "";
        user.bankDetailsSecurity.unlockedAt = new Date();
        user.bankDetailsSecurity.unlockedBy = req.user._id;

        await user.save();
        res.json({ message: "Bank detail update lock removed. User can submit details again." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── Admin Alerts Summary (for sidebar badges + popup polling) ───
export const getAdminAlertSummary = async (req, res) => {
    try {
        const [
            totalInvestors,
            totalWriters,
            totalReaders,
            totalScripts,
            aiUsage,
            evaluations,
            investorPurchases,
            invoices,
            payments,
            aiScores,
            platformScores,
            readerScores,
            approvals,
            trailers,
            pendingInvestors,
            pendingMembershipReviews,
            pendingBankReviews,
            lockedBankUsers,
            queries,
        ] = await Promise.all([
            User.countDocuments({ role: "investor" }),
            User.countDocuments({ role: { $in: ["writer", "creator"] } }),
            User.countDocuments({ role: "reader" }),
            Script.countDocuments(),
            Script.countDocuments({
                $or: [
                    { "services.evaluation": true },
                    { "services.aiTrailer": true },
                    { "scriptScore.overall": { $exists: true, $ne: null } },
                ],
            }),
            Script.countDocuments({ "services.evaluation": true }),
            Script.countDocuments({ unlockedBy: { $exists: true, $not: { $size: 0 } } }),
            Invoice.countDocuments(),
            Transaction.countDocuments(),
            Script.countDocuments({ "scriptScore.overall": { $exists: true, $ne: null } }),
            Script.countDocuments({ "platformScore.overall": { $exists: true, $ne: null } }),
            Script.countDocuments({ rating: { $gt: 0 }, reviewCount: { $gt: 0 } }),
            Script.countDocuments(getPendingApprovalScriptFilter()),
            Script.countDocuments(getAdminTrailerRequestFilter()),
            User.countDocuments({ role: "investor", approvalStatus: "pending" }),
            User.countDocuments({
                role: { $in: ["writer", "creator"] },
                $or: [
                    { "writerProfile.membershipVerification.wga.status": "pending" },
                    { "writerProfile.membershipVerification.swa.status": "pending" },
                ],
            }),
            User.countDocuments({ role: { $in: ["writer", "creator"] }, "bankDetailsReview.status": "pending" }),
            User.countDocuments({ role: { $in: ["writer", "creator"] }, "bankDetailsSecurity.isLocked": true }),
            ContactSubmission.countDocuments(),
        ]);

        const bankReviewAlerts = pendingBankReviews + lockedBankUsers;

        res.json({
            overview: approvals + trailers + pendingInvestors + pendingMembershipReviews + bankReviewAlerts + queries,
            investors: totalInvestors,
            writers: totalWriters,
            readers: totalReaders,
            projects: totalScripts,
            "ai-usage": aiUsage,
            evaluations,
            "investor-purchases": investorPurchases,
            invoices,
            payments,
            scores: aiScores + platformScores + readerScores,
            approvals,
            trailers,
            "pending-investors": pendingInvestors,
            "membership-reviews": pendingMembershipReviews,
            "bank-reviews": bankReviewAlerts,
            queries,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getAdminAgreements = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            status,
            writerId,
            buyerId,
            scriptId,
        } = req.query;

        const pageNumber = Math.max(Number(page) || 1, 1);
        const pageLimit = Number(limit) === 0 ? 0 : Math.min(Math.max(Number(limit) || 20, 1), 100);

        const filter = {};
        if (status) {
            filter.status = String(status).trim();
        }
        if (writerId && mongoose.Types.ObjectId.isValid(writerId)) {
            filter.writer_id = writerId;
        }
        if (buyerId && mongoose.Types.ObjectId.isValid(buyerId)) {
            filter.buyer_id = buyerId;
        }
        if (scriptId && mongoose.Types.ObjectId.isValid(scriptId)) {
            filter.script_id = scriptId;
        }

        const total = await Agreement.countDocuments(filter);
        const agreements = await Agreement.find(filter)
            .populate("script_id", "title sid genre")
            .populate("writer_id", "name email sid")
            .populate("buyer_id", "name email sid")
            .sort({ createdAt: -1 })
            .skip((pageNumber - 1) * pageLimit)
            .limit(pageLimit)
            .lean();

        res.json({
            agreements,
            total,
            page: pageNumber,
            totalPages: pageLimit === 0 ? 1 : Math.ceil(total / pageLimit),
        });
    } catch (error) {
        res.status(500).json({ message: error.message || "Failed to load agreements." });
    }
};

export const getAdminAgreementById = async (req, res) => {
    try {
        const agreement = await Agreement.findById(req.params.id)
            .populate("script_id", "title sid genre")
            .populate("writer_id", "name email sid")
            .populate("buyer_id", "name email sid")
            .lean();

        if (!agreement) {
            return res.status(404).json({ message: "Agreement not found." });
        }

        return res.json(agreement);
    } catch (error) {
        return res.status(500).json({ message: error.message || "Failed to load agreement." });
    }
};

export const getAdminAgreementPdf = async (req, res) => {
    try {
        const party = normalizeString(req.query.party || "").toLowerCase();
        if (!party || !["writer", "buyer"].includes(party)) {
            return res.status(400).json({ message: "party query must be writer or buyer." });
        }

        const agreement = await Agreement.findById(req.params.id).lean();
        if (!agreement) {
            return res.status(404).json({ message: "Agreement not found." });
        }

        const targetUrl = party === "writer" ? agreement.writer_pdf_url : agreement.buyer_pdf_url;
        if (!targetUrl || !/^https?:\/\//i.test(String(targetUrl))) {
            return res.status(404).json({ message: "Agreement PDF not available." });
        }

        const { buffer: fileBuffer } = await fetchTrustedPdfAsset(targetUrl);
        const shouldDownload = String(req.query.download || "") === "1";
        const disposition = shouldDownload ? "attachment" : "inline";

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `${disposition}; filename="agreement-${agreement._id}-${party}.pdf"`
        );

        return res.send(fileBuffer);
    } catch (error) {
        return res.status(500).json({ message: error.message || "Failed to load agreement PDF." });
    }
};

export const getAdminPurchaseTermsCurrent = async (_req, res) => {
    try {
        const current = await getCurrentPurchaseTermsPolicy();
        res.json({
            key: current?.key || "purchase_agreement",
            version: current?.version || "",
            title: current?.title || "",
            content: current?.content || "",
            effectiveAt: current?.effectiveAt || null,
            isCurrent: Boolean(current?.isCurrent),
        });
    } catch (error) {
        res.status(500).json({ message: error.message || "Failed to load current terms." });
    }
};

export const getAdminPurchaseTermsVersions = async (_req, res) => {
    try {
        const versions = await listPurchaseTermsPolicyVersions();
        res.json({ versions });
    } catch (error) {
        res.status(500).json({ message: error.message || "Failed to load terms versions." });
    }
};

export const createAdminPurchaseTermsVersion = async (req, res) => {
    try {
        const { version, title, content } = req.body || {};

        const created = await createNewPurchaseTermsPolicyVersion({
            version,
            title,
            content,
            updatedBy: req.user?._id,
        });

        res.status(201).json({
            message: "Purchase terms version created.",
            version: created,
        });
    } catch (error) {
        const statusCode = /already exists|required/i.test(String(error?.message || "")) ? 400 : 500;
        res.status(statusCode).json({ message: error.message || "Failed to create terms version." });
    }
};



/**
 * Grant or revoke the finance role — the read-only payments panel handed to an external
 * accountant (see middleware/financeMiddleware.js for why it is not admin).
 *
 * Granting REMEMBERS the user's previous role in financeRoleGrantedFrom so revoking restores it
 * exactly; a role is load-bearing everywhere (routing, entitlements, nav), so "revoke to reader"
 * would quietly break a writer's account. Admin accounts are refused: demoting an admin to a
 * read-only role through this side door would be privilege management by accident.
 */
export const setFinanceRole = async (req, res) => {
    try {
        const { grant } = req.body || {};
        const user = await User.findById(req.params.id).select("role email name financeRoleGrantedFrom");
        if (!user) return res.status(404).json({ message: "User not found" });
        if (user.role === "admin") {
            return res.status(400).json({ message: "Admin accounts cannot be converted to finance." });
        }

        if (grant) {
            if (user.role === "finance") return res.json({ message: "Already a finance account.", user });
            user.financeRoleGrantedFrom = user.role;
            user.role = "finance";
        } else {
            if (user.role !== "finance") return res.status(400).json({ message: "Not a finance account." });
            user.role = user.financeRoleGrantedFrom || "reader";
            user.financeRoleGrantedFrom = undefined;
        }
        await user.save({ validateModifiedOnly: true });

        return res.json({
            message: grant
                ? `${user.name || user.email} can now access the payments panel at /finance.`
                : `Finance access removed; role restored to ${user.role}.`,
            user: { _id: user._id, role: user.role },
        });
    } catch (error) {
        console.error("[admin] setFinanceRole failed:", error?.message || error);
        return res.status(500).json({ message: "Failed to update finance access." });
    }
};
