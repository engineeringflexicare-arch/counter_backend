import express from "express";
import { getAllLines, getLineById, assignLine, updateLineDetails, removeAssignment } from "../controllers/LineController.js";

const router = express.Router();

router.get("/", getAllLines);
router.get("/:lineId", getLineById);

router.post("/assign", assignLine);
router.put("/update", updateLineDetails);
router.delete("/remove", removeAssignment);

export default router;
