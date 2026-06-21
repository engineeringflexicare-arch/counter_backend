import bcrypt from "bcrypt";
import { User } from "../models/User.js"; // මාර්ගය නිවැරදිදැයි පරීක්ෂා කරන්න
import { sendEmail } from "../utils/sendEmail.js";
import { Notifier } from "../utils/Notifier.js";

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.resetOTP = otp;
    user.resetOTPExpire = new Date(Date.now() + 10 * 60 * 1000);

    await user.save();

    await sendEmail(email, "Password Reset OTP", `Your OTP is ${otp}`);

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error) {
    // ⚠️ System Error එක Admin ට දැනුම් දීම
    Notifier.toAdmin("System Error", `Forgot Password Error for ${req.body?.email}: ${error.message}`, "CRITICAL_ERROR");
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });

    if (!user || user.resetOTP !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (user.resetOTPExpire < new Date()) {
      return res.status(400).json({
        success: false,
        message: "OTP expired",
      });
    }

    return res.status(200).json({
      success: true,
      message: "OTP verified",
    });
  } catch (error) {
    Notifier.toAdmin("System Error", `Verify OTP Error: ${error.message}`, "CRITICAL_ERROR");
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({ email });

    if (!user || user.resetOTP !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    // OTP කාලය ඉක්මවා ගොස් ඇත්දැයි බැලීම (Verify OTP එකේ නොතිබුන නිසා මෙහි එකතු කළා)
    if (user.resetOTPExpire < new Date()) {
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    user.resetOTP = null;
    user.resetOTPExpire = null;

    await user.save();

    // 🔔 Password Reset කළ පසු අදාළ User ට Notification එකක් යැවීම
    Notifier.toUser(user._id, "Password Reset Successful", "Your password has been changed successfully.", "SECURITY", "System");

    return res.status(200).json({
      success: true,
      message: "Password reset successful",
    });
  } catch (error) {
    Notifier.toAdmin("System Error", `Reset Password Error: ${error.message}`, "CRITICAL_ERROR");
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
