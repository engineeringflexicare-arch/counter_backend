import express from "express";
import { verifyToken, requireAdmin } from "../middleware/authMiddleware.js";
import {
  // Auth Controllers
  loginUser,
  submitRegistration,

  // User Management Controllers (Admin protected)
  createUser,
  getUsers,
  getSingleUser,
  getCurrentUser,
  updateUser,
  deleteUser,
  blockUser,
  unblockUser,

  // Notification Controllers
  markNotificationRead,
  clearAllNotifications,
  getNotifications,
  forgotPassword,
  verifyOTP,
  resetPassword,
} from "../controllers/UserController.js";

const router = express.Router();

// ==========================================
// Public Routes (No Auth Required)
// ==========================================
router.post("/login", loginUser);
router.post("/register", submitRegistration);

router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOTP);
router.post("/reset-password", resetPassword);

// ==========================================
// Notification Routes (Require Auth)
// ==========================================
router.get("/notifications", verifyToken, getNotifications);
router.patch("/notification/:id/read", verifyToken, markNotificationRead);
router.post("/notifications/clear-all", verifyToken, clearAllNotifications);

// ==========================================
// Current User Routes
// ==========================================
router.get("/profile", verifyToken, getCurrentUser);

// ==========================================
// Admin Protected User Routes
// ==========================================
router.get("/", verifyToken, requireAdmin, getUsers);
router.get("/:id", verifyToken, requireAdmin, getSingleUser);
router.post("/add", verifyToken, requireAdmin, createUser);
router.put("/:id", verifyToken, requireAdmin, updateUser);
router.delete("/:id", verifyToken, requireAdmin, deleteUser);
router.patch("/block/:id", verifyToken, requireAdmin, blockUser);
router.patch("/unblock/:id", verifyToken, requireAdmin, unblockUser);

export default router;
