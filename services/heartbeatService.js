import cron from "node-cron";
import { get, ref, update } from "firebase/database";
import { rtdb } from "../database.js";
import { Line } from "../models/Line.js";
import { InjectionMachine } from "../models/InjectionMachine.js";
import { Counter } from "../models/Machine.js";
import { Notifier } from "../utils/Notifier.js";

const OFFLINE_THRESHOLD_MS = 120 * 1000;
const previousRestartCounts = new Map();
const activeWeakSignals = new Set();
let heartbeatRunning = false;

const getKnownMachineIds = async () => {
  const [lineIds, injectionIds, counterIds] = await Promise.all([
    Line.distinct("machineId"),
    InjectionMachine.distinct("machineId"),
    Counter.distinct("counterId"),
  ]);
  return [...new Set([...lineIds, ...injectionIds, ...counterIds].filter(Boolean).map(String))];
};

const readMachineHealth = async (machineId) => {
  const snapshot = await get(ref(rtdb, `Machines/${machineId}/Health`));
  return snapshot.exists() ? snapshot.val() : null;
};

export const startHeartbeatService = () => {
  console.log("⏱️ Heartbeat monitoring service started (memory-safe mode).");

  cron.schedule("* * * * *", async () => {
    // Prevent overlapping cron executions if Firebase/network is slow.
    if (heartbeatRunning) {
      console.warn("⚠️ Heartbeat cycle skipped: previous cycle still running.");
      return;
    }
    heartbeatRunning = true;

    try {
      const machineIds = await getKnownMachineIds();
      if (machineIds.length === 0) return;

      const now = Date.now();
      const updates = {};

      // Only Health nodes are read. CounterHistory/LiveStatus are never loaded.
      const healthEntries = await Promise.all(machineIds.map(async (machineId) => {
        try {
          return [machineId, await readMachineHealth(machineId)];
        } catch (error) {
          console.error(`❌ Heartbeat read failed for ${machineId}:`, error.message);
          return [machineId, null];
        }
      }));

      for (const [machineId, health] of healthEntries) {
        if (!health) continue;

        const lastSeen = Number(health.lastSeen) || 0;
        const currentlyOffline = now - lastSeen > OFFLINE_THRESHOLD_MS;

        if (currentlyOffline) {
          if (health.status !== "offline") {
            updates[`${machineId}/Health/status`] = "offline";
            Notifier.toSupervisor(
              "Machine Offline ⚠️",
              `Machine ${machineId} has not reported in the last 120 seconds.`,
              "IOT_ALERT",
            );
          }
        } else if (health.status !== "online") {
          updates[`${machineId}/Health/status`] = "online";
          Notifier.toSupervisor(
            "Machine Online 🟢",
            `Machine ${machineId} is back online and connected.`,
            "IOT_INFO",
          );
        }

        const rssi = Number(health.rssi);
        if (Number.isFinite(rssi) && rssi < -80) {
          if (!activeWeakSignals.has(machineId)) {
            Notifier.toAdmin(
              "Weak Machine Signal 📶",
              `Machine ${machineId} Wi-Fi RSSI dropped to ${rssi} dBm.`,
              "IOT_WARNING",
            );
            activeWeakSignals.add(machineId);
          }
        } else {
          activeWeakSignals.delete(machineId);
        }

        if (health.restartCount !== undefined) {
          const current = Number(health.restartCount);
          const previous = previousRestartCounts.get(machineId);
          if (Number.isFinite(current) && previous !== undefined && current > previous) {
            Notifier.toAdmin(
              "Machine Restarted ⚡",
              `Machine ${machineId} unexpectedly restarted. Total restarts: ${current}`,
              "IOT_WARNING",
            );
          }
          if (Number.isFinite(current)) previousRestartCounts.set(machineId, current);
        }
      }

      if (Object.keys(updates).length > 0) {
        await update(ref(rtdb, "Machines"), updates);
        console.log(`⏱️ Heartbeat: updated ${Object.keys(updates).length} status fields.`);
      }

      // Bound in-memory state to currently registered machines.
      const known = new Set(machineIds);
      for (const id of previousRestartCounts.keys()) if (!known.has(id)) previousRestartCounts.delete(id);
      for (const id of activeWeakSignals) if (!known.has(id)) activeWeakSignals.delete(id);
    } catch (error) {
      console.error("❌ Error in heartbeat service:", error);
      Notifier.toAdmin("Heartbeat Service Error", `Background monitoring failed: ${error.message}`, "CRITICAL_ERROR");
    } finally {
      heartbeatRunning = false;
    }
  });
};
