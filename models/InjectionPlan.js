import mongoose from "mongoose";

const injectionPlanSchema = new mongoose.Schema(
  {
    machine_id: { type: String, required: true }, // උදා: "INJ-02", "INJ-04"
    date: { type: String, required: true }, // උදා: "2026-06-23"
    planned_qty: { type: Number, required: true },
    actual_qty: { type: Number, default: 0 }, // යන්ත්‍රයෙන් ඇත්තටම නිම කළ ප්‍රමාණය
    status: {
      type: String,
      enum: ["Pending", "Running", "Completed", "Maintenance"],
      default: "Pending",
    },
    remarks: { type: String, default: "" }, // යන්ත්‍රය කැඩුනොත් හෝ ප්‍රමාදයක් වුවහොත් සටහන් කිරීමට
  },
  { timestamps: true },
);

// එකම දවසේ එකම මැෂින් එකට සැලසුම් දෙකක් වැටීම වැළැක්වීමට:
injectionPlanSchema.index({ machine_id: 1, date: 1 }, { unique: true });

export default mongoose.model("InjectionPlan", injectionPlanSchema);
