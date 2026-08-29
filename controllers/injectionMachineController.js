import { get, ref } from "firebase/database";
import { rtdb } from "../database.js";
import { InjectionMachine } from "../models/InjectionMachine.js";
import { InjectionMachineHistory } from "../models/InjectionMachineHistory.js";
import { AuditLog } from "../models/AuditLog.js";
import { Notification } from "../models/Notification.js";
import Configuration from "../models/Configuration.js";
import { Notifier } from "../utils/Notifier.js";
import jwt from "jsonwebtoken";

// ============================================================================
// Permission Helpers
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

const canEdit = (req, res) => {
  const user = req.user || getAuthUser(req);
  if (user) {
    const roleStr = String(user.role || user.userRole || user.type || "").toLowerCase();
    if (["admin", "superuser"].includes(roleStr)) {
      req.user = user;
      return true;
    }
  }
  res.status(403).json({ success: false, message: "Access denied. Requires Admin or Superuser privileges." });
  return false;
};

const canUpdateMachine = (req, res) => {
  const user = req.user || getAuthUser(req);
  if (user) {
    const roleStr = String(user.role || user.userRole || user.type || "").toLowerCase();
    if (["admin", "superuser", "supervisor", "assembly_supervisor", "production_supervisor"].includes(roleStr)) {
      req.user = user;
      return true;
    }
  }
  res.status(403).json({ success: false, message: "Access denied. Requires Admin, Superuser, or Supervisor privileges." });
  return false;
};

