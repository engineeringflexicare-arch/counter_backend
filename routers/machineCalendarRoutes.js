import express from "express";
import { checkMachineAvailability, createCalendarBlock, deleteCalendarBlock, getCalendarBlocks } from "../controllers/machineCalendarController.js";

const router = express.Router();

router.post("/", createCalendarBlock);
router.get("/", getCalendarBlocks);
router.get("/availability", checkMachineAvailability);
router.delete("/:id", deleteCalendarBlock);

export default router;
