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
      maxlength: [50, "First name cannot exceed 50 characters"],
    },

    LastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      maxlength: [50, "Last name cannot exceed 50 characters"],
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,})+$/, "Please provide a valid email"],
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },

    role: {
      type: String,
      enum: ["Admin", "Superuser", "Supervisor", "Operator"],
      default: "Operator",
    },

    isBlocked: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    resetOTP: {
      type: String,
      default: null,
    },

    resetOTPExpire: {
      type: Date,
      default: null,
    },

    phone: {
      type: String,
      default: null,
      trim: true,
    },

    department: {
      type: String,
      default: null,
      trim: true,
    },

    position: {
      type: String,
      default: null,
      trim: true,
    },

    profileImage: {
      type: String,
      default: null,
    },

    lastLogin: {
      type: Date,
      default: null,
    },

    loginAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    lockoutUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
    },
    toObject: {
      virtuals: true,
    },
  },
);

// ==========================================
// Virtual Fields
// ==========================================

UserSchema.virtual("fullName").get(function () {
  return `${this.FirstName} ${this.LastName}`;
});

// ==========================================
// Middleware
// ==========================================

UserSchema.pre("save", function () {
  if (this.isModified("email") && this.email) {
    this.email = this.email.toLowerCase().trim();
  }
});

// ==========================================
// Instance Methods
// ==========================================

UserSchema.methods.isResetOTPValid = function () {
  return Boolean(this.resetOTP && this.resetOTPExpire && this.resetOTPExpire.getTime() > Date.now());
};

UserSchema.methods.clearResetOTP = function () {
  this.resetOTP = null;
  this.resetOTPExpire = null;
};

UserSchema.methods.getPublicProfile = function () {
  return {
    _id: this._id,
    EmployeeId: this.EmployeeId,
    FirstName: this.FirstName,
    LastName: this.LastName,
    fullName: this.fullName,
    email: this.email,
    role: this.role,
    department: this.department,
    position: this.position,
    phone: this.phone,
    profileImage: this.profileImage,
    isActive: this.isActive,
    isBlocked: this.isBlocked,
    lastLogin: this.lastLogin,
    createdAt: this.createdAt,
  };
};

// ==========================================
// Static Methods
// ==========================================

UserSchema.statics.emailExists = async function (email) {
  if (!email) return false;

  const user = await this.findOne({
    email: email.toLowerCase().trim(),
  });

  return !!user;
};

UserSchema.statics.employeeExists = async function (employeeId) {
  if (!employeeId) return false;

  const user = await this.findOne({
    EmployeeId: employeeId,
  });

  return !!user;
};

// ==========================================
// Model Export
// ==========================================

const User = mongoose.models.User || mongoose.model("User", UserSchema);

export default User;
