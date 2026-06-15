import { addDoc, getDocs, getDoc, query, where, updateDoc, deleteDoc, doc } from "firebase/firestore";
import UsersCollection from "../models/User.js"; // Check this path based on your project
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key_here";

// ==========================================
// 1. JWT Middleware
// ==========================================
// 1. JWT Middleware (Updated for Debugging)
// ==========================================
export const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("No auth header or doesn't start with Bearer");
    return res.status(401).json({ success: false, message: "No token provided or invalid format" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }

  try {
    // JWT_SECRET එක undefined ද යන්න මෙහිදී පරීක්ෂා වේ
    if (!JWT_SECRET) {
      console.error("CRITICAL ERROR: JWT_SECRET is not defined in .env file!");
      return res.status(500).json({ success: false, message: "Server configuration error" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next(); // Token එක නිවැරදි නම් ඊළඟ පියවරට යයි
  } catch (error) {
    console.error("JWT Verification Error:", error.message);
    // Token එක Expire වෙලා නම් හෝ වැරදි නම් පැහැදිලි Error එකක් දෙයි
    res.status(401).json({ success: false, message: "Unauthorized: " + error.message });
  }
};
// ==========================================
// 2. Controller Functions
// ==========================================

// --- ADD NEW USER ---
export const createUser = async (req, res) => {
  try {
    // Frontend sends: name, email, password, role
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await addDoc(UsersCollection, {
      name,
      email,
      password: hashedPassword,
      role,
      createdAt: new Date(),
    });

    res.status(201).json({ success: true, message: "User created successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- USER LOGIN ---
// --- USER LOGIN (Updated to prevent undefined error) ---
export const loginUser = async (req, res) => {
  try {
    // Frontend එකෙන් එවන දත්ත ලබාගැනීම
    const { email, password, EmployeeNumber, employeeId } = req.body;

    // Email හෝ Employee ID එකක් එවා ඇත්දැයි බැලීම
    const identifier = email || EmployeeNumber || employeeId;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "Email/Employee ID and Password are required!",
      });
    }

    // Database එකේ Search කළ යුතු field එක තීරණය කිරීම (email ද නැත්නම් EmployeeNumber ද කියා)
    const searchField = email ? "email" : "EmployeeNumber";

    const q = query(UsersCollection, where(searchField, "==", identifier));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return res.status(401).json({ success: false, message: "Invalid credentials or user not found" });
    }

    const userDoc = snapshot.docs[0];
    const user = { id: userDoc.id, ...userDoc.data() };

    // Database එකේ තියෙන password field එක
    const dbPassword = user.password || user.Password;

    const isMatch = await bcrypt.compare(password, dbPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid password" });
    }

    // Token එකේ කාලය පැය 8ක් (8h) දක්වා වැඩි කර ඇත
    const token = jwt.sign({ id: user.id, role: user.role || user.Role, name: user.name || user.Firstname }, JWT_SECRET, { expiresIn: "8h" });

    res.status(200).json({
      success: true,
      token,
      role: user.role || user.Role,
      name: user.name || user.Firstname,
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
// --- GET ALL USERS ---
export const getUsers = async (req, res) => {
  try {
    const snapshot = await getDocs(UsersCollection);

    // Mapping to return only needed data
    const users = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,

        name: data.name || data.Firstname || "Unknown",

        employeeId: data.employeeId || data.EmployeeNumber || "N/A",
        email: data.email || "",
        role: data.role || data.Role || "Operator",
      };
    });

    res.status(200).json({ success: true, data: users });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- GET SINGLE USER ---
export const getSingleUser = async (req, res) => {
  try {
    const { id } = req.params;
    const userRef = doc(UsersCollection, id);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) return res.status(404).json({ success: false, message: "User not found" });

    const data = snapshot.data();
    res.status(200).json({
      success: true,
      data: { id: snapshot.id, name: data.name, email: data.email, role: data.role },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- UPDATE USER ---
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, password } = req.body;
    const userRef = doc(UsersCollection, id);

    const updateData = {
      name,
      email,
      role,
      updatedAt: new Date(),
    };

    // Only update the password if the user actually typed a new one in the Edit form
    if (password && password.trim() !== "") {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    await updateDoc(userRef, updateData);
    res.status(200).json({ success: true, message: "User updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- DELETE USER ---
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const userRef = doc(UsersCollection, id);

    await deleteDoc(userRef);
    res.status(200).json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};
