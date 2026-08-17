// routes/injectionMachineRoutes.js
import express from "express";
import {
  getAllInjectionMachines,
  getInjectionMachineById,
  getAvailableESPDevices,
  assignInjectionMachine,
  removeInjectionMachineAssignment,
  updateInjectionMachineDetails,
} from "../controllers/injectionMachineController.js";

const router = express.Router();

// Get all machines
router.get("/", getAllInjectionMachines);

// Assign new machine
router.post("/assign", assignInjectionMachine);

// Update machine details
router.put("/update", updateInjectionMachineDetails);

// Remove assignment
router.delete("/remove", removeInjectionMachineAssignment);

// Get available ESP devices (frontend requires this route to fetch available configs)
router.get("/esp32/free", getAvailableESPDevices);

// Get machine by ID (e.g., INJ_01)
router.get("/:machineNumber", getInjectionMachineById);

export default router;
