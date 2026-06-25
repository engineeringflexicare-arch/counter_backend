import express from "express";
import { createInjectionPlan, getInjectionPlans, updateInjectionPlan } from "../controllers/injectionController.js";

const router = express.Router();

router.route("/").post(createInjectionPlan).get(getInjectionPlans);

router.route("/:id").put(updateInjectionPlan);

export default router;
