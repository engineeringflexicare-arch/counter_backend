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

import { body, param, validationResult } from "express-validator";

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  next();
};

// ==========================================
// Public Routes (No Auth Required)
// ==========================================
router.post(
  "/login",
  [
    body("password").isString().notEmpty().withMessage("Password is required"),
  ],
  validate,
  loginUser
);

router.post(
  "/register",
  [
    body("firstName").trim().notEmpty().withMessage("First name is required"),
    body("lastName").trim().notEmpty().withMessage("Last name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
  ],
  validate,
  submitRegistration
);

router.post("/logout", (req, res) => {
  res.clearCookie("token", { path: "/" });
  res.status(200).json({ success: true, message: "Logged out" });
});

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

router.post(
  "/add",
  verifyToken,
  requireAdmin,
  [
    body("EmployeeId").notEmpty().withMessage("EmployeeId is required"),
    body("FirstName").notEmpty().withMessage("FirstName is required"),
    body("LastName").notEmpty().withMessage("LastName is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  ],
  validate,
  createUser
);

router.put(
  "/:id",
  verifyToken,
  requireAdmin,
  [
    param("id").isMongoId().withMessage("Invalid user ID"),
    body("email").optional().isEmail().withMessage("Invalid email format"),
  ],
  validate,
  updateUser
);

router.delete("/:id", verifyToken, requireAdmin, deleteUser);
router.patch("/block/:id", verifyToken, requireAdmin, blockUser);
router.patch("/unblock/:id", verifyToken, requireAdmin, unblockUser);

export default router;
