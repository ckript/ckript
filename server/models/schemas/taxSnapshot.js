import mongoose from "mongoose";

/**
 * The frozen tax computation for one payment, embedded on every record that describes it.
 *
 * Built once by utils/tax/engine.js buildTaxSnapshot and NEVER recomputed: reports, PDFs and refunds
 * read these numbers, so a later change to rates, SAC codes or the supplier address can never rewrite
 * history. All money is integer minor units in `currency`; `inr` holds the INR equivalents the returns
 * are filed in.
 */
const money = { type: Number, default: 0 };

const taxLineSchema = new mongoose.Schema(
  {
    kind: { type: String, default: "" },
    description: { type: String, default: "" },
    sac: { type: String, default: "" },
    qty: { type: Number, default: 1 },
    unit: { type: String, default: "OTH" },
    rateBps: { type: Number, default: 0 },
    taxableMinor: money,
    cgstMinor: money,
    sgstMinor: money,
    igstMinor: money,
    taxMinor: money,
    totalMinor: money,
  },
  { _id: false },
);

const totalsSchema = new mongoose.Schema(
  {
    taxableMinor: money,
    taxMinor: money,
    cgstMinor: money,
    sgstMinor: money,
    igstMinor: money,
    grossMinor: money,
  },
  { _id: false },
);

const taxSnapshotSchema = new mongoose.Schema(
  {
    engineVersion: { type: Number, default: 1 },
    computedAt: { type: Date },
    supplyType: { type: String, default: "" },
    pricingMode: { type: String, enum: ["exclusive", "inclusive"], default: "exclusive" },
    reverseCharge: { type: Boolean, default: false },
    gap: { type: Boolean, default: false },
    supplier: {
      legalName: { type: String, default: "" },
      gstin: { type: String, default: "" },
      stateCode: { type: String, default: "" },
      address: { type: String, default: "" },
      pan: { type: String, default: "" },
      cin: { type: String, default: "" },
    },
    recipient: {
      type: { type: String, default: "individual" },
      name: { type: String, default: "" },
      legalName: { type: String, default: "" },
      gstin: { type: String, default: "" },
      isSez: { type: Boolean, default: false },
      email: { type: String, default: "" },
      address: {
        line1: { type: String, default: "" },
        line2: { type: String, default: "" },
        city: { type: String, default: "" },
        stateCode: { type: String, default: "" },
        stateName: { type: String, default: "" },
        pincode: { type: String, default: "" },
        country: { type: String, default: "" },
      },
    },
    placeOfSupply: {
      country: { type: String, default: "" },
      stateCode: { type: String, default: "" },
      stateName: { type: String, default: "" },
      basis: { type: String, default: "" },
      evidence: { type: [String], default: [] },
      needsReview: { type: Boolean, default: false },
    },
    currency: { type: String, default: "INR" },
    rateBps: { type: Number, default: 0 },
    lines: { type: [taxLineSchema], default: [] },
    totals: { type: totalsSchema, default: () => ({}) },
    inr: {
      fxRate: { type: Number, default: 1 },
      fxSource: { type: String, default: "" },
      fxDate: { type: Date },
      taxableMinor: money,
      cgstMinor: money,
      sgstMinor: money,
      igstMinor: money,
      grossMinor: money,
    },
    exportDeclaration: { type: String, default: "" },
  },
  { _id: false },
);

export default taxSnapshotSchema;
