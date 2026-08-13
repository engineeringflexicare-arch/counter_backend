import express from "express";
import { createProductionPlan, getCandidateMachines, getProductionPlans } from "../controllers/productionPlanningController.js";

const router = express.Router();

router.post("/", createProductionPlan);
router.get("/", getProductionPlans);
router.get("/candidate-machines", getCandidateMachines);

export default router;
