import express from "express";
import {
  getAllData,
  getCounterHistory,
  getHourlyProductionData,
  getCombinedProductionGaps,
  getMachineData,
  getMachineLiveMetrics,
  getLiveDataByLineId,
  getHourlyTableData,
  getFreeCounterMachines,
  getTotalOutput,
  getMachineStatus,
} from "../controllers/Esp32DataController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// සියලුම ESP32 data routes සඳහා Auth අනිවාර්ය වේ
router.use(verifyToken);

// ====================================================
// General & Status Routes
// ====================================================
router.get("/", getAllData);
router.get("/status", getMachineStatus);
router.get("/machine-status", getMachineStatus); // Note: You have two endpoints for the same controller
router.get("/machines/free", getFreeCounterMachines);
router.get("/free-counters", getFreeCounterMachines); // Note: You have two endpoints for the same controller

// ====================================================
// Machine Data & Metrics Routes
// ====================================================
router.get("/machine/:machineId", getMachineData);
router.get("/history/:machineId", getCounterHistory);
router.get("/metrics/:machineId", getMachineLiveMetrics);
router.get("/hourly-production/:machineId", getHourlyProductionData);
router.get("/hourly-table/:machineId", getHourlyTableData);
router.get("/:machineId/total-output", getTotalOutput);

// ====================================================
// Production Gaps & Live Line Routes
// ====================================================
router.get("/production-gaps", getCombinedProductionGaps);
router.get("/live-line/:lineId", getLiveDataByLineId);
router.get("/line-live-data/:lineId", getLiveDataByLineId); // Note: You have two endpoints for the same controller

// Only ONE default export!
export default router;
