import mongoose from "mongoose";

const lineSchema = new mongoose.Schema({
  lineId: { type: String, required: true, unique: true },
  machineId: { type: String, default: "" },
  productCode: { type: String, default: "" },
  dailyTarget: { type: Number, default: 0 },
  hourlyTarget: { type: Number, default: 0 },
  plannedMembers: { type: Number, default: 0 },
  shift: { type: String, default: "" },
  supervisor: { type: String, default: "" },
  shiftStartTime: { type: String, default: "08:30" },
  shiftEndTime: { type: String, default: "20:30" },
  floor: { type: String, default: "" },
  plannedDate: { type: String, default: "" },
  assignedBy: { type: String, default: "" },
  assignedAt: { type: Date, default: null },
  updatedBy: { type: String, default: "" },
  updatedAt: { type: Date, default: null },
});

export const Line = mongoose.model("Line", lineSchema);
