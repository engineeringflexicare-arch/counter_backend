import { get, ref } from "firebase/database";
import { rtdb } from "../database.js";
import { Line } from "../models/Line.js";
import { LineHistory } from "../models/LineHistory.js";
import { AuditLog } from "../models/AuditLog.js";
import { Notification } from "../models/Notification.js";
import Configuration from "../models/Configuration.js";
import { Notifier } from "../utils/Notifier.js";
import jwt from "jsonwebtoken"; // ✅ අනිවාර්යයෙන්ම මෙය තිබිය යුතුය

// ============================================================================
// Permission Helpers (✅ BUG FIX: Robust Role & Token Checking)
// ============================================================================

// Frontend එකෙන් එන Token එක කියවා User ව හඳුනාගැනීම (Middleware එකක් නැති වුවහොත්)
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

// 1. Admin සහ Superuser සඳහා පමණි (මැෂින් සවි කිරීමට/ගැලවීමට)
const canEdit = (req, res) => {
  const user = req.user || getAuthUser(req);

  if (user) {
    // JWT එකේ role, userRole, type යන ඕනෑම නමකින් role එක ආවත් හඳුනාගැනීමට
    const roleStr = String(user.role || user.userRole || user.type || "").toLowerCase();

    if (["admin", "superuser"].includes(roleStr)) {
      req.user = user;
      return true;
    }
  }

  res.status(403).json({
    success: false,
    message: "Access denied. Requires Admin or Superuser privileges.",
  });
  return false;
};

// 2. Admin, Superuser සහ Supervisor යන තිදෙනාටම (දත්ත සංස්කරණයට පමණක්)
const canUpdateLine = (req, res) => {
  const user = req.user || getAuthUser(req);

  if (user) {
    const roleStr = String(user.role || user.userRole || user.type || "").toLowerCase();

    // supervisor ටත් මෙතැනදී අවසර හිමිවේ
    if (["admin", "superuser", "supervisor"].includes(roleStr)) {
      req.user = user;
      return true;
    }
  }

  res.status(403).json({
    success: false,
    message: "Access denied. Requires Admin, Superuser, or Supervisor privileges.",
  });
  return false;
};

