import { get, ref } from "firebase/database";
import { rtdb } from "../database.js";
import jwt from "jsonwebtoken";
import { Notifier } from "../utils/Notifier.js";

// ============================================================================
// 1. PRIVATE HELPER FUNCTIONS (No Import/Export path errors)
// ============================================================================

const getAuthUser = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.split(" ")[1];
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
};

const MIN_READINGS_PER_RUN = 2;

// FIX: Timezone Double-Offset Issue - Using String matching for dates
const getHistoryForDate = (history, selectedDate) => {
  if (!history || !Array.isArray(history)) return [];

  const targetDate = selectedDate.replace(/-/g, "/");

  return history
    .filter((item) => {
      if (!item.Time) return false;
      const itemDate = item.Time.split(" ")[0].replace(/-/g, "/");
      return itemDate === targetDate || itemDate === selectedDate;
    })
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
};

const splitIntoRuns = (rawData) => {
  const runs = [];
  if (!Array.isArray(rawData) || rawData.length === 0) return runs;

  const data = rawData.filter((item) => !Number.isNaN(Number(item.Count)));
  if (data.length === 0) return runs;

  let currentRun = [data[0]];

  for (let i = 1; i < data.length; i++) {
    const previous = data[i - 1];
    const current = data[i];

    const prevCount = Number(previous.Count);
    const currentCount = Number(current.Count);

    if (currentCount < prevCount) {
      if (currentRun.length >= MIN_READINGS_PER_RUN) {
        runs.push(currentRun);
      }
      currentRun = [current];
      continue;
    }
    currentRun.push(current);
  }

  if (currentRun.length >= MIN_READINGS_PER_RUN) {
    runs.push(currentRun);
  }
  return runs;
};

// 100% Dynamic Shift Bucket Generator
const generateShiftHourBuckets = (startTimeStr, endTimeStr) => {
  const start = startTimeStr || "00:00";
  const end = endTimeStr || "23:59";

  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);

  let startMinutes = startH * 60 + (Number.isNaN(startM) ? 0 : startM);
  let endMinutes = endH * 60 + (Number.isNaN(endM) ? 0 : endM);

  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60; // Overnight shift support
  }

  const buckets = [];
  let cursor = startMinutes;

  const formatTime = (totalMins) => {
    const dayMins = ((totalMins % 1440) + 1440) % 1440;
    const h = String(Math.floor(dayMins / 60)).padStart(2, "0");
    const m = String(dayMins % 60).padStart(2, "0");
    return `${h}:${m}`;
  };

  while (cursor < endMinutes) {
    const nextCursor = Math.min(cursor + 60, endMinutes);
    buckets.push({
      label: `${formatTime(cursor)}-${formatTime(nextCursor)}`,
      startMinutes: cursor,
      endMinutes: nextCursor,
      output: 0,
    });
    cursor = nextCursor;
  }

  return { buckets, shiftStartMinutes: startMinutes };
};

// Core Metrics Calculator
const calculateProductionMetrics = (historyToday, shiftStartTime, shiftEndTime) => {
  if (!historyToday || historyToday.length === 0) {
    return { totalOutput: 0, hourlyData: [], firstTime: null };
  }

  const firstRecord = historyToday[0];
  const firstTimeStr = firstRecord?.Time || null;

  const runs = splitIntoRuns(historyToday);
  const { buckets, shiftStartMinutes } = generateShiftHourBuckets(shiftStartTime, shiftEndTime);

  let totalOutput = 0;

  runs.forEach((run) => {
    for (let i = 1; i < run.length; i++) {
      const prev = Number(run[i - 1].Count);
      const curr = Number(run[i].Count);

      if (Number.isNaN(prev) || Number.isNaN(curr)) continue;

      const delta = curr - prev;
      if (delta <= 0) continue;

      // FIX: Time String භාවිතා කර Timezone ගැටළුව මඟහැරීම
      if (!run[i].Time || !run[i].Time.includes(" ")) continue;

      totalOutput += delta;

      const timePart = run[i].Time.split(" ")[1];
      const [recH, recM] = timePart.split(":").map(Number);

      if (Number.isNaN(recH) || Number.isNaN(recM)) continue;

      let recordMinsOfDay = recH * 60 + recM;

      if (recordMinsOfDay < shiftStartMinutes) {
        recordMinsOfDay += 24 * 60;
      }

      const targetBucket = buckets.find((b) => recordMinsOfDay >= b.startMinutes && recordMinsOfDay < b.endMinutes);

      if (targetBucket) {
        targetBucket.output += delta;
      }
    }
  });

  const hourlyData = buckets.map((b) => ({
    hour: b.label,
    output: b.output,
  }));

  return { totalOutput, hourlyData, firstTime: firstTimeStr };
};

