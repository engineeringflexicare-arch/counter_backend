import express from "express";
import { getSupervisedUsers, createSupervisor, blockSupervisor, unblockSupervisor } from "../controllers/SuperuserController.js";
import { verifyToken, requireSuperuser } from "../middleware/authMiddleware.js";

const SuperuserRouter = express.Router();

SuperuserRouter.use(verifyToken, requireSuperuser);

SuperuserRouter.get("/users", getSupervisedUsers);
SuperuserRouter.post("/add", createSupervisor);

// Block/Unblock Routes
SuperuserRouter.patch("/block/:id", blockSupervisor);
SuperuserRouter.patch("/unblock/:id", unblockSupervisor);

export default SuperuserRouter;
