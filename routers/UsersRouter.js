import express from "express";
import { createUser, getUsers, updateUser, deleteUser, loginUser } from "../controllers/UserController.js";

const router = express.Router();

router.post("/", createUser);
router.post("/login", loginUser);
router.get("/", getUsers);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);

export default router;
