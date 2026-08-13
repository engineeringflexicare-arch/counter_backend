import express from "express";
import {
  getAllLines,
  getLineById,
  assignLine,
  updateLineDetails,
  removeAssignment,
  getAvailableMachines,
  getLiveDataByLineId, // ✅ අලුතින් මෙය එකතු කරන්න
} from "../controllers/LineController.js";

const router = express.Router();

router.get("/", getAllLines);
router.get("/available-machines", getAvailableMachines); // ✅ අලුතින් මෙම Route එක එකතු කරන්න
router.get("/:lineId", getLineById);
router.get("/live/:lineId", getLiveDataByLineId);

router.post("/assign", assignLine);
router.put("/update", updateLineDetails);
router.delete("/remove", removeAssignment);

export default router;
