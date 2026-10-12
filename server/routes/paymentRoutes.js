import express from "express";
import protect from "../middleware/authMiddleware.js";
import {
  activateFilmIndustryProfessionalTestCheckout,
  getFilmIndustryProfessionalTestCheckoutStatus,
  createRazorpayOrder,
  verifyRazorpayPayment,
  revealWriterContact,
  consumeMessageWriterSlot,
  activateTestWriterSubscription,
  createWriterRazorpayOrder,
  verifyWriterRazorpayPayment,
  createPlanSubscription,
  verifyPlanSubscription,
  getPlanSubscription,
  cancelPlanSubscription,
  getPlanQuote,
} from "../controllers/paymentController.js";

const router = express.Router();

router.get("/film-industry-professional/test-checkout", protect, getFilmIndustryProfessionalTestCheckoutStatus);
router.post("/film-industry-professional/test-checkout", protect, activateFilmIndustryProfessionalTestCheckout);
router.post("/film-industry-professional/create-razorpay-order", protect, createRazorpayOrder);
router.post("/film-industry-professional/verify-razorpay-payment", protect, verifyRazorpayPayment);

router.post("/writer/activate-test-subscription", protect, activateTestWriterSubscription);
router.post("/writer/create-razorpay-order", protect, createWriterRazorpayOrder);
router.post("/writer/verify-razorpay-payment", protect, verifyWriterRazorpayPayment);

// Recurring plans (Razorpay Subscriptions). The webhook that applies renewals is NOT here: it needs
// the raw request body, so server.js mounts it at /api/webhooks/razorpay ahead of express.json().
// What a plan costs at checkout: listed (pre-tax) price, Taxes (18%), total. No order is created.
router.post("/plans/quote", protect, getPlanQuote);
router.post("/subscriptions", protect, createPlanSubscription);
router.post("/subscriptions/verify", protect, verifyPlanSubscription);
router.get("/subscriptions/current", protect, getPlanSubscription);
router.post("/subscriptions/cancel", protect, cancelPlanSubscription);

router.post("/reveal-contact/:writerId", protect, revealWriterContact);
router.post("/message-writer/:writerId", protect, consumeMessageWriterSlot);

export default router;
