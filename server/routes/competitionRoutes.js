import express from "express";
import protect from "../middleware/authMiddleware.js";
import {
  getActiveCompetition,
  listCompetitions,
  registerForCompetition,
  getMyEntry,
  openCompetitionEditor,
  submitCompetitionEntry,
  getMyCompetitions,
  getCompetitionHistory,
  getCompetitionParticipants,
  getCompetitionCertificate,
  getCompletedCompetitions,
  getHallOfFameEntry,
  getMyCompetitionReferrals,
  createRegistrationOrder,
  getRegistrationQuote,
  verifyRegistrationPayment,
  reconcileRegistrationPayment,
} from "../controllers/competitionController.js";
import {
  listExternalProviders,
  submitExternalRegistration,
  getMyExternalRegistration,
  uploadExternalRegistrationScreenshot,
} from "../controllers/externalRegistrationController.js";

const router = express.Router();

// Public. These sit above the `/:id/...` block so they are never captured as an id.
// Above the `/:id/...` block so "external-providers" is never captured as a competition id.
router.get("/external-providers", listExternalProviders);
router.get("/active", getActiveCompetition);
router.get("/list", listCompetitions);
router.get("/completed", getCompletedCompetitions);
router.get("/hall-of-fame/:slug", getHallOfFameEntry);
router.get("/history/:userId", getCompetitionHistory);

// Participant. `/mine` is declared before `/:id/...` so it is never captured as an id.
router.get("/mine", protect, getMyCompetitions);
router.post("/:id/register", protect, registerForCompetition);
router.post("/:id/registration-quote", protect, getRegistrationQuote);
router.post("/:id/create-registration-order", protect, createRegistrationOrder);
router.post("/:id/verify-registration-payment", protect, verifyRegistrationPayment);
router.post("/:id/reconcile-registration-payment", protect, reconcileRegistrationPayment);
router.get("/:id/me", protect, getMyEntry);
router.get("/:id/participants", protect, getCompetitionParticipants);
router.get("/:id/referrals", protect, getMyCompetitionReferrals);
router.get("/:id/certificate", protect, getCompetitionCertificate);
router.post("/:id/open-editor", protect, openCompetitionEditor);
router.post("/:id/submit", protect, submitCompetitionEntry);

// Entrants who already paid on Luma, BookMyShow, FilmFreeway and the rest: a claim for a human to
// review rather than a checkout. Multipart, because the proof is an optional screenshot.
router.get("/:id/external-registration", protect, getMyExternalRegistration);
router.post(
  "/:id/external-registration",
  protect,
  uploadExternalRegistrationScreenshot,
  submitExternalRegistration,
);

export default router;
