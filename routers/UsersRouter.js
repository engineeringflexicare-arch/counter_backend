import express from "express";
import { createUser, getUsers, updateUser, deleteUser, loginUser, verifyToken } from "../controllers/UserController.js";

const UserRouter = express.Router();

// ====================================================
// Public Routes (No Token Required)
// ====================================================
UserRouter.post("/login", loginUser);
UserRouter.post("/", createUser); // User Registration

// ====================================================
// Protected Routes (Token Required)
// ====================================================
UserRouter.get("/", verifyToken, getUsers);
UserRouter.put("/:id", verifyToken, updateUser);
UserRouter.delete("/:id", verifyToken, deleteUser);

export default UserRouter;
