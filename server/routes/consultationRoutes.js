import express from "express";
import protect from "../middleware/authMiddleware.js";
import {
  createOrder,
  verifyPayment,
  getWriterConsultations,
  getProfessionalConsultations,
  getConsultationDetails,
  acceptConsultation,
  rejectConsultation,
  completeConsultation,
  cancelConsultation
} from "../controllers/consultationController.js";

const router = express.Router();

router.post("/", protect, createOrder);
router.post("/:id/payment/verify", protect, verifyPayment);
router.get("/my", protect, getWriterConsultations);
router.get("/professional", protect, getProfessionalConsultations);
router.get("/:id", protect, getConsultationDetails);
router.post("/:id/cancel", protect, cancelConsultation);
router.post("/:id/accept", protect, acceptConsultation);
router.post("/:id/reject", protect, rejectConsultation);
router.post("/:id/complete", protect, completeConsultation);

export default router;
