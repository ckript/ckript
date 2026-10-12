import express from "express";
import protect from "../middleware/authMiddleware.js";
import { getInvoicePdf } from "../controllers/invoiceController.js";
import { listMyInvoices } from "../controllers/billingController.js";

const router = express.Router();

// The signed-in user's own tax invoices, credit notes and access confirmations.
router.get("/", protect, listMyInvoices);
router.get("/:id/pdf", protect, getInvoicePdf);

export default router;
