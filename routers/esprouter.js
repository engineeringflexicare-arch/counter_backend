import express from "express";

// නිවැරදි කරන ලද Controller Imports
import {
  getAllData,
  getCounterHistory,
  getAllLines,
  getLineById, // getSingleLine වෙනුවට
  getHourlyProductionData, // withoutResetCountHourlyData වෙනුවට
  getTotalOutput,
  getCombinedProductionGaps, // getProductionGaps සහ getProductionGapsByLineId වෙනුවට
  assignLine,
  removeAssignment,
  updateLineDetails,
  getMachineData,
  getMachineLiveMetrics,
  getLiveDataByLineId,
  getHourlyTableData,
  getFreeCounterMachines,
} from "../controllers/Esp32DataController.js";

const ESP32DataRouter = express.Router();

// ====================================================
// General Data Routes
// ====================================================
ESP32DataRouter.get("/", getAllData);
ESP32DataRouter.get("/all-lines", getAllLines);
ESP32DataRouter.get("/line/:lineId", getLineById);
ESP32DataRouter.get("/lines/:lineId", getLineById); // පැරණි route එක වැඩ කරන්න මෙහෙම තියන්න පුළුවන්

// ⚠️ මේ function එක Controller එකේ නැති නිසා දැනට comment කලා
// ESP32DataRouter.get("/lines", getLinesChanges);

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
ESP32DataRouter.get("/without-reset-hourly/:machineId", getHourlyProductionData); // මෙතනට නිවැරදි එක දුන්නා
ESP32DataRouter.get("/total-output/:machineId", getTotalOutput);
ESP32DataRouter.get("/hourly-table/:machineId", getHourlyTableData);

// getCombinedProductionGaps එකෙන් Query parameters (?machineId= හෝ ?lineId=) කියවන නිසා routes දෙකටම මේක දාන්න පුළුවන්
ESP32DataRouter.get("/production-gaps/:machineId", getCombinedProductionGaps);
ESP32DataRouter.get("/production-gaps-by-line/:lineId", getCombinedProductionGaps);

// ====================================================
// Live Data Routes
// ====================================================
ESP32DataRouter.get("/line-live-data/:lineId", getLiveDataByLineId);

// ====================================================
// Free Machines Routes
// ====================================================
ESP32DataRouter.get("/free-counters", getFreeCounterMachines);

export default ESP32DataRouter;
