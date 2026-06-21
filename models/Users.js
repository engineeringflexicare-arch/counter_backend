import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    EmployeeId: {
      type: Number,
      required: [true, "Employee ID is required"],
      unique: true,
      sparse: true,
    },
    FirstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },
    LastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, "Please provide a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ["Admin", "Superuser", "Supervisor", "Operator"],
      default: "Operator",
    },
    isBlocked: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    resetOTP: { type: String, default: null },
    resetOTPExpire: { type: Date, default: null },
    phone: { type: String, default: null },
    department: { type: String, default: null },
    position: { type: String, default: null },
    profileImage: { type: String, default: null },
    lastLogin: { type: Date, default: null },
    loginAttempts: { type: Number, default: 0 },
    lockoutUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

// Indexes
UserSchema.index({ email: 1 });
UserSchema.index({ EmployeeId: 1 });

// Virtual Field
UserSchema.virtual("fullName").get(function () {
  return `${this.FirstName} ${this.LastName}`;
});

// Corrected Pre-save Hook
UserSchema.pre("save", function () {
  // If the email field is modified, enforce lowercase
  if (this.isModified("email")) {
    this.email = this.email.toLowerCase();
  }
  // Note: No 'next()' needed here for modern Mongoose middleware
});

// Instance Methods
UserSchema.methods.isResetOTPValid = function () {
  return this.resetOTP && this.resetOTPExpire && this.resetOTPExpire > Date.now();
};

UserSchema.methods.clearResetOTP = function () {
  this.resetOTP = null;
  this.resetOTPExpire = null;
};

UserSchema.methods.getPublicProfile = function () {
  return {
    _id: this._id,
    EmployeeId: this.EmployeeId,
    fullName: `${this.FirstName} ${this.LastName}`,
    email: this.email,
    role: this.role,
    department: this.department,
  };
};

// Static Methods
UserSchema.statics.emailExists = async function (email) {
  const user = await this.findOne({ email: email.toLowerCase() });
  return !!user;
};

const User = mongoose.model("User", UserSchema);

export default User;
