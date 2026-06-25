import ProductionPlan from "../models/ProductionPlan.js";

// 1. CREATE: අලුත් Production Plan එකක් හැදීම
export const createPlan = async (req, res) => {
  try {
    const { date, line_id, product_code, target_qty, planned_hours } = req.body;
    const newPlan = new ProductionPlan({ date, line_id, product_code, target_qty, planned_hours });

    const savedPlan = await newPlan.save();
    res.status(201).json({ success: true, data: savedPlan });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "මෙම දිනයට අදාළ Line එක සඳහා දැනටමත් සැලසුමක් පවතී." });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. READ (ALL): සියලුම Plans බැලීම (Filter කිරීමේ පහසුකමත් සමග)
export const getPlans = async (req, res) => {
  try {
    const { date, line_id, status } = req.query;
    let filter = {};
    if (date) filter.date = date;
    if (line_id) filter.line_id = line_id;
    if (status) filter.status = status;

    const plans = await ProductionPlan.find(filter).sort({ date: -1 });
    res.status(200).json({ success: true, count: plans.length, data: plans });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. READ (SINGLE): ID එක මගින් එක Plan එකක් පමණක් බැලීම
export const getPlanById = async (req, res) => {
  try {
    const plan = await ProductionPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: "Plan එක සොයාගත නොහැකි විය." });

    res.status(200).json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4. UPDATE: Plan එක වෙනස් කිරීම (Status/Target Update)
export const updatePlan = async (req, res) => {
  try {
    const updatedPlan = await ProductionPlan.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });

    if (!updatedPlan) return res.status(404).json({ success: false, message: "Plan එක සොයාගත නොහැකි විය." });
    res.status(200).json({ success: true, data: updatedPlan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5. DELETE: Plan එක මකා දැමීම
export const deletePlan = async (req, res) => {
  try {
    const deletedPlan = await ProductionPlan.findByIdAndDelete(req.params.id);
    if (!deletedPlan) return res.status(404).json({ success: false, message: "Plan එක සොයාගත නොහැකි විය." });

    res.status(200).json({ success: true, message: "Production Plan එක සාර්ථකව මකා දමන ලදී." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
