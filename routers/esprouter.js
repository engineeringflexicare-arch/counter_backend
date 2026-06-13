import express from "express";

import {
  getAllData,
  getCounterHistory,
  getAllLines,
  getSingleLine,
  getLinesChanges,
  withoutResetCountHourlyData,
  getTotalOutput,
  getProductionGaps,
  assignLine,
  removeAssignment,
  updateLineDetails,
  getMachineData,
  getMachineLiveMetrics,
  getLiveDataByLineId,
  getLineById,
  getHourlyTableData,
  getFreeCounterMachines,
  getProductionGapsByLineId,
} from "../controllers/Esp32DataController.js";

const ESP32DataRouter = express.Router();

// ====================================================
// General Data Routes
// ====================================================
ESP32DataRouter.get("/", getAllData);
ESP32DataRouter.get("/all-lines", getAllLines);
ESP32DataRouter.get("/lines", getLinesChanges);
ESP32DataRouter.get("/lines/:lineId", getSingleLine);
ESP32DataRouter.get("/line/:lineId", getLineById);

// ====================================================
// Line Management Routes
// ====================================================
ESP32DataRouter.post("/assign-line", assignLine);
ESP32DataRouter.post("/remove-assignment", removeAssignment);
ESP32DataRouter.put("/update-line", updateLineDetails);

// ====================================================
// Machine Data Routes
// ====================================================
ESP32DataRouter.get("/machine/:machineId", getMachineData);
ESP32DataRouter.get("/history/:machineId", getCounterHistory);
ESP32DataRouter.get("/metrics/:machineId", getMachineLiveMetrics);
ESP32DataRouter.get("/without-reset-hourly/:machineId", withoutResetCountHourlyData);
ESP32DataRouter.get("/total-output/:machineId", getTotalOutput);
ESP32DataRouter.get("/production-gaps/:machineId", getProductionGaps);
ESP32DataRouter.get("/hourly-table/:machineId", getHourlyTableData);
ESP32DataRouter.get("/production-gaps-by-line/:lineId", getProductionGapsByLineId);

// ====================================================
// Live Data Routes
// ====================================================
ESP32DataRouter.get("/line-live-data/:lineId", getLiveDataByLineId);

// ====================================================
// Free Machines Routes
// ====================================================
ESP32DataRouter.get("/free-counters", getFreeCounterMachines);

export default ESP32DataRouter;
