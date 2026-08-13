import mongoose from "mongoose";

const salesOrderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: [true, "Order number is required"],
      trim: true,
      uppercase: true,
      unique: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: [true, "Customer is required"],
    },
    priority: {
      type: String,
      enum: ["Low", "Normal", "High", "Urgent"],
      default: "Normal",
    },
    status: {
      type: String,
      enum: ["Draft", "Confirmed", "In Progress", "Completed", "Cancelled"],
      default: "Draft",
    },
    remarks: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

salesOrderSchema.index({ status: 1, priority: 1, createdAt: -1 });

export default mongoose.model("SalesOrder", salesOrderSchema);
