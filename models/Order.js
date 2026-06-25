import mongoose from "mongoose";

// Order එක ඇතුළත ඇති අයිතම සඳහා වෙනම කුඩා Schema එකක් (Sub-document)
const orderItemSchema = new mongoose.Schema({
  product_code: { type: String, required: true },
  qty: { type: Number, required: true },
});

const orderSchema = new mongoose.Schema(
  {
    po_no: { type: String, required: true, unique: true }, // Purchase Order Number (උදා: 0006-25)
    customer: { type: String, default: "Flexicare" },
    due_date: { type: String, required: true }, // නැව්ගත කළ යුතු දිනය (Ship Date)
    status: {
      type: String,
      enum: ["Pending", "In Progress", "Completed"],
      default: "Pending",
    },
    order_items: [orderItemSchema], // ඉහත සෑදූ අයිතම ලැයිස්තුව
  },
  { timestamps: true },
);

export default mongoose.model("Order", orderSchema);
