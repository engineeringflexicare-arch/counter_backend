import bcrypt from "bcrypt";
import { get, ref } from "firebase/database";
import { rtdb } from "../database.js";
import User from "../models/Users.js";
import Registration from "../models/Registration.js";
import { Line } from "../models/Line.js";
import { LineHistory } from "../models/LineHistory.js";
import { AuditLog } from "../models/AuditLog.js";

// අලුත් Notifier එක Import කරගන්න (පරණ Notification import එක ඉවත් කළා)
import { Notifier } from "../utils/Notifier.js";

// ==========================================
// User Management Re-Exports (From UserController)
// ==========================================
import { getPendingRegistrations, rejectRegistration, getUsers, blockUser, unblockUser, deleteUser } from "./UserController.js";

export { getPendingRegistrations, rejectRegistration, blockUser, unblockUser, deleteUser };

export const getAllUsers = getUsers;

// ==========================================
// Admin Check Middleware (Internal Helper)
// ==========================================
const isAdmin = (req, res) => {
  if (req.user && req.user.role === "Admin") return true;
  res.status(403).json({ success: false, message: "Access denied. Admin only." });
  return false;
};

// ==========================================
// Admin Specific Controllers with Authorization
// ==========================================

export const getDashboardStats = async (req, res) => {
  if (!isAdmin(req, res)) return;
  try {
    const totalUsers = await User.countDocuments();
    const machinesSnapshot = await get(ref(rtdb, "Machines"));
    const machineEntries = Object.entries(machinesSnapshot.val() || {});
    const machinesOnline = machineEntries.filter(([, m]) => (m.status || "").toLowerCase() === "online").length;
    res.status(200).json({ success: true, data: { totalUsers, machinesOnline, totalMachines: machineEntries.length } });
  } catch (error) {
    Notifier.toAdmin("System Error", `Dashboard Stats Error: ${error.message}`, "CRITICAL_ERROR", req.user?.name || "System");
    res.status(500).json({ success: false, message: error.message });
  }
};

export const approveRegistration = async (req, res) => {
  if (!isAdmin(req, res)) return;
  try {
    const { id } = req.params;
    const { role } = req.body;
    const reg = await Registration.findById(id);
    if (!reg) return res.status(404).json({ success: false, message: "Not found" });

    const hashedPassword = await bcrypt.hash("Flexicare@123", 10);
    const newUser = await User.create({
      FirstName: reg.firstName,
      LastName: reg.lastName,
      email: reg.email,
      password: hashedPassword,
      role: role || "Operator",
      EmployeeId: Math.floor(1000 + Math.random() * 9000).toString(),
    });

    await Registration.findByIdAndDelete(id);

    // Admin approve කළාම Superuser ලට දැනුම් දීම
    Notifier.toSuperuser("New User Approved", `${reg.firstName} was approved as a ${role || "Operator"}`, "USER_MANAGEMENT", req.user?.name);

    res.status(200).json({ success: true, data: newUser });
  } catch (error) {
    Notifier.toAdmin("System Error", `Approve Registration Error: ${error.message}`, "CRITICAL_ERROR", req.user?.name || "System");
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllLines = async (req, res) => {
  if (!isAdmin(req, res)) return;
  try {
    const lines = await Line.find();
    res.status(200).json({ success: true, data: lines });
  } catch (error) {
    Notifier.toAdmin("System Error", `Get All Lines Error: ${error.message}`, "CRITICAL_ERROR", req.user?.name || "System");
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAvailableMachines = async (req, res) => {
  if (!isAdmin(req, res)) return;
  try {
    const machineSnapshot = await get(ref(rtdb, "Machines"));
    const lineSnapshot = await get(ref(rtdb, "Lines"));

    const machines = machineSnapshot.val() || {};
    const lines = lineSnapshot.val() || {};

    const assignedMachines = new Set();

    Object.values(lines).forEach((line) => {
      if (line.machineId) {
        assignedMachines.add(line.machineId);
      }
    });

    const availableMachines = Object.entries(machines)
      .filter(([machineId]) => !assignedMachines.has(machineId))
      .map(([machineId, machine]) => ({
        machineId,
        machineName: machine.machineName || machineId,
        status: machine.status || "offline",
        machineState: machine.machineState || "idle",
      }));

    return res.status(200).json({
      success: true,
      count: availableMachines.length,
      data: availableMachines,
    });
  } catch (error) {
    Notifier.toAdmin("System Error", `Get Available Machines Error: ${error.message}`, "CRITICAL_ERROR", req.user?.name || "System");
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const assignLine = async (req, res) => {
  if (!isAdmin(req, res)) return;
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

    // අදාළ Supervisor ට සහ Superuser ට Notification යැවීම
    Notifier.toSuperuser("Line Assignment", `Line ${lineId} assigned to Machine ${machineId}`, "LINE_UPDATE", userName);
    Notifier.toSupervisor("New Line Assigned", `Machine ${machineId} is now assigned to Line ${lineId}`, "LINE_UPDATE", userName);

    return res.status(200).json({ success: true, message: "Line assigned successfully", data: line });
  } catch (error) {
    console.error("ASSIGN LINE ERROR:", error);
    Notifier.toAdmin("System Error", `Assign Line Error [${req.body?.lineId}]: ${error.message}`, "CRITICAL_ERROR", req.user?.name || "System");
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const removeAssignment = async (req, res) => {
  if (!isAdmin(req, res)) return;
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

    // Assignment අයින් කළාම දැනුම් දීම
    Notifier.toSuperuser("Assignment Cleared", `Machine ${oldMachineId} removed from Line ${lineId}`, "LINE_UPDATE", req.user?.name);
    Notifier.toSupervisor("Assignment Cleared", `Line ${lineId} is now unassigned`, "LINE_UPDATE", req.user?.name);

    return res.status(200).json({ success: true, message: "Assignment removed successfully" });
  } catch (error) {
    Notifier.toAdmin("System Error", `Remove Assignment Error: ${error.message}`, "CRITICAL_ERROR", req.user?.name || "System");
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateLineDetails = async (req, res) => {
  if (!isAdmin(req, res)) return;
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

    // Update එකක් කළාම දැනුම් දීම
    Notifier.toSuperuser("Line Updated", `Details for Line ${lineId} were updated`, "LINE_UPDATE", req.user?.name);
    Notifier.toSupervisor("Line Updated", `Line ${lineId} targets/details updated by Admin`, "LINE_UPDATE", req.user?.name);

    return res.status(200).json({ success: true, message: "Line updated successfully" });
  } catch (error) {
    console.error("UPDATE LINE ERROR:", error);
    Notifier.toAdmin("System Error", `Update Line Error [${req.body?.lineId}]: ${error.message}`, "CRITICAL_ERROR", req.user?.name || "System");
    return res.status(500).json({ success: false, message: error.message });
  }
};
