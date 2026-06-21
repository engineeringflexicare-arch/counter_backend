import { get, ref } from "firebase/database";
import { rtdb } from "../database.js";
import jwt from "jsonwebtoken";

// 🔔 අලුත් Notifier එක Import කරගැනීම
import { Notifier } from "../utils/Notifier.js";

// ==========================================
// 1. Helper Functions
// ==========================================

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

const generateShiftHourBuckets = (startTime, endTime) => {
  const [startHour, startMinute] = (startTime || "08:00").split(":").map(Number);
  const [endHour, endMinute] = (endTime || "16:00").split(":").map(Number);

  let startMinutes = startHour * 60 + startMinute;
  let endMinutes = endHour * 60 + endMinute;

  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  const buckets = [];
  let cursor = startMinutes;

  while (cursor < endMinutes) {
    const next = cursor + 60;
    const fmt = (mins) => {
      const wrapped = ((mins % 1440) + 1440) % 1440;
      return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
    };

    buckets.push({
      label: `${fmt(cursor)}-${fmt(next)}`,
      startMinutes: cursor,
      endMinutes: next,
    });

    cursor = next;
  }

  return buckets;
};

const timeToMinutesOfDay = (timeStr, dayOffsetMinutes = 0) => {
  const timePart = timeStr.split(" ")[1];
  const [h, m] = timePart.split(":").map(Number);
  return h * 60 + m + dayOffsetMinutes;
};

const findBucketLabel = (buckets, minutesOfDay, shiftStartMinutes) => {
  let adjusted = minutesOfDay;
  if (adjusted < shiftStartMinutes) {
    adjusted += 24 * 60;
  }

  const bucket = buckets.find((b) => adjusted >= b.startMinutes && adjusted < b.endMinutes);
  return bucket ? bucket.label : null;
};

const MIN_READINGS_PER_RUN = 2;

const splitIntoRuns = (history) => {
  const rawRuns = [];
  let currentRun = [];

  for (let i = 0; i < history.length; i++) {
    const current = history[i];
    const previous = history[i - 1];

    if (previous && Number(current.Count) < Number(previous.Count)) {
      if (currentRun.length > 0) rawRuns.push(currentRun);
      currentRun = [];
    }

    currentRun.push(current);
  }

  if (currentRun.length > 0) rawRuns.push(currentRun);
  return rawRuns.filter((run) => run.length >= MIN_READINGS_PER_RUN);
};

const getRunOutput = (run) => {
  const counts = run.map((item) => Number(item.Count));
  return Math.max(...counts) - Math.min(...counts);
};

const getRunHourlyData = (run, buckets, shiftStartMinutes) => {
  const outputs = {};
  buckets.forEach((b) => {
    outputs[b.label] = 0;
  });

  for (let i = 1; i < run.length; i++) {
    const item = run[i];
    const prevItem = run[i - 1];

    const currentCount = Number(item.Count);
    const previousCount = Number(prevItem.Count);
    const delta = currentCount - previousCount;

    if (delta <= 0) continue;

    const minutesOfDay = timeToMinutesOfDay(item.Time);
    const label = findBucketLabel(buckets, minutesOfDay, shiftStartMinutes);

    if (label && outputs[label] !== undefined) {
      outputs[label] += delta;
    }
  }

  return buckets.map((b) => ({ hour: b.label, output: outputs[b.label] || 0 }));
};

// ==========================================
// 2. General Data Controllers
// ==========================================

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

// ==========================================
// 4. Machine Data & Metrics Controllers
// ==========================================

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

