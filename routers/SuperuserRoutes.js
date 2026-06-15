// routers/SuperuserRoutes.js
import express from "express";
import { getSupervisedUsers, createSupervisor } from "../controllers/SuperuserController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();
// Routes
router.get("/users", verifyToken, getSupervisedUsers);
router.post("/add", verifyToken, createSupervisor);

export default router;
