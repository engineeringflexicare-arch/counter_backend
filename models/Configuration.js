import mongoose from "mongoose";

const configurationSchema = new mongoose.Schema(
  {
    device_id: {
      type: String,
      required: true,
    },

    firebase_api_key: {
      type: String,
      default: "",
    },

    firebase_url: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    collection: "configurations",
  },
);

const Configuration = mongoose.model("Configuration", configurationSchema);

export default Configuration;
export { Configuration };
