import express from "express";
import {
  getAllData,
  getCounterHistory,
  getAllLines,
  getSingleLine, // අලුතින් එකතු කරන ලදී
  getLinesChanges,
  withoutResetCountHourlyData,
  getTotalOutput,
  getProductionGaps,
  assignLine,
  removeAssignment,
  updateLineDetails,
  getMachineData,
} from "../controllers/Esp32DataController.js";

const ESP32DataRouter = express.Router();

// 1. පොදු දත්ත ලබාගැනීම
ESP32DataRouter.get("/", getAllData);
ESP32DataRouter.get("/all-lines", getAllLines); // සියලුම Lines ලැයිස්තුව
ESP32DataRouter.get("/lines/:lineId", getSingleLine); // [lineId] page එක සඳහා අවශ්‍ය වේ

// 2. Line Assignment සහ කළමනාකරණය
ESP32DataRouter.get("/lines", getLinesChanges); // Supervisor ව ෆිල්ටර් කර ලබා ගැනීමට
ESP32DataRouter.post("/assign-line", assignLine);
ESP32DataRouter.post("/remove-assignment", removeAssignment);
ESP32DataRouter.put("/update-line", updateLineDetails);

// 3. යන්ත්‍ර දත්ත සහ නිෂ්පාදන වාර්තා (Machine specific)
// මෙහි ඇති route පථයන් Frontend එකේ axios ඉල්ලීම් වලට ගැලපෙන පරිදි සකසා ඇත.

ESP32DataRouter.get("/machine/:machineId", getMachineData);
ESP32DataRouter.get("/history/:machineId", getCounterHistory);

// නිෂ්පාදන වාර්තා (සංඛ්‍යාලේඛන)
ESP32DataRouter.get("/total-output/:machineId", getTotalOutput);
ESP32DataRouter.get("/production-gaps/:machineId", getProductionGaps);
ESP32DataRouter.get("/without-reset-hourly/:machineId", withoutResetCountHourlyData);

export default ESP32DataRouter;