// ============================================================================
// 1. GET ALL INJECTION MACHINES
// ============================================================================
export const getAllInjectionMachines = async (req, res) => {
  try {
    const machines = await InjectionMachine.find().sort({ injectionMachineNumber: 1 });
    return res.status(200).json({ success: true, count: machines.length, data: machines });
  } catch (error) {
    Notifier.toAdmin("System Error", `Get All Injection Machines Error: ${error.message}`, "CRITICAL_ERROR");
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// 2. GET SINGLE INJECTION MACHINE
// ============================================================================
export const getInjectionMachineById = async (req, res) => {
  try {
    const { machineNumber } = req.params;
    const machine = await InjectionMachine.findOne({ injectionMachineNumber: machineNumber });

    if (!machine) return res.status(404).json({ success: false, message: "Machine not found" });
    return res.status(200).json({ success: true, data: machine });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// 3. GET AVAILABLE ESP32 DEVICES
// ============================================================================
export const getAvailableESPDevices = async (req, res) => {
  try {
    const configs = await Configuration.find();
    const assignedMachines = await InjectionMachine.find();
    const assignedESP = assignedMachines.map((m) => m.machineId).filter(Boolean);

    const availableESP = configs.filter((config) => !assignedESP.includes(config.device_id)).map((config) => ({ machineId: config.device_id }));

    return res.status(200).json({ success: true, data: availableESP });
  } catch (error) {
    console.error("GET ESP ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// 4. ASSIGN INJECTION MACHINE (මෙයටත් History එක එකතු කරන ලදී)
// ============================================================================
export const assignInjectionMachine = async (req, res) => {
  if (!canUpdateMachine(req, res)) return;

  try {
    const { injectionMachineNumber, mouldNumber, cavities, machineId, productCode, dailyTarget, hourlyTarget, teamMembers, shift, supervisor, shiftStartTime, shiftEndTime, floor, plannedDate } =
      req.body;
    const userName = req.user?.name || "System";

    if (!injectionMachineNumber || !machineId || !mouldNumber) {
      return res.status(400).json({ success: false, message: "Machine Number, Mould Number and ESP32 ID are required" });
    }

    const updateData = {
      mouldNumber,
      cavities: Number(cavities) || 1,
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

    let injectionMachine = await InjectionMachine.findOne({ injectionMachineNumber });
    let oldData = null;
    let action = "INJECTION_MACHINE_ASSIGNED";

    if (injectionMachine) {
      oldData = injectionMachine.toObject();
      Object.assign(injectionMachine, updateData);
      action = "INJECTION_MACHINE_REASSIGNED";
    } else {
      injectionMachine = new InjectionMachine({ injectionMachineNumber, ...updateData });
    }

    await injectionMachine.save();

    // 🔥 Assign / Re-assign කරන විටත් History එක MongoDB හි Save වීම සඳහා
    const historyDate = plannedDate || new Date().toISOString().split("T")[0];
    const machineObj = injectionMachine.toObject();
    delete machineObj._id;
    delete machineObj.__v;

    await InjectionMachineHistory.findOneAndUpdate({ injectionMachineNumber, historyDate }, { ...machineObj, historyDate }, { upsert: true, new: true });

    await AuditLog.create({
      action,
      entity: "InjectionMachine",
      entityId: injectionMachineNumber,
      oldData,
      newData: updateData,
      changedBy: userName,
    });

    Notifier.toSuperuser("Machine Assignment", `${injectionMachineNumber} assigned to ESP32 ${machineId}`, "MACHINE_UPDATE", userName);

    return res.status(200).json({ success: true, message: "Machine assigned successfully", data: injectionMachine });
  } catch (error) {
    console.error("ASSIGN MACHINE ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// 5. REMOVE ASSIGNMENT
// ============================================================================
export const removeInjectionMachineAssignment = async (req, res) => {
  if (!canUpdateMachine(req, res)) return;

  try {
    const { injectionMachineNumber } = req.body;

    if (!injectionMachineNumber || !injectionMachineNumber.toString().trim()) {
      return res.status(400).json({ success: false, message: "Injection Machine Number required" });
    }

    const cleanMachineNum = injectionMachineNumber.toString().trim();

    const machine = await InjectionMachine.findOne({
      injectionMachineNumber: { $regex: new RegExp(`^${cleanMachineNum}$`, "i") },
    });

    if (!machine) {
      return res.status(404).json({ success: false, message: "Machine not found" });
    }

    const oldData = machine.toObject();
    const oldESPId = machine.machineId;

    const clearedFields = {
      mouldNumber: "",
      cavities: 1,
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
    };

    const updatedMachine = await InjectionMachine.findOneAndUpdate({ _id: machine._id }, { $set: clearedFields }, { new: true });

    await AuditLog.create({
      action: "INJECTION_MACHINE_CLEARED",
      entity: "InjectionMachine",
      entityId: machine.injectionMachineNumber,
      oldData,
      newData: updatedMachine,
      changedBy: req.user?.name || "System",
    });

    Notifier.toSuperuser("Assignment Cleared", `ESP32 ${oldESPId} removed from ${machine.injectionMachineNumber}`, "MACHINE_UPDATE", req.user?.name);

    return res.status(200).json({ success: true, message: "Assignment removed successfully", data: updatedMachine });
  } catch (error) {
    console.error("❌ [REMOVE] Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// 6. UPDATE MACHINE DETAILS
// ============================================================================
export const updateInjectionMachineDetails = async (req, res) => {
  if (!canUpdateMachine(req, res)) return;

  try {
    const { injectionMachineNumber, mouldNumber, cavities, machineId, productCode, dailyTarget, hourlyTarget, teamMembers, shift, floor, supervisor, plannedDate, shiftStartTime, shiftEndTime } =
      req.body;

    const machine = await InjectionMachine.findOne({ injectionMachineNumber });
    if (!machine) return res.status(404).json({ success: false, message: "Machine not found" });

    const oldData = machine.toObject();

    Object.assign(machine, {
      mouldNumber: mouldNumber ?? machine.mouldNumber,
      cavities: cavities ? Number(cavities) : machine.cavities,
      machineId: machineId ?? machine.machineId,
      productCode: productCode ?? machine.productCode,
      dailyTarget: dailyTarget ?? machine.dailyTarget,
      hourlyTarget: hourlyTarget ?? machine.hourlyTarget,
      plannedMembers: teamMembers ?? machine.plannedMembers,
      shift: shift ?? machine.shift,
      floor: floor ?? machine.floor,
      supervisor: supervisor ?? machine.supervisor,
      plannedDate: plannedDate ?? machine.plannedDate,
      shiftStartTime: shiftStartTime ?? machine.shiftStartTime,
      shiftEndTime: shiftEndTime ?? machine.shiftEndTime,
    });

    await machine.save();

    // 🔥 දෛනික History එක Save කිරීම (වැඩිදියුණු කරන ලදී)
    const historyDate = plannedDate || new Date().toISOString().split("T")[0];
    const machineObj = machine.toObject();
    delete machineObj._id;
    delete machineObj.__v;

    await InjectionMachineHistory.findOneAndUpdate({ injectionMachineNumber, historyDate }, { ...machineObj, historyDate }, { upsert: true, new: true });

    await AuditLog.create({
      action: "INJECTION_MACHINE_UPDATE",
      entity: "InjectionMachine",
      entityId: injectionMachineNumber,
      oldData,
      newData: machine.toObject(),
      changedBy: req.user?.name || "System",
    });

    return res.status(200).json({ success: true, message: "Machine updated successfully" });
  } catch (error) {
    console.error("UPDATE MACHINE ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
