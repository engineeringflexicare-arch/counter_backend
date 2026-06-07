import express from "express";
import {
  getAllData,
  getMachineStatus,
  getCounterHistory,
  getAllLines,
  withoutResetCountHourlyData,
  getTotalOutput,
  getProductionGaps,
  assignLine,
  removeAssignment,
} from "../controllers/Esp32DataController.js";

const ESP32DataRouter = express.Router();

ESP32DataRouter.get("/", getAllData);
ESP32DataRouter.get("/lines", getAllLines);
ESP32DataRouter.get("/:machineId", getMachineStatus);
ESP32DataRouter.get("/:machineId/history", getCounterHistory);
ESP32DataRouter.get("/:machineId/without-reset-hourly", withoutResetCountHourlyData);
ESP32DataRouter.get("/:machineId/total-output", getTotalOutput);
// ESP32DataRouter.js ෆයිල් එකේ:
ESP32DataRouter.get("/:machineId/production-gaps", getProductionGaps);
ESP32DataRouter.post("/remove-assignment", removeAssignment);
ESP32DataRouter.post("/assign-line", assignLine);
// ESP32DataRouter.get("/:machineId/realtime-hourly", getRealtimeHourlyProduction);

export default ESP32DataRouter;
