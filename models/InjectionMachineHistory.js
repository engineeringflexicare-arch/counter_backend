import mongoose from "mongoose";

const injectionMachineHistorySchema = new mongoose.Schema(
  {
    injectionMachineNumber: { type: String, required: true },
    historyDate: { type: String, required: true }, // අදාළ දිනය
    mouldNumber: { type: String, default: "" },
    cavities: { type: Number, default: 1 },
    machineId: { type: String, default: "" },
    productCode: { type: String, default: "" },
    dailyTarget: { type: Number, default: 0 },
    hourlyTarget: { type: Number, default: 0 },
    plannedMembers: { type: Number, default: 0 },
    totalProductCount: { type: Number, default: 0 },
    shift: { type: String, default: "" },
    supervisor: { type: String, default: "" },
    shiftStartTime: { type: String, default: "" },
    shiftEndTime: { type: String, default: "" },
    floor: { type: String, default: "" },
  },
  { timestamps: true },
);

// වේගවත් සෙවීම් සඳහා Index කිරීම
injectionMachineHistorySchema.index({ injectionMachineNumber: 1, historyDate: 1 }, { unique: true });
injectionMachineHistorySchema.index({ machineId: 1, historyDate: 1 }); // Machine ID එකෙන් හොයන්න පහසු වෙන්න

export const InjectionMachineHistory = mongoose.models.InjectionMachineHistory || mongoose.model("InjectionMachineHistory", injectionMachineHistorySchema);
