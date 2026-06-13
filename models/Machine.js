import mongoose from "mongoose";

const machineSchema = new mongoose.Schema(
  {
    machineId: { type: String, required: true, unique: true },
    machineName: { type: String, default: "" },
    status: { type: String, default: "offline" }, // "online" හෝ "offline"
    machineState: { type: String, default: "idle" }, // "running" හෝ "idle"
    productionStartTime: { type: String, default: "08:30" },
    productionEndTime: { type: String, default: "20:30" },
    dailyTarget: { type: Number, default: 0 },
  },
  {
    timestamps: true, // මෙය යෙදීමෙන් createdAt සහ updatedAt ස්වයංක්‍රීයව එකතු වේ
  },
);

export const Machine = mongoose.model("Machine", machineSchema);
