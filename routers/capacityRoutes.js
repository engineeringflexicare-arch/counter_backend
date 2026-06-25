import express from "express";
import { calculateCapacity } from "../controllers/capacityController.js";

const router = express.Router();

router.route("/").post(calculateCapacity);

export default router;
