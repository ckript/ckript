import express from "express";
import protect from "../middleware/authMiddleware.js";
import { getAvailability, updateAvailability } from "../controllers/availabilityController.js";

const router = express.Router();

router.get("/:professionalId", protect, getAvailability);
router.put("/me", protect, updateAvailability);

export default router;
