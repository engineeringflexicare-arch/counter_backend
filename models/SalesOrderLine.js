import mongoose from "mongoose";

const salesOrderLineSchema = new mongoose.Schema(
  {
    salesOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalesOrder",
      required: [true, "Sales order is required"],
      index: true,
    },
    lineNumber: {
      type: Number,
      required: [true, "Line number is required"],
      min: 1,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product is required"],
    },
    orderQty: {
      type: Number,
      required: [true, "Order quantity is required"],
      min: [1, "Order quantity must be at least 1"],
    },
    plannedQty: {
      type: Number,
      default: 0,
    },
    producedQty: {
      type: Number,
      default: 0,
    },
    dueDate: {
      type: Date,
      required: [true, "Due date is required"],
    },
    priority: {
      type: String,
      enum: ["Low", "Normal", "High", "Urgent"],
      default: "Normal",
    },
    status: {
      type: String,
      enum: ["Pending", "Partially Planned", "Fully Planned", "In Production", "Completed", "Late"],
      default: "Pending",
    },
    remarks: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

salesOrderLineSchema.index({ salesOrder: 1, lineNumber: 1 }, { unique: true });
salesOrderLineSchema.index({ status: 1, priority: 1, dueDate: 1 });

export default mongoose.model("SalesOrderLine", salesOrderLineSchema);
