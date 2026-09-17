import { get, ref, remove, update, query, orderByChild, startAt, endAt, limitToFirst } from "firebase/database";
import { rtdb } from "../database.js";
import jwt from "jsonwebtoken";
import { Notifier } from "../utils/Notifier.js";
import { Line } from "../models/Line.js";
import { LineHistory } from "../models/LineHistory.js";
import { InjectionMachine } from "../models/InjectionMachine.js";
import { InjectionMachineHistory } from "../models/InjectionMachineHistory.js";
import { CounterHistoryArchive } from "../models/CounterHistoryArchive.js";
import { Line as LineModel } from "../models/Line.js";
import { InjectionMachine as InjectionMachineModel } from "../models/InjectionMachine.js";
import { Counter } from "../models/Machine.js";
import { cacheGet, cacheSet, cached } from "../utils/memoryCache.js";

// ----------------------------------------------------------------------------
// Firebase RTDB missing-index guard.
// orderByChild("timestamp") queries against Machines/$machineId/CounterHistory
// require ".indexOn": "timestamp" to be set in the Realtime Database *rules*
// (Firebase Console -> Realtime Database -> Rules). This is a server-side
// config change, not something this backend can set for itself at runtime.
// Without it, every hourly/production/gap request fails and gets retried by
// the dashboard, which is what drives up free-tier bandwidth and CPU. We only
// log this once every 60s (instead of once per request) so a missing index
// doesn't itself become a source of log/CPU spam while it's being fixed.
let lastMissingIndexWarnAt = 0;
const isMissingIndexError = (error) => /Index not defined/i.test(error?.message || "");
const warnMissingIndexOnce = (machineId) => {
  const now = Date.now();
  if (now - lastMissingIndexWarnAt < 60_000) return;
  lastMissingIndexWarnAt = now;
  console.error(
    `🔥 Firebase Realtime Database is missing the required index for Machines/${machineId}/CounterHistory. ` +
      `Add ".indexOn": "timestamp" under Machines/$machineId/CounterHistory in the Realtime Database Rules ` +
      `tab of the Firebase Console, then Publish. See database.rules.snippet.json for the exact block to merge in.`,
  );
};

// ============================================================================
// 1. AUTH HELPER
// ============================================================================

const getAuthUser = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
};

// ============================================================================
// 2. RUN-DETECTION CONFIGURATION
// ============================================================================

const MIN_READINGS_PER_RUN = 2;
const RESET_EVENT_TYPES = new Set(["BOOT", "RESET", "MANUAL_RESET", "POWER_ON"]);
const RESET_DROP_RATIO = 0.8;
const RESTART_COUNT_THRESHOLD = 1;
const SIGNIFICANT_COUNT_FLOOR = 5;
const SMALL_FLUCTUATION_ABS = 5;
const SMALL_FLUCTUATION_RATIO = 0.02;
const OUT_OF_ORDER_TOLERANCE_SECONDS = 5;

// ============================================================================
// 3. HISTORY / RUN-DETECTION HELPERS
// ============================================================================

