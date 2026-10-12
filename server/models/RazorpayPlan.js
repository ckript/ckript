import mongoose from "mongoose";

/**
 * Which Razorpay Plan bills which Ckript plan.
 *
 * A Razorpay Subscription has to point at a Razorpay Plan, and Razorpay Plans are immutable — the
 * amount, currency and period are fixed at creation. So the plans are created lazily, the first time
 * someone subscribes to a given (plan, cycle, currency, amount), and remembered here.
 *
 * The amount is part of the key on purpose: changing a price in config/pricing.js must create a NEW
 * Razorpay plan for new subscribers, never silently re-bill existing ones at the old one's id.
 *
 * `accountKeyId` is part of the key because plan ids belong to one Razorpay account. Test and live
 * keys are different accounts as far as plans are concerned, and reusing a test plan id against the
 * live account (or the reverse) fails at subscription creation.
 */
const razorpayPlanSchema = new mongoose.Schema(
  {
    accountKeyId: { type: String, required: true },
    planKey: { type: String, required: true },
    cycle: { type: String, enum: ["monthly", "annual"], required: true },
    currency: { type: String, required: true },
    amountMinor: { type: Number, required: true },
    razorpayPlanId: { type: String, required: true },
  },
  { timestamps: true }
);

razorpayPlanSchema.index(
  { accountKeyId: 1, planKey: 1, cycle: 1, currency: 1, amountMinor: 1 },
  { unique: true }
);

export default mongoose.model("RazorpayPlan", razorpayPlanSchema);
