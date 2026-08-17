import express from "express";
import { createSalesOrder, getPendingLines, getSalesOrders, updateOrderStatus } from "../controllers/salesOrderController.js";

const router = express.Router();

router.post("/", createSalesOrder);
router.get("/", getSalesOrders);
router.get("/pending-lines", getPendingLines);
router.patch("/:id/status", updateOrderStatus);

export default router;