export const getHourlyTableData = async (req, res) => {
  const { machineId } = req.params;

  try {
    const snapshot = await get(ref(rtdb, `Machines/${machineId}/CounterHistory`));
    if (!snapshot.exists()) return res.status(200).json({ success: true, hourlyData: [], totalOutput: 0, firstTime: null });

    const history = Object.values(snapshot.val());
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const historyToday = history.filter((item) => item.Time && item.Time.startsWith(todayStr.replace(/-/g, "/"))).sort((a, b) => new Date(a.Time).getTime() - new Date(b.Time).getTime());

    if (historyToday.length === 0) return res.status(200).json({ success: true, hourlyData: [], totalOutput: 0 });

    const firstRecord = historyToday[0];
    const firstDate = new Date(firstRecord.Time);
    const startHour = firstDate.getHours();

    const hourlyData = [];
    let previousCount = 0;

    for (let i = 0; i < 12; i++) {
      const targetHour = (startHour + i) % 24;
      const hourRecords = historyToday.filter((item) => new Date(item.Time).getHours() === targetHour);

      const lastCount = hourRecords.length > 0 ? Number(hourRecords[hourRecords.length - 1].Count) : previousCount;
      const output = lastCount >= previousCount ? lastCount - previousCount : lastCount;

      hourlyData.push({
        hour: `${String(targetHour).padStart(2, "0")}:00`,
        output: output,
      });
      previousCount = lastCount;
    }

    res.status(200).json({
      success: true,
      totalOutput: historyToday[historyToday.length - 1].Count,
      firstTime: firstRecord.Time,
      hourlyData,
    });
  } catch (error) {
    Notifier.toAdmin("Firebase Error", `Hourly Table Data Error [${machineId}]: ${error.message}`, "CRITICAL_ERROR");
    res.status(500).json({ success: false, message: error.message });
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

export async function getCombinedProductionGaps(req, res) {
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
}

// ==========================================
// 6. Live Data Routes
// ==========================================

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

// ==========================================
// Phase 2: Machine Health Status
// ==========================================

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

const generateShiftSlots = (dateStr, startTimeStr, endTimeStr) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [startH, startM] = startTimeStr.split(":").map(Number);
  const [endH, endM] = endTimeStr.split(":").map(Number);

  const start = new Date(year, month - 1, day, startH, startM, 0);
  const end = new Date(year, month - 1, day, endH, endM, 0);

  if (end <= start) {
    end.setDate(end.getDate() + 1);
  }

  const slots = [];
  let current = new Date(start);

  const formatTime = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  while (current < end) {
    const next = new Date(current);
    next.setHours(next.getHours() + 1);

    slots.push({
      label: `${formatTime(current)}-${formatTime(next)}`,
      startTimestamp: Math.floor(current.getTime() / 1000),
      endTimestamp: Math.floor(next.getTime() / 1000),
    });

    current.setHours(current.getHours() + 1);
  }

  return {
    shiftSlots: slots,
    shiftStartTs: Math.floor(start.getTime() / 1000),
    shiftEndTs: Math.floor(end.getTime() / 1000),
  };
};

export async function getHourlyProductionData(req, res) {
  const { machineId } = req.params;
  const { date, shiftStartTime, shiftEndTime } = req.query;

  const startTime = shiftStartTime || "08:00";
  const endTime = shiftEndTime || "16:00";
  const dayBuckets = generateShiftHourBuckets(startTime, endTime);

  const [startH, startM] = startTime.split(":").map(Number);
  const dayStartMinutes = startH * 60 + startM;

  const hours = dayBuckets.map((b) => b.label);

  try {
    const snapshot = await get(ref(rtdb, `Machines/${machineId}/CounterHistory`));

    const selectedDate =
      date ||
      (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      })();

    if (!snapshot.exists()) {
      return res.status(200).json({
        success: true,
        machineId,
        date: selectedDate,
        totalOutput: 0,
        currentHour: "N/A",
        currentHourOutput: 0,
        hourlyData: hours.map((hour) => ({ hour, output: 0 })),
        runCount: 0,
        runs: [],
      });
    }

    const history = Object.values(snapshot.val())
      .filter((item) => {
        if (!item.Time) return false;
        const itemDate = item.Time.split(" ")[0].replace(/\//g, "-");
        return itemDate === selectedDate;
      })
      .sort((a, b) => a.Time.localeCompare(b.Time));

    const runs = splitIntoRuns(history);

    const chronologicalOutputs = {};
    hours.forEach((range) => {
      chronologicalOutputs[range] = 0;
    });

    runs.forEach((run) => {
      for (let i = 1; i < run.length; i++) {
        const item = run[i];
        const prevItem = run[i - 1];

        const currentCount = Number(item.Count);
        const previousCount = Number(prevItem.Count);
        const delta = currentCount - previousCount;

        if (delta <= 0) continue;

        const minutesOfDay = timeToMinutesOfDay(item.Time);
        const range = findBucketLabel(dayBuckets, minutesOfDay, dayStartMinutes);

        if (range && chronologicalOutputs[range] !== undefined) {
          chronologicalOutputs[range] += delta;
        }
      }
    });

    const hourlyData = hours.map((range) => ({
      hour: range,
      output: chronologicalOutputs[range] || 0,
    }));

    const totalOutput = runs.reduce((sum, run) => sum + getRunOutput(run), 0);

    const now = new Date();
    const nowMinutesOfDay = now.getHours() * 60 + now.getMinutes();
    const currentRange = findBucketLabel(dayBuckets, nowMinutesOfDay, dayStartMinutes) || "N/A";
    const currentHourOutput = hourlyData.find((item) => item.hour === currentRange)?.output || 0;

    return res.status(200).json({
      success: true,
      machineId,
      date: selectedDate,
      totalOutput,
      currentHour: currentRange,
      currentHourOutput,
      hourlyData,
      runCount: runs.length,
      runs: runs.map((run, index) => ({
        runNo: index + 1,
        startTime: run[0]?.Time,
        endTime: run[run.length - 1]?.Time,
        totalOutput: getRunOutput(run),
        hourlyData: getRunHourlyData(run, dayBuckets, dayStartMinutes),
      })),
    });
  } catch (error) {
    Notifier.toAdmin("Firebase Error", `Hourly Production Data Error: ${error.message}`, "CRITICAL_ERROR");
    return res.status(500).json({ success: false, message: error.message });
  }
}
