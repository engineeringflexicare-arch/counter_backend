// controllers/SuperuserController.js
import UsersCollection from "../models/User.js";
import { getDocs, query, where, addDoc, updateDoc, deleteDoc, doc, getDoc } from "firebase/firestore";
import bcrypt from "bcryptjs";

// Superuser ට Supervisor ලාව පමණක් පෙනේ
export const getSupervisedUsers = async (req, res) => {
  try {
    const snapshot = await getDocs(UsersCollection);
    const users = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((user) => user.role === "Supervisor"); // Superuser ට පේන්නේ Supervisor ලා පමණි

    res.status(200).json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Superuser ට Supervisor ලාව පමණක් සෑදිය හැක
export const createSupervisor = async (req, res) => {
  try {
    const { name, email, employeeId, password } = req.body;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await addDoc(UsersCollection, {
      name,
      email,
      employeeId,
      password: hashedPassword,
      role: "Supervisor", // අනිවාර්යයෙන්ම Supervisor
      createdAt: new Date(),
    });
    res.status(201).json({ success: true, message: "Supervisor created!" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
