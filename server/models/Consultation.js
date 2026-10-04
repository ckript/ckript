import mongoose from "mongoose";

const consultationSchema = new mongoose.Schema({
  bookingId: { type: String, unique: true, index: true },
  writer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  professional: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  professionalRole: { type: String },
  amount: { type: Number, required: true },
  currency: { type: String, default: "INR" },
  platformFee: { type: Number, default: 0 },
  professionalAmount: { type: Number, required: true },
  duration: { type: Number, required: true }, // in minutes
  scheduledStart: { type: Date, required: true },
  scheduledEnd: { type: Date, required: true },
  timezone: { type: String, required: true },
  topic: { type: String, required: true },
  additionalMessage: { type: String },
  fileLink: { type: String },
  status: {
    type: String,
    enum: [
      "payment_pending",
      "payment_success",
      "awaiting_response",
      "accepted",
      "meeting_scheduled",
      "meeting_in_progress",
      "meeting_completed",
      "rejected",
      "refund_pending",
      "refunded",
      "payout_pending",
      "payout_processing",
      "payout_completed",
      "cancelled",
      "payment_failed",
      "refund_failed",
      "payout_failed",
      "meeting_creation_failed"
    ],
    default: "payment_pending",
    index: true
  },
  rejectionReason: { type: String },
  isRescheduled: { type: Boolean, default: false },
  googleEventId: { type: String },
  googleMeetUrl: { type: String },
  
  // Payment info
  razorpayOrderId: { type: String, sparse: true, index: true },
  razorpayPaymentId: { type: String, sparse: true, index: true },
  
  // Refund info
  razorpayRefundId: { type: String },
  refundAmount: { type: Number },
  refundReason: { type: String },
  
  // Payout info
  payoutProviderReference: { type: String },
  
  // Timestamps for state changes
  paidAt: { type: Date },
  acceptedAt: { type: Date },
  rejectedAt: { type: Date },
  completedAt: { type: Date },
  refundInitiatedAt: { type: Date },
  refundCompletedAt: { type: Date },
  payoutInitiatedAt: { type: Date },
  payoutCompletedAt: { type: Date }
}, { timestamps: true });

consultationSchema.pre("validate", async function () {
  if (!this.bookingId) {
    const prefix = "CKR-CONS-";
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let attempt = 0; attempt < 8; attempt++) {
      let token = "";
      for (let i = 0; i < 6; i++) {
        token += chars[Math.floor(Math.random() * chars.length)];
      }
      const candidate = `${prefix}${token}`;
      const exists = await this.constructor.exists({ bookingId: candidate });
      if (!exists) {
        this.bookingId = candidate;
        break;
      }
    }
  }
});

export default mongoose.model("Consultation", consultationSchema);
