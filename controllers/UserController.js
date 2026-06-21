import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import User from "../models/Users.js";
import { Notification } from "../models/Notification.js";
import Registration from "../models/Registration.js";

// අලුත් Notifier එක Import කරගැනීම
import { Notifier } from "../utils/Notifier.js";

// ==========================================
// Configurations
// ==========================================
const JWT_SECRET = process.env.JWT_SECRET;

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ==========================================
// Registration (Pending Requests) Controllers
// ==========================================

export const submitRegistration = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, department, position, reason } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "An account already exists with this email.",
      });
    }

    const existingPending = await Registration.findOne({
      email,
      status: "pending",
    });
    if (existingPending) {
      return res.status(400).json({
        success: false,
        message: "Your request is already pending approval.",
      });
    }

    await Registration.create({
      firstName,
      lastName,
      email,
      phone,
      department,
      position,
      reason,
    });

    // අලුත් Request එකක් ආවම Admin ට දැනුම් දීම
    Notifier.toAdmin("New Registration", `${firstName} ${lastName} requested an account for ${department}.`, "REGISTRATION", "System");

    res.status(201).json({
      success: true,
      message: "Registration request submitted successfully",
    });
  } catch (error) {
    Notifier.toAdmin("System Error", `Submit Registration Error: ${error.message}`, "CRITICAL_ERROR");
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPendingRegistrations = async (req, res) => {
  try {
    const pendingRequests = await Registration.find({ status: "pending" });
    res.status(200).json({ success: true, data: pendingRequests });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const approveRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const registration = await Registration.findById(id);
    if (!registration) {
      return res.status(404).json({ success: false, message: "Registration request not found" });
    }

    const existingUser = await User.findOne({ email: registration.email });
    if (existingUser) {
      const updateRes = await User.findByIdAndUpdate(existingUser._id, { role: role || "Operator" }, { new: true });
      await Registration.findByIdAndDelete(id);

      Notifier.toUser(existingUser._id, "Role Updated", `Your role was updated to ${role || "Operator"}`, "ACCOUNT_UPDATE", req.user?.name);
      return res.status(200).json({ success: true, message: `Role assigned successfully`, data: updateRes });
    }

    const defaultPassword = "Flexicare@123";
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(defaultPassword, salt);
    const randomEmpId = Math.floor(1000 + Math.random() * 9000).toString();

    const newUser = await User.create({
      EmployeeId: randomEmpId,
      FirstName: registration.firstName,
      LastName: registration.lastName,
      email: registration.email,
      password: hashedPassword,
      role: role || "Operator",
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: registration.email,
      subject: "Flexicare Account Approved! 🎉",
      html: `...`, // (ඔයාගේ කලින් තිබ්බ Email HTML template එක මෙතන තියෙනවා යැයි සිතන්න)
    };

    await transporter.sendMail(mailOptions);
    await Registration.findByIdAndDelete(id);

    Notifier.toSuperuser("New User Approved", `${registration.firstName} joined as ${role || "Operator"}`, "USER_MANAGEMENT", req.user?.name);

    return res.status(200).json({ success: true, message: "User approved and email sent", data: newUser });
  } catch (error) {
    Notifier.toAdmin("System Error", `Approval Error: ${error.message}`, "CRITICAL_ERROR", req.user?.name);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const rejectRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const registration = await Registration.findByIdAndDelete(id);
    if (!registration) {
      return res.status(404).json({ success: false, message: "Registration request not found" });
    }
    res.status(200).json({ success: true, message: "Registration request rejected" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// User Management Controllers
// ==========================================

export const createUser = async (req, res) => {
  try {
    const { EmployeeId, FirstName, LastName, email, password, role } = req.body;

    if (!EmployeeId || !FirstName || !LastName || !email || !password) {
      return res.status(400).json({ success: false, message: "Required fields missing" });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { EmployeeId }] });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      EmployeeId,
      FirstName,
      LastName,
      email,
      password: hashedPassword,
      role: role || "Supervisor",
    });

    Notifier.toSuperuser("User Created", `${FirstName} was manually created as ${role}`, "USER_MANAGEMENT", req.user?.name);

    return res.status(201).json({ success: true, message: "User created successfully", user: { id: user._id, employeeId: user.EmployeeId, firstName: user.FirstName, role: user.role } });
  } catch (error) {
    Notifier.toAdmin("System Error", `Create User Error: ${error.message}`, "CRITICAL_ERROR", req.user?.name);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { EmployeeId, EmployeeNumber, password } = req.body;
    const employeeId = EmployeeId || EmployeeNumber;

    console.log("🔍 Login Attempt - Raw ID:", employeeId, "Type:", typeof employeeId);

    if (!employeeId || !password) return res.status(400).json({ success: false, message: "Employee ID and Password required" });

    // වෙනස් කළ යුතු පේළිය:
    const user = await User.findOne({ EmployeeId: employeeId.toString() }).select("+password");

    console.log("👤 User found in DB:", user ? "Yes" : "No");

    if (!user) return res.status(401).json({ success: false, message: "User not found" });
    if (user.isBlocked) return res.status(403).json({ success: false, message: "Your account has been blocked" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid password" });

    const token = jwt.sign({ id: user._id, role: user.role, name: user.FirstName }, JWT_SECRET, { expiresIn: "8h" });

    return res.status(200).json({
      success: true,
      token,
      role: user.role,
      name: user.FirstName,
      user: { id: user._id, employeeId: user.EmployeeId, firstName: user.FirstName, lastName: user.LastName, email: user.email, role: user.role },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getUsers = async (req, res) => {
  try {
    const users = await User.find();
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getSingleUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    if (updateData.email) {
      const existingUser = await User.findOne({ email: updateData.email, _id: { $ne: id } });
      if (existingUser) return res.status(400).json({ success: false, message: "Email already in use" });
    }

    if (updateData.EmployeeId) {
      const existingEmp = await User.findOne({ EmployeeId: updateData.EmployeeId, _id: { $ne: id } });
      if (existingEmp) return res.status(400).json({ success: false, message: "Employee ID already in use" });
    }

    if (updateData.password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(updateData.password, salt);
    }

    const user = await User.findByIdAndUpdate(id, updateData, { new: true });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    res.status(200).json({ success: true, message: "User updated successfully", user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    Notifier.toSuperuser("User Deleted", `User ${user.FirstName} was removed from the system.`, "USER_MANAGEMENT", req.user?.name);

    res.status(200).json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    Notifier.toAdmin("System Error", `Delete User Error: ${error.message}`, "CRITICAL_ERROR", req.user?.name);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const blockUser = async (req, res) => {
  try {
    const { id } = req.params;
    const targetUser = await User.findById(id);

    if (!targetUser) return res.status(404).json({ success: false, message: "User not found" });
    if (targetUser.role === "Admin") return res.status(403).json({ success: false, message: "Admin account cannot be blocked" });

    targetUser.isBlocked = true;
    await targetUser.save();

    // අලුත් Notifier Logic
    Notifier.toUser(targetUser._id, "Account Blocked", "Your account has been blocked by an administrator.", "USER_STATUS", req.user?.name);
    Notifier.toSuperuser("Account Blocked", `${targetUser.FirstName} ${targetUser.LastName}'s account was blocked.`, "USER_MANAGEMENT", req.user?.name);

    res.status(200).json({ success: true, message: "User blocked successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const unblockUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndUpdate(id, { isBlocked: false }, { new: true });

    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // අලුත් Notifier Logic
    Notifier.toUser(user._id, "Account Unblocked", "Your account has been successfully unblocked.", "USER_STATUS", req.user?.name);
    Notifier.toSuperuser("Account Unblocked", `${user.FirstName} ${user.LastName}'s account was unblocked.`, "USER_MANAGEMENT", req.user?.name);

    res.status(200).json({ success: true, message: "User unblocked successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// Email OTP Password Reset System
// ==========================================

export const forgotPassword = async (req, res) => {
  // (කලින් තිබුණු කෝඩ් එකමයි, වෙනසක් නැත)
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: "User not found with this email" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetOTP = otp;
    user.resetOTPExpire = Date.now() + 15 * 60 * 1000;
    await user.save();

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Password Reset OTP - Flexicare",
      html: `...`, // (කලින් තිබ්බ OTP Email එක)
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ success: true, message: "OTP sent to email successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const verifyOTP = async (req, res) => {
  // (කලින් තිබුණු කෝඩ් එකමයි, වෙනසක් නැත)
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: "Email and OTP are required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (user.resetOTP !== otp) return res.status(400).json({ success: false, message: "Invalid OTP" });
    if (user.resetOTPExpire < Date.now()) return res.status(400).json({ success: false, message: "OTP has expired." });

    res.status(200).json({ success: true, message: "OTP verified successfully." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ success: false, message: "All fields are required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (user.resetOTP !== otp || user.resetOTPExpire < Date.now()) return res.status(400).json({ success: false, message: "Invalid or expired OTP" });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetOTP = null;
    user.resetOTPExpire = null;
    await user.save();

    // අලුත් Notifier Logic
    Notifier.toUser(user._id, "Password Changed", "Your account password was successfully reset.", "SECURITY", user.FirstName);

    res.status(200).json({ success: true, message: "Password reset successfully. You can now login." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// Notifications Fetching & Updating
// ==========================================

export const markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    await Notification.findByIdAndUpdate(id, { isRead: true });
    res.status(200).json({ success: true, message: "Notification cleared" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const clearAllNotifications = async (req, res) => {
  try {
    // මෙය අදාළ User ගේ private notifications පමණක් mark as read කරයි
    // (මුළු සිස්ටම් එකේම පොදු ඒවා මැකෙන්නේ නැත)
    await Notification.updateMany({ targetUser: req.user.id }, { isRead: true });
    res.status(200).json({ success: true, message: "All private notifications cleared" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getNotifications = async (req, res) => {
  try {
    // මෙතන තමයි Role Base පෙන්වීමේ මැජික් එක තියෙන්නේ
    const notifications = await Notification.find({
      $or: [
        { targetUser: req.user.id }, // 1. මේ User ට විශේෂයෙන් එවපු ඒවා
        { targetRole: req.user.role }, // 2. මේ User ගේ Role එකට එවපු ඒවා
        { targetRole: "ALL" }, // 3. සැමටම පොදුවේ එවපු ඒවා
        { targetUser: null, targetRole: null }, // 4. පරණ සිස්ටම් එකේ තිබ්බ ඒවා
      ],
    }).sort({ createdAt: -1 });

    res.status(200).json({ success: true, notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
