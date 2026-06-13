import express from "express";
import { assignLine, getAlerts, removeAssignment, updateLineDetails } from "../controllers/LineController.js";

const LineRouter = express.Router();

// Line Management Routes
LineRouter.post("/assign", assignLine);
LineRouter.post("/remove-assignment", removeAssignment);
LineRouter.put("/update-line", updateLineDetails);
LineRouter.get("/alerts", getAlerts);

export default LineRouter;
