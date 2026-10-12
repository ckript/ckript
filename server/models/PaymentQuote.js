import mongoose from "mongoose";
import taxSnapshotSchema from "./schemas/taxSnapshot.js";

/**
 * The priced checkout behind one Razorpay order.
 *
 * Written when the order is created — where the price and taxes are computed server-side — and read
 * back at verification. That is what lets verification prove the captured amount equals the
 * tax-added total, and lets every record after capture carry the SAME snapshot the buyer was shown,
 * rather than recomputing it (rates, billing details or FX could all have moved in between).
 */
const paymentQuoteSchema = new mongoose.Schema(
  {
    provider: { type: String, default: "razorpay" },
    orderId: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    purpose: { type: String, required: true },
    subjectId: { type: String, default: "" },
    currency: { type: String, required: true },
    preTaxMinor: { type: Number, required: true },
    grossMinor: { type: Number, required: true },
    tax: { type: taxSnapshotSchema },
    capturedPaymentId: { type: String, default: "" },
  },
  { timestamps: true },
);

export default mongoose.model("PaymentQuote", paymentQuoteSchema);
