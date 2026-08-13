import mongoose from "mongoose";

const machineCapacitySchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product is required"],
      index: true,
    },
    machine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InjectionMachine",
      required: [true, "Machine is required"],
      index: true,
    },
    actualOutputPerHour: {
      type: Number,
      default: 0,
    },
    avgOutputPerHour: {
      type: Number,
      default: 0,
    },
    bestOutputPerHour: {
      type: Number,
      default: 0,
    },
    worstOutputPerHour: {
      type: Number,
      default: 0,
    },
    avgEfficiency: {
      type: Number,
      default: 0,
    },
    avgScrapRate: {
      type: Number,
      default: 0,
    },
    avgDowntimeMinutes: {
      type: Number,
      default: 0,
    },
    lastProductionDate: {
      type: Date,
    },
    historicalRunCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

machineCapacitySchema.index({ product: 1, machine: 1 }, { unique: true });

export default mongoose.model("MachineCapacity", machineCapacitySchema);
