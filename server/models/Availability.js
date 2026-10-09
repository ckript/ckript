import mongoose from "mongoose";

const availabilitySchema = new mongoose.Schema({
  professional: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  enabled: { type: Boolean, default: false },
  consultationPrice: { type: Number, default: 200000 }, // in paise (e.g., 2000 INR = 200000)
  currency: { type: String, default: "INR" },
  duration: { type: Number, default: 30 }, // in minutes
  buffer: { type: Number, default: 15 }, // minutes between meetings
  advanceBookingHours: { type: Number, default: 2 }, // min hours before meeting
  maxBookingDays: { type: Number, default: 30 }, // max days ahead
  timezone: { type: String, default: "Asia/Kolkata" },
  
  // Weekly schedule
  schedule: {
    // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    monday: [{ startTime: { type: String }, endTime: { type: String } }],
    tuesday: [{ startTime: { type: String }, endTime: { type: String } }],
    wednesday: [{ startTime: { type: String }, endTime: { type: String } }],
    thursday: [{ startTime: { type: String }, endTime: { type: String } }],
    friday: [{ startTime: { type: String }, endTime: { type: String } }],
    saturday: [{ startTime: { type: String }, endTime: { type: String } }],
    sunday: [{ startTime: { type: String }, endTime: { type: String } }]
  }
}, { timestamps: true });

export default mongoose.model("Availability", availabilitySchema);
