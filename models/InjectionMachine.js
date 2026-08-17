// models/InjectionMachine.js
import mongoose from "mongoose";

const injectionMachineSchema = new mongoose.Schema(
  {
    injectionMachineNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    mouldNumber: {
      type: String,
      default: "",
    },
    cavities: {
      type: Number,
      default: 1,
    },
    machineId: {
      type: String, // ESP32 Device ID
      default: "",
    },
    productCode: {
      type: String,
      default: "",
    },
    dailyTarget: {
      type: Number,
      default: 0,
    },
    hourlyTarget: {
      type: Number,
      default: 0,
    },
    plannedMembers: {
      type: Number,
      default: 0,
    },
    totalProductCount: {
      type: Number,
      default: 0,
    },
    shift: {
      type: String,
      default: "",
    },
    supervisor: {
      type: String,
      default: "",
    },
    shiftStartTime: {
      type: String,
      default: "",
    },
    shiftEndTime: {
      type: String,
      default: "",
    },
    floor: {
      type: String,
      default: "",
    },
    plannedDate: {
      type: String,
      default: "",
    },
    assignedBy: {
      type: String,
      default: "System",
    },
    updatedBy: {
      type: String,
      default: "System",
    },
  },
  { timestamps: true },
);

export const InjectionMachine = mongoose.model("InjectionMachine", injectionMachineSchema);
