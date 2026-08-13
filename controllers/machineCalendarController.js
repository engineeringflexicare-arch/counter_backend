import mongoose from "mongoose";
import { InjectionMachine } from "../models/InjectionMachine.js";
import MachineCalendarBlock from "../models/MachineCalendarBlock.js";

const buildAvailabilityQuery = (machineId, start, end) => {
  const query = {
    machine: machineId,
    startTime: { $lt: end },
    endTime: { $gt: start },
  };

  return query;
};

export const createCalendarBlock = async (req, res) => {
  try {
    const { machine, startTime, endTime, status, sourceType, sourceId, sourceRef, title, remarks, createdBy } = req.body;

    if (!machine || !startTime || !endTime) {
      return res.status(400).json({ success: false, message: "machine, startTime, and endTime are required." });
    }

    const machineDoc = await InjectionMachine.findById(machine);
    if (!machineDoc) {
      return res.status(404).json({ success: false, message: "Machine not found." });
    }

    const block = await MachineCalendarBlock.create({
      machine,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      status: status || "Booked",
      sourceType: sourceType || "Manual",
      sourceId: sourceId || null,
      sourceRef: sourceRef || undefined,
      title: title || "Calendar Block",
      remarks,
      createdBy,
    });

    res.status(201).json({ success: true, data: block });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getCalendarBlocks = async (req, res) => {
  try {
    const { machine, start, end } = req.query;
    const query = {};

    if (machine) query.machine = machine;
    if (start || end) {
      query.startTime = { $lt: new Date(end || new Date()) };
      query.endTime = { $gt: new Date(start || new Date(0)) };
    }

    const blocks = await MachineCalendarBlock.find(query).sort({ startTime: 1 }).populate("machine", "machineCode location").lean();

    res.status(200).json({ success: true, count: blocks.length, data: blocks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const checkMachineAvailability = async (req, res) => {
  try {
    const { machine, startTime, endTime } = req.query;

    if (!machine || !startTime || !endTime) {
      return res.status(400).json({ success: false, message: "machine, startTime, and endTime are required." });
    }

    const overlaps = await MachineCalendarBlock.find(buildAvailabilityQuery(machine, new Date(startTime), new Date(endTime))).lean();
    const available = overlaps.length === 0;

    res.status(200).json({
      success: true,
      data: {
        machine,
        startTime,
        endTime,
        available,
        overlaps,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteCalendarBlock = async (req, res) => {
  try {
    const block = await MachineCalendarBlock.findByIdAndDelete(req.params.id);
    if (!block) {
      return res.status(404).json({ success: false, message: "Calendar block not found." });
    }

    res.status(200).json({ success: true, message: "Calendar block removed." });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
