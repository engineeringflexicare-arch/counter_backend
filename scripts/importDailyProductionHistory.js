import dotenv from "dotenv";
import mongoose from "mongoose";
import ExcelJS from "exceljs";
import DailyProductionHistory from "../models/DailyProductionHistory.js";

dotenv.config();

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: node scripts/importDailyProductionHistory.js <path-to-xlsx>");
  process.exit(1);
}

function normalizeRowsFromWorksheet(worksheet) {
  const startRowIndex = 4;
  const headerRow = worksheet.getRow(startRowIndex);
  const headers = [];

  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const value = cell.value == null ? `__empty_${colNumber}` : String(cell.value).trim();
    headers[colNumber - 1] = value;
  });

  const rows = [];

  for (let rowIndex = startRowIndex + 1; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    const record = {};
    let hasContent = false;

    headers.forEach((header, headerIndex) => {
      if (!header || header.startsWith("__empty_")) {
        return;
      }

      const cellValue = row.getCell(headerIndex + 1).value;
      if (cellValue !== null && cellValue !== undefined && cellValue !== "") {
        hasContent = true;
      }
      record[header] = cellValue;
    });

    if (hasContent) {
      rows.push(record);
    }
  }

  return rows;
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  const rows = normalizeRowsFromWorksheet(worksheet);

  console.log(`Read ${rows.length} rows. Importing in batches...`);

  const BATCH_SIZE = 500;
  let imported = 0;
  let skipped = 0;
  let batch = [];

  const flush = async () => {
    if (batch.length === 0) return;

    try {
      await DailyProductionHistory.insertMany(batch, { ordered: false });
      imported += batch.length;
    } catch (error) {
      imported += error.result?.nInserted ?? 0;
      skipped += batch.length - (error.result?.nInserted ?? 0);
    }

    batch = [];
  };

  for (const row of rows) {
    const productionDate = row["Production Date"];
    const machineCode = row["Machine"];
    const itemId = row["Item ID"];

    if (!productionDate || !machineCode || !itemId) {
      skipped += 1;
      continue;
    }

    batch.push({
      productionDate: new Date(productionDate),
      section: row["Section"] ? String(row["Section"]).toUpperCase() : undefined,
      machineCode: String(machineCode).toUpperCase(),
      shift: row["Shift"] ? String(row["Shift"]).toUpperCase() : "DAY",
      machineType: row["Machine Type"],
      customer: row["Customer"],
      itemId: String(itemId).toUpperCase(),
      productDescription: row["Product Description"],
      toolId1: row["Tool ID 1"] ? String(row["Tool ID 1"]).toUpperCase() : undefined,
      toolId2: row["Tool ID 2"] ? String(row["Tool ID 2"]).toUpperCase() : undefined,
      cavities: row["Cavities"] ?? 0,
      actualProductionPcs: row["Actual Production Pcs"] ?? 0,
      planHours: row["Plan Hours"] ?? 0,
      downTimeSeconds: row["Down Time (Seconds)"] ?? 0,
      dtReason: row["DT Reason"],
      scrapQty: row["Scrap Qty"] ?? 0,
      scrapReason: row["Scrap Reason"],
      bestHrOutput: row["Best Hr Output"] ?? 0,
      bestHrScrap: row["Best Hr Scrap"] ?? 0,
      bestHrDtMin: row["Best Hr DT (min)"] ?? 0,
      dtLossPcs: row["DT Loss (pcs)"] ?? 0,
      hourlyMachineOutput: row["Hourly Machine Output (pcs)"] ?? 0,
    });

    if (batch.length >= BATCH_SIZE) {
      await flush();
    }
  }

  await flush();

  console.log(`Imported: ${imported}, Skipped (missing key fields): ${skipped}`);
  await mongoose.disconnect();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
