import mongoose from "mongoose";

const lineHistorySchema = new mongoose.Schema(
  {
    lineId: { type: String, required: true },
    historyDate: { type: String, required: true }, // මෙය එකතු කරන්න!
    machineId: { type: String, default: "" },
    productCode: { type: String, default: "" },
    dailyTarget: { type: Number, default: 0 },
    hourlyTarget: { type: Number, default: 0 },
    plannedMembers: { type: Number, default: 0 },
    totalProductCount: { type: Number, default: 0 },
    shift: { type: String, default: "" },
    floor: { type: String, default: "" },
    supervisor: { type: String, default: "" },
    shiftStartTime: { type: String, default: "" },
    shiftEndTime: { type: String, default: "" },
  },
  {
    timestamps: true,
  },
);

// එකම field එකක් පාවිච්චි කරලා unique history එකක් තියාගන්න index එකක් දාන්න පුළුවන් (optional)
lineHistorySchema.index({ lineId: 1, historyDate: 1 }, { unique: true });

const LineHistory = mongoose.models.LineHistory || mongoose.model("LineHistory", lineHistorySchema);

export { LineHistory };
