import express from "express";
import { createUser, getUsers, updateUser, deleteUser, loginUser, verifyToken } from "../controllers/UserController.js";

const router = express.Router();

router.post("/", createUser);
router.post("/login", loginUser);

// ආරක්ෂිත රවුට්ස් (Token අවශ්‍ය වේ)
router.get("/", verifyToken, getUsers);
router.put("/:id", verifyToken, updateUser);
router.delete("/:id", verifyToken, deleteUser);

export default router;
