import mongoose from "mongoose";

const inventorySchema = new mongoose.Schema(
  {
    item_code: { type: String, required: true, unique: true },
    item_name: { type: String, required: true },
    category: {
      type: String,
      enum: ["Poly Bag", "Carton", "Label", "Connector", "Raw Material"],
      required: true,
    },
    available_qty: { type: Number, required: true, default: 0 },
    reorder_level: { type: Number, required: true, default: 1000 }, // මේ ප්‍රමාණයට වඩා අඩු වුවහොත් Shortage ලෙස පෙන්වයි
  },
  { timestamps: true },
);

export default mongoose.model("Inventory", inventorySchema);
