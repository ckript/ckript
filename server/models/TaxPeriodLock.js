import mongoose from "mongoose";

/**
 * A return period that has been filed. Once a month's GSTR-1 is filed, no document may be dated inside
 * it any more — a late document is reported in the next open period instead. Set only by an admin
 * (POST /api/admin/taxes/period-lock); never removed by the application.
 */
const taxPeriodLockSchema = new mongoose.Schema(
  {
    period: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}$/ },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

export default mongoose.model("TaxPeriodLock", taxPeriodLockSchema);
