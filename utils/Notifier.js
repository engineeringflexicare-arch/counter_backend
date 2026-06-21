import { Notification } from "../models/Notification.js";

// Internal Core Engine (මෙය පිටතට export නොකෙරේ)
const dispatch = async ({ title, message, type, targetRole, targetUser, createdBy }) => {
  try {
    await Notification.create({
      title,
      message,
      type: type || "SYSTEM",
      targetRole: targetRole || null,
      targetUser: targetUser || null,
      createdBy: createdBy || "System",
    });
  } catch (err) {
    console.error(`[Notification Hub Error] -> role:${targetRole} | title:${title}`, err.message);
  }
};

// ============================================================================
// THE NOTIFIER HUB (මුළු Project එකේම Notifications යවන්නේ මේකෙන් විතරයි)
// ============================================================================
export const Notifier = {
  // 1. ADMIN ට පමණක් යැවීමට (Security, Critical Errors, New Account Approvals)
  toAdmin: (title, message, type = "ADMIN_ALERT", createdBy = "System") => dispatch({ title, message, type, targetRole: "Admin", createdBy }),

  // 2. SUPERUSER ට පමණක් යැවීමට (Master Data Updates, Daily Target Overrides)
  toSuperuser: (title, message, type = "SUPERUSER_INFO", createdBy = "System") => dispatch({ title, message, type, targetRole: "Superuser", createdBy }),

  // 3. SUPERVISOR ට පමණක් යැවීමට (Machine Down Alerts, Hourly Production Gaps)
  toSupervisor: (title, message, type = "SUPERVISOR_INFO", createdBy = "System") => dispatch({ title, message, type, targetRole: "Supervisor", createdBy }),

  // 4. OPERATOR ට පමණක් යැවීමට (Line Start/Stop warnings, Shift schedules)
  toOperator: (title, message, type = "OPERATOR_INFO", createdBy = "System") => dispatch({ title, message, type, targetRole: "Operator", createdBy }),

  // 5. නිශ්චිත එක් පුද්ගලයෙකුට පමණක් (Account Block/Unblock, Password Reset)
  toUser: (userId, title, message, type = "PERSONAL", createdBy = "System") => dispatch({ title, message, type, targetRole: null, targetUser: userId, createdBy }),

  // 6. කර්මාන්තශාලාවේ සැමටම පොදුවේ (System Broadcasts)
  toAll: (title, message, type = "BROADCAST", createdBy = "System") => dispatch({ title, message, type, targetRole: "ALL", createdBy }),
};
