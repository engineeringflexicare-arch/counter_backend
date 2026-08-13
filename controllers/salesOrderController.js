import mongoose from "mongoose";
import Customer from "../models/Customer.js";
import Product from "../models/Product.js";
import SalesOrder from "../models/SalesOrder.js";
import SalesOrderLine from "../models/SalesOrderLine.js";

const resolveCustomer = async (customerRef) => {
  if (!customerRef) return null;

  if (mongoose.Types.ObjectId.isValid(customerRef)) {
    return Customer.findById(customerRef);
  }

  return Customer.findOne({ code: String(customerRef).toUpperCase() });
};

const resolveProduct = async (productRef) => {
  if (!productRef) return null;

  if (mongoose.Types.ObjectId.isValid(productRef)) {
    return Product.findById(productRef);
  }

  return Product.findOne({ product_code: String(productRef).toUpperCase() });
};

export const createSalesOrder = async (req, res) => {
  try {
    const { orderNumber, customer, priority, remarks, lines } = req.body;

    if (!orderNumber || !customer || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({
        success: false,
        message: "orderNumber, customer, and at least one line are required.",
      });
    }

    const customerDoc = await resolveCustomer(customer);
    if (!customerDoc) {
      return res.status(400).json({ success: false, message: "Customer not found." });
    }

    const resolvedLines = [];

    for (const line of lines) {
      if (!line.product || !line.orderQty || !line.dueDate) {
        return res.status(400).json({
          success: false,
          message: "Every line requires product, orderQty, and dueDate.",
        });
      }

      const productDoc = await resolveProduct(line.product);
      if (!productDoc) {
        return res.status(400).json({ success: false, message: `Product not found: ${line.product}` });
      }

      resolvedLines.push({
        product: productDoc._id,
        orderQty: Number(line.orderQty),
        dueDate: new Date(line.dueDate),
        priority: line.priority || priority || "Normal",
        remarks: line.remarks,
      });
    }

    const order = await SalesOrder.create({
      orderNumber: String(orderNumber).toUpperCase(),
      customer: customerDoc._id,
      priority,
      remarks,
    });

    const lineDocs = resolvedLines.map((line, index) => ({
      salesOrder: order._id,
      lineNumber: index + 1,
      product: line.product,
      orderQty: line.orderQty,
      dueDate: line.dueDate,
      priority: line.priority,
      remarks: line.remarks,
    }));

    const createdLines = await SalesOrderLine.insertMany(lineDocs);

    res.status(201).json({ success: true, data: { order, lines: createdLines } });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: `Order ${req.body.orderNumber} already exists.` });
    }

    res.status(500).json({ success: false, message: error.message });
  }
};

export const getSalesOrders = async (req, res) => {
  try {
    const { status, priority, customer, page = 1, limit = 50 } = req.query;
    const query = {};

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (customer) query.customer = customer;

    const skip = (Number(page) - 1) * Number(limit);

    const [orders, total] = await Promise.all([
      SalesOrder.find(query).populate("customer", "code name").sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      SalesOrder.countDocuments(query),
    ]);

    const orderIds = orders.map((order) => order._id);
    const lines = await SalesOrderLine.find({ salesOrder: { $in: orderIds } })
      .populate("product", "product_code description")
      .sort({ lineNumber: 1 })
      .lean();

    const linesByOrder = lines.reduce((acc, line) => {
      const key = line.salesOrder.toString();
      (acc[key] = acc[key] || []).push(line);
      return acc;
    }, {});

    const data = orders.map((order) => ({
      ...order,
      lines: linesByOrder[order._id.toString()] || [],
    }));

    res.status(200).json({ success: true, count: data.length, total, page: Number(page), data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPendingLines = async (req, res) => {
  try {
    const priorityRank = { Urgent: 0, High: 1, Normal: 2, Low: 3 };

    const lines = await SalesOrderLine.find({
      status: { $in: ["Pending", "Partially Planned"] },
    })
      .populate("product", "product_code description")
      .populate({
        path: "salesOrder",
        select: "orderNumber customer",
        populate: { path: "customer", select: "code name" },
      })
      .lean();

    lines.sort((a, b) => {
      const rankDiff = priorityRank[a.priority] - priorityRank[b.priority];
      if (rankDiff !== 0) return rankDiff;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });

    res.status(200).json({ success: true, count: lines.length, data: lines });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await SalesOrder.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
