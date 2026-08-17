import mongoose from "mongoose";
import { InjectionMachine } from "../models/InjectionMachine.js";
import MachineCalendarBlock from "../models/MachineCalendarBlock.js";
import MachineCapacity from "../models/MachineCapacity.js";
import Mould from "../models/Mould.js";
import ProductionPlanLine from "../models/ProductionPlanLine.js";
import SalesOrderLine from "../models/SalesOrderLine.js";
import ToolCalendarBlock from "../models/ToolCalendarBlock.js";

const getMachineCandidates = async (productId) => {
  const capacities = await MachineCapacity.find({ product: productId }).populate("machine", "_id machineCode").lean();
  return capacities.filter((capacity) => capacity.machine).map((capacity) => capacity.machine._id);
};

const hasOverlap = async ({ machineId, toolId, startTime, endTime }) => {
  const [machineOverlap, toolOverlap] = await Promise.all([
    MachineCalendarBlock.findOne({
      machine: machineId,
      startTime: { $lt: endTime },
      endTime: { $gt: startTime },
    }).lean(),
    toolId
      ? ToolCalendarBlock.findOne({
          tool: toolId,
          startTime: { $lt: endTime },
          endTime: { $gt: startTime },
        }).lean()
      : null,
  ]);

  return { machineOverlap, toolOverlap };
};

export const createProductionPlan = async (req, res) => {
  try {
    const { salesOrderLineId, machineId, toolId, startTime, endTime, plannedQty, notes } = req.body;

    if (!salesOrderLineId || !machineId || !startTime || !endTime || !plannedQty) {
      return res.status(400).json({ success: false, message: "salesOrderLineId, machineId, startTime, endTime, and plannedQty are required." });
    }

    const salesOrderLine = await SalesOrderLine.findById(salesOrderLineId).populate("product", "_id product_code description").lean();
    if (!salesOrderLine) {
      return res.status(404).json({ success: false, message: "Sales order line not found." });
    }

    const machine = await InjectionMachine.findById(machineId);
    if (!machine) {
      return res.status(404).json({ success: false, message: "Machine not found." });
    }

    let toolDoc = null;
    if (toolId) {
      toolDoc = await Mould.findById(toolId);
      if (!toolDoc) {
        return res.status(404).json({ success: false, message: "Tool not found." });
      }
    }

    const { machineOverlap, toolOverlap } = await hasOverlap({
      machineId,
      toolId,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
    });

    if (machineOverlap || toolOverlap) {
      return res.status(409).json({
        success: false,
        message: "The selected time window overlaps an existing calendar block.",
        data: { machineOverlap, toolOverlap },
      });
    }

    const plan = await ProductionPlanLine.create({
      salesOrderLine: salesOrderLineId,
      machine: machineId,
      tool: toolId || undefined,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      plannedQty: Number(plannedQty),
      notes,
    });

    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getProductionPlans = async (req, res) => {
  try {
    const plans = await ProductionPlanLine.find()
      .populate({
        path: "salesOrderLine",
        populate: [
          { path: "product", select: "product_code description" },
          { path: "salesOrder", select: "orderNumber" },
        ],
      })
      .populate("machine", "machineCode location")
      .populate("tool", "mouldNumber productCode")
      .sort({ startTime: 1 })
      .lean();

    res.status(200).json({ success: true, count: plans.length, data: plans });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCandidateMachines = async (req, res) => {
  try {
    const { productId } = req.query;
    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required." });
    }

    const machineIds = await getMachineCandidates(productId);
    const machines = await InjectionMachine.find({ _id: { $in: machineIds } })
      .select("_id machineCode location tonnage")
      .lean();

    res.status(200).json({ success: true, count: machines.length, data: machines });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
