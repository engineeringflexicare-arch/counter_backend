import express from "express";
import { checkToolAvailability, createToolCalendarBlock, deleteToolCalendarBlock, getToolCalendarBlocks } from "../controllers/toolCalendarController.js";

const router = express.Router();

router.post("/", createToolCalendarBlock);
router.get("/", getToolCalendarBlocks);
router.get("/availability", checkToolAvailability);
router.delete("/:id", deleteToolCalendarBlock);

export default router;
