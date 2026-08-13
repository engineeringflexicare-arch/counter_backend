import mongoose from "mongoose";

const sectionSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Section code is required"],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Section name is required"],
      trim: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model("Section", sectionSchema);
