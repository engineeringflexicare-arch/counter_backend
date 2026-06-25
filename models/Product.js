import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    product_code: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    cycle_time: { type: Number, required: true }, // තත්පර වලින් (in seconds)
    standard_capacity: { type: Number, required: true }, // පැය 8කට අදාළ සම්මත ධාරිතාව
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
  },
  { timestamps: true },
);

export default mongoose.model("Product", productSchema);
