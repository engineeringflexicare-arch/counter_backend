import mongoose from "mongoose";

const lineHistorySchema = new mongoose.Schema(
  {
    lineId: { type: String, required: true },
    historyDate: { type: String, required: true },
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
    cavity: { type: Number, default: 1 }, // 🔥 අලුතින් එකතු කරන ලදී
  },
  {
    timestamps: true,
  },
);

lineHistorySchema.index({ lineId: 1, historyDate: 1 }, { unique: true });
lineHistorySchema.index({ machineId: 1, historyDate: 1 });

const LineHistory = mongoose.models.LineHistory || mongoose.model("LineHistory", lineHistorySchema);

export { LineHistory };
