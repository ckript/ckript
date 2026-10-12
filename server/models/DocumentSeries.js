import mongoose from "mongoose";

/**
 * Consecutive document numbers, one counter per (series, financial year).
 *
 * CGST Rules r.46(b) requires a tax invoice number that is consecutive, at most 16 characters, and
 * unique within a financial year. Allocation is a single atomic $inc, so concurrent payments can never
 * share a number or skip one.
 */
const documentSeriesSchema = new mongoose.Schema(
  {
    series: { type: String, required: true },
    fy: { type: String, required: true },
    next: { type: Number, default: 0 },
  },
  { timestamps: true },
);

documentSeriesSchema.index({ series: 1, fy: 1 }, { unique: true });

export default mongoose.model("DocumentSeries", documentSeriesSchema);
