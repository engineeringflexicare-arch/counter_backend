import express from "express";
import { createMould, getMoulds, getAllMoulds, getMouldById, updateMould, deleteMould } from "../controllers/MouldsController.js";

const MouldsRouter = express.Router();

MouldsRouter.get("/", getMoulds);
MouldsRouter.get("/all", getAllMoulds);
MouldsRouter.get("/:id", getMouldById);

MouldsRouter.post("/", createMould);

MouldsRouter.put("/:id", updateMould);

MouldsRouter.delete("/:id", deleteMould);

export default MouldsRouter;
