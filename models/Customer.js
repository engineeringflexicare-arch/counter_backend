import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Customer code is required"],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
    },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
    contactPerson: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
    },
    remarks: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model("Customer", customerSchema);