// ============================================================================
// 2. GENERAL DATA CONTROLLERS
// ============================================================================

export const getAllData = async (req, res) => {
  try {
    const snapshot = await get(ref(rtdb, "/"));
    if (!snapshot.exists()) {
      return res.status(404).json({ success: false, message: "No data found" });
    }
    res.status(200).json({ success: true, data: snapshot.val() });
  } catch (error) {
    Notifier.toAdmin("Firebase Error", `Failed to get All Data: ${error.message}`, "CRITICAL_ERROR");
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// 3. MACHINE DATA & METRICS CONTROLLERS
// ============================================================================

export const getTotalOutput = async (req, res) => {
  try {
    const { machineId } = req.params;
    const snapshot = await get(ref(rtdb, `Machines/${machineId}/LiveStatus/Count`));
    const count = snapshot.exists() ? snapshot.val() : 0;
    return res.status(200).json({ success: true, totalOutput: count });
  } catch (error) {
    Notifier.toAdmin("Firebase Error", `Failed to fetch Total Output for ${req.params?.machineId}: ${error.message}`, "IOT_ERROR");
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getMachineData = async (req, res) => {
  const { machineId } = req.params;
  try {
    const snapshot = await get(ref(rtdb, `Machines/${machineId}`));
    const machineData = snapshot.val();

    if (!machineData) {
      return res.status(404).json({ success: false, message: "Machine not found" });
    }
    res.status(200).json({ success: true, data: machineData });
  } catch (error) {
    Notifier.toAdmin("Firebase Error", `Failed to fetch Machine Data [${machineId}]: ${error.message}`, "IOT_ERROR");
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCounterHistory = async (req, res) => {
  try {
    const { machineId } = req.params;
    const snapshot = await get(ref(rtdb, `${machineId}/CounterHistory`));
    res.status(200).json({ success: true, data: snapshot.val() });
  } catch (error) {
    Notifier.toAdmin("Firebase Error", `Counter History Fetch Error: ${error.message}`, "IOT_ERROR");
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMachineLiveMetrics = async (req, res) => {
  try {
    const { machineId } = req.params;
    const statusSnapshot = await get(ref(rtdb, `Machines/${machineId}/LiveStatus/Count`));
    const linesSnapshot = await get(ref(rtdb, `Lines`));
    const linesData = linesSnapshot.val() || {};

    let target = 0;
    Object.values(linesData).forEach((line) => {
      if (line.machineId === machineId) {
        target = line.dailyTarget || 0;
      }
    });

    res.status(200).json({
      success: true,
      data: {
        current: statusSnapshot.val() || 0,
        target: target,
      },
    });
  } catch (error) {
    Notifier.toAdmin("Firebase Error", `Live Metrics Fetch Error [${req.params?.machineId}]: ${error.message}`, "IOT_ERROR");
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- (1) Table Data Endpoint ---
export const getHourlyTableData = async (req, res) => {
  const { machineId } = req.params;
  const { date, shiftStartTime, shiftEndTime } = req.query;

  const selectedDate =
    date ||
    (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    })();

  try {
    const snapshot = await get(ref(rtdb, `Machines/${machineId}/CounterHistory`));
    if (!snapshot.exists()) {
      return res.status(200).json({ success: true, hourlyData: [], totalOutput: 0, firstTime: null });
    }

    const historyToday = getHistoryForDate(Object.values(snapshot.val()), selectedDate);
    const metrics = calculateProductionMetrics(historyToday, shiftStartTime, shiftEndTime);

    return res.status(200).json({
      success: true,
      totalOutput: metrics.totalOutput,
      firstTime: metrics.firstTime,
      hourlyData: metrics.hourlyData,
    });
  } catch (error) {
    Notifier.toAdmin("Firebase Error", `Hourly Table Data Error [${machineId}]: ${error.message}`, "CRITICAL_ERROR");
    return res.status(500).json({ success: false, message: error.message });
  }
};

// --- (2) Chart/Production Data Endpoint ---
export const getHourlyProductionData = async (req, res) => {
  const { machineId } = req.params;
  const { date, shiftStartTime, shiftEndTime } = req.query;

  const selectedDate =
    date ||
    (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    })();

  try {
    const snapshot = await get(ref(rtdb, `Machines/${machineId}/CounterHistory`));
    if (!snapshot.exists()) {
      return res.status(200).json({ success: true, hourlyData: [], totalOutput: 0, firstTime: null });
    }

    const historyToday = getHistoryForDate(Object.values(snapshot.val()), selectedDate);
    const metrics = calculateProductionMetrics(historyToday, shiftStartTime, shiftEndTime);

    return res.status(200).json({
      success: true,
      totalOutput: metrics.totalOutput,
      firstTime: metrics.firstTime,
      hourlyData: metrics.hourlyData,
    });
  } catch (error) {
    Notifier.toAdmin("Firebase Error", `Hourly Production Data Error [${machineId}]: ${error.message}`, "CRITICAL_ERROR");
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getFreeCounterMachines = async (req, res) => {
  try {
    const machineSnapshot = await get(ref(rtdb, "Machines"));
    const lineSnapshot = await get(ref(rtdb, "Lines"));

    const machines = machineSnapshot.val() || {};
    const lines = lineSnapshot.val() || {};

    const assignedMachines = new Set();
    Object.values(lines).forEach((line) => {
      if (line.machineId && line.machineId.trim() !== "") {
        assignedMachines.add(line.machineId);
      }
    });

    const freeMachines = Object.entries(machines)
      .filter(([machineId]) => !assignedMachines.has(machineId))
      .map(([machineId, machine]) => ({
        machineId,
        machineName: machine.machineName || machineId,
        status: machine.status || "offline",
        machineState: machine.machineState || "idle",
      }));

    return res.status(200).json({ success: true, count: freeMachines.length, data: freeMachines });
  } catch (error) {
    console.error("Error fetching free counters:", error);
    Notifier.toAdmin("Firebase Error", `Free Counters Fetch Error: ${error.message}`, "CRITICAL_ERROR");
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ============================================================================
// 4. GAP ANALYSIS CONTROLLER
// ============================================================================

export const getCombinedProductionGaps = async (req, res) => {
  const { date, lineId, machineId: queryMachineId } = req.query;
  let targetMachineId = queryMachineId;
  let lineData = {};

  try {
    if (lineId) {
      const lineSnapshot = await get(ref(rtdb, `Lines/${lineId}`));
      if (!lineSnapshot.exists()) {
        return res.status(404).json({ success: false, message: "Line not found" });
      }
      lineData = lineSnapshot.val();
      targetMachineId = lineData.machineId;

      if (!targetMachineId) {
        return res.status(404).json({ success: false, message: "No machine assigned to this line" });
      }
    }

    if (!targetMachineId) {
      return res.status(400).json({ success: false, message: "Please provide either lineId or machineId" });
    }

    const historySnapshot = await get(ref(rtdb, `Machines/${targetMachineId}/CounterHistory`));

    if (!historySnapshot.exists()) {
      return res.status(404).json({ success: false, message: "No CounterHistory found" });
    }

    const machineSnapshot = await get(ref(rtdb, `Machines/${targetMachineId}`));
    const machineData = machineSnapshot.val() || {};

    const startTime = lineData.shiftStartTime || machineData.productionStartTime || "08:30";
    const endTime = lineData.shiftEndTime || machineData.productionEndTime || "20:30";
    const dailyTarget = Number(lineData.dailyTarget || machineData.dailyTarget || 0);

    const selectedDate =
      date ||
      (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      })();

    const history = Object.values(historySnapshot.val())
      .filter((item) => {
        if (!item.Time) return false;
        const itemDate = item.Time.split(" ")[0].replace(/\//g, "-");
        return itemDate === selectedDate;
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    const gapData = [];

    for (let i = 1; i < history.length; i++) {
      const current = history[i];
      const previous = history[i - 1];

      if (current.Count > previous.Count) {
        let gapSeconds = 0;
        if (current.timestamp && previous.timestamp) {
          gapSeconds = current.timestamp - previous.timestamp;
        } else {
          const currTime = new Date(current.Time.replace(/\//g, "-")).getTime() / 1000;
          const prevTime = new Date(previous.Time.replace(/\//g, "-")).getTime() / 1000;
          gapSeconds = currTime - prevTime;
        }

        if (gapSeconds >= 0) {
          gapData.push({
            count: current.Count,
            time: current.Time.split(" ")[1],
            gapSeconds: Math.round(gapSeconds),
          });
        }
      }
    }

    let plannedAverageGap = 0;
    if (dailyTarget > 0) {
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      const startSeconds = sh * 3600 + sm * 60;
      const endSeconds = eh * 3600 + em * 60;
      let workingSeconds = endSeconds - startSeconds;

      if (workingSeconds < 0) workingSeconds += 24 * 3600;
      plannedAverageGap = Number((workingSeconds / dailyTarget).toFixed(2));
    }

    return res.status(200).json({
      success: true,
      lineId: lineId || null,
      machineId: targetMachineId,
      date: selectedDate,
      startTime,
      endTime,
      dailyTarget,
      averageGap: plannedAverageGap,
      data: gapData,
    });
  } catch (error) {
    Notifier.toAdmin("Firebase Error", `Production Gaps Calc Error: ${error.message}`, "CRITICAL_ERROR");
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// 5. LIVE DATA & HEALTH ROUTES
// ============================================================================

export const getLiveDataByLineId = async (req, res) => {
  try {
    const { lineId } = req.params;
    const lineSnapshot = await get(ref(rtdb, `Lines/${lineId}`));

    if (!lineSnapshot.exists()) {
      return res.status(404).json({ success: false, message: "Line not found" });
    }

    const lineData = lineSnapshot.val();
    const machineId = lineData.machineId;

    if (!machineId) {
      return res.status(404).json({ success: false, message: "No machine assigned to this line" });
    }

    const statusSnapshot = await get(ref(rtdb, `Machines/${machineId}/LiveStatus/Count`));
    const count = statusSnapshot.exists() ? statusSnapshot.val() : 0;

    return res.status(200).json({
      success: true,
      count,
      target: lineData.dailyTarget || 0,
      productCode: lineData.productCode || "—",
      startTime: lineData.shiftStartTime || "—",
      machineId,
    });
  } catch (error) {
    console.error("Error fetching free counters:", error);
    Notifier.toAdmin("Firebase Error", `Live Data Error [${req.params?.lineId}]: ${error.message}`, "IOT_ERROR");
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const getMachineStatus = async (req, res) => {
  try {
    const machinesRef = ref(rtdb, "Machines");
    const snapshot = await get(machinesRef);

    if (!snapshot.exists()) {
      return res.status(200).json({ success: true, data: [] });
    }

    const machines = snapshot.val();
    const statusData = [];

    for (const [machineId, machineData] of Object.entries(machines)) {
      if (machineData.Health) {
        statusData.push({
          machineId,
          ...machineData.Health,
        });
      }
    }

    return res.status(200).json({ success: true, data: statusData });
  } catch (error) {
    console.error("Error fetching machine status:", error);
    Notifier.toAdmin("Firebase Error", `Machine Health Status Error: ${error.message}`, "IOT_ERROR");
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};
