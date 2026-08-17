import { get, ref, remove, update } from "firebase/database";
import { rtdb } from "../database.js";
import jwt from "jsonwebtoken";
import { Notifier } from "../utils/Notifier.js";
import { Line } from "../models/Line.js";
import { InjectionMachine } from "../models/InjectionMachine.js";

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
const RESET_EVENT_TYPES = new Set(["BOOT", "RESET", "MANUAL_RESET", "POWER_ON"]);
const RESET_DROP_RATIO = 0.8;
const RESTART_COUNT_THRESHOLD = 1;
const SIGNIFICANT_COUNT_FLOOR = 5;
const SMALL_FLUCTUATION_ABS = 5;
const SMALL_FLUCTUATION_RATIO = 0.02;
const OUT_OF_ORDER_TOLERANCE_SECONDS = 5;

// ============================================================================
// 3. HISTORY / RUN-DETECTION HELPERS (🔥 FIXED FOR OVERNIGHT SHIFTS)
// ============================================================================

// යම් වෙලාවක් shift එක ආරම්භ වූ දිනය කුමක්දැයි නිවැරදිව සොයා ගනී
const getLogicalShiftDate = (selectedDate, startTime, endTime) => {
  if (selectedDate) return selectedDate;

  const now = new Date();
  const [sh, sm] = (startTime || "00:00").split(":").map(Number);
  const [eh, em] = (endTime || "23:59").split(":").map(Number);
  const isOvernight = sh * 60 + sm > eh * 60 + em;

  const shiftStartTimeToday = new Date(now);
  shiftStartTimeToday.setHours(sh, sm, 0, 0);

  // Overnight shift එකක් වී, දැනට වෙලාව උදේ පාන්දර නම් (shift එක ඉවර වෙන්න කලින්),
  // එය අයිති වන්නේ ඊයේ දවසේ shift එකටයි.
  if (isOvernight && now < shiftStartTimeToday && now.getHours() < eh) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  }

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