const getLogicalShiftDate = (selectedDate, startTime, endTime) => {
  if (selectedDate) return selectedDate;
  const now = new Date();
  const [sh, sm] = (startTime || "00:00").split(":").map(Number);
  const [eh, em] = (endTime || "23:59").split(":").map(Number);
  const isOvernight = sh * 60 + sm > eh * 60 + em;
  const shiftStartTimeToday = new Date(now);
  shiftStartTimeToday.setHours(sh, sm, 0, 0);

  if (isOvernight && now < shiftStartTimeToday && now.getHours() < eh) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  }
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const getShiftHistory = (history, logicalDateStr, startTimeStr, endTimeStr) => {
  if (!history || !Array.isArray(history)) return [];
  const [startH, startM] = (startTimeStr || "00:00").split(":").map(Number);
  const [endH, endM] = (endTimeStr || "23:59").split(":").map(Number);
  const isOvernight = startH * 60 + startM >= endH * 60 + endM;

  const shiftStart = new Date(`${logicalDateStr}T${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}:00`);
  const shiftEnd = new Date(`${logicalDateStr}T${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00`);
  if (isOvernight) shiftEnd.setDate(shiftEnd.getDate() + 1);

  return history
    .filter((item) => {
      if (!item.Time) return false;
      const itemDate = new Date(item.Time.replace(/\//g, "-"));
      return itemDate >= shiftStart && itemDate <= shiftEnd;
    })
    .sort((a, b) => {
      const tA = Number(a.timestamp) || new Date(a.Time.replace(/\//g, "-")).getTime();
      const tB = Number(b.timestamp) || new Date(b.Time.replace(/\//g, "-")).getTime();
      return tA - tB;
    });
};

const isExplicitResetEvent = (item) => {
  const eventValue = item?.event ?? item?.Event ?? item?.eventType ?? item?.EventType ?? null;
  if (!eventValue) return false;
  return RESET_EVENT_TYPES.has(String(eventValue).toUpperCase().trim());
};

const hasRunIdentifierChanged = (previous, current) => {
  const prevId = previous?.bootId ?? previous?.BootId ?? previous?.runId ?? previous?.RunId ?? null;
  const currId = current?.bootId ?? current?.BootId ?? current?.runId ?? current?.RunId ?? null;
  if (prevId === null || currId === null) return false;
  return String(prevId) !== String(currId);
};

const splitIntoRuns = (rawData) => {
  const runs = [];
  if (!Array.isArray(rawData) || rawData.length === 0) return runs;
  const sanitized = rawData.filter((item) => !Number.isNaN(Number(item.Count)));
  if (sanitized.length === 0) return runs;

  const data = [...sanitized].sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
  const runsBuffer = [];
  let currentRun = [data[0]];
  let lastValid = data[0];

  for (let i = 1; i < data.length; i++) {
    const candidate = data[i];
    const prevCount = Number(lastValid.Count);
    const currCount = Number(candidate.Count);
    if (currCount === prevCount) continue;

    const lastTs = Number(lastValid.timestamp);
    const candidateTs = Number(candidate.timestamp);
    if (!Number.isNaN(lastTs) && !Number.isNaN(candidateTs) && candidateTs < lastTs - OUT_OF_ORDER_TOLERANCE_SECONDS) continue;

    if (currCount < prevCount) {
      const drop = prevCount - currCount;
      const dropRatio = prevCount > 0 ? drop / prevCount : 0;
      if (drop <= SMALL_FLUCTUATION_ABS || dropRatio < SMALL_FLUCTUATION_RATIO) continue;
    }

    const explicitReset = isExplicitResetEvent(candidate);
    const bootIdChanged = hasRunIdentifierChanged(lastValid, candidate);

    let isRealReset = false;
    if (explicitReset || bootIdChanged) isRealReset = true;
    else if (currCount <= RESTART_COUNT_THRESHOLD && prevCount > SIGNIFICANT_COUNT_FLOOR) isRealReset = true;
    else if (currCount < prevCount) {
      const dropRatio = prevCount > 0 ? (prevCount - currCount) / prevCount : 0;
      if (dropRatio >= RESET_DROP_RATIO) isRealReset = true;
    }

    if (isRealReset) {
      if (currentRun.length >= MIN_READINGS_PER_RUN) runsBuffer.push(currentRun);
      currentRun = [candidate];
      lastValid = candidate;
      continue;
    }
    currentRun.push(candidate);
    lastValid = candidate;
  }
  if (currentRun.length >= MIN_READINGS_PER_RUN) runsBuffer.push(currentRun);
  return runsBuffer;
};

const generateShiftHourBuckets = (startTimeStr, endTimeStr) => {
  const start = startTimeStr || "00:00";
  const end = endTimeStr || "23:59";
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  let startMinutes = startH * 60 + (Number.isNaN(startM) ? 0 : startM);
  let endMinutes = endH * 60 + (Number.isNaN(endM) ? 0 : endM);
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;

  const buckets = [];
  let cursor = startMinutes;
  const formatTime = (totalMins) => {
    const dayMins = ((totalMins % 1440) + 1440) % 1440;
    const h = String(Math.floor(dayMins / 60)).padStart(2, "0");
    const m = String(dayMins % 60).padStart(2, "0");
    return `${h}:${m}`;
  };

  while (cursor < endMinutes) {
    const nextCursor = Math.min(cursor + 60, endMinutes);
    buckets.push({
      label: `${formatTime(cursor)}-${formatTime(nextCursor)}`,
      startMinutes: cursor,
      endMinutes: nextCursor,
      output: 0,
    });
    cursor = nextCursor;
  }
  return { buckets, shiftStartMinutes: startMinutes };
};

const calculateProductionMetrics = (historyData, shiftStartTime, shiftEndTime, cavity = 1) => {
  if (!historyData || historyData.length === 0) {
    return { totalOutput: 0, hourlyData: [], firstTime: null, runs: [] };
  }
  const firstRecord = historyData[0];
  const firstTimeStr = firstRecord?.Time || null;
  const runs = splitIntoRuns(historyData);
  const { buckets, shiftStartMinutes } = generateShiftHourBuckets(shiftStartTime, shiftEndTime);

  let totalOutput = 0;
  const runResults = [];

  runs.forEach((run, runIndex) => {
    const runBuckets = buckets.map((b) => ({ ...b, output: 0 }));
    let runTotalOutput = 0;
    let acceptedPrevCount = Number(run[0].Count);

    for (let i = 1; i < run.length; i++) {
      const curr = Number(run[i].Count);
      if (Number.isNaN(curr)) continue;

      const delta = (curr - acceptedPrevCount) * cavity;
      if (delta <= 0) continue;
      acceptedPrevCount = curr;

      if (!run[i].Time || !run[i].Time.includes(" ")) continue;
      totalOutput += delta;
      runTotalOutput += delta;

      const timePart = run[i].Time.split(" ")[1];
      const [recH, recM] = timePart.split(":").map(Number);
      if (Number.isNaN(recH) || Number.isNaN(recM)) continue;

      let recordMinsOfDay = recH * 60 + recM;
      if (recordMinsOfDay < shiftStartMinutes) recordMinsOfDay += 24 * 60;

      const targetBucket = buckets.find((b) => recordMinsOfDay >= b.startMinutes && recordMinsOfDay < b.endMinutes);
      if (targetBucket) targetBucket.output += delta;

      const runTargetBucket = runBuckets.find((b) => recordMinsOfDay >= b.startMinutes && recordMinsOfDay < b.endMinutes);
      if (runTargetBucket) runTargetBucket.output += delta;
    }

    const firstInRun = run[0];
    const lastInRun = run[run.length - 1];
    const extractHM = (item) => (item?.Time && item.Time.includes(" ") ? item.Time.split(" ")[1].slice(0, 5) : null);

    runResults.push({
      runNo: runIndex + 1,
      startTime: extractHM(firstInRun) || "—",
      endTime: extractHM(lastInRun) || "—",
      totalOutput: runTotalOutput,
      hourlyData: runBuckets.map((b) => ({ hour: b.label, output: b.output })),
    });
  });

  const hourlyData = buckets.map((b) => ({ hour: b.label, output: b.output }));
  return { totalOutput, hourlyData, firstTime: firstTimeStr, runs: runResults };
};

const getOptimizedConfig = async (machineId, lineId, logicalDate) => {
  const cacheKey = `config:${machineId || ""}:${lineId || ""}:${logicalDate || ""}`;
  return cached(cacheKey, 30_000, async () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const isToday = logicalDate === today;
    const selectFields = "cavities cavity dailyTarget shiftStartTime shiftEndTime machineId";
    let injectionMachine = null;
    let line = null;

    if (isToday) {
      if (machineId) {
        injectionMachine = await InjectionMachine.findOne({ machineId }).select(selectFields).lean();
        if (!injectionMachine) line = await Line.findOne({ machineId }).select(selectFields).lean();
      } else if (lineId) {
        line = await Line.findOne({ lineId }).select(selectFields).lean();
        if (line?.machineId) {
          injectionMachine = await InjectionMachine.findOne({ machineId: line.machineId }).select(selectFields).lean();
        }
      }
    } else {
      if (machineId) {
        injectionMachine = await InjectionMachineHistory.findOne({ machineId, historyDate: logicalDate }).select(selectFields).lean();
        if (!injectionMachine) injectionMachine = await InjectionMachine.findOne({ machineId }).select(selectFields).lean();
        line = await LineHistory.findOne({ machineId, historyDate: logicalDate }).select(selectFields).lean();
        if (!line) line = await Line.findOne({ machineId }).select(selectFields).lean();
      } else if (lineId) {
        line = await LineHistory.findOne({ lineId, historyDate: logicalDate }).select(selectFields).lean();
        if (!line) line = await Line.findOne({ lineId }).select(selectFields).lean();
        if (line?.machineId) {
          injectionMachine = await InjectionMachineHistory.findOne({ machineId: line.machineId, historyDate: logicalDate }).select(selectFields).lean();
          if (!injectionMachine) injectionMachine = await InjectionMachine.findOne({ machineId: line.machineId }).select(selectFields).lean();
        }
      }
    }
    return { injectionMachine, line };
  });
};

// ============================================================================
// 3.1 MEMORY-SAFE FIREBASE HELPERS
// ============================================================================

// IMPORTANT: Never read Machines/ as a whole. CounterHistory can grow very large.
// Machine IDs are discovered from the application's MongoDB registry instead.
const getKnownMachineIds = async () => cached("machine-ids", 15_000, async () => {
  const [lineIds, injectionIds, counterIds] = await Promise.all([
    LineModel.distinct("machineId"),
    InjectionMachineModel.distinct("machineId"),
    Counter.distinct("counterId"),
  ]);
  return [...new Set([...lineIds, ...injectionIds, ...counterIds].filter(Boolean).map(String))];
});

const getMachineSnapshot = async (machineId) => {
  if (!machineId) return null;
  return cached(`machine-snapshot:${machineId}`, 2_500, async () => {
    const [healthSnapshot, liveSnapshot] = await Promise.all([
      get(ref(rtdb, `Machines/${machineId}/Health`)),
      get(ref(rtdb, `Machines/${machineId}/LiveStatus`)),
    ]);
    if (!healthSnapshot.exists() && !liveSnapshot.exists()) return null;
    return {
      Health: healthSnapshot.exists() ? healthSnapshot.val() : {},
      LiveStatus: liveSnapshot.exists() ? liveSnapshot.val() : {},
    };
  });
};

const getDateBoundsSeconds = (dateStr) => {
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(`${dateStr}T23:59:59.999`);
  return {
    start: Math.floor(start.getTime() / 1000),
    end: Math.floor(end.getTime() / 1000),
  };
};

// ============================================================================
// 3.1 MEMORY-SAFE HISTORY ITERATION
// ============================================================================
// IMPORTANT: Never load a complete CounterHistory day into JS memory for
// dashboard calculations. RTDB is paged in small chunks and legacy Mongo
// archive documents are streamed through an aggregation cursor.
const HISTORY_PAGE_SIZE = 750;

const toTimestampSeconds = (item) => {
  const ts = Number(item?.timestamp);
  if (Number.isFinite(ts)) return ts;
  if (!item?.Time) return NaN;
  const parsed = new Date(String(item.Time).replace(/\//g, "-")).getTime();
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : NaN;
};

const getCounterHistoryCountForDate = async (machineId, logicalDate) => {
  if (!machineId || !logicalDate) return 0;
  const archived = await CounterHistoryArchive.findOne({ machineId, date: logicalDate }).select({ _id: 1 }).lean();
  if (archived) return null; // archive exists; count is not needed for streaming
  const { start, end } = getDateBoundsSeconds(logicalDate);
  try {
    const snapshot = await get(query(ref(rtdb, `Machines/${machineId}/CounterHistory`), orderByChild("timestamp"), startAt(start), endAt(end), limitToFirst(1)));
    return snapshot.exists() ? 1 : 0;
  } catch (error) {
    if (isMissingIndexError(error)) warnMissingIndexOnce(machineId);
    throw error;
  }
};

async function* iterateArchivedRecords(machineId, logicalDate) {
  const cursor = CounterHistoryArchive.aggregate([
    { $match: { machineId: String(machineId), date: String(logicalDate) } },
    { $unwind: "$records" },
    { $match: { "records.Time": { $exists: true } } },
    { $sort: { "records.timestamp": 1, "records.Time": 1 } },
    { $project: { _id: 0, record: "$records" } },
  ])
    .allowDiskUse(true)
    .cursor({ batchSize: HISTORY_PAGE_SIZE });

  for await (const row of cursor) {
    if (row?.record) yield row.record;
  }
}

async function* iterateRtdbRecords(machineId, logicalDate) {
  const { start, end } = getDateBoundsSeconds(logicalDate);
  const historyRef = ref(rtdb, `Machines/${machineId}/CounterHistory`);
  let cursorTimestamp = start;
  let cursorKey = undefined;
  let firstPage = true;

  while (true) {
    const pageQuery = firstPage
      ? query(historyRef, orderByChild("timestamp"), startAt(start), endAt(end), limitToFirst(HISTORY_PAGE_SIZE))
      : query(historyRef, orderByChild("timestamp"), startAt(cursorTimestamp, cursorKey), endAt(end), limitToFirst(HISTORY_PAGE_SIZE));

    let snapshot;
    try {
      snapshot = await get(pageQuery);
    } catch (error) {
      if (isMissingIndexError(error)) warnMissingIndexOnce(machineId);
      throw error;
    }
    if (!snapshot.exists()) return;

    const entries = Object.entries(snapshot.val() || {});
    if (!entries.length) return;

    let emitted = 0;
    let lastTimestamp = cursorTimestamp;
    let lastKey = cursorKey;

    for (const [key, record] of entries) {
      const ts = toTimestampSeconds(record);
      if (!Number.isFinite(ts)) continue;
      if (!firstPage && (ts < cursorTimestamp || (ts === cursorTimestamp && key === cursorKey))) continue;
      if (ts < start || ts > end) continue;
      yield record;
      emitted++;
      lastTimestamp = ts;
      lastKey = key;
    }

    if (entries.length < HISTORY_PAGE_SIZE || emitted === 0) return;
    if (lastKey === cursorKey && lastTimestamp === cursorTimestamp) return;

    cursorTimestamp = lastTimestamp;
    cursorKey = lastKey;
    firstPage = false;
  }
}

const archiveExists = async (machineId, logicalDate) =>
  Boolean(await CounterHistoryArchive.exists({ machineId: String(machineId), date: String(logicalDate) }));

async function* iterateCounterHistoryForDate(machineId, logicalDate) {
  if (!machineId || !logicalDate) return;
  if (await archiveExists(machineId, logicalDate)) {
    yield* iterateArchivedRecords(machineId, logicalDate);
    return;
  }
  yield* iterateRtdbRecords(machineId, logicalDate);
}

const addDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const getShiftBounds = (logicalDateStr, startTimeStr, endTimeStr) => {
  const [sh, sm] = (startTimeStr || "00:00").split(":").map(Number);
  const [eh, em] = (endTimeStr || "23:59").split(":").map(Number);
  const start = new Date(`${logicalDateStr}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00`);
  const end = new Date(`${logicalDateStr}T${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00`);
  if (end <= start) end.setDate(end.getDate() + 1);
  return { start, end, overnight: end.getDate() !== start.getDate() || end.getTime() > start.getTime() + 24 * 3600 * 1000 - 1 };
};

async function* iterateCounterHistoryForShift(machineId, logicalDate, startTimeStr, endTimeStr) {
  const { start, end } = getShiftBounds(logicalDate, startTimeStr, endTimeStr);
  const dates = [logicalDate];
  const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  if (endDate !== logicalDate) dates.push(endDate);

  for (const datePart of dates) {
    for await (const record of iterateCounterHistoryForDate(machineId, datePart)) {
      const tsMs = toTimestampSeconds(record) * 1000;
      if (!Number.isFinite(tsMs)) continue;
      if (tsMs >= start.getTime() && tsMs <= end.getTime()) yield record;
    }
  }
}

const createEmptyMetricState = (shiftStartTime, shiftEndTime) => {
  const { buckets, shiftStartMinutes } = generateShiftHourBuckets(shiftStartTime, shiftEndTime);
  return { buckets, shiftStartMinutes, totalOutput: 0, firstTime: null, runs: [], current: null, runNo: 0 };
};

const cloneBuckets = (buckets) => buckets.map((b) => ({ ...b, output: 0 }));

const finalizeStreamRun = (state) => {
  if (!state.current || state.current.length < MIN_READINGS_PER_RUN) return;
  const first = state.current[0];
  const last = state.current[state.current.length - 1];
  const extractHM = (item) => (item?.Time && String(item.Time).includes(" ") ? String(item.Time).split(" ")[1].slice(0, 5) : null);
  state.runs.push({
    runNo: ++state.runNo,
    startTime: extractHM(first) || "—",
    endTime: extractHM(last) || "—",
    totalOutput: state.currentTotal,
    hourlyData: state.currentBuckets.map((b) => ({ hour: b.label, output: b.output })),
  });
};

const consumeProductionRecord = (state, record, cavity) => {
  const count = Number(record?.Count);
  if (!Number.isFinite(count)) return;
  if (!state.firstTime) state.firstTime = record?.Time || null;

  if (!state.current) {
    state.current = [record];
    state.currentTotal = 0;
    state.currentBuckets = cloneBuckets(state.buckets);
    state.lastValid = record;
    return;
  }

  const previous = state.lastValid;
  const prevCount = Number(previous?.Count);
  if (!Number.isFinite(prevCount)) return;
  if (count === prevCount) return;

  const lastTs = toTimestampSeconds(previous);
  const candidateTs = toTimestampSeconds(record);
  if (Number.isFinite(lastTs) && Number.isFinite(candidateTs) && candidateTs < lastTs - OUT_OF_ORDER_TOLERANCE_SECONDS) return;

  if (count < prevCount) {
    const drop = prevCount - count;
    const ratio = prevCount > 0 ? drop / prevCount : 0;
    if (drop <= SMALL_FLUCTUATION_ABS || ratio < SMALL_FLUCTUATION_RATIO) return;
  }

  const explicitReset = isExplicitResetEvent(record);
  const bootIdChanged = hasRunIdentifierChanged(previous, record);
  let isRealReset = explicitReset || bootIdChanged;
  if (!isRealReset && count <= RESTART_COUNT_THRESHOLD && prevCount > SIGNIFICANT_COUNT_FLOOR) isRealReset = true;
  if (!isRealReset && count < prevCount) {
    const ratio = prevCount > 0 ? (prevCount - count) / prevCount : 0;
    if (ratio >= RESET_DROP_RATIO) isRealReset = true;
  }

  if (isRealReset) {
    finalizeStreamRun(state);
    state.current = [record];
    state.currentTotal = 0;
    state.currentBuckets = cloneBuckets(state.buckets);
    state.lastValid = record;
    return;
  }

  const delta = (count - prevCount) * cavity;
  state.current.push(record);
  state.lastValid = record;
  if (delta <= 0) return;

  state.totalOutput += delta;
  state.currentTotal += delta;

  if (!record?.Time || !String(record.Time).includes(" ")) return;
  const [recH, recM] = String(record.Time).split(" ")[1].split(":").map(Number);
  if (!Number.isFinite(recH) || !Number.isFinite(recM)) return;
  let recordMinutes = recH * 60 + recM;
  if (recordMinutes < state.shiftStartMinutes) recordMinutes += 1440;

  const targetBucket = state.buckets.find((b) => recordMinutes >= b.startMinutes && recordMinutes < b.endMinutes);
  if (targetBucket) targetBucket.output += delta;
  const runBucket = state.currentBuckets.find((b) => recordMinutes >= b.startMinutes && recordMinutes < b.endMinutes);
  if (runBucket) runBucket.output += delta;
};

const calculateProductionMetricsStream = async (machineId, logicalDate, shiftStartTime, shiftEndTime, cavity) => {
  const state = createEmptyMetricState(shiftStartTime, shiftEndTime);
  for await (const record of iterateCounterHistoryForShift(machineId, logicalDate, shiftStartTime, shiftEndTime)) {
    consumeProductionRecord(state, record, cavity);
  }
  finalizeStreamRun(state);
  return {
    totalOutput: state.totalOutput,
    hourlyData: state.buckets.map((b) => ({ hour: b.label, output: b.output })),
    firstTime: state.firstTime,
    runs: state.runs,
  };
};

const calculateProductionGapsStream = async (machineId, logicalDate, startTime, endTime, cavity) => {
  const gaps = [];
  let previous = null;
  for await (const current of iterateCounterHistoryForShift(machineId, logicalDate, startTime, endTime)) {
    if (!previous) { previous = current; continue; }
    const prevCount = Number(previous.Count);
    const currCount = Number(current.Count);
    if (Number.isFinite(prevCount) && Number.isFinite(currCount) && currCount > prevCount) {
      const prevTs = toTimestampSeconds(previous);
      const currTs = toTimestampSeconds(current);
      const gapSeconds = Number.isFinite(prevTs) && Number.isFinite(currTs)
        ? currTs - prevTs
        : (new Date(String(current.Time).replace(/\//g, "-")).getTime() - new Date(String(previous.Time).replace(/\//g, "-")).getTime()) / 1000;
      if (gapSeconds >= 0) gaps.push({ count: (currCount - prevCount) * cavity, time: String(current.Time || "").split(" ")[1] || "—", gapSeconds: Math.round(gapSeconds) });
    }
    previous = current;
  }
  return gaps;
};

// Legacy raw-history endpoint only. Dashboard calculations must use the
// streaming functions above so a complete day is never retained in memory.
const getCounterHistoryForDate = async (machineId, logicalDate) => {
  const records = [];
  for await (const record of iterateCounterHistoryForDate(machineId, logicalDate)) records.push(record);
  return records;
};

// ============================================================================
// 4. GENERAL DATA CONTROLLERS
// ============================================================================

export const getAllData = async (req, res) => {
  try {
    const machineIds = await getKnownMachineIds();
    const results = await Promise.all(machineIds.map(async (machineId) => {
      const data = await getMachineSnapshot(machineId);
      return data ? { machineId, ...data } : null;
    }));

    return res.status(200).json({
      success: true,
      data: results.filter(Boolean),
      note: "Large CounterHistory data is intentionally excluded from this endpoint.",
    });
  } catch (error) {
    Notifier.toAdmin("Firebase Error", `Failed to get machine data: ${error.message}`, "CRITICAL_ERROR");
    return res.status(500).json({ success: false, message: "Failed to fetch machine data" });
  }
};

export const getTotalOutput = async (req, res) => {
  try {
    const { machineId } = req.params;
    const snapshot = await get(ref(rtdb, `Machines/${machineId}/LiveStatus/Count`));
    const count = snapshot.exists() ? snapshot.val() : 0;
    return res.status(200).json({ success: true, totalOutput: count });
  } catch (error) {
    Notifier.toAdmin("Firebase Error", `Failed to fetch Total Output: ${error.message}`, "IOT_ERROR");
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getMachineData = async (req, res) => {
  const { machineId } = req.params;
  try {
    const data = await getMachineSnapshot(machineId);
    if (!data) return res.status(404).json({ success: false, message: "Machine not found" });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

// 🔥 Debugging සඳහා වෙනස් කරන ලද API Controller එක
export const getCounterHistory = async (req, res) => {
  try {
    const { machineId } = req.params;
    const targetDate = req.query.date || (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    })();

    const historyData = await getCounterHistoryForDate(machineId, targetDate);

    return res.status(200).json({
      success: true,
      date: targetDate,
      totalRecords: historyData.length,
      data: historyData,
    });
  } catch (error) {
    console.error("❌ Error in getCounterHistory:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch counter history" });
  }
};

// ============================================================================
// 5-6. LIVE METRICS / HOURLY PRODUCTION / GAP ANALYSIS
// ============================================================================

export const getMachineLiveMetrics = async (req, res) => {
  try {
    const { machineId } = req.params;
    const statusSnapshot = await get(ref(rtdb, `Machines/${machineId}/LiveStatus/Count`));
    const rawCount = statusSnapshot.exists() ? statusSnapshot.val() : 0;

    const { injectionMachine, line } = await getOptimizedConfig(machineId, null, getLogicalShiftDate(null, null, null));
    const cavity = injectionMachine?.cavities || line?.cavity || 1;
    const current = rawCount * cavity;
    const target = injectionMachine?.dailyTarget || line?.dailyTarget || 0;

    res.status(200).json({ success: true, data: { current, target, cavity } });
  } catch (error) {
    Notifier.toAdmin("Firebase Error", `Live Metrics Fetch Error: ${error.message}`, "IOT_ERROR");
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// 5. HOURLY PRODUCTION DATA (OPTIMIZED, ARCHIVE-AWARE)
// ============================================================================

export const getHourlyTableData = async (req, res) => {
  const { machineId } = req.params;
  const { date, shiftStartTime, shiftEndTime } = req.query;
  const logicalDate = getLogicalShiftDate(date, shiftStartTime, shiftEndTime);

  try {
    const { injectionMachine, line } = await getOptimizedConfig(machineId, null, logicalDate);
    const cavity = Number(injectionMachine?.cavities || line?.cavity || 1) || 1;
    const cacheKey = `hourly-table:${machineId}:${logicalDate}:${shiftStartTime || ""}:${shiftEndTime || ""}:${cavity}`;
    const metrics = await cached(cacheKey, 15_000, () => calculateProductionMetricsStream(machineId, logicalDate, shiftStartTime, shiftEndTime, cavity));

    return res.status(200).json({ success: true, totalOutput: metrics.totalOutput, firstTime: metrics.firstTime, hourlyData: metrics.hourlyData, runs: metrics.runs, cavityConfigured: cavity });
  } catch (error) {
    console.error("❌ getHourlyTableData", { machineId, logicalDate, shiftStartTime, shiftEndTime, error: error?.stack || error });
    return res.status(500).json({ success: false, message: "Failed to calculate hourly production" });
  }
};

export const getHourlyProductionData = async (req, res) => {
  const { machineId } = req.params;
  const { date, shiftStartTime, shiftEndTime } = req.query;
  const logicalDate = getLogicalShiftDate(date, shiftStartTime, shiftEndTime);

  if (!machineId) return res.status(400).json({ success: false, message: "machineId is required" });

  try {
    const { injectionMachine, line } = await getOptimizedConfig(machineId, null, logicalDate);
    const cavity = Number(injectionMachine?.cavities || line?.cavity || 1) || 1;
    const cacheKey = `hourly-production:${machineId}:${logicalDate}:${shiftStartTime || ""}:${shiftEndTime || ""}:${cavity}`;
    const metrics = await cached(cacheKey, 15_000, () => calculateProductionMetricsStream(machineId, logicalDate, shiftStartTime, shiftEndTime, cavity));

    return res.status(200).json({ success: true, machineId, date: logicalDate, totalOutput: metrics.totalOutput, firstTime: metrics.firstTime, hourlyData: metrics.hourlyData, runs: metrics.runs });
  } catch (error) {
    console.error("❌ getHourlyProductionData", { machineId, logicalDate, shiftStartTime, shiftEndTime, error: error?.stack || error });
    return res.status(500).json({ success: false, message: "Failed to calculate hourly production" });
  }
};

// ============================================================================
// 6. GAP ANALYSIS CONTROLLER (OPTIMIZED, ARCHIVE-AWARE)
// ============================================================================

export const getCombinedProductionGaps = async (req, res) => {
  const { date, lineId, machineId: queryMachineId } = req.query;
  try {
    const now = new Date();
    const defaultLogicalDate = date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const { injectionMachine, line: lineData } = await getOptimizedConfig(queryMachineId, lineId, defaultLogicalDate);

    let targetMachineId = queryMachineId || lineData?.machineId;
    if (!targetMachineId) return res.status(400).json({ success: false, message: "Please provide either lineId or machineId / No machine assigned" });

    const cavity = injectionMachine?.cavities || lineData?.cavity || 1;
    const startTime = lineData?.shiftStartTime || injectionMachine?.shiftStartTime || "08:30";
    const endTime = lineData?.shiftEndTime || injectionMachine?.shiftEndTime || "20:30";
    const dailyTarget = Number(lineData?.dailyTarget || injectionMachine?.dailyTarget || 0);

    const logicalDate = getLogicalShiftDate(date, startTime, endTime);

    const gapData = await cached(`production-gaps:${targetMachineId}:${logicalDate}:${startTime}:${endTime}:${cavity}`, 15_000, () =>
      calculateProductionGapsStream(targetMachineId, logicalDate, startTime, endTime, cavity)
    );
    if (gapData.length === 0) return res.status(200).json({ success: true, lineId: lineId || null, machineId: targetMachineId, date: logicalDate, startTime, endTime, dailyTarget, averageGap: 0, data: [] });

    let plannedAverageGap = 0;
    if (dailyTarget > 0) {
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      let workingSeconds = eh * 3600 + em * 60 - (sh * 3600 + sm * 60);
      if (workingSeconds < 0) workingSeconds += 24 * 3600;
      plannedAverageGap = Number((workingSeconds / dailyTarget).toFixed(2));
    }

    return res.status(200).json({
      success: true,
      lineId: lineId || null,
      machineId: targetMachineId,
      date: logicalDate,
      startTime,
      endTime,
      dailyTarget,
      averageGap: plannedAverageGap,
      data: gapData,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// 7. OTHER HELPERS (FREE MACHINES, CRON JOBS, ETC)
// ============================================================================


// ============================================================================
// 7. OTHER HELPERS (FREE MACHINES, CRON JOBS, ETC)
// ============================================================================

export const getFreeCounterMachines = async (req, res) => {
  try {
    const machineIds = await getKnownMachineIds();
    const machineEntries = await Promise.all(machineIds.map(async (machineId) => {
      const data = await getMachineSnapshot(machineId);
      return [machineId, data || {}];
    }));
    const machines = Object.fromEntries(machineEntries);

    const assignedLines = await Line.find({}, "machineId").select("machineId").lean();
    const assignedInjections = await InjectionMachine.find({}, "machineId").select("machineId").lean();

    const assignedMachines = new Set([...assignedLines.map((l) => l.machineId).filter(Boolean), ...assignedInjections.map((im) => im.machineId).filter(Boolean)]);

    const freeMachines = Object.entries(machines)
      .filter(([machineId]) => !assignedMachines.has(machineId))
      .map(([machineId, machine]) => ({
        machineId,
        machineName: machine.machineName || machineId,
        status: machine.status || "offline",
        machineState: machine.machineState || "idle",
      }));

    return res.status(200).json({ success: true, count: freeMachines.length, data: freeMachines });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const getLiveDataByLineId = async (req, res) => {
  try {
    const { lineId } = req.params;
    const line = await Line.findOne({ lineId }).select("machineId cavity dailyTarget productCode shiftStartTime shiftEndTime").lean();
    if (!line) return res.status(404).json({ success: false, message: "Line not found" });

    if (!line.machineId) return res.status(404).json({ success: false, message: "No machine assigned to this line" });

    const statusSnapshot = await get(ref(rtdb, `Machines/${line.machineId}/LiveStatus/Count`));
    const rawCount = statusSnapshot.exists() ? statusSnapshot.val() : 0;

    return res.status(200).json({
      success: true,
      count: rawCount * (line.cavity || 1),
      target: line.dailyTarget || 0,
      productCode: line.productCode || "—",
      startTime: line.shiftStartTime || "—",
      endTime: line.shiftEndTime || "—",
      machineId: line.machineId,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const getMachineStatus = async (req, res) => {
  try {
    const machineIds = await getKnownMachineIds();

    // Read only Health + LiveStatus for each machine. CounterHistory is never loaded.
    const data = await cached("machine-status-response", 2_500, async () => {
      return (await Promise.all(machineIds.map(async (machineId) => {
        const machine = await getMachineSnapshot(machineId);
        if (!machine) return null;
        return { machineId, ...(machine.Health || {}), liveCount: Number(machine.LiveStatus?.Count ?? 0) };
      }))).filter(Boolean);
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("❌ getMachineStatus:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const deleteOldCounterHistory = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const machineIds = await getKnownMachineIds();
    if (machineIds.length === 0) return res.status(404).json({ success: false, message: "No machines found" });

    const machines = Object.fromEntries(machineIds.map((id) => [id, true]));
    let totalDeleted = 0;
    let totalArchived = 0;

    for (const machineId of Object.keys(machines)) {
      const historyRef = ref(rtdb, `Machines/${machineId}/CounterHistory`);
      const historySnapshot = await get(historyRef);

      if (!historySnapshot.exists()) continue;

      const history = historySnapshot.val();
      const updates = {};
      const byDate = {};

      for (const [key, item] of Object.entries(history)) {
        if (!item.Time) continue;
        const recordDate = new Date(item.Time.replace(/\//g, "-"));
        recordDate.setHours(0, 0, 0, 0);

        if (recordDate < today) {
          const dateStr = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, "0")}-${String(recordDate.getDate()).padStart(2, "0")}`;
          if (!byDate[dateStr]) byDate[dateStr] = [];
          byDate[dateStr].push(item);
          updates[key] = null;
          totalDeleted++;
        }
      }

      for (const [dateStr, records] of Object.entries(byDate)) {
        await CounterHistoryArchive.findOneAndUpdate({ machineId, date: dateStr }, { $push: { records: { $each: records } } }, { upsert: true });
        totalArchived += records.length;
      }

      if (Object.keys(updates).length > 0) {
        await update(historyRef, updates);
        console.log(`✅ ${machineId}: Archived ${Object.values(byDate).flat().length} records, Deleted ${Object.keys(updates).length} records from RTDB`);
      }
    }

    return res.status(200).json({
      success: true,
      deletedRecords: totalDeleted,
      archivedRecords: totalArchived,
      message: "Old CounterHistory archived to MongoDB and deleted from RTDB successfully.",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 🔥 RTDB එකේ ඇති දත්ත නොමකා MongoDB වෙත Archive කිරීමේ (Migration) Function එක
export const migrateDataToMongo = async (req, res) => {
  try {
    const machineIds = await getKnownMachineIds();
    if (machineIds.length === 0) {
      return res.status(404).json({ success: false, message: "No machines registered" });
    }

    const machines = Object.fromEntries(machineIds.map((id) => [id, true]));
    let totalArchived = 0;
    const migrationDetails = [];

    // සෑම Machine එකකම දත්ත පරීක්ෂා කිරීම
    for (const machineId of Object.keys(machines)) {
      const historySnapshot = await get(ref(rtdb, `Machines/${machineId}/CounterHistory`));
      if (!historySnapshot.exists()) continue;

      const history = historySnapshot.val();
      const byDate = {};

      // දිනය (Date) අනුව දත්ත වෙන් කිරීම
      for (const [key, item] of Object.entries(history)) {
        if (!item.Time) continue;

        // Time format එක (උදා: "2026/08/24 14:30") ගෙන දිනය පමණක් වෙන් කර ගැනීම
        const recordDate = new Date(item.Time.replace(/\//g, "-"));
        const dateStr = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, "0")}-${String(recordDate.getDate()).padStart(2, "0")}`;

        if (!byDate[dateStr]) byDate[dateStr] = [];
        byDate[dateStr].push(item);
      }

      // වෙන් කරගත් දත්ත MongoDB වෙත Save කිරීම
      let machineArchivedCount = 0;
      for (const [dateStr, records] of Object.entries(byDate)) {
        await CounterHistoryArchive.findOneAndUpdate(
          { machineId, date: dateStr },
          { $push: { records: { $each: records } } },
          { upsert: true }, // අදාළ දවසට Document එකක් නැත්නම් අලුතින් සාදයි
        );
        machineArchivedCount += records.length;
        totalArchived += records.length;
      }

      migrationDetails.push({ machineId, archivedRecords: machineArchivedCount });
    }

    return res.status(200).json({
      success: true,
      message: "All existing RTDB data successfully copied to MongoDB.",
      totalArchived,
      details: migrationDetails,
    });
  } catch (error) {
    console.error("Migration Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
