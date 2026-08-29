// middleware/authMiddleware.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

export const verifyToken = (req, res, next) => {
  let token = null;

  // 1. Try extracting from HttpOnly cookie manually (since cookie-parser is not installed)
  if (req.headers.cookie) {
    const cookies = Object.fromEntries(req.headers.cookie.split(";").map(c => c.trim().split("=")));
    if (cookies.token) {
      token = cookies.token;
    }
  }

  // 2. Fallback to Authorization header (Backward compatibility)
  if (!token && req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "Unauthorized: No token provided" });
  }

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
  Admin: 1,
  Superuser: 2,
  Supervisor: 3,
  Operator: 4,
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
export const requireOperator = checkRole(roleHierarchy.Operator);
