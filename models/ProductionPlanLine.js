import mongoose from "mongoose";

const productionPlanLineSchema = new mongoose.Schema(
  {
    salesOrderLine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalesOrderLine",
      required: [true, "Sales order line is required"],
      index: true,
    },
    machine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InjectionMachine",
      required: [true, "Machine is required"],
      index: true,
    },
    tool: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mould",
      index: true,
    },
    startTime: {
      type: Date,
      required: [true, "Start time is required"],
      index: true,
    },
    endTime: {
      type: Date,
      required: [true, "End time is required"],
      index: true,
    },
    plannedQty: {
      type: Number,
      required: [true, "Planned quantity is required"],
      min: [1, "Planned quantity must be at least 1"],
    },
    producedQty: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["Planned", "In Progress", "Completed", "Cancelled"],
      default: "Planned",
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

productionPlanLineSchema.index({ machine: 1, startTime: 1, endTime: 1 });
productionPlanLineSchema.index({ status: 1, startTime: 1 });

export default mongoose.model("ProductionPlanLine", productionPlanLineSchema);
