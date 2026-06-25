import InjectionPlan from "../models/InjectionPlan.js";

// 1. අලුත් සැලසුමක් (Plan) එකතු කිරීම
export const createInjectionPlan = async (req, res) => {
  try {
    const newPlan = new InjectionPlan(req.body);
    const savedPlan = await newPlan.save();
    res.status(201).json({ success: true, data: savedPlan });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "මෙම දිනයට අදාළ මැෂින් එක සඳහා දැනටමත් සැලසුමක් පවතී." });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. අදාළ දවසේ සියලුම මැෂින් වල සැලසුම් බැලීම (Dashboard එකට අවශ්‍ය වේ)
export const getInjectionPlans = async (req, res) => {
  try {
    const { date, machine_id } = req.query;
    let filter = {};
    if (date) filter.date = date;
    if (machine_id) filter.machine_id = machine_id;

    const plans = await InjectionPlan.find(filter).sort({ machine_id: 1 });
    res.status(200).json({ success: true, count: plans.length, data: plans });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. යන්ත්‍රයේ නිෂ්පාදනය යාවත්කාලීන කිරීම (Actual Qty Update)
export const updateInjectionPlan = async (req, res) => {
  try {
    const updatedPlan = await InjectionPlan.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });

    if (!updatedPlan) return res.status(404).json({ success: false, message: "සැලසුම සොයාගත නොහැක." });

    res.status(200).json({ success: true, data: updatedPlan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
