import mongoose from "mongoose";

const counterSchema = new mongoose.Schema(
  {
    counterId: {
      type: String,
      required: true,
      unique: true,
    },

    counterName: {
      type: String,
      required: true,
    },

    // ESP32 Configuration
    wifiSSID: {
      type: String,
      default: "",
    },

    wifiPassword: {
      type: String,
      default: "",
    },

    mqttBroker: {
      type: String,
      default: "",
    },

    mqttPort: {
      type: Number,
      default: 1883,
    },

    mqttTopic: {
      type: String,
      default: "",
    },

    firmwareVersion: {
      type: String,
      default: "1.0.0",
    },

    ipAddress: {
      type: String,
      default: "",
    },

    macAddress: {
      type: String,
      default: "",
    },

    // Device Status
    status: {
      type: String,
      enum: ["Active", "Inactive", "Maintenance"],
      default: "Active",
    },

    lastSeen: {
      type: Date,
      default: null,
    },

    isOnline: {
      type: Boolean,
      default: false,
    },

    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

export const Counter = mongoose.model("Counter", counterSchema);
