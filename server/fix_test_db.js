import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const Consultation = (await import("./models/Consultation.js")).default;
  
  // Find the consultation with topic "topic 1"
  const res = await Consultation.updateOne(
    { topic: "topic 1" },
    { $set: { fileLink: "https://drive.google.com/file/d/dummy_file/view" } }
  );
  console.log("Updated dummy consultation:", res);
  process.exit(0);
});
