import express from "express";

// අනිවාර්යයෙන්ම ඔයාගේ Controllers ෆෝල්ඩරයේ තියෙන ෆයිල් එකේ නමට (Capital U) මෙය සමාන විය යුතුයි
import { createUser, loginUser, getUsers, updateUser, deleteUser, verifyToken } from "../controllers/UserController.js";

const router = express.Router();

// User Routes
router.post("/login", loginUser);
router.get("/", verifyToken, getUsers);
router.post("/add", verifyToken, createUser);
router.put("/:id", verifyToken, updateUser);
router.delete("/:id", verifyToken, deleteUser);

export default router;
