import express from "express";
// මෙන්න මෙතන ./ වෙනුවට ../ දාන්න
import { createUser, loginUser, getUsers, updateUser, deleteUser, verifyToken } from "../controllers/userController.js";

const router = express.Router();

router.post("/login", loginUser);
router.get("/", verifyToken, getUsers);
router.post("/add", verifyToken, createUser);
router.put("/:id", verifyToken, updateUser);
router.delete("/:id", verifyToken, deleteUser);

export default router;
