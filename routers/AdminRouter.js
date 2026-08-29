import express from "express";
import {
  getDashboardStats,
  getPendingRegistrations,
  approveRegistration,
  rejectRegistration,
  getAllUsers,
  blockUser,
  unblockUser,
  deleteUser,
  getAllLines,
  getAvailableMachines,
  assignLine,
  removeAssignment,
  updateLineDetails,
} from "../controllers/AdminController.js";
import { verifyToken, requireAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(verifyToken, requireAdmin);

// 1. Dashboard Stats
router.get("/dashboard-stats", getDashboardStats);

// 2. User & Registration Management
router.get("/registrations/pending", getPendingRegistrations);
router.post("/registrations/approve/:id", approveRegistration);
router.delete("/registrations/reject/:id", rejectRegistration);
router.get("/users", getAllUsers);
router.patch("/users/block/:id", blockUser);
router.patch("/users/unblock/:id", unblockUser);
router.delete("/users/:id", deleteUser);

import { body, validationResult } from "express-validator";

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  next();
};

// 3. Line & Machine Management
router.get("/lines", getAllLines);
router.get("/machines/available", getAvailableMachines);
router.post(
  "/lines/assign",
  [
    body("lineId").notEmpty().withMessage("Line ID is required"),
    body("machineId").notEmpty().withMessage("Machine ID is required"),
  ],
  validate,
  assignLine
);
router.patch("/lines/remove", removeAssignment);
router.patch("/lines/update", updateLineDetails);

export default router;
