import { ref, get, update } from "firebase/database";
import { rtdb } from "../database.js";
import jwt from "jsonwebtoken";

// ==========================================
// 1. Helper Functions
// ==========================================

// Verify incoming JWT token
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
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllLines = async (req, res) => {
  try {
    console.log("👉 [DEBUG] GET /api/esp32/lines - Firebase එකෙන් දත්ත ගනිමින් පවතී...");

    const snapshot = await get(ref(rtdb, `Lines`));

    console.log("👉 [DEBUG] දත්ත සාර්ථකව ලබාගත්තා!");
    res.status(200).json({ success: true, data: snapshot.val() || {} });
  } catch (error) {
    console.error("🔥 [DEBUG - FATAL ERROR] getAllLines හි දෝෂයක්:");
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getLineById = async (req, res) => {
  try {
    const { lineId } = req.params;
    const snapshot = await get(ref(rtdb, `Lines/${lineId}`));

    if (!snapshot.exists()) {
      return res.status(404).json({ success: false, message: "Line not found" });
    }

    return res.status(200).json({ success: true, data: snapshot.val() });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 3. Line Management Controllers
// ==========================================

export const assignLine = async (req, res) => {
  const { lineId, machineId, productCode, dailyTarget, hourlyTarget, teamMembers, shift, supervisor, shiftStartTime, shiftEndTime, floor } = req.body;

  if (!lineId) {
    return res.status(400).json({ success: false, message: "Line ID is required" });
  }

  try {
    const lineRef = ref(rtdb, `Lines/${lineId}`);
    await update(lineRef, {
      machineId: machineId || "",
      productCode: productCode || "",
      dailyTarget: Number(dailyTarget) || 0,
      hourlyTarget: Number(hourlyTarget) || 0,
      plannedMembers: Number(teamMembers) || 0,
      shift: shift || "",
      supervisor: supervisor || "",
      shiftStartTime: shiftStartTime || "",
      shiftEndTime: shiftEndTime || "",
      floor: floor || "",
      assignedAt: new Date().toISOString(),
    });

    return res.status(200).json({ success: true, message: "Line assigned successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const removeAssignment = async (req, res) => {
  const user = getAuthUser(req);

  if (!user || (user.role !== "Admin" && user.role !== "Superuser")) {
    return res.status(403).json({
      success: false,
      message: "Access Denied: Only Admins and Superusers can remove line assignments.",
    });
  }

  const { lineId } = req.body;
  if (!lineId) {
    return res.status(400).json({ success: false, message: "Line ID is required." });
  }

  try {
    const lineRef = ref(rtdb, `Lines/${lineId}`);
    await update(lineRef, {
      machineId: "",
      productCode: "",
      dailyTarget: 0,
      hourlyTarget: 0,
      plannedMembers: 0,
      totalProductCount: 0,
      shift: "",
      supervisor: "",
      shiftStartTime: "",
      shiftEndTime: "",
      floor: "",
      assignedBy: "",
      assignedAt: "",
    });

    return res.status(200).json({ success: true, message: `Assignment for ${lineId} removed successfully.` });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to remove assignment." });
  }
};

export const updateLineDetails = async (req, res) => {
  const user = getAuthUser(req);
  const allowedRoles = ["Admin", "Superuser", "Supervisor"];

  if (!user || !allowedRoles.includes(user.role)) {
    return res.status(403).json({
      success: false,
      message: "Access Denied: Only Admins, Superusers, and Supervisors can update line details.",
    });
  }

  const { lineId, machineId, productCode, dailyTarget, hourlyTarget, teamMembers, shift, floor } = req.body;

  if (!lineId) {
    return res.status(400).json({ success: false, message: "Line ID is required." });
  }

  try {
    const lineRef = ref(rtdb, `Lines/${lineId}`);
    const snapshot = await get(lineRef);

    if (!snapshot.exists()) {
      return res.status(404).json({ success: false, message: "Line not found." });
    }

    const currentLineData = snapshot.val();

    if (user.role === "Supervisor" && currentLineData.supervisor !== user.name) {
      return res.status(403).json({
        success: false,
        message: "Access Denied: You can only update details of lines assigned to you.",
      });
    }

    await update(lineRef, {
      machineId: machineId !== undefined ? machineId : currentLineData.machineId,
      productCode: productCode !== undefined ? productCode : currentLineData.productCode,
      dailyTarget: dailyTarget !== undefined ? Number(dailyTarget) : currentLineData.dailyTarget,
      hourlyTarget: hourlyTarget !== undefined ? Number(hourlyTarget) : currentLineData.hourlyTarget,
      plannedMembers: teamMembers !== undefined ? Number(teamMembers) : currentLineData.plannedMembers,
      shift: shift !== undefined ? shift : currentLineData.shift,
      floor: floor !== undefined ? floor : currentLineData.floor,
      updatedBy: user.name,
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({ success: true, message: `Line ${lineId} details updated successfully.` });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to update line details." });
  }
};

// ==========================================
// 4. Machine Data & Metrics Controllers
// ==========================================

// 👈 අලුතින් එකතු කළ function එක (Dashboard එකේ 404 Error එක විසඳීමට)
export const getTotalOutput = async (req, res) => {
  try {
    const { machineId } = req.params;
    const snapshot = await get(ref(rtdb, `Machines/${machineId}/LiveStatus/Count`));

    const count = snapshot.exists() ? snapshot.val() : 0;

    return res.status(200).json({ success: true, totalOutput: count });
  } catch (error) {
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
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMachineStatus = async (req, res) => {
  try {
    const { machineId } = req.params;
    const snapshot = await get(ref(rtdb, `Machine_01/LiveStatus`));
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
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 5. Refactored / Combined Controllers
// ==========================================

export async function getHourlyProductionData(req, res) {
  const { machineId } = req.params;
  const { date } = req.query;

  const hours = [
    "08:00-09:00",
    "09:00-10:00",
    "10:00-11:00",
    "11:00-12:00",
    "12:00-13:00",
    "13:00-14:00",
    "14:00-15:00",
    "15:00-16:00",
    "16:00-17:00",
    "17:00-18:00",
    "18:00-19:00",
    "19:00-20:00",
    "20:00-21:00",
    "21:00-22:00",
    "22:00-23:00",
    "23:00-00:00",
    "00:00-01:00",
    "01:00-02:00",
    "02:00-03:00",
    "03:00-04:00",
    "04:00-05:00",
    "05:00-06:00",
    "06:00-07:00",
    "07:00-08:00",
  ];

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
      });
    }

    const history = Object.values(snapshot.val())
      .filter((item) => {
        if (!item.Time) return false;
        const itemDate = item.Time.split(" ")[0].replace(/\//g, "-");
        return itemDate === selectedDate;
      })
      .sort((a, b) => a.Time.localeCompare(b.Time));

    const lastCountsByHour = {};
    history.forEach((item) => {
      const timePart = item.Time.split(" ")[1];
      const hourStr = timePart.split(":")[0];
      lastCountsByHour[hourStr] = Number(item.Count || 0);
    });

    const chronologicalOutputs = {};
    let previousLastCount = 0;

    for (let i = 0; i < 24; i++) {
      const hourStr = String(i).padStart(2, "0");
      const nextHourStr = String((i + 1) % 24).padStart(2, "0");
      const range = `${hourStr}:00-${nextHourStr}:00`;

      if (lastCountsByHour[hourStr] !== undefined) {
        const currentLastCount = lastCountsByHour[hourStr];
        chronologicalOutputs[range] = currentLastCount >= previousLastCount ? currentLastCount - previousLastCount : currentLastCount;
        previousLastCount = currentLastCount;
      } else {
        chronologicalOutputs[range] = 0;
      }
    }

    const hourlyData = hours.map((range) => ({
      hour: range,
      output: chronologicalOutputs[range] || 0,
    }));

    const totalOutput = hourlyData.reduce((sum, item) => sum + item.output, 0);
    const currentHourNum = new Date().getHours();
    const currentRange = `${String(currentHourNum).padStart(2, "0")}:00-${String((currentHourNum + 1) % 24).padStart(2, "0")}:00`;
    const currentHourOutput = hourlyData.find((item) => item.hour === currentRange)?.output || 0;

    return res.status(200).json({
      success: true,
      machineId,
      date: selectedDate,
      totalOutput,
      currentHour: currentRange,
      currentHourOutput,
      hourlyData,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

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
    return res.status(500).json({ success: false, message: error.message });
  }
};
