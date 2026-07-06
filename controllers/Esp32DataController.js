import { get, ref } from "firebase/database";
import { rtdb } from "../database.js";
import jwt from "jsonwebtoken";
import { Notifier } from "../utils/Notifier.js";
import { Line } from "../models/Line.js";

// ============================================================================
// 1. AUTH HELPER
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

// ============================================================================
// 2. RUN-DETECTION CONFIGURATION
// ============================================================================

const MIN_READINGS_PER_RUN = 2;

// Explicit device-reported reset signals (firmware event field), if present.
const RESET_EVENT_TYPES = new Set(["BOOT", "RESET", "MANUAL_RESET", "POWER_ON"]);

// A drop of this ratio or more (e.g. 0.8 = 80%) is treated as a genuine
// counter reset even if it doesn't land exactly on 0/1.
const RESET_DROP_RATIO = 0.8;

// Counter must fall to <= this value to qualify as "restarted from 0/1".
const RESTART_COUNT_THRESHOLD = 1;

// A "restart to 0/1" is only trusted as a real reset if the PREVIOUS count
// was meaningfully large — protects against noise at the very start of a
// shift when counts are naturally still near 0.
const SIGNIFICANT_COUNT_FLOOR = 5;

// Any drop this small (absolute) is sensor/network noise, never a reset.
// e.g. 233 -> 232 -> 234
const SMALL_FLUCTUATION_ABS = 5;

// Any drop below this ratio of the previous count is also noise.
const SMALL_FLUCTUATION_RATIO = 0.02;

// Clock-jitter tolerance (seconds) before a lower timestamp is treated as
// a genuinely out-of-order / delayed packet rather than normal jitter.
const OUT_OF_ORDER_TOLERANCE_SECONDS = 5;

// ============================================================================
// 3. HISTORY / RUN-DETECTION HELPERS
// ============================================================================

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

// Requirement 3: explicit reset event reported by firmware
const isExplicitResetEvent = (item) => {
  const eventValue = item?.event ?? item?.Event ?? item?.eventType ?? item?.EventType ?? null;
  if (!eventValue) return false;
  return RESET_EVENT_TYPES.has(String(eventValue).toUpperCase().trim());
};

// Requirement 4: bootId/runId change reported by firmware
const hasRunIdentifierChanged = (previous, current) => {
  const prevId = previous?.bootId ?? previous?.BootId ?? previous?.runId ?? previous?.RunId ?? null;
  const currId = current?.bootId ?? current?.BootId ?? current?.runId ?? current?.RunId ?? null;

  // If firmware doesn't send an identifier, this signal simply doesn't apply.
  if (prevId === null || currId === null) return false;
  return String(prevId) !== String(currId);
};

