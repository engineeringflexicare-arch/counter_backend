import express from "express";
import { addInventoryItem, checkInventoryStatus, consumeInventory } from "../controllers/inventoryController.js";

const router = express.Router();

router.route("/").post(addInventoryItem).get(checkInventoryStatus);

router.route("/consume").post(consumeInventory);

export default router;