// ============================================================================
// 1. GET ALL LINES
// ============================================================================
export const getAllLines = async (req, res) => {
  try {
    const lines = await Line.find().sort({ lineId: 1 });
    return res.status(200).json({ success: true, count: lines.length, data: lines });
  } catch (error) {
    Notifier.toAdmin("System Error", `Get All Lines Error: ${error.message}`, "CRITICAL_ERROR");
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// 2. GET SINGLE LINE
// ============================================================================
export const getLineById = async (req, res) => {
  try {
    const { lineId } = req.params;
    const line = await Line.findOne({ lineId: lineId });

    if (!line) return res.status(404).json({ success: false, message: "Line not found" });
    return res.status(200).json({ success: true, data: line });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// 3. GET AVAILABLE MACHINES
// ============================================================================
export const getAvailableMachines = async (req, res) => {
  try {
    const configs = await Configuration.find();
    const assignedLines = await Line.find();
    const assignedMachines = assignedLines.map((line) => line.machineId).filter(Boolean);

    const machines = configs.filter((config) => !assignedMachines.includes(config.device_id)).map((config) => ({ machineId: config.device_id }));

    return res.status(200).json({ success: true, data: machines });
  } catch (error) {
    console.error("GET MACHINES ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// 4. ASSIGN LINE (Admin / Superuser පමණි)
// ============================================================================
export const assignLine = async (req, res) => {
  if (!canEdit(req, res)) return;

  try {
    const { lineId, machineId, productCode, dailyTarget, hourlyTarget, teamMembers, shift, supervisor, shiftStartTime, shiftEndTime, floor } = req.body;
    const userName = req.user?.name || "System";

    if (!lineId || !machineId) {
      return res.status(400).json({ success: false, message: "Line ID and Machine ID are required" });
    }

    const updateData = {
      machineId,
      productCode: productCode || "",
      dailyTarget: Number(dailyTarget) || 0,
      hourlyTarget: Number(hourlyTarget) || 0,
      plannedMembers: Number(teamMembers) || 0,
      shift: shift || "",
      supervisor: supervisor || "",
      shiftStartTime: shiftStartTime || "",
      shiftEndTime: shiftEndTime || "",
      floor: floor || "",
      assignedBy: userName,
      updatedBy: userName,
    };

    let line = await Line.findOne({ lineId });
    let oldData = null;
    let action = "LINE_ASSIGNED";

    if (line) {
      oldData = line.toObject();
      Object.assign(line, updateData);
      action = "LINE_REASSIGNED";
    } else {
      line = new Line({ lineId, ...updateData });
    }

    await line.save();

    await AuditLog.create({
      action,
      entity: "Line",
      entityId: lineId,
      oldData,
      newData: updateData,
      changedBy: userName,
    });

    Notifier.toSuperuser("Line Assignment", `Line ${lineId} assigned to Machine ${machineId}`, "LINE_UPDATE", userName);
    Notifier.toSupervisor("New Line Assigned", `Machine ${machineId} is now assigned to Line ${lineId}`, "LINE_UPDATE", userName);

    return res.status(200).json({ success: true, message: "Line assigned successfully", data: line });
  } catch (error) {
    console.error("ASSIGN LINE ERROR:", error);
    Notifier.toAdmin("System Error", `Assign Line Error [${req.body?.lineId}]: ${error.message}`, "CRITICAL_ERROR", req.user?.name);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// 5. REMOVE ASSIGNMENT (Admin / Superuser පමණි)
// ============================================================================
export const removeAssignment = async (req, res) => {
  if (!canEdit(req, res)) return;

  try {
    const { lineId } = req.body;
    if (!lineId) return res.status(400).json({ success: false, message: "Line ID required" });

    const line = await Line.findOne({ lineId });
    if (!line) return res.status(404).json({ success: false, message: "Line not found" });

    const oldData = line.toObject();
    const oldMachineId = line.machineId;

    Object.assign(line, {
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
    });

    await line.save();

    await AuditLog.create({
      action: "LINE_CLEARED",
      entity: "Line",
      entityId: lineId,
      oldData,
      newData: line,
      changedBy: req.user?.name || "System",
    });

    Notifier.toSuperuser("Assignment Cleared", `Machine ${oldMachineId} removed from Line ${lineId}`, "LINE_UPDATE", req.user?.name);
    Notifier.toSupervisor("Assignment Cleared", `Line ${lineId} is now unassigned`, "LINE_UPDATE", req.user?.name);

    return res.status(200).json({ success: true, message: "Assignment removed successfully" });
  } catch (error) {
    Notifier.toAdmin("System Error", `Remove Assignment Error: ${error.message}`, "CRITICAL_ERROR", req.user?.name);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// 6. UPDATE LINE DETAILS (Supervisor ටත් අදාළ වේ)
// ============================================================================
export const updateLineDetails = async (req, res) => {
  // ✅ FIX: මෙහි canUpdateLine භාවිතා වේ
  if (!canUpdateLine(req, res)) return;

  try {
    const { lineId, machineId, productCode, dailyTarget, hourlyTarget, teamMembers, shift, floor, supervisor, plannedDate, shiftStartTime, shiftEndTime } = req.body;

    const line = await Line.findOne({ lineId });
    if (!line) return res.status(404).json({ success: false, message: "Line not found" });

    const oldData = line.toObject();

    Object.assign(line, {
      machineId: machineId ?? line.machineId,
      productCode: productCode ?? line.productCode,
      dailyTarget: dailyTarget ?? line.dailyTarget,
      hourlyTarget: hourlyTarget ?? line.hourlyTarget,
      plannedMembers: teamMembers ?? line.plannedMembers,
      shift: shift ?? line.shift,
      floor: floor ?? line.floor,
      supervisor: supervisor ?? line.supervisor,
      plannedDate: plannedDate ?? line.plannedDate,
      shiftStartTime: shiftStartTime ?? line.shiftStartTime,
      shiftEndTime: shiftEndTime ?? line.shiftEndTime,
    });

    await line.save();

    const historyDate = plannedDate || new Date().toISOString().split("T")[0];

    const lineObj = line.toObject();
    delete lineObj._id;
    delete lineObj.__v;

    if (LineHistory) {
      await LineHistory.findOneAndUpdate({ lineId, historyDate }, { ...lineObj, historyDate }, { upsert: true, new: true });
    }

    await AuditLog.create({
      action: "LINE_UPDATE",
      entity: "Line",
      entityId: lineId,
      oldData,
      newData: lineObj,
      changedBy: req.user?.name || "System",
    });

    Notifier.toSuperuser("Line Updated", `Details for Line ${lineId} were updated`, "LINE_UPDATE", req.user?.name);
    Notifier.toSupervisor("Line Updated", `Line ${lineId} production targets updated`, "LINE_UPDATE", req.user?.name);

    return res.status(200).json({ success: true, message: "Line updated successfully" });
  } catch (error) {
    console.error("UPDATE LINE ERROR:", error);
    Notifier.toAdmin("System Error", `Update Line Error [${req.body?.lineId}]: ${error.message}`, "CRITICAL_ERROR", req.user?.name);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// 7. GET LIVE DATA BY LINE ID
// ============================================================================
export const getLiveDataByLineId = async (req, res) => {
  try {
    const { lineId } = req.params;
    const lineSnapshot = await get(ref(rtdb, `Lines/${lineId}`));

    if (!lineSnapshot.exists()) {
      return res.status(404).json({ success: false, message: "Line not found in live database" });
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
    Notifier.toAdmin("System Error", `Live Data Fetch Error [${req.params?.lineId}]: ${error.message}`, "IOT_ERROR");
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ============================================================================
// 8. GET COMBINED PRODUCTION GAPS
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
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

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
    Notifier.toAdmin("System Error", `Production Gaps Calc Error: ${error.message}`, "CRITICAL_ERROR");
    return res.status(500).json({ success: false, message: error.message });
  }
};
