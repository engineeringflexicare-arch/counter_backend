import { ref, get, update } from "firebase/database";
import { rtdb } from "../database.js";

import jwt from "jsonwebtoken";

// Me function eka thamai athulath wena token eka check karanne
const getAuthUser = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.split(" ")[1];
  try {
    return jwt.verify(token, process.env.JWT_SECRET); // Token eka decode karanawa
  } catch (err) {
    return null;
  }
};
export const getAllData = async (req, res) => {
  try {
    const snapshot = await get(ref(rtdb, "/"));

    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        message: "No data found",
      });
    }

    res.status(200).json({
      success: true,
      data: snapshot.val(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getMachineStatus = async (req, res) => {
  try {
    const { machineId } = req.params;

    const snapshot = await get(ref(rtdb, `Machine_01/LiveStatus`));

    res.status(200).json({
      success: true,
      data: snapshot.val(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
export const getAllLines = async (req, res) => {
  try {
    const snapshot = await get(ref(rtdb, `Lines`));

    res.status(200).json({
      success: true,
      data: snapshot.val(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getCounterHistory = async (req, res) => {
  try {
    const { machineId } = req.params;

    const snapshot = await get(ref(rtdb, `${machineId}/CounterHistory`));

    res.status(200).json({
      success: true,
      data: snapshot.val(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// export async function getHourlyProduction(req, res) {
//   const { machineId } = req.params;

//   const hours = [
//     "08:00-09:00",
//     "09:00-10:00",
//     "10:00-11:00",
//     "11:00-12:00",
//     "12:00-13:00",
//     "13:00-14:00",
//     "14:00-15:00",
//     "15:00-16:00",
//     "16:00-17:00",
//     "17:00-18:00",
//     "18:00-19:00",
//     "19:00-20:00",
//     "20:00-21:00",
//     "21:00-22:00",
//     "22:00-23:00",
//     "23:00-00:00",
//     "00:00-01:00",
//     "01:00-02:00",
//     "02:00-03:00",
//     "03:00-04:00",
//     "04:00-05:00",
//     "05:00-06:00",
//     "06:00-07:00",
//     "07:00-08:00",
//   ];

//   try {
//     const snapshot = await get(ref(rtdb, `${machineId}/CounterHistory`));

//     if (!snapshot.exists()) {
//       return res.status(404).json({
//         success: false,
//         message: "No CounterHistory found",
//       });
//     }

//     const history = Object.values(snapshot.val());

//     const result = {};

//     hours.forEach((hour) => {
//       result[hour] = 0;
//     });

//     // Group records by hour
//     const grouped = {};

//     history.forEach((item) => {
//       const date = new Date(item.Time.replace(/\//g, "-"));

//       const hour = date.getHours();
//       const nextHour = (hour + 1) % 24;

//       const range = `${String(hour).padStart(2, "0")}:00-` + `${String(nextHour).padStart(2, "0")}:00`;

//       if (!grouped[range]) {
//         grouped[range] = [];
//       }

//       grouped[range].push({
//         count: Number(item.Count),
//         time: date.getTime(),
//       });
//     });

//     // Calculate production for each hour
//     Object.keys(grouped).forEach((range) => {
//       const records = grouped[range].sort((a, b) => a.time - b.time);

//       let output = 0;

//       for (let i = 1; i < records.length; i++) {
//         const current = records[i].count;
//         const previous = records[i - 1].count;

//         if (current >= previous) {
//           output += current - previous;
//         } else {
//           // Counter reset
//           output += current;
//         }
//       }

//       result[range] = output;
//     });

//     return res.status(200).json({
//       success: true,
//       machineId,
//       data: hours.map((hour) => ({
//         hour,
//         output: result[hour] || 0,
//       })),
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// }

// export async function getHourlyProduction(req, res) {
//   const { machineId } = req.params;
//   const { date } = req.query;

//   const hours = [
//     "08:00-09:00",
//     "09:00-10:00",
//     "10:00-11:00",
//     "11:00-12:00",
//     "12:00-13:00",
//     "13:00-14:00",
//     "14:00-15:00",
//     "15:00-16:00",
//     "16:00-17:00",
//     "17:00-18:00",
//     "18:00-19:00",
//     "19:00-20:00",
//     "20:00-21:00",
//     "21:00-22:00",
//     "22:00-23:00",
//     "23:00-00:00",
//     "00:00-01:00",
//     "01:00-02:00",
//     "02:00-03:00",
//     "03:00-04:00",
//     "04:00-05:00",
//     "05:00-06:00",
//     "06:00-07:00",
//     "07:00-08:00",
//   ];

//   try {
//     const snapshot = await get(ref(rtdb, `${machineId}/CounterHistory`));

//     if (!snapshot.exists()) {
//       return res.status(404).json({
//         success: false,
//         message: "No CounterHistory found",
//       });
//     }

//     const selectedDate = date ? new Date(date) : new Date();

//     const history = Object.values(snapshot.val()).filter((item) => {
//       const itemDate = new Date(item.Time.replace(/\//g, "-"));

//       return itemDate.getFullYear() === selectedDate.getFullYear() && itemDate.getMonth() === selectedDate.getMonth() && itemDate.getDate() === selectedDate.getDate();
//     });

//     const result = {};

//     hours.forEach((hour) => {
//       result[hour] = 0;
//     });

//     const grouped = {};

//     history.forEach((item) => {
//       const itemDate = new Date(item.Time.replace(/\//g, "-"));

//       const hour = itemDate.getHours();
//       const nextHour = (hour + 1) % 24;

//       const range = `${String(hour).padStart(2, "0")}:00-` + `${String(nextHour).padStart(2, "0")}:00`;

//       if (!grouped[range]) {
//         grouped[range] = [];
//       }

//       grouped[range].push({
//         count: Number(item.Count),
//         time: itemDate.getTime(),
//       });
//     });

//     Object.keys(grouped).forEach((range) => {
//       const records = grouped[range].sort((a, b) => a.time - b.time);

//       let output = 0;

//       for (let i = 1; i < records.length; i++) {
//         const current = records[i].count;
//         const previous = records[i - 1].count;

//         if (current >= previous) {
//           output += current - previous;
//         } else {
//           // Counter reset detected
//           output += current;
//         }
//       }

//       result[range] = output;
//     });

//     return res.status(200).json({
//       success: true,
//       machineId,
//       date: `${selectedDate.getFullYear()}-` + `${String(selectedDate.getMonth() + 1).padStart(2, "0")}-` + `${String(selectedDate.getDate()).padStart(2, "0")}`,
//       data: hours.map((hour) => ({
//         hour,
//         output: result[hour] || 0,
//       })),
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// }

// export async function getRealtimeHourlyProduction(req, res) {
//   const { machineId } = req.params;

//   const hours = [
//     "08:00-09:00",
//     "09:00-10:00",
//     "10:00-11:00",
//     "11:00-12:00",
//     "12:00-13:00",
//     "13:00-14:00",
//     "14:00-15:00",
//     "15:00-16:00",
//     "16:00-17:00",
//     "17:00-18:00",
//     "18:00-19:00",
//     "19:00-20:00",
//     "20:00-21:00",
//     "21:00-22:00",
//     "22:00-23:00",
//     "23:00-00:00",
//     "00:00-01:00",
//     "01:00-02:00",
//     "02:00-03:00",
//     "03:00-04:00",
//     "04:00-05:00",
//     "05:00-06:00",
//     "06:00-07:00",
//     "07:00-08:00",
//   ];

//   try {
//     const snapshot = await get(ref(rtdb, `${machineId}/CounterHistory`));

//     if (!snapshot.exists()) {
//       return res.status(404).json({
//         success: false,
//         message: "No CounterHistory found",
//       });
//     }

//     const today = new Date();

//     const history = Object.values(snapshot.val()).filter((item) => {
//       const d = new Date(item.Time.replace(/\//g, "-"));

//       return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
//     });

//     const grouped = {};

//     history.forEach((item) => {
//       const d = new Date(item.Time.replace(/\//g, "-"));

//       const hour = d.getHours();
//       const nextHour = (hour + 1) % 24;

//       const range = `${String(hour).padStart(2, "0")}:00-` + `${String(nextHour).padStart(2, "0")}:00`;

//       if (!grouped[range]) {
//         grouped[range] = [];
//       }

//       grouped[range].push({
//         count: Number(item.Count),
//         time: d.getTime(),
//       });
//     });

//     const hourlyData = hours.map((range) => {
//       const records = grouped[range] || [];

//       if (records.length <= 1) {
//         return {
//           hour: range,
//           output: 0,
//         };
//       }

//       records.sort((a, b) => a.time - b.time);

//       let output = 0;

//       for (let i = 1; i < records.length; i++) {
//         const current = records[i].count;
//         const previous = records[i - 1].count;

//         if (current >= previous) {
//           output += current - previous;
//         } else {
//           // Counter Reset
//           output += current;
//         }
//       }

//       return {
//         hour: range,
//         output,
//       };
//     });

//     const totalOutput = hourlyData.reduce((sum, item) => sum + item.output, 0);

//     const currentHour = new Date().getHours();

//     const currentRange = `${String(currentHour).padStart(2, "0")}:00-` + `${String((currentHour + 1) % 24).padStart(2, "0")}:00`;

//     return res.status(200).json({
//       success: true,
//       machineId,
//       currentHour: currentRange,
//       totalOutput,
//       hourlyData,
//       lastUpdated: new Date().toISOString(),
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// }

export async function withoutResetCountHourlyData(req, res) {
  const { machineId } = req.params;
  const { date } = req.query;

  const hours = [
    "08:00-09:00",
    "09:00-10:00",
    "10:00-11:00",
    "11:00-12:00",
    "12:00-13:00",
    "13:00-14:00",
    "14:00-15:00",
    "15:00-16:00",
    "16:00-17:00",
    "17:00-18:00",
    "18:00-19:00",
    "19:00-20:00",
    "20:00-21:00",
    "21:00-22:00",
    "22:00-23:00",
    "23:00-00:00",
    "00:00-01:00",
    "01:00-02:00",
    "02:00-03:00",
    "03:00-04:00",
    "04:00-05:00",
    "05:00-06:00",
    "06:00-07:00",
    "07:00-08:00",
  ];

  try {
    const snapshot = await get(ref(rtdb, `${machineId}/CounterHistory`));

    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        message: "No CounterHistory found",
      });
    }

    const selectedDate =
      date ||
      (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      })();

    // 1. අදාළ දිනයට අදාළ දත්ත පමණක් ගෙන වෙලාව අනුව පෙළගස්වන්න
    const history = Object.values(snapshot.val())
      .filter((item) => {
        if (!item.Time) return false;
        const itemDate = item.Time.split(" ")[0].replace(/\//g, "-");
        return itemDate === selectedDate;
      })
      .sort((a, b) => a.Time.localeCompare(b.Time));

    // 2. සෑම පැයකටම අදාළ අවසාන Count අගය පමණක් වෙන් කර ගැනීම
    const lastCountsByHour = {};
    history.forEach((item) => {
      const timePart = item.Time.split(" ")[1];
      const hourStr = timePart.split(":")[0]; // උදා: "08", "09"
      lastCountsByHour[hourStr] = Number(item.Count || 0);
    });

    const chronologicalOutputs = {};
    let previousLastCount = 0;

    // 3. දවසේ මුල සිට අගට (00:00 සිට 23:00 දක්වා) නිෂ්පාදනය ගණනය කිරීම
    for (let i = 0; i < 24; i++) {
      const hourStr = String(i).padStart(2, "0");
      const nextHourStr = String((i + 1) % 24).padStart(2, "0");
      const range = `${hourStr}:00-${nextHourStr}:00`;

      if (lastCountsByHour[hourStr] !== undefined) {
        const currentLastCount = lastCountsByHour[hourStr];

        if (currentLastCount >= previousLastCount) {
          chronologicalOutputs[range] = currentLastCount - previousLastCount;
        } else {
          // යම් හෙයකින් යන්ත්‍රය Reset වී ඇත්නම් පමණක්
          chronologicalOutputs[range] = currentLastCount;
        }
        previousLastCount = currentLastCount;
      } else {
        chronologicalOutputs[range] = 0;
      }
    }

    // 4. අවසානයට අදාළ hours array එකේ (Shift එකේ) පිළිවෙලට Data සකස් කිරීම
    const hourlyData = hours.map((range) => {
      return {
        hour: range,
        output: chronologicalOutputs[range] || 0,
      };
    });

    const totalOutput = hourlyData.reduce((sum, item) => sum + item.output, 0);

    const currentHourNum = new Date().getHours();
    const currentRange = `${String(currentHourNum).padStart(2, "0")}:00-${String((currentHourNum + 1) % 24).padStart(2, "0")}:00`;
    const currentHourOutput = hourlyData.find((item) => item.hour === currentRange)?.output || 0;

    return res.status(200).json({
      success: true,
      machineId,
      date: selectedDate,
      totalOutput,
      currentHour: currentRange,
      currentHourOutput,
      hourlyData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

//Toatal output එක ගණනය කිරීමේදී counter reset වීමක් හඳුනා ගැනීමේදී පමණක් reset count එක add කරන logic එකක් තියෙනවා. ඒක නිසා counter reset වුණත් production එකට add වෙනවා.

export async function getTotalOutput(req, res) {
  const { machineId } = req.params;
  const { date } = req.query;

  // Shift එකට අදාළ පැය මාලාව
  const hours = [
    "08:00-09:00",
    "09:00-10:00",
    "10:00-11:00",
    "11:00-12:00",
    "12:00-13:00",
    "13:00-14:00",
    "14:00-15:00",
    "15:00-16:00",
    "16:00-17:00",
    "17:00-18:00",
    "18:00-19:00",
    "19:00-20:00",
    "20:00-21:00",
    "21:00-22:00",
    "22:00-23:00",
    "23:00-00:00",
    "00:00-01:00",
    "01:00-02:00",
    "02:00-03:00",
    "03:00-04:00",
    "04:00-05:00",
    "05:00-06:00",
    "06:00-07:00",
    "07:00-08:00",
  ];

  try {
    const snapshot = await get(ref(rtdb, `Machines/${machineId}/CounterHistory`));

    if (!snapshot.exists()) {
      return res.status(200).json({
        success: true,
        machineId,
        date: date || new Date().toISOString().split("T")[0],
        totalOutput: 0,
        currentHour: "N/A",
        currentHourOutput: 0,
        hourlyData: hours.map((hour) => ({ hour, output: 0 })), // සියලුම පැය වලට 0 යවයි
      });
    }

    const selectedDate =
      date ||
      (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      })();

    // 1. අද දවසේ දත්ත පමණක් වෙන් කරගැනීම සහ වෙලාව අනුව පෙළගැස්වීම
    const history = Object.values(snapshot.val())
      .filter((item) => {
        if (!item.Time) return false;
        const itemDate = item.Time.split(" ")[0].replace(/\//g, "-");
        return itemDate === selectedDate;
      })
      .sort((a, b) => a.Time.localeCompare(b.Time));

    // 2. සෑම පැයක් සඳහාම වාර්තා වී ඇති "අවසාන Count අගය" ලබා ගැනීම
    // (Real-time එකේදී Current Hour එකට අදාළව මේ මොහොතේ අගය මෙයට ලැබේ)
    const lastCountsByHour = {};
    history.forEach((item) => {
      const timePart = item.Time.split(" ")[1];
      const hourStr = timePart.split(":")[0];
      lastCountsByHour[hourStr] = Number(item.Count || 0);
    });

    const chronologicalOutputs = {};
    let previousLastCount = 0;

    // 3. දවසේ පැය 24 පුරාවටම ගණනය කිරීම (00:00 සිට 23:00 දක්වා අනුපිළිවෙලින්)
    for (let i = 0; i < 24; i++) {
      const hourStr = String(i).padStart(2, "0");
      const nextHourStr = String((i + 1) % 24).padStart(2, "0");
      const range = `${hourStr}:00-${nextHourStr}:00`;

      if (lastCountsByHour[hourStr] !== undefined) {
        const currentLastCount = lastCountsByHour[hourStr];

        if (currentLastCount >= previousLastCount) {
          chronologicalOutputs[range] = currentLastCount - previousLastCount;
        } else {
          // යන්ත්‍රය Reset වී ඇත්නම් පමණක්
          chronologicalOutputs[range] = currentLastCount;
        }
        previousLastCount = currentLastCount;
      } else {
        chronologicalOutputs[range] = 0;
      }
    }

    // 4. Shift එකේ පිළිවෙලට (උදෑසන 8 සිට) Data සකස් කිරීම
    const hourlyData = hours.map((range) => ({
      hour: range,
      output: chronologicalOutputs[range] || 0,
    }));

    // සම්පූර්ණ එකතුව හරියටම දවසේ අවසාන Count එකට සමාන වේ
    const totalOutput = hourlyData.reduce((sum, item) => sum + item.output, 0);

    const currentHourNum = new Date().getHours();
    const currentRange = `${String(currentHourNum).padStart(2, "0")}:00-${String((currentHourNum + 1) % 24).padStart(2, "0")}:00`;

    // දැනට පවතින පැයේ Real-time නිෂ්පාදනය
    const currentHourOutput = hourlyData.find((item) => item.hour === currentRange)?.output || 0;

    return res.status(200).json({
      success: true,
      machineId,
      date: selectedDate,
      totalOutput, // හරියටම 3923 ලෙස ලැබෙනු ඇත
      currentHour: currentRange,
      currentHourOutput, // Dashboard එකේ මේ මොහොතේ පැයට අදාළ අගය
      hourlyData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}
export async function getProductionGaps(req, res) {
  const { machineId } = req.params;
  const { date } = req.query;

  try {
    const snapshot = await get(ref(rtdb, `Machines/${machineId}/CounterHistory`));

    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        message: "No CounterHistory found",
      });
    }

    // දින ලබා දී නොමැති නම් අද දිනය ලබා ගැනීම
    const selectedDate =
      date ||
      (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      })();

    // 1. අදාළ දිනයට අදාළ දත්ත පමණක් වෙන් කර, Timestamp එක අනුව පෙළගස්වන්න
    const history = Object.values(snapshot.val())
      .filter((item) => {
        if (!item.Time) return false;
        const itemDate = item.Time.split(" ")[0].replace(/\//g, "-");
        return itemDate === selectedDate;
      })
      .sort((a, b) => a.timestamp - b.timestamp); // ESP32 එකෙන් එවන Unix Timestamp එකෙන් sort කිරීම

    const gapData = [];
    let totalGap = 0;
    let validGapCount = 0;

    // 2. එකකට පසු එකක් එන Count අතර පරතරය තත්පර වලින් ගණනය කිරීම
    for (let i = 1; i < history.length; i++) {
      const current = history[i];
      const previous = history[i - 1];

      // මැෂින් එක Reset වුණ වෙලාවල් මඟහැරීම (Count එක වැඩි වුණා නම් පමණක් ගණනය කිරීම)
      if (current.Count > previous.Count) {
        let gapSeconds = 0;

        // ESP32 එකෙන් එවන Timestamp (තත්පර) භාවිතා කර පරතරය සෙවීම
        if (current.timestamp && previous.timestamp) {
          gapSeconds = current.timestamp - previous.timestamp;
        } else {
          // යම් හෙයකින් Timestamp නොමැති නම්, Time string එකෙන් ගණනය කිරීම
          const currTime = new Date(current.Time.replace(/\//g, "-")).getTime() / 1000;
          const prevTime = new Date(previous.Time.replace(/\//g, "-")).getTime() / 1000;
          gapSeconds = currTime - prevTime;
        }

        // ඍණ අගයන් හෝ අසාමාන්‍ය පරතරයන් ඉවත් කිරීම
        if (gapSeconds >= 0) {
          gapData.push({
            count: current.Count,
            time: current.Time.split(" ")[1], // "08:15:30" ලෙස වෙලාව පමණක් වෙන් කිරීම
            gapSeconds: Math.round(gapSeconds),
          });

          totalGap += gapSeconds;
          validGapCount++;
        }
      }
    }

    // 3. සාමාන්‍ය කාල පරතරය (Average Gap) ගණනය කිරීම
    const averageGap = validGapCount > 0 ? Math.round(totalGap / validGapCount) : 0;

    // 4. ප්‍රතිඵලය Frontend එකට යැවීම
    return res.status(200).json({
      success: true,
      machineId,
      date: selectedDate,
      averageGap,
      data: gapData, // Graph එකට කෙලින්ම දිය හැකි Array එක
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}
export const assignLine = async (req, res) => {
  const user = getAuthUser(req);

  // 1. User ලොග් වී නැත්නම්
  if (!user) {
    return res.status(401).json({ success: false, message: "Unauthorized: No token provided." });
  }

  // 2. Roles තුනම අනුමත වන පරිදි සකසන්න
  const allowedRoles = ["Admin", "Supervisor", "Superuser"];

  if (!allowedRoles.includes(user.role)) {
    return res.status(403).json({
      success: false,
      message: `Access Denied: Your role '${user.role}' does not have permission to assign lines.`,
    });
  }

  const { lineId, machineId, productCode, dailyTarget, hourlyTarget, teamMembers, shift, supervisor, shiftStartTime, shiftEndTime, floor } = req.body;

  if (!lineId) {
    return res.status(400).json({ success: false, message: "Line ID is required." });
  }

  try {
    const lineRef = ref(rtdb, `Lines/${lineId}`);
    await update(lineRef, {
      machineId: machineId || "",
      productCode: productCode || "",
      dailyTarget: Number(dailyTarget) || 0,
      hourlyTarget: Number(hourlyTarget) || 0,
      plannedMembers: Number(teamMembers) || 0,
      shift: shift || "",
      supervisor: supervisor || "",
      shiftStartTime: shiftStartTime || "",
      shiftEndTime: shiftEndTime || "",
      floor: floor || "",
      assignedBy: user.name,
      assignedAt: new Date().toISOString(),
    });

    return res.status(200).json({ success: true, message: `Line ${lineId} assignment updated successfully.` });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to update assignment." });
  }
};

export const removeAssignment = async (req, res) => {
  // Remove කිරීමත් Admin/Superuser ට පමණක් සීමා කිරීම වඩාත් ආරක්ෂිතයි
  const user = getAuthUser(req);

  if (!user || (user.role !== "Admin" && user.role !== "Superuser")) {
    return res.status(403).json({
      success: false,
      message: "Access Denied: Only Admins and Superusers can remove line assignments.",
    });
  }

  const { lineId } = req.body;

  if (!lineId) {
    return res.status(400).json({ success: false, message: "Line ID is required." });
  }

  try {
    const lineRef = ref(rtdb, `Lines/${lineId}`);
    await update(lineRef, {
      machineId: "",
      productCode: "",
      dailyTarget: 0,
      hourlyTarget: 0,
      plannedMembers: 0,
      totalProductCount: 0,
      shift: "",
      supervisor: "",
      shiftStartTime: "",
      shiftEndTime: "",
      floor: "",
      assignedBy: "",
      assignedAt: "",
    });

    return res.status(200).json({ success: true, message: `Assignment for ${lineId} removed successfully.` });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to remove assignment." });
  }
};

// =========================================================
// 4. Supervisor අනුව Data Filter කිරීම
// =========================================================

export const getLinesChanges = async (req, res) => {
  // කෙලින්ම Token එකෙන් User ව ගන්නවා
  const user = getAuthUser(req);

  try {
    const snapshot = await get(ref(rtdb, `Lines`));
    let lines = snapshot.val() || {};

    // User කෙනෙක් ඉන්නවා නම් සහ ඔහු Supervisor නම් පමණක් Filter කරනවා
    if (user && user.role === "Supervisor") {
      const supervisorName = user.name;

      const filteredLines = {};
      Object.keys(lines).forEach((key) => {
        if (lines[key].supervisor === supervisorName) {
          filteredLines[key] = lines[key];
        }
      });
      lines = filteredLines; // Supervisor ට පේන්නේ අදාළ Lines විතරයි
    }

    res.status(200).json({ success: true, data: lines });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
export const updateLineDetails = async (req, res) => {
  // 1. Token එකෙන් User ව ලබා ගැනීම (කලින් හැදූ getAuthUser function එක හරහා)
  const user = getAuthUser(req);

  // 2. Role එක පරීක්ෂා කිරීම (Admin, Superuser හෝ Supervisor පමණක් දැයි බැලීම)
  const allowedRoles = ["Admin", "Superuser", "Supervisor"];
  if (!user || !allowedRoles.includes(user.role)) {
    return res.status(403).json({
      success: false,
      message: "Access Denied: Only Admins, Superusers, and Supervisors can update line details.",
    });
  }

  // 3. Frontend එකෙන් එවන දත්ත ලබා ගැනීම
  const { lineId, machineId, productCode, dailyTarget, hourlyTarget, teamMembers, shift, floor } = req.body;

  if (!lineId) {
    return res.status(400).json({ success: false, message: "Line ID is required." });
  }

  try {
    const lineRef = ref(rtdb, `Lines/${lineId}`);
    const snapshot = await get(lineRef);

    if (!snapshot.exists()) {
      return res.status(404).json({ success: false, message: "Line not found." });
    }

    const currentLineData = snapshot.val();

    // 4. Supervisor කෙනෙක් නම්, මේ Line එක ඔහුගේදැයි පරීක්ෂා කිරීම
    if (user.role === "Supervisor" && currentLineData.supervisor !== user.name) {
      return res.status(403).json({
        success: false,
        message: "Access Denied: You can only update details of lines assigned to you.",
      });
    }

    // 5. දත්ත Update කිරීම (Supervisor ට වෙනස් කළ නොහැකි දේවල් වෙන් කර ඇත)
    // උදාහරණයක් ලෙස Supervisor ගේ නම වෙනස් කිරීමට ඉඩ දී නැත (එය Admin ට පමණක් කළ හැක)
    await update(lineRef, {
      machineId: machineId !== undefined ? machineId : currentLineData.machineId,
      productCode: productCode !== undefined ? productCode : currentLineData.productCode,
      dailyTarget: dailyTarget !== undefined ? Number(dailyTarget) : currentLineData.dailyTarget,
      hourlyTarget: hourlyTarget !== undefined ? Number(hourlyTarget) : currentLineData.hourlyTarget,
      plannedMembers: teamMembers !== undefined ? Number(teamMembers) : currentLineData.plannedMembers,
      shift: shift !== undefined ? shift : currentLineData.shift,
      floor: floor !== undefined ? floor : currentLineData.floor,
      updatedBy: user.name, // දත්ත වෙනස් කළේ කවුද යන්න සටහන් වේ
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: `Line ${lineId} details updated successfully.`,
    });
  } catch (error) {
    console.error("Update Line Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update line details.",
    });
  }
};

export const getMachineData = async (req, res) => {
  const { machineId } = req.params; // { } යොදා destructure කරන්න

  try {
    // ඔබේ Firebase JSON ව්‍යුහය අනුව 'Machines' යන්න Capital අකුරින් තිබේ නම් එයම භාවිතා කරන්න
    const snapshot = await get(ref(rtdb, `Machines/${machineId}`));
    const machineData = snapshot.val();

    if (!machineData) {
      return res.status(404).json({ success: false, message: "Machine not found" });
    }

    res.status(200).json({ success: true, data: machineData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
export const getSingleLine = async (req, res) => {
  const { lineId } = req.params;
  try {
    const snapshot = await get(ref(rtdb, `Lines/${lineId}`));
    if (!snapshot.exists()) {
      return res.status(404).json({ success: false, message: "Line not found" });
    }
    res.status(200).json({ success: true, data: snapshot.val() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
