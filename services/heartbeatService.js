import cron from "node-cron";
import { get, ref, update } from "firebase/database";
import { rtdb } from "../database.js";

// 🔔 අලුත් Notifier එක Import කරගැනීම (පරණ alertService වෙනුවට)
import { Notifier } from "../utils/Notifier.js";

// OFFLINE_THRESHOLD: 120 seconds
const OFFLINE_THRESHOLD_MS = 120 * 1000;

// State Tracking (To prevent notification spam)
const previousRestartCounts = new Map();
const activeWeakSignals = new Set(); // RSSI දුර්වල වූ ඒවා track කිරීමට

export const startHeartbeatService = () => {
  console.log("⏱️  Heartbeat monitoring service started.");

  // Run every minute
  cron.schedule("* * * * *", async () => {
    try {
      const machinesRef = ref(rtdb, "Machines");
      const snapshot = await get(machinesRef);

      if (!snapshot.exists()) return;

      const machines = snapshot.val();
      const now = Date.now();

      const updates = {};

      for (const [machineId, machineData] of Object.entries(machines)) {
        if (!machineData.Health) continue;

        const health = machineData.Health;
        const lastSeen = health.lastSeen || 0;

        // ==========================================
        // 1. Check Offline / Online Status
        // ==========================================
        if (now - lastSeen > OFFLINE_THRESHOLD_MS) {
          if (health.status !== "offline") {
            updates[`${machineId}/Health/status`] = "offline";

            // 🔴 Machine එක Offline ගිය ගමන් Supervisor ට යැවීම
            Notifier.toSupervisor("Machine Offline ⚠️", `Machine ${machineId} has not reported in the last 120 seconds.`, "IOT_ALERT");
          }
        } else {
          // If it was offline but now reported in, mark as online
          if (health.status !== "online") {
            updates[`${machineId}/Health/status`] = "online";

            // 🟢 Machine එක ආයෙත් Online ආවම Supervisor ට යැවීම
            Notifier.toSupervisor("Machine Online 🟢", `Machine ${machineId} is back online and connected.`, "IOT_INFO");
          }
        }

        // ==========================================
        // 2. Check Weak Signal (With Spam Prevention)
        // ==========================================
        if (health.rssi && health.rssi < -80) {
          if (!activeWeakSignals.has(machineId)) {
            // පළමු වතාවට සිග්නල් drop වුණාම පමණක් Admin ට Alert කිරීම
            Notifier.toAdmin("Weak Machine Signal 📶", `Machine ${machineId} Wi-Fi RSSI dropped to ${health.rssi} dBm.`, "IOT_WARNING");
            activeWeakSignals.add(machineId);
          }
        } else {
          // සිග්නල් එක ආයෙත් හරි ගියාම Set එකෙන් අයින් කිරීම
          if (activeWeakSignals.has(machineId)) {
            activeWeakSignals.delete(machineId);
          }
        }

        // ==========================================
        // 3. Frequent Restarts Detection
        // ==========================================
        if (health.restartCount !== undefined) {
          if (previousRestartCounts.has(machineId)) {
            const prevCount = previousRestartCounts.get(machineId);
            if (health.restartCount > prevCount) {
              // 🔄 Machine එක Restart වුණාම Admin ට යැවීම
              Notifier.toAdmin("Machine Restarted ⚡", `Machine ${machineId} unexpectedly restarted. Total restarts: ${health.restartCount}`, "IOT_WARNING");
            }
          }
          previousRestartCounts.set(machineId, health.restartCount);
        }
      }

      // ==========================================
      // Apply Updates to Firebase
      // ==========================================
      if (Object.keys(updates).length > 0) {
        await update(machinesRef, updates);
        console.log(`⏱️  Heartbeat Service: Updated status for ${Object.keys(updates).length} machines.`);
      }
    } catch (error) {
      console.error("❌ Error in heartbeat service:", error);
      // ⚠️ Service එක crash වුණොත් Admin ට Alert කිරීම
      Notifier.toAdmin("Heartbeat Service Error", `Background monitoring failed: ${error.message}`, "CRITICAL_ERROR");
    }
  });
};
