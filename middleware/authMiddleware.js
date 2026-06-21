// middleware/authMiddleware.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

export const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Unauthorized: No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Contains { id, role, EmployeeNumber, etc. }
    next();
  } catch (error) {
    const message = error.name === "TokenExpiredError" ? "Unauthorized: Token expired" : "Unauthorized: Invalid token";
    res.status(401).json({ success: false, message });
  }
};

// Role Hierarchy Mapping (lower number = higher privilege)
const roleHierarchy = {
  SuperAdmin: 1,
  Admin: 2,
  Superuser: 3,
  Supervisor: 4,
  Viewer: 5,
};

const checkRole = (minRoleLevel) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ success: false, message: "Forbidden: No role assigned" });
    }

    const userRoleLevel = roleHierarchy[req.user.role];
    
    if (!userRoleLevel || userRoleLevel > minRoleLevel) {
      return res.status(403).json({ success: false, message: `Forbidden: Requires higher privileges` });
    }

    next();
  };
};

export const requireAdmin = checkRole(roleHierarchy.Admin);
export const requireSuperuser = checkRole(roleHierarchy.Superuser);
export const requireSupervisor = checkRole(roleHierarchy.Supervisor);
export const requireViewer = checkRole(roleHierarchy.Viewer);
