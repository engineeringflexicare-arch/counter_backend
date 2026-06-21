import bcrypt from "bcrypt";
import User from "../models/Users.js";

// 🔔 අලුත් Notifier එක Import කරගැනීම
import { Notifier } from "../utils/Notifier.js";

// 1. GET SUPERVISORS ONLY
export const getSupervisedUsers = async (req, res) => {
  try {
    const supervisors = await User.find({ role: "Supervisor" }).select("-password");
    return res.status(200).json({
      success: true,
      count: supervisors.length,
      data: supervisors,
    });
  } catch (error) {
    console.error("Get Supervised Users Error:", error);
    // ⚠️ Error එකක් ආවොත් Admin ට යැවීම
    Notifier.toAdmin("System Error", `Get Supervisors Error: ${error.message}`, "CRITICAL_ERROR", req.user?.name || "System");
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 2. CREATE SUPERVISOR
export const createSupervisor = async (req, res) => {
  try {
    const { name, FirstName, email, employeeId, EmployeeId, password, LastName } = req.body;

    const finalFirstName = FirstName || name;
    const finalEmpId = EmployeeId || employeeId;

    if (!finalEmpId || !finalFirstName || !email || !password) {
      return res.status(400).json({ success: false, message: "Required fields missing" });
    }

    const numericEmpId = Number(finalEmpId);
    if (isNaN(numericEmpId)) {
      return res.status(400).json({ success: false, message: "Employee ID must be a valid number" });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { EmployeeId: numericEmpId }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Supervisor already exists with this Email or Employee ID",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const supervisor = await User.create({
      EmployeeId: numericEmpId,
      FirstName: finalFirstName,
      LastName: LastName || "",
      email,
      password: hashedPassword,
      role: "Supervisor",
    });

    // 🔔 අලුත් Supervisor කෙනෙක් හැදුවම Superuser ට දැනුම් දීම
    Notifier.toSuperuser("New Supervisor Created", `${supervisor.FirstName} was added as a Supervisor`, "USER_MANAGEMENT", req.user?.name || "System");

    return res.status(201).json({
      success: true,
      message: "Supervisor created successfully!",
      data: {
        id: supervisor._id,
        employeeId: supervisor.EmployeeId,
        firstName: supervisor.FirstName,
        role: supervisor.role,
      },
    });
  } catch (error) {
    console.error("Create Supervisor Error:", error);
    // ⚠️ Error එකක් ආවොත් Admin ට යැවීම
    Notifier.toAdmin("System Error", `Create Supervisor Error: ${error.message}`, "CRITICAL_ERROR", req.user?.name || "System");
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 3. BLOCK SUPERVISOR
export const blockSupervisor = async (req, res) => {
  try {
    const { id } = req.params;
    const supervisor = await User.findById(id);

    if (!supervisor) {
      return res.status(404).json({ success: false, message: "Supervisor not found" });
    }

    supervisor.isBlocked = true;
    await supervisor.save();

    // 🔔 Block කළාම අදාළ Supervisor ට සහ Superuser ට දැනුම් දීම
    Notifier.toUser(supervisor._id, "Account Blocked", "Your Supervisor account has been blocked.", "USER_STATUS", req.user?.name || "System");
    Notifier.toSuperuser("Supervisor Blocked", `Supervisor ${supervisor.FirstName}'s account was blocked.`, "USER_MANAGEMENT", req.user?.name || "System");

    return res.status(200).json({ success: true, message: "Supervisor blocked successfully" });
  } catch (error) {
    // ⚠️ Error එකක් ආවොත් Admin ට යැවීම
    Notifier.toAdmin("System Error", `Block Supervisor Error: ${error.message}`, "CRITICAL_ERROR", req.user?.name || "System");
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 4. UNBLOCK SUPERVISOR
export const unblockSupervisor = async (req, res) => {
  try {
    const { id } = req.params;
    const supervisor = await User.findById(id);

    if (!supervisor) {
      return res.status(404).json({ success: false, message: "Supervisor not found" });
    }

    supervisor.isBlocked = false;
    await supervisor.save();

    // 🔔 Unblock කළාම අදාළ Supervisor ට සහ Superuser ට දැනුම් දීම
    Notifier.toUser(supervisor._id, "Account Unblocked", "Your Supervisor account has been unblocked.", "USER_STATUS", req.user?.name || "System");
    Notifier.toSuperuser("Supervisor Unblocked", `Supervisor ${supervisor.FirstName}'s account was unblocked.`, "USER_MANAGEMENT", req.user?.name || "System");

    return res.status(200).json({ success: true, message: "Supervisor unblocked successfully" });
  } catch (error) {
    // ⚠️ Error එකක් ආවොත් Admin ට යැවීම
    Notifier.toAdmin("System Error", `Unblock Supervisor Error: ${error.message}`, "CRITICAL_ERROR", req.user?.name || "System");
    return res.status(500).json({ success: false, message: error.message });
  }
};
