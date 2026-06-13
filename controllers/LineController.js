import { ref, get, update, push } from "firebase/database";
import { rtdb } from "../database.js";
import jwt from "jsonwebtoken";

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

// 1. Assign Line
export const assignLine = async (req, res) => {
  const { lineId, machineId, productCode, dailyTarget, hourlyTarget, teamMembers, shift, supervisor, shiftStartTime, shiftEndTime, floor } = req.body;
  if (!lineId) return res.status(400).json({ success: false, message: "Line ID is required" });

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

    // Alert for Assignment
    await push(ref(rtdb, `Alerts`), {
      type: "info",
      message: `Line ${lineId} has been assigned to ${supervisor}.`,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({ success: true, message: "Line assigned successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Remove Assignment
export const removeAssignment = async (req, res) => {
  const user = getAuthUser(req);
  if (!user || (user.role !== "Admin" && user.role !== "Superuser")) {
    return res.status(403).json({ success: false, message: "Access Denied: Only Admins/Superusers." });
  }

  const { lineId } = req.body;
  if (!lineId) return res.status(400).json({ success: false, message: "Line ID is required." });

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

    await push(ref(rtdb, `Alerts`), {
      type: "warning",
      message: `Assignment for ${lineId} has been removed by ${user.name}.`,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({ success: true, message: `Assignment for ${lineId} removed successfully.` });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to remove assignment." });
  }
};

// 3. Update Line Details
export const updateLineDetails = async (req, res) => {
  const user = getAuthUser(req);
  const allowedRoles = ["Admin", "Superuser", "Supervisor"];

  if (!user || !allowedRoles.includes(user.role)) {
    return res.status(403).json({ success: false, message: "Access Denied." });
  }

  const { lineId, date, machineId, productCode, dailyTarget, hourlyTarget, teamMembers, shift, floor } = req.body;
  if (!lineId) return res.status(400).json({ success: false, message: "Line ID required." });

  try {
    const lineRef = ref(rtdb, `Lines/${lineId}`);
    const snapshot = await get(lineRef);
    if (!snapshot.exists()) return res.status(404).json({ success: false, message: "Line not found." });

    const currentLineData = snapshot.val();

    await update(lineRef, {
      machineId: machineId !== undefined ? machineId : currentLineData.machineId,
      productCode: productCode !== undefined ? productCode : currentLineData.productCode,
      dailyTarget: dailyTarget !== undefined ? Number(dailyTarget) : currentLineData.dailyTarget,
      hourlyTarget: hourlyTarget !== undefined ? Number(hourlyTarget) : currentLineData.hourlyTarget,
      plannedMembers: teamMembers !== undefined ? Number(teamMembers) : currentLineData.plannedMembers,
      shift: shift !== undefined ? shift : currentLineData.shift,
      floor: floor !== undefined ? floor : currentLineData.floor,
      plannedDate: date || currentLineData.plannedDate || new Date().toISOString().split("T")[0],
      updatedBy: user.name,
      updatedAt: new Date().toISOString(),
    });

    // Alert for Update
    await push(ref(rtdb, `Alerts`), {
      type: "info",
      message: `Line ${lineId} was updated by ${user.name}.`,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({ success: true, message: "Line updated successfully." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
