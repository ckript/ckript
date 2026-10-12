import express from "express";
import protect from "../middleware/authMiddleware.js";
import { getWriters, getBlockedUsers, blockUser,getCurrentUser,unblockUser, getUserProfile, getProfileCollections, getPublicUserProfile, updateUserProfile, followUser, unfollowUser, getFollowRequests, acceptFollowRequest, rejectFollowRequest, cancelFollowRequest, getWatchlist, addToWatchlist, removeFromWatchlist, uploadProfileImage, upload, uploadNotableCreditAttachmentsFile, uploadNotableCreditAttachments, getNotableCreditAttachmentAccessUrl, getNotableCreditAttachmentFile, removeNotableCreditAttachment, updateSettings, changePassword, changeEmail, sendEmailVerificationCode, verifyEmailVerificationCode, deleteAccount } from "../controllers/userController.js";
import { getReaderProfile } from "../controllers/readerProfileController.js";
import { getBillingProfile, updateBillingProfile } from "../controllers/billingController.js";

const router = express.Router();

// Writers listing (must come before /:id)
router.get("/writers", protect, getWriters);

// Current user route must come before /:id to avoid conflict
router.get("/me", protect, getCurrentUser);

// Watchlist routes must come before /:id to avoid conflict
router.get("/watchlist", protect, getWatchlist);
router.post("/watchlist/add", protect, addToWatchlist);
router.post("/watchlist/remove", protect, removeFromWatchlist);
router.get("/blocked-users", protect, getBlockedUsers);

// Follow request routes (must come before /:id)
router.get("/follow-requests", protect, getFollowRequests);
router.post("/follow-requests/accept", protect, acceptFollowRequest);
router.post("/follow-requests/reject", protect, rejectFollowRequest);
router.post("/follow-requests/cancel", protect, cancelFollowRequest);

// Billing details for tax invoices (must come before /:id)
router.get("/billing-profile", protect, getBillingProfile);
router.put("/billing-profile", protect, updateBillingProfile);

// Settings routes (must come before /:id)
router.put("/settings", protect, updateSettings);
router.put("/change-password", protect, changePassword);
router.put("/change-email", protect, changeEmail);
router.post("/email-verification/send", protect, sendEmailVerificationCode);
router.post("/email-verification/verify", protect, verifyEmailVerificationCode);
router.delete("/account", protect, deleteAccount);

// User profile routes
router.get("/public/:id", getPublicUserProfile);
router.get("/industry-credit-attachments/file", protect, getNotableCreditAttachmentFile);
router.get("/industry-credit-attachments/access-url", protect, getNotableCreditAttachmentAccessUrl);
router.get("/reader-profile/:id", protect, getReaderProfile);
router.get("/:id/profile-collections", protect, getProfileCollections);
router.get("/:id", protect, getUserProfile);
router.put("/update", protect, updateUserProfile);
router.post("/upload-image", protect, upload.single("profileImage"), uploadProfileImage);
router.post("/industry-credit-attachments", protect, uploadNotableCreditAttachmentsFile, uploadNotableCreditAttachments);
router.delete("/industry-credit-attachments", protect, removeNotableCreditAttachment);
router.post("/follow", protect, followUser);
router.post("/unfollow", protect, unfollowUser);
router.post("/block", protect, blockUser);
router.post("/unblock", protect, unblockUser);

export default router;

