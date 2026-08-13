import mongoose from "mongoose";
import Mould from "../models/Mould.js";
import ToolCalendarBlock from "../models/ToolCalendarBlock.js";

const buildAvailabilityQuery = (toolId, start, end) => ({
  tool: toolId,
  startTime: { $lt: end },
  endTime: { $gt: start },
});

export const createToolCalendarBlock = async (req, res) => {
  try {
    const { tool, startTime, endTime, status, sourceType, sourceId, sourceRef, title, remarks, createdBy } = req.body;

    if (!tool || !startTime || !endTime) {
      return res.status(400).json({ success: false, message: "tool, startTime, and endTime are required." });
    }

    const toolDoc = await Mould.findById(tool);
    if (!toolDoc) {
      return res.status(404).json({ success: false, message: "Tool not found." });
    }

    const block = await ToolCalendarBlock.create({
      tool,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      status: status || "Booked",
      sourceType: sourceType || "Manual",
      sourceId: sourceId || null,
      sourceRef: sourceRef || undefined,
      title: title || "Tool Calendar Block",
      remarks,
      createdBy,
    });

    res.status(201).json({ success: true, data: block });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getToolCalendarBlocks = async (req, res) => {
  try {
    const { tool, start, end } = req.query;
    const query = {};

    if (tool) query.tool = tool;
    if (start || end) {
      query.startTime = { $lt: new Date(end || new Date()) };
      query.endTime = { $gt: new Date(start || new Date(0)) };
    }

    const blocks = await ToolCalendarBlock.find(query).sort({ startTime: 1 }).populate("tool", "mouldNumber productCode").lean();

    res.status(200).json({ success: true, count: blocks.length, data: blocks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const checkToolAvailability = async (req, res) => {
  try {
    const { tool, startTime, endTime } = req.query;

    if (!tool || !startTime || !endTime) {
      return res.status(400).json({ success: false, message: "tool, startTime, and endTime are required." });
    }

    const overlaps = await ToolCalendarBlock.find(buildAvailabilityQuery(tool, new Date(startTime), new Date(endTime))).lean();
    const available = overlaps.length === 0;

    res.status(200).json({
      success: true,
      data: {
        tool,
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

export const deleteToolCalendarBlock = async (req, res) => {
  try {
    const block = await ToolCalendarBlock.findByIdAndDelete(req.params.id);
    if (!block) {
      return res.status(404).json({ success: false, message: "Tool calendar block not found." });
    }

    res.status(200).json({ success: true, message: "Tool calendar block removed." });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
