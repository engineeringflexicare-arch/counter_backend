import mongoose from "mongoose";

const productionPlanSchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // Format: YYYY-MM-DD
    line_id: { type: String, required: true }, // e.g. "Line_01"
    product_code: { type: String, required: true },
    target_qty: { type: Number, required: true },
    planned_hours: { type: Number, default: 8 },
    status: {
      type: String,
      enum: ["Pending", "Running", "Completed", "Behind Plan"],
      default: "Pending",
    },
  },
  { timestamps: true },
);

// එකම දවසේ එකම line එකට Plan දෙකක් වැටීම වැළැක්වීමට Composite Index එකක්:
productionPlanSchema.index({ date: 1, line_id: 1 }, { unique: true });

export default mongoose.model("ProductionPlan", productionPlanSchema);
