import Inventory from "../models/Inventory.js";

// අලුත් Item එකක් ගබඩාවට එකතු කිරීම
export const addInventoryItem = async (req, res) => {
  try {
    const newItem = new Inventory(req.body);
    const savedItem = await newItem.save();
    res.status(201).json({ success: true, data: savedItem });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ගබඩාවේ ඇති සියලුම දේවල් බැලීම සහ Shortage Alerts බැලීම
export const checkInventoryStatus = async (req, res) => {
  try {
    const items = await Inventory.find();

    // Shortage තියෙන Items මොනවාද කියලා වෙනම වෙන් කිරීම
    const shortages = items.filter((item) => item.available_qty <= item.reorder_level);

    res.status(200).json({
      success: true,
      total_items: items.length,
      shortage_alerts: shortages.length,
      data: items,
      shortages: shortages,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// නිෂ්පාදනයක් අවසන් වූ පසු ගබඩාවෙන් බඩු අඩු කිරීම (Deduct Stock)
export const consumeInventory = async (req, res) => {
  try {
    const { item_code, consumed_qty } = req.body;

    const item = await Inventory.findOne({ item_code });
    if (!item) return res.status(404).json({ success: false, message: "Item එක සොයාගත නොහැක." });

    item.available_qty -= consumed_qty;
    await item.save();

    res.status(200).json({ success: true, message: "Stock successfully updated", data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