// ============================================================================
// RUN SPLITTER — rewritten for real-world IoT reliability
// ============================================================================
// A "new run" is only created when a reset is VERIFIED via one of several
// independent signals. Duplicates, delayed/out-of-order packets, and small
// sensor noise are all absorbed WITHOUT splitting a run or corrupting output.
const splitIntoRuns = (rawData) => {
  const runs = [];
  if (!Array.isArray(rawData) || rawData.length === 0) return runs;

  // Step 1: drop records with no usable numeric Count.
  const sanitized = rawData.filter((item) => !Number.isNaN(Number(item.Count)));
  if (sanitized.length === 0) return runs;

  // Step 2: defensive re-sort by timestamp. Never trust that upstream data
  // arrived in order — network delay can reorder packets before they reach
  // Firebase, and this must never be misread as a reset.
  const data = [...sanitized].sort((a, b) => {
    const tA = Number(a.timestamp) || 0;
    const tB = Number(b.timestamp) || 0;
    return tA - tB;
  });

  const runsBuffer = [];
  let currentRun = [data[0]];
  let lastValid = data[0]; // last reading actually accepted into the current run

  for (let i = 1; i < data.length; i++) {
    const candidate = data[i];
    const prevCount = Number(lastValid.Count);
    const currCount = Number(candidate.Count);

    // --- Guard A: Duplicate packet (Requirement 7) ---------------------
    if (currCount === prevCount) {
      continue;
    }

    // --- Guard B: Out-of-order / delayed packet (Requirement 6, 8) -----
    const lastTs = Number(lastValid.timestamp);
    const candidateTs = Number(candidate.timestamp);
    if (!Number.isNaN(lastTs) && !Number.isNaN(candidateTs) && candidateTs < lastTs - OUT_OF_ORDER_TOLERANCE_SECONDS) {
      continue;
    }

    // --- Guard C: Small fluctuation / noise (Requirement 5) -------------
    if (currCount < prevCount) {
      const drop = prevCount - currCount;
      const dropRatio = prevCount > 0 ? drop / prevCount : 0;
      const isSmallFluctuation = drop <= SMALL_FLUCTUATION_ABS || dropRatio < SMALL_FLUCTUATION_RATIO;

      if (isSmallFluctuation) {
        continue;
      }
    }

    // --- Strong signals: these override count math entirely -----------
    const explicitReset = isExplicitResetEvent(candidate); // Requirement 3
    const bootIdChanged = hasRunIdentifierChanged(lastValid, candidate); // Requirement 4

    // --- Guard D: verified reset decision (Requirements 1, 2, 9) --------
    let isRealReset = false;

    if (explicitReset || bootIdChanged) {
      isRealReset = true;
    } else if (currCount <= RESTART_COUNT_THRESHOLD && prevCount > SIGNIFICANT_COUNT_FLOOR) {
      isRealReset = true;
    } else if (currCount < prevCount) {
      const drop = prevCount - currCount;
      const dropRatio = prevCount > 0 ? drop / prevCount : 0;
      if (dropRatio >= RESET_DROP_RATIO) {
        isRealReset = true;
      }
    }

    if (isRealReset) {
      if (currentRun.length >= MIN_READINGS_PER_RUN) {
        runsBuffer.push(currentRun);
      }
      currentRun = [candidate];
      lastValid = candidate;
      continue;
    }

    // --- Default: normal continuing production --------------------------
    currentRun.push(candidate);
    lastValid = candidate;
  }

  if (currentRun.length >= MIN_READINGS_PER_RUN) {
    runsBuffer.push(currentRun);
  }

  return runsBuffer;
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

// Core Metrics Calculator (combined totals + per-run breakdown)
const calculateProductionMetrics = (historyToday, shiftStartTime, shiftEndTime) => {
  if (!historyToday || historyToday.length === 0) {
    return { totalOutput: 0, hourlyData: [], firstTime: null, runs: [] };
  }

  const firstRecord = historyToday[0];
  const firstTimeStr = firstRecord?.Time || null;

  const runs = splitIntoRuns(historyToday);
  const { buckets, shiftStartMinutes } = generateShiftHourBuckets(shiftStartTime, shiftEndTime);

  let totalOutput = 0;
  const runResults = [];

  runs.forEach((run, runIndex) => {
    const runBuckets = buckets.map((b) => ({ ...b, output: 0 }));
    let runTotalOutput = 0;

    for (let i = 1; i < run.length; i++) {
      const prev = Number(run[i - 1].Count);
      const curr = Number(run[i].Count);

      if (Number.isNaN(prev) || Number.isNaN(curr)) continue;

      const delta = curr - prev;
      if (delta <= 0) continue; // Safety net: never credit negative/zero output

      if (!run[i].Time || !run[i].Time.includes(" ")) continue;

      totalOutput += delta;
      runTotalOutput += delta;

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

      const runTargetBucket = runBuckets.find((b) => recordMinsOfDay >= b.startMinutes && recordMinsOfDay < b.endMinutes);
      if (runTargetBucket) {
        runTargetBucket.output += delta;
      }
    }

    const firstInRun = run[0];
    const lastInRun = run[run.length - 1];
    const extractHM = (item) => (item?.Time && item.Time.includes(" ") ? item.Time.split(" ")[1].slice(0, 5) : null);

    runResults.push({
      runNo: runIndex + 1,
      startTime: extractHM(firstInRun) || "—",
      endTime: extractHM(lastInRun) || "—",
      totalOutput: runTotalOutput,
      hourlyData: runBuckets.map((b) => ({ hour: b.label, output: b.output })),
    });
  });

  const hourlyData = buckets.map((b) => ({
    hour: b.label,
    output: b.output,
  }));

  return { totalOutput, hourlyData, firstTime: firstTimeStr, runs: runResults };
};

// ============================================================================
// 4. GENERAL DATA CONTROLLERS
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
// 5. MACHINE DATA & METRICS CONTROLLERS
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

// Target is Line Configuration data -> sourced from MongoDB (source of truth)
export const getMachineLiveMetrics = async (req, res) => {
  try {
    const { machineId } = req.params;
    const statusSnapshot = await get(ref(rtdb, `Machines/${machineId}/LiveStatus/Count`));
    const current = statusSnapshot.exists() ? statusSnapshot.val() : 0;

    const line = await Line.findOne({ machineId }).lean();
    const target = line?.dailyTarget || 0;

    res.status(200).json({
      success: true,
      data: { current, target },
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
      return res.status(200).json({ success: true, hourlyData: [], totalOutput: 0, firstTime: null, runs: [] });
    }

    const historyToday = getHistoryForDate(Object.values(snapshot.val()), selectedDate);
    const metrics = calculateProductionMetrics(historyToday, shiftStartTime, shiftEndTime);

    return res.status(200).json({
      success: true,
      totalOutput: metrics.totalOutput,
      firstTime: metrics.firstTime,
      hourlyData: metrics.hourlyData,
      runs: metrics.runs,
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
      return res.status(200).json({ success: true, hourlyData: [], totalOutput: 0, firstTime: null, runs: [] });
    }

    const historyToday = getHistoryForDate(Object.values(snapshot.val()), selectedDate);
    const metrics = calculateProductionMetrics(historyToday, shiftStartTime, shiftEndTime);

    return res.status(200).json({
      success: true,
      totalOutput: metrics.totalOutput,
      firstTime: metrics.firstTime,
      hourlyData: metrics.hourlyData,
      runs: metrics.runs,
    });
  } catch (error) {
    Notifier.toAdmin("Firebase Error", `Hourly Production Data Error [${machineId}]: ${error.message}`, "CRITICAL_ERROR");
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Assigned machines check -> MongoDB (source of truth for Line assignment)
export const getFreeCounterMachines = async (req, res) => {
  try {
    const machineSnapshot = await get(ref(rtdb, "Machines"));
    const machines = machineSnapshot.val() || {};

    const assignedLines = await Line.find({}, "machineId").lean();
    const assignedMachines = new Set(assignedLines.map((l) => l.machineId).filter(Boolean));

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
// 6. GAP ANALYSIS CONTROLLER
// ============================================================================

// Line configuration (shiftStartTime/shiftEndTime/dailyTarget) -> MongoDB
export const getCombinedProductionGaps = async (req, res) => {
  const { date, lineId, machineId: queryMachineId } = req.query;
  let targetMachineId = queryMachineId;
  let lineData = {};

  try {
    if (lineId) {
      const line = await Line.findOne({ lineId }).lean();
      if (!line) {
        return res.status(404).json({ success: false, message: "Line not found" });
      }
      lineData = line;
      targetMachineId = line.machineId;

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

    const startTime = lineData.shiftStartTime || "08:30";
    const endTime = lineData.shiftEndTime || "20:30";
    const dailyTarget = Number(lineData.dailyTarget || 0);

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
// 7. LIVE DATA & HEALTH ROUTES
// ============================================================================

// Line details (target/product/shift times/machineId) -> MongoDB.
// Firebase is used ONLY for the real-time Count.
export const getLiveDataByLineId = async (req, res) => {
  try {
    const { lineId } = req.params;

    const line = await Line.findOne({ lineId }).lean();

    if (!line) {
      return res.status(404).json({ success: false, message: "Line not found" });
    }

    const machineId = line.machineId;

    if (!machineId) {
      return res.status(404).json({ success: false, message: "No machine assigned to this line" });
    }

    const statusSnapshot = await get(ref(rtdb, `Machines/${machineId}/LiveStatus/Count`));
    const count = statusSnapshot.exists() ? statusSnapshot.val() : 0;

    return res.status(200).json({
      success: true,
      count,
      target: line.dailyTarget || 0,
      productCode: line.productCode || "—",
      startTime: line.shiftStartTime || "—",
      endTime: line.shiftEndTime || "—",
      machineId,
    });
  } catch (error) {
    console.error("Error fetching line live data:", error);
    Notifier.toAdmin("Firebase Error", `Live Data Error [${req.params?.lineId}]: ${error.message}`, "IOT_ERROR");
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ✅ FIX: Now also returns each machine's LIVE COUNT (not just Health).
// The Superuser/Supervisor dashboards need this to fill in totalProductCount,
// since previously only Health was returned and Count was never merged in,
// causing "Total Products", the Output bars, and per-line progress to show 0.
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
      const liveCount = Number(machineData?.LiveStatus?.Count ?? 0);

      // Previously this skipped machines with no Health node entirely,
      // meaning their live count never reached the frontend either.
      statusData.push({
        machineId,
        ...(machineData.Health || {}),
        liveCount,
      });
    }

    return res.status(200).json({ success: true, data: statusData });
  } catch (error) {
    console.error("Error fetching machine status:", error);
    Notifier.toAdmin("Firebase Error", `Machine Health Status Error: ${error.message}`, "IOT_ERROR");
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};
