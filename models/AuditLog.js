import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    action: String,

    entity: String,

    entityId: String,

    oldData: Object,

    newData: Object,

    changedBy: String,
  },
  {
    timestamps: true,
  },
);

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
