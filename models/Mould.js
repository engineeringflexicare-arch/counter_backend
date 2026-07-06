import mongoose from "mongoose";

const mouldSchema = new mongoose.Schema(
  {
    mouldNumber: {
      type: String,
      required: [true, "Mould number is required"],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    productCode: {
      type: String,
      required: [true, "Product code is required"],
      trim: true,
      uppercase: true,
      index: true,
    },
    cavityCount: {
      type: Number,
      required: [true, "Cavity count is required"],
      min: [1, "Cavity count must be at least 1"],
    },

    validatedMaterials: {
      type: String,
      required: false,
      trim: true,
      uppercase: true,
      index: true,
    },
    standardMaterial: {
      type: String,
      required: [true, "Standard material is required"],
      trim: true,
      uppercase: true,
    },
    isCrushMaterialAllowed: {
      type: Boolean,
      default: false,
      index: true,
    },
    compatibleMachines: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "InjectionMachine",
      },
    ],

    additionalDevices: {
      hotWaterUnit: { type: String, default: "Not Required" },
      coldWaterUnit: { type: String, default: "Not Required" },
      oilCoolingUnit: { type: String, default: "Not Required" },
      steamCoolingUnit: { type: String, default: "Not Required" },
      hotRunners: { type: String, default: "Not Required" },
      hydraulicUnit: { type: String, default: "Not Required" }, // Ejector position maintainer
      airLine: { type: String, default: "Not Required" }, // Items remover for mould
    },

    description: {
      type: String,
      required: [true, "Mould description is required"],
      trim: true,
    },

    cycleTime: {
      type: Number,
      required: [true, "Cycle time is required (in seconds)"],
      min: [0.1, "Cycle time must be greater than 0"],
    },
    standardCapacity: {
      type: Number,
      required: [true, "Standard capacity is required"],
      min: [1, "Standard capacity must be at least 1"],
    },
    // Using a Map for dynamic external inputs (e.g. { "ChillerTemp": "15C", "CorePullers": "2" })
    externalInputs: {
      type: Map,
      of: String,
      default: {},
    },

    status: {
      type: String,
      enum: ["Active", "Maintenance", "Inactive"],
      default: "Active",
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Moved inside the schema and refactored for proper nesting and camelCase
    mouldService: {
      serviceType: {
        type: String,
        required: [true, "Mould service type is required"],
        trim: true,
        uppercase: true,
        index: true,
      },
      serviceDate: {
        type: Date,
        required: [true, "Service date is required"],
      },
      serviceInterval: {
        type: Number,
        required: [true, "Service interval is required"],
        min: [1, "Service interval must be at least 1"],
      },
      serviceDescription: {
        type: String,
        required: [true, "Service description is required"],
        trim: true,
      },
    },
  },
  {
    timestamps: true,
  },
);

// Pre-find hook to exclude soft-deleted moulds
mouldSchema.pre(/^find/, function (next) {
  this.find({ isDeleted: { $ne: true } });
  next();
});

const Mould = mongoose.model("Mould", mouldSchema);

export default Mould;
