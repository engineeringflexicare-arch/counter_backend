import mongoose from "mongoose";

const monthlySummarySchema = new mongoose.Schema({
  machineId: {
    type: String,
    required: true,
    index: true,
  },
  monthYear: {
    type: String,
    required: true,
  }, // උදා: "2026-06"
  totalOutput: {
    type: Number,
    default: 0,
  },
});

// දත්ත සෙවීම වඩාත් වේගවත් කිරීමට සහ එකම මාසයට වාර්තා දෙකක් සෑදීම වැළැක්වීමට
monthlySummarySchema.index({ machineId: 1, monthYear: 1 }, { unique: true });

export const MonthlySummary = mongoose.model("MonthlySummary", monthlySummarySchema);
