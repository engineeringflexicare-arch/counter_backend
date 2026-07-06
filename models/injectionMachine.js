import mongoose from "mongoose";

const injectionMachineSchema = new mongoose.Schema(
  {
    machineCode: {
      type: String,
      required: [true, "Machine code is required"],
      unique: true,
      trim: true,
      uppercase: true, // අකුරු capital වලින් save වීමට
    },
    tonnage: {
      type: Number,
      required: [true, "Tonnage is required"],
    },
    status: {
      type: String,
      enum: ["Active", "Inactive", "Maintenance"],
      default: "Active",
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
    },
    brand: {
      type: String,
      trim: true,
    },
    // Soft delete සඳහා (කලින් controller එකේ භාවිත කළ පරිදි)
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // createdAt සහ updatedAt ස්වයංක්‍රීයව සෑදීමට
  },
);

const InjectionMachine = mongoose.model("InjectionMachine", injectionMachineSchema);

export default InjectionMachine;
