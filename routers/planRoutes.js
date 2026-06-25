import express from "express";
import { createPlan, getPlans, getPlanById, updatePlan, deletePlan } from "../controllers/planController.js";

const planRouter = express.Router();

planRouter.route("/").post(createPlan).get(getPlans);

planRouter.route("/:id").get(getPlanById).put(updatePlan).delete(deletePlan);

export default planRouter;