// දින දෙකක් අතර පැතිරෙන (Cross-midnight) Shift එකක් වුවත් සම්පූර්ණ දත්ත පරාසයම ලබා ගනී
const getShiftHistory = (history, logicalDateStr, startTimeStr, endTimeStr) => {
  if (!history || !Array.isArray(history)) return [];

  const [startH, startM] = (startTimeStr || "00:00").split(":").map(Number);
  const [endH, endM] = (endTimeStr || "23:59").split(":").map(Number);
  const isOvernight = startH * 60 + startM >= endH * 60 + endM;

  const shiftStart = new Date(`${logicalDateStr}T${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}:00`);
  const shiftEnd = new Date(`${logicalDateStr}T${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00`);

  if (isOvernight) {
    shiftEnd.setDate(shiftEnd.getDate() + 1); // ඊළඟ දවසට දික් කිරීම
  }

  return history
    .filter((item) => {
      if (!item.Time) return false;
      const itemDate = new Date(item.Time.replace(/\//g, "-"));
      return itemDate >= shiftStart && itemDate <= shiftEnd;
    })
    .sort((a, b) => {
      const tA = Number(a.timestamp) || new Date(a.Time.replace(/\//g, "-")).getTime();
      const tB = Number(b.timestamp) || new Date(b.Time.replace(/\//g, "-")).getTime();
      return tA - tB;
    });
};

const isExplicitResetEvent = (item) => {
  const eventValue = item?.event ?? item?.Event ?? item?.eventType ?? item?.EventType ?? null;
  if (!eventValue) return false;
  return RESET_EVENT_TYPES.has(String(eventValue).toUpperCase().trim());
};

const hasRunIdentifierChanged = (previous, current) => {
  const prevId = previous?.bootId ?? previous?.BootId ?? previous?.runId ?? previous?.RunId ?? null;
  const currId = current?.bootId ?? current?.BootId ?? current?.runId ?? current?.RunId ?? null;
  if (prevId === null || currId === null) return false;
  return String(prevId) !== String(currId);
};

const splitIntoRuns = (rawData) => {
  const runs = [];
  if (!Array.isArray(rawData) || rawData.length === 0) return runs;

  const sanitized = rawData.filter((item) => !Number.isNaN(Number(item.Count)));
  if (sanitized.length === 0) return runs;

  const data = [...sanitized].sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));

  const runsBuffer = [];
  let currentRun = [data[0]];
  let lastValid = data[0];

  for (let i = 1; i < data.length; i++) {
    const candidate = data[i];
    const prevCount = Number(lastValid.Count);
    const currCount = Number(candidate.Count);

    if (currCount === prevCount) continue;

    const lastTs = Number(lastValid.timestamp);
    const candidateTs = Number(candidate.timestamp);
    if (!Number.isNaN(lastTs) && !Number.isNaN(candidateTs) && candidateTs < lastTs - OUT_OF_ORDER_TOLERANCE_SECONDS) {
      continue;
    }

    if (currCount < prevCount) {
      const drop = prevCount - currCount;
      const dropRatio = prevCount > 0 ? drop / prevCount : 0;
      if (drop <= SMALL_FLUCTUATION_ABS || dropRatio < SMALL_FLUCTUATION_RATIO) continue;
    }

    const explicitReset = isExplicitResetEvent(candidate);
    const bootIdChanged = hasRunIdentifierChanged(lastValid, candidate);

    let isRealReset = false;
    if (explicitReset || bootIdChanged) {
      isRealReset = true;
    } else if (currCount <= RESTART_COUNT_THRESHOLD && prevCount > SIGNIFICANT_COUNT_FLOOR) {
      isRealReset = true;
    } else if (currCount < prevCount) {
      const drop = prevCount - currCount;
      const dropRatio = prevCount > 0 ? drop / prevCount : 0;
      if (dropRatio >= RESET_DROP_RATIO) isRealReset = true;
    }

    if (isRealReset) {
      if (currentRun.length >= MIN_READINGS_PER_RUN) {
        runsBuffer.push(currentRun);
      }
      currentRun = [candidate];
      lastValid = candidate;
      continue;
    }

    currentRun.push(candidate);
    lastValid = candidate;
  }

  if (currentRun.length >= MIN_READINGS_PER_RUN) {
    runsBuffer.push(currentRun);
  }

  return runsBuffer;
};

const generateShiftHourBuckets = (startTimeStr, endTimeStr) => {
  const start = startTimeStr || "00:00";
  const end = endTimeStr || "23:59";

  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);

  let startMinutes = startH * 60 + (Number.isNaN(startM) ? 0 : startM);
  let endMinutes = endH * 60 + (Number.isNaN(endM) ? 0 : endM);

  if (endMinutes <= startMinutes) endMinutes += 24 * 60;

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

const calculateProductionMetrics = (historyData, shiftStartTime, shiftEndTime, cavity = 1) => {
  if (!historyData || historyData.length === 0) {
    return { totalOutput: 0, hourlyData: [], firstTime: null, runs: [] };
  }

  const firstRecord = historyData[0];
  const firstTimeStr = firstRecord?.Time || null;

  const runs = splitIntoRuns(historyData);
  const { buckets, shiftStartMinutes } = generateShiftHourBuckets(shiftStartTime, shiftEndTime);

  let totalOutput = 0;
  const runResults = [];

  runs.forEach((run, runIndex) => {
    const runBuckets = buckets.map((b) => ({ ...b, output: 0 }));
    let runTotalOutput = 0;

    // 🔥 Noise වැළැක්වීම සඳහා අවසන් වරට පිළිගත් අගය (accepted value) භාවිත කිරීම
    let acceptedPrevCount = Number(run[0].Count);

    for (let i = 1; i < run.length; i++) {
      const curr = Number(run[i].Count);
      if (Number.isNaN(curr)) continue;

      const delta = (curr - acceptedPrevCount) * cavity;
      if (delta <= 0) continue;

      acceptedPrevCount = curr; // අගය නිවැරදිව වැඩි වුනා නම් පමණක් update කරයි

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
      if (targetBucket) targetBucket.output += delta;

      const runTargetBucket = runBuckets.find((b) => recordMinsOfDay >= b.startMinutes && recordMinsOfDay < b.endMinutes);
      if (runTargetBucket) runTargetBucket.output += delta;
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
    if (!snapshot.exists()) return res.status(404).json({ success: false, message: "No data found" });
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
    Notifier.toAdmin("Firebase Error", `Failed to fetch Total Output: ${error.message}`, "IOT_ERROR");
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getMachineData = async (req, res) => {
  const { machineId } = req.params;
  try {
    const snapshot = await get(ref(rtdb, `Machines/${machineId}`));
    if (!snapshot.val()) return res.status(404).json({ success: false, message: "Machine not found" });
    res.status(200).json({ success: true, data: snapshot.val() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCounterHistory = async (req, res) => {
  try {
    const { machineId } = req.params;
    const snapshot = await get(ref(rtdb, `${machineId}/CounterHistory`));
    res.status(200).json({ success: true, data: snapshot.val() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMachineLiveMetrics = async (req, res) => {
  try {
    const { machineId } = req.params;
    const statusSnapshot = await get(ref(rtdb, `Machines/${machineId}/LiveStatus/Count`));
    const rawCount = statusSnapshot.exists() ? statusSnapshot.val() : 0;

    const injectionMachine = await InjectionMachine.findOne({ machineId }).lean();
    const line = await Line.findOne({ machineId }).lean();

    const cavity = injectionMachine?.cavities || line?.cavity || 1;
    const current = rawCount * cavity;
    const target = injectionMachine?.dailyTarget || line?.dailyTarget || 0;

    res.status(200).json({
      success: true,
      data: { current, target, cavity },
    });
  } catch (error) {
    Notifier.toAdmin("Firebase Error", `Live Metrics Fetch Error [${req.params?.machineId}]: ${error.message}`, "IOT_ERROR");
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getHourlyTableData = async (req, res) => {
  const { machineId } = req.params;
  const { date, shiftStartTime, shiftEndTime } = req.query;

  const logicalDate = getLogicalShiftDate(date, shiftStartTime, shiftEndTime);

  try {
    const snapshot = await get(ref(rtdb, `Machines/${machineId}/CounterHistory`));
    if (!snapshot.exists()) {
      return res.status(200).json({ success: true, hourlyData: [], totalOutput: 0, firstTime: null, runs: [] });
    }

    const injectionMachine = await InjectionMachine.findOne({ machineId }).lean();
    const line = await Line.findOne({ machineId }).lean();
    const cavity = injectionMachine?.cavities || line?.cavity || 1;

    // 🔥 යාවත්කාලීන කළ shift history function එක භාවිතය
    const historyData = getShiftHistory(Object.values(snapshot.val()), logicalDate, shiftStartTime, shiftEndTime);
    const metrics = calculateProductionMetrics(historyData, shiftStartTime, shiftEndTime, cavity);

    return res.status(200).json({
      success: true,
      totalOutput: metrics.totalOutput,
      firstTime: metrics.firstTime,
      hourlyData: metrics.hourlyData,
      runs: metrics.runs,
      cavityConfigured: cavity,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getHourlyProductionData = async (req, res) => {
  const { machineId } = req.params;
  const { date, shiftStartTime, shiftEndTime } = req.query;

  const logicalDate = getLogicalShiftDate(date, shiftStartTime, shiftEndTime);

  try {
    const snapshot = await get(ref(rtdb, `Machines/${machineId}/CounterHistory`));
    if (!snapshot.exists()) {
      return res.status(200).json({ success: true, hourlyData: [], totalOutput: 0, firstTime: null, runs: [] });
    }

    const injectionMachine = await InjectionMachine.findOne({ machineId }).lean();
    const line = await Line.findOne({ machineId }).lean();
    const cavity = injectionMachine?.cavities || line?.cavity || 1;

    // 🔥 යාවත්කාලීන කළ shift history function එක භාවිතය
    const historyData = getShiftHistory(Object.values(snapshot.val()), logicalDate, shiftStartTime, shiftEndTime);
    const metrics = calculateProductionMetrics(historyData, shiftStartTime, shiftEndTime, cavity);

    return res.status(200).json({
      success: true,
      totalOutput: metrics.totalOutput,
      firstTime: metrics.firstTime,
      hourlyData: metrics.hourlyData,
      runs: metrics.runs,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getFreeCounterMachines = async (req, res) => {
  try {
    const machineSnapshot = await get(ref(rtdb, "Machines"));
    const machines = machineSnapshot.val() || {};

    const assignedLines = await Line.find({}, "machineId").lean();
    const assignedInjections = await InjectionMachine.find({}, "machineId").lean();

    const assignedMachines = new Set([...assignedLines.map((l) => l.machineId).filter(Boolean), ...assignedInjections.map((im) => im.machineId).filter(Boolean)]);

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
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ============================================================================
// 6. GAP ANALYSIS CONTROLLER
// ============================================================================

export const getCombinedProductionGaps = async (req, res) => {
  const { date, lineId, machineId: queryMachineId } = req.query;
  let targetMachineId = queryMachineId;
  let lineData = {};

  try {
    if (lineId) {
      const line = await Line.findOne({ lineId }).lean();
      if (!line) return res.status(404).json({ success: false, message: "Line not found" });
      lineData = line;
      targetMachineId = line.machineId;

      if (!targetMachineId) return res.status(404).json({ success: false, message: "No machine assigned" });
    }

    if (!targetMachineId) return res.status(400).json({ success: false, message: "Please provide either lineId or machineId" });

    const historySnapshot = await get(ref(rtdb, `Machines/${targetMachineId}/CounterHistory`));
    if (!historySnapshot.exists()) return res.status(404).json({ success: false, message: "No CounterHistory found" });

    const injectionMachine = await InjectionMachine.findOne({ machineId: targetMachineId }).lean();
    const cavity = injectionMachine?.cavities || lineData?.cavity || 1;

    const startTime = lineData.shiftStartTime || injectionMachine?.shiftStartTime || "08:30";
    const endTime = lineData.shiftEndTime || injectionMachine?.shiftEndTime || "20:30";
    const dailyTarget = Number(lineData.dailyTarget || injectionMachine?.dailyTarget || 0);

    // 🔥 Gap Chart එක සඳහාද නිවැරදි shift date එක භාවිතා කිරීම
    const logicalDate = getLogicalShiftDate(date, startTime, endTime);
    const history = getShiftHistory(Object.values(historySnapshot.val()), logicalDate, startTime, endTime);

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
            count: current.Count * cavity,
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
      date: logicalDate,
      startTime,
      endTime,
      dailyTarget,
      averageGap: plannedAverageGap,
      data: gapData,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// 7. LIVE DATA & HEALTH ROUTES
// ============================================================================

export const getLiveDataByLineId = async (req, res) => {
  try {
    const { lineId } = req.params;
    const line = await Line.findOne({ lineId }).lean();
    if (!line) return res.status(404).json({ success: false, message: "Line not found" });

    const machineId = line.machineId;
    if (!machineId) return res.status(404).json({ success: false, message: "No machine assigned to this line" });

    const statusSnapshot = await get(ref(rtdb, `Machines/${machineId}/LiveStatus/Count`));
    const rawCount = statusSnapshot.exists() ? statusSnapshot.val() : 0;

    const cavity = line.cavity || 1;
    const count = rawCount * cavity;

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
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const getMachineStatus = async (req, res) => {
  try {
    const machinesRef = ref(rtdb, "Machines");
    const snapshot = await get(machinesRef);

    if (!snapshot.exists()) return res.status(200).json({ success: true, data: [] });

    const machines = snapshot.val();
    const statusData = [];

    for (const [machineId, machineData] of Object.entries(machines)) {
      const liveCount = Number(machineData?.LiveStatus?.Count ?? 0);
      statusData.push({
        machineId,
        ...(machineData.Health || {}),
        liveCount,
      });
    }

    return res.status(200).json({ success: true, data: statusData });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const deleteOldCounterHistory = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const machinesSnapshot = await get(ref(rtdb, "Machines"));
    if (!machinesSnapshot.exists()) return res.status(404).json({ success: false, message: "No machines found" });

    const machines = machinesSnapshot.val();
    let totalDeleted = 0;

    for (const machineId of Object.keys(machines)) {
      const historyRef = ref(rtdb, `Machines/${machineId}/CounterHistory`);
      const historySnapshot = await get(historyRef);

      if (!historySnapshot.exists()) continue;

      const history = historySnapshot.val();
      const updates = {};

      for (const [key, item] of Object.entries(history)) {
        if (!item.Time) continue;
        const recordDate = new Date(item.Time.replace(/\//g, "-"));
        recordDate.setHours(0, 0, 0, 0);

        if (recordDate < today) {
          updates[key] = null;
          totalDeleted++;
        }
      }

      if (Object.keys(updates).length > 0) {
        await update(historyRef, updates);
        console.log(`✅ ${machineId}: Deleted ${Object.keys(updates).length} records`);
      }
    }

    return res.status(200).json({
      success: true,
      deletedRecords: totalDeleted,
      message: "Old CounterHistory deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
