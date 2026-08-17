import mongoose from "mongoose";

const machineCalendarBlockSchema = new mongoose.Schema(
  {
    machine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InjectionMachine",
      required: [true, "Machine is required"],
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
    status: {
      type: String,
      enum: ["Booked", "Maintenance", "Blocked"],
      default: "Booked",
    },
    sourceType: {
      type: String,
      enum: ["Manual", "Maintenance", "ProductionPlan", "SalesOrder", "Other"],
      default: "Manual",
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    sourceRef: {
      type: String,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
      default: "Calendar Block",
    },
    remarks: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

machineCalendarBlockSchema.index({ machine: 1, startTime: 1, endTime: 1 });

machineCalendarBlockSchema.pre("validate", function (next) {
  if (this.startTime && this.endTime && this.endTime <= this.startTime) {
    this.invalidate("endTime", "End time must be after start time");
  }
  next();
});

export default mongoose.model("MachineCalendarBlock", machineCalendarBlockSchema);
