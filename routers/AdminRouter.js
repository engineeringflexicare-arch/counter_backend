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

// 3. Line & Machine Management
router.get("/lines", getAllLines);
router.get("/machines/available", getAvailableMachines);
router.post("/lines/assign", assignLine);
router.patch("/lines/remove", removeAssignment);
router.patch("/lines/update", updateLineDetails);

export default router;
