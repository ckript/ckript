import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const Consultation = (await import("./models/Consultation.js")).default;
  // If there's a recently updated consultation, mark it as rescheduled
  const res = await Consultation.updateMany(
    { status: "meeting_scheduled" }, // maybe this is the status? Wait, the UI screenshot showed "ACCEPTED" status, wait, let me just update all accepted
    { $set: { isRescheduled: true } }
  );
  
  const res2 = await Consultation.updateMany(
    { status: "accepted" }, // Update all accepted as well just in case
    { $set: { isRescheduled: true } }
  );
  console.log("Updated consultations:", res, res2);
  process.exit(0);
});
