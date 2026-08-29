import mongoose from "mongoose";

const counterHistoryArchiveSchema = new mongoose.Schema(
  {
    machineId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true }, // "YYYY-MM-DD"
    records: [{ type: mongoose.Schema.Types.Mixed }],
  },
  { timestamps: true },
);

counterHistoryArchiveSchema.index({ machineId: 1, date: 1 }, { unique: true });

export const CounterHistoryArchive = mongoose.model("CounterHistoryArchive", counterHistoryArchiveSchema);
