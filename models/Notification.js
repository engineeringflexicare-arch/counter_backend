import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    title: String,

    message: String,

    type: {
      type: String,
      default: "LINE",
    },

    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    createdBy: String,
  },
  {
    timestamps: true,
  },
);

export const Notification = mongoose.model("Notification", notificationSchema);
