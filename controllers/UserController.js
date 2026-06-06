import { addDoc, getDocs, query, where, updateDoc, deleteDoc, doc } from "firebase/firestore";
import UsersCollection from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

// ==========================================
// 1. JWT Middleware
// ==========================================
export const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(403).json({ success: false, message: "No token provided" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: "Unauthorized" });
  }
};

// ==========================================
// 2. Controller Functions
// ==========================================

export const createUser = async (req, res) => {
  try {
    const { Firstname, Lastname, EmployeeNumber, Password, Role } = req.body;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(Password, salt);

    await addDoc(UsersCollection, {
      Firstname,
      Lastname,
      EmployeeNumber,
      Password: hashedPassword,
      Role,
      CreatedAt: new Date(),
    });
    res.status(201).json({ success: true, message: "User created" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { EmployeeNumber, Password } = req.body;
    const q = query(UsersCollection, where("EmployeeNumber", "==", EmployeeNumber));
    const snapshot = await getDocs(q);
    console.log();

    if (snapshot.empty) return res.status(401).json({ message: "Invalid EmployeeNumber" });

    const userDoc = snapshot.docs[0];
    const user = { id: userDoc.id, ...userDoc.data() };

    const isMatch = await bcrypt.compare(Password, user.Password);
    if (!isMatch) return res.status(401).json({ message: "Invalid password" });

    const token = jwt.sign({ id: user.id, role: user.Role, name: user.Firstname }, JWT_SECRET, { expiresIn: "1h" });
    console.log(token);
    res.status(200).json({ success: true, token, role: user.Role, name: user.Firstname });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getUsers = async (req, res) => {
  try {
    const snapshot = await getDocs(UsersCollection);
    const users = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { Firstname, Lastname, EmployeeNumber, Role } = req.body;
    const userRef = doc(UsersCollection, id);

    await updateDoc(userRef, {
      Firstname,
      Lastname,
      EmployeeNumber,
      Role,
      UpdatedAt: new Date(),
    });
    res.status(200).json({ success: true, message: "User updated" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const userRef = doc(UsersCollection, id);
    await deleteDoc(userRef);
    res.status(200).json({ success: true, message: "User deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
