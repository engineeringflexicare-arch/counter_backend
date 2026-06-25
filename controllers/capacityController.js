import Product from "../models/Product.js";

export const calculateCapacity = async (req, res) => {
  try {
    const { product_code, working_minutes } = req.body; // උදා: 480 min (පැය 8ක Shift එකක්)

    // 1. අදාළ Product එක Database එකෙන් සෙවීම
    const product = await Product.findOne({ product_code });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product එක සොයාගත නොහැක." });
    }

    // 2. Cycle Time එක තත්පර වලින් ඇති නිසා, Working Minutes තත්පර වලට හරවා ගණනය කිරීම
    // Formula: Capacity = (Working Minutes * 60) / Cycle Time
    const workingSeconds = working_minutes * 60;
    const calculatedCapacity = Math.floor(workingSeconds / product.cycle_time);

    res.status(200).json({
      success: true,
      data: {
        product: product.description,
        cycle_time_seconds: product.cycle_time,
        working_minutes: working_minutes,
        estimated_capacity: calculatedCapacity,
        message: `මෙම Shift එක තුළ උපරිම කෑලි ${calculatedCapacity} ක් නිෂ්පාදනය කළ හැක.`,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
