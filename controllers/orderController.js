import Order from "../models/Order.js";

// 1. CREATE: අලුත් Order එකක් පද්ධතියට ඇතුළත් කිරීම
export const createOrder = async (req, res) => {
  try {
    const { po_no, customer, due_date, order_items } = req.body;

    const newOrder = new Order({ po_no, customer, due_date, order_items });
    const savedOrder = await newOrder.save();

    res.status(201).json({ success: true, data: savedOrder });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "මෙම PO අංකය දැනටමත් පද්ධතියේ ඇත." });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. READ (ALL): සියලුම Orders බැලීම
export const getOrders = async (req, res) => {
  try {
    const { status } = req.query; // Status එක අනුව ෆිල්ටර් කිරීමට
    let filter = status ? { status } : {};

    const orders = await Order.find(filter).sort({ due_date: 1 }); // කල් ඉකුත්වන දින අනුපිළිවෙලට
    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. READ (SINGLE): එක් Order එකක් පමණක් බැලීම
export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: "Order එක සොයාගත නොහැක." });

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4. UPDATE: Order Status එක හෝ Items යාවත්කාලීන කිරීම
export const updateOrder = async (req, res) => {
  try {
    const updatedOrder = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });

    if (!updatedOrder) return res.status(404).json({ success: false, message: "Order එක සොයාගත නොහැක." });
    res.status(200).json({ success: true, data: updatedOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5. DELETE: Order එකක් මකා දැමීම
export const deleteOrder = async (req, res) => {
  try {
    const deletedOrder = await Order.findByIdAndDelete(req.params.id);
    if (!deletedOrder) return res.status(404).json({ success: false, message: "Order එක සොයාගත නොහැක." });

    res.status(200).json({ success: true, message: "Order එක සාර්ථකව මකා දමන ලදී." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    await Notification.findByIdAndUpdate(id, { isRead: true });
    res.status(200).json({ success: true, message: "Notification cleared" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const clearAllNotifications = async (req, res) => {
  try {
    // මෙය අදාළ User ගේ private notifications පමණක් mark as read කරයි
    // (මුළු සිස්ටම් එකේම පොදු ඒවා මැකෙන්නේ නැත)
    await Notification.updateMany({ targetUser: req.user.id }, { isRead: true });
    res.status(200).json({ success: true, message: "All private notifications cleared" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
