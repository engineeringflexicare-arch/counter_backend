import Mould from "../models/Mould.js";
import InjectionMachine from "../models/InjectionMachine.js";

export const createMould = async (req, res) => {
  try {
    const { mouldNumber, productCode, cavityCount, standardMaterial, description, cycleTime, standardCapacity, mouldService, compatibleMachines } = req.body;

    // 1. Input Validation
    if (!mouldNumber || !productCode || !cavityCount || !standardMaterial || !description || !cycleTime || !standardCapacity) {
      return res.status(400).json({
        success: false,
        message: "Mould number, product code, cavity count, standard material, description, cycle time, and standard capacity are required.",
      });
    }

    // Validate Mould Service details
    if (!mouldService || !mouldService.serviceType || !mouldService.serviceDate || !mouldService.serviceInterval || !mouldService.serviceDescription) {
      return res.status(400).json({
        success: false,
        message: "Mould service details (type, date, interval, and description) are completely required.",
      });
    }

    // 2. Uniqueness Check
    const upperCaseMouldNumber = mouldNumber.toUpperCase();
    const existingMould = await Mould.findOne({ mouldNumber: upperCaseMouldNumber });
    if (existingMould) {
      return res.status(409).json({
        success: false,
        message: `Mould with number ${upperCaseMouldNumber} already exists.`,
      });
    }

    // 3. Relational Data Validation (Checking if assigned machines actually exist)
    if (compatibleMachines && compatibleMachines.length > 0) {
      const machinesCount = await InjectionMachine.countDocuments({
        _id: { $in: compatibleMachines },
      });
      if (machinesCount !== compatibleMachines.length) {
        return res.status(400).json({
          success: false,
          message: "One or more compatible machines provided do not exist.",
        });
      }
    }

    // 4. Save to Database
    // Assign the uppercase mould number back to req.body before saving
    req.body.mouldNumber = upperCaseMouldNumber;

    const mould = new Mould(req.body);
    await mould.save();

    return res.status(201).json({ success: true, data: mould });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getMoulds = async (req, res) => {
  try {
    // Find moulds based on query parameters (e.g., active moulds)
    const moulds = await Mould.find(req.query).populate("compatibleMachines", "machineCode tonnage status location").sort({ mouldNumber: 1 });

    return res.status(200).json({ success: true, count: moulds.length, data: moulds });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};

// Added: getAllMoulds function to handle the '/all' route
export const getAllMoulds = async (req, res) => {
  try {
    // Get all moulds regardless of query parameters
    const moulds = await Mould.find().populate("compatibleMachines", "machineCode tonnage status location").sort({ mouldNumber: 1 });

    return res.status(200).json({ success: true, count: moulds.length, data: moulds });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};

export const getMouldById = async (req, res) => {
  try {
    const mould = await Mould.findById(req.params.id).populate("compatibleMachines", "machineCode tonnage status location");

    if (!mould) {
      return res.status(404).json({ success: false, message: "Mould not found." });
    }

    return res.status(200).json({ success: true, data: mould });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateMould = async (req, res) => {
  try {
    const { compatibleMachines } = req.body;

    // Re-validate machines if they are being updated
    if (compatibleMachines && compatibleMachines.length > 0) {
      const machinesCount = await InjectionMachine.countDocuments({
        _id: { $in: compatibleMachines },
      });
      if (machinesCount !== compatibleMachines.length) {
        return res.status(400).json({
          success: false,
          message: "One or more compatible machines provided do not exist.",
        });
      }
    }

    const mould = await Mould.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate("compatibleMachines", "machineCode tonnage status location");

    if (!mould) {
      return res.status(404).json({ success: false, message: "Mould not found." });
    }

    return res.status(200).json({ success: true, data: mould });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const deleteMould = async (req, res) => {
  try {
    // Using soft delete to preserve audit history and MES reporting
    const mould = await Mould.findByIdAndUpdate(req.params.id, { isDeleted: true, status: "Inactive" }, { new: true });

    if (!mould) {
      return res.status(404).json({ success: false, message: "Mould not found." });
    }

    return res.status(200).json({ success: true, message: "Mould deleted successfully." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
