import mongoose from "mongoose";

const detailedDataSchema = new mongoose.Schema({
  machineId: {
    type: String,
    required: true,
    index: true,
  },
  count: {
    type: Number,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    expires: 259200, // දින 3කට පසු ස්වයංක්‍රීයව මැකී යයි
  },
});

export const DetailedData = mongoose.model("DetailedData", detailedDataSchema);
