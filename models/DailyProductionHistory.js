import mongoose from "mongoose";

const dailyProductionHistorySchema = new mongoose.Schema(
  {
    productionDate: {
      type: Date,
      required: [true, "Production date is required"],
      index: true,
    },
    section: {
      type: String,
      trim: true,
      uppercase: true,
    },
    machineCode: {
      type: String,
      required: [true, "Machine code is required"],
      trim: true,
      uppercase: true,
      index: true,
    },
    shift: {
      type: String,
      trim: true,
      uppercase: true,
      default: "DAY",
    },
    machineType: {
      type: String,
      trim: true,
    },
    customer: {
      type: String,
      trim: true,
    },
    itemId: {
      type: String,
      required: [true, "Item ID is required"],
      trim: true,
      uppercase: true,
      index: true,
    },
    productDescription: {
      type: String,
      trim: true,
    },
    toolId1: {
      type: String,
      trim: true,
      uppercase: true,
    },
    toolId2: {
      type: String,
      trim: true,
      uppercase: true,
    },
    cavities: {
      type: Number,
      default: 0,
    },
    actualProductionPcs: {
      type: Number,
      default: 0,
    },
    planHours: {
      type: Number,
      default: 0,
    },
    downTimeSeconds: {
      type: Number,
      default: 0,
    },
    dtReason: {
      type: String,
      trim: true,
    },
    scrapQty: {
      type: Number,
      default: 0,
    },
    scrapReason: {
      type: String,
      trim: true,
    },
    bestHrOutput: {
      type: Number,
      default: 0,
    },
    bestHrScrap: {
      type: Number,
      default: 0,
    },
    bestHrDtMin: {
      type: Number,
      default: 0,
    },
    dtLossPcs: {
      type: Number,
      default: 0,
    },
    hourlyMachineOutput: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

dailyProductionHistorySchema.index({ productionDate: 1, machineCode: 1, itemId: 1 });

export default mongoose.model("DailyProductionHistory", dailyProductionHistorySchema);
