import express from "express";
import { getAllLines, getLineById, assignLine, updateLineDetails, removeAssignment } from "../controllers/LineController.js";
import { verifyToken, requireSuperuser } from "../middleware/authMiddleware.js";

const router = express.Router();

// කියවීමේ (GET) routes වලට login වීම පමණක් ප්‍රමාණවත් වේ
router.get("/", verifyToken, getAllLines);
router.get("/:lineId", verifyToken, getLineById);

// වෙනස්කම් (Mutations) කිරීම සඳහා අවම වශයෙන් Superuser වත් විය යුතුය
// (authMiddleware එකේ හැටියට Admin ටත් පුළුවන්)
router.post("/assign", verifyToken, requireSuperuser, assignLine);
router.put("/update", verifyToken, requireSuperuser, updateLineDetails);
router.delete("/remove", verifyToken, requireSuperuser, removeAssignment);

export default router;
