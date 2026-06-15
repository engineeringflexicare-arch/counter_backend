import express from "express";
import { getDashboardStats } from "../controllers/AdminController.js";

const AdminRouter = express.Router();

AdminRouter.get("/dashboard-stats", getDashboardStats);

export default AdminRouter;
