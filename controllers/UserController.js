import { addDoc, getDocs, updateDoc, deleteDoc, doc } from "firebase/firestore";

import UsersCollection from "../models/User.js";

// Create User
export const createUser = async (req, res) => {
  try {
    const { Firstname, Lastname, Email, Password, Role } = req.body;

    const newUser = {
      Firstname,
      Lastname,
      Email,
      Password,
      Role,
      CreatedAt: new Date(),
      UpdatedAt: new Date(),
    };

    await addDoc(UsersCollection, newUser);

    res.status(201).json({
      success: true,
      message: "User created successfully",
    });
  } catch (error) {
    console.error("Create User Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { Email, Password } = req.body;

    const snapshot = await getDocs(UsersCollection);

    const users = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const user = users.find((user) => user.Email === Email);

    if (user && user.Password === Password) {
      res.status(200).json({
        success: true,
        message: "User logged in successfully",
      });
    } else {
      res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }
  } catch (error) {
    console.error("Login User Error:", error);
  }
};

// Get Users
export const getUsers = async (req, res) => {
  try {
    const snapshot = await getDocs(UsersCollection);

    const users = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Get Users Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Update User
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;

    const { Firstname, Lastname, Email, Password, Role } = req.body;

    const userRef = doc(UsersCollection, id);

    await updateDoc(userRef, {
      Firstname,
      Lastname,
      Email,
      Password,
      Role,
      UpdatedAt: new Date(),
    });

    res.status(200).json({
      success: true,
      message: "User updated successfully",
    });
  } catch (error) {
    console.error("Update User Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete User
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const userRef = doc(UsersCollection, id);

    await deleteDoc(userRef);

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Delete User Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
