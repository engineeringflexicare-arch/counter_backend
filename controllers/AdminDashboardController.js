import { ref, get } from "firebase/database";
import { rtdb } from "../database.js";
import UsersCollection from "../models/User.js";
import { getDocs } from "firebase/firestore";

// ==========================================
// Admin Dashboard Controller
// ==========================================

export const getDashboardStats = async (req, res) => {
  try {
    // 1. Get Lines (Factories proxy) & Machines from Realtime Database
    const linesSnapshot = await get(ref(rtdb, "Lines"));
    const machinesSnapshot = await get(ref(rtdb, "Machines"));

    const linesData = linesSnapshot.val() || {};
    const machinesData = machinesSnapshot.val() || {};

    const lineEntries = Object.entries(linesData);
    const machineEntries = Object.entries(machinesData);

    // 2. Total Factories -> number of production lines configured
    const totalFactories = lineEntries.length;

    // 3. Machines Online -> count machines whose status is "online"
    const machinesOnline = machineEntries.filter(([, machine]) => (machine.status || "").toLowerCase() === "online").length;

    const totalMachines = machineEntries.length;

    // 4. Total Users -> from Firestore Users collection
    const usersSnapshot = await getDocs(UsersCollection);
    const totalUsers = usersSnapshot.size;

    // 5. Production Today -> sum of LiveStatus/Count for each machine
    let productionToday = 0;
    machineEntries.forEach(([, machine]) => {
      const count = machine?.LiveStatus?.Count;
      if (typeof count === "number") {
        productionToday += count;
      } else if (typeof count === "string" && !isNaN(Number(count))) {
        productionToday += Number(count);
      }
    });

    // 6. Production Efficiency & OEE -> based on dailyTarget vs production
    let totalDailyTarget = 0;
    lineEntries.forEach(([, line]) => {
      totalDailyTarget += Number(line.dailyTarget || 0);
    });

    const productionEfficiency = totalDailyTarget > 0 ? Math.min(100, Math.round((productionToday / totalDailyTarget) * 100)) : 0;

    // OEE = Efficiency * (machinesOnline / totalMachines ratio) as a simple approximation
    const availability = totalMachines > 0 ? machinesOnline / totalMachines : 0;
    const oee = Math.round(productionEfficiency * availability);

    // 7. Best Performing Line -> line with highest (production/target) ratio
    let bestLine = null;
    let bestRatio = -1;

    lineEntries.forEach(([lineId, line]) => {
      const machineId = line.machineId;
      const machine = machinesData[machineId];
      const count = Number(machine?.LiveStatus?.Count || 0);
      const target = Number(line.dailyTarget || 0);

      if (target > 0) {
        const ratio = count / target;
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestLine = lineId;
        }
      }
    });

    // 8. Shift Target Achievement -> overall production / overall target (capped at 100%)
    const shiftTargetAchievement = totalDailyTarget > 0 ? Math.min(100, Math.round((productionToday / totalDailyTarget) * 100)) : 0;

    // 9. System Status (static/basic check, since DB connection succeeded if we got here)
    const systemStatus = [
      { label: "Backend API", status: "Online" },
      { label: "Database", status: "Connected" },
      { label: "MQTT Broker", status: "Running" },
      { label: "WebSocket", status: "Active" },
    ];

    // 10. Alerts -> generate dynamically based on simple rules
    const alerts = [];

    machineEntries.forEach(([machineId, machine]) => {
      const status = (machine.status || "").toLowerCase();
      const machineState = (machine.machineState || "").toLowerCase();

      if (status === "offline" || machineState === "stopped") {
        alerts.push({
          message: `Machine ${machine.machineName || machineId} stopped unexpectedly.`,
          level: "warning",
        });
      }
    });

    lineEntries.forEach(([lineId, line]) => {
      const machineId = line.machineId;
      const machine = machinesData[machineId];
      const count = Number(machine?.LiveStatus?.Count || 0);
      const target = Number(line.dailyTarget || 0);

      if (target > 0 && count < target * 0.5) {
        alerts.push({
          message: `${lineId} production below target.`,
          level: "danger",
        });
      }
    });

    if (alerts.length === 0) {
      alerts.push({
        message: "All systems operating normally.",
        level: "success",
      });
    }

    // ==========================================
    // Final Response
    // ==========================================
    return res.status(200).json({
      success: true,
      data: {
        stats: {
          totalFactories,
          totalUsers,
          machinesOnline,
          totalMachines,
          productionToday,
        },
        systemStatus,
        performance: {
          bestPerformingLine: bestLine || "N/A",
          activeMachines: `${machinesOnline} / ${totalMachines}`,
          shiftTargetAchievement: `${shiftTargetAchievement}%`,
          productionEfficiency: `${productionEfficiency}%`,
          oee: `${oee}%`,
        },
        alerts,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
