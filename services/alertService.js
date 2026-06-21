// පරණ Notification වෙනුවට අලුත් Notifier එක Import කරගන්න
import { Notifier } from "../utils/Notifier.js";

// In-memory cache for deduplication
// Map of machineId_alertType -> timestamp
const alertCache = new Map();

// Deduplication window in milliseconds (30 minutes)
const DEDUPLICATION_WINDOW_MS = 30 * 60 * 1000;

export const createMachineAlert = async (machineId, type, message) => {
  const cacheKey = `${machineId}_${type}`;
  const now = Date.now();

  if (alertCache.has(cacheKey)) {
    const lastAlertTime = alertCache.get(cacheKey);
    if (now - lastAlertTime < DEDUPLICATION_WINDOW_MS) {
      // Skip duplicate alert (විනාඩි 30ක් ඇතුළත ආපු එකම alert එක නම් මග හරින්න)
      return;
    }
  }

  // Update cache
  alertCache.set(cacheKey, now);

  try {
    const alertTitle = `Machine Alert: ${type}`;
    const alertMessage = `Machine ${machineId} - ${message}`;

    // =========================================================
    // 🔔 Type එක අනුව අදාළ Role එකට යොමු කිරීම (Role-based Routing)
    // =========================================================

    if (type === "Offline" || type === "Production Gap") {
      // Offline වීම් සහ Production ප්‍රමාදයන් අදාළ Supervisor ට යැවීම
      Notifier.toSupervisor(alertTitle, alertMessage, "IOT_ALERT");
    } else if (type === "Weak Signal" || type === "Restart Detected") {
      // Hardware සහ Network ගැටළු Admin/IT අංශයට යැවීම
      Notifier.toAdmin(alertTitle, alertMessage, "IOT_WARNING");
    } else {
      // වෙනත් සාමාන්‍ය Alerts Superuser ට යැවීම (Fallback)
      Notifier.toSuperuser(alertTitle, alertMessage, "MACHINE_ALERT");
    }

    console.log(`⚠️ Alert dispatched for Machine ${machineId}: ${message}`);
  } catch (error) {
    console.error("Failed to create alert:", error);
  }
};
