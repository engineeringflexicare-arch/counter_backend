import dotenv from "dotenv";
import mongoose from "mongoose";
import DailyProductionHistory from "../models/DailyProductionHistory.js";
import InjectionMachine from "../models/InjectionMachine.js";
import MachineCapacity from "../models/MachineCapacity.js";
import Product from "../models/Product.js";
import Section from "../models/Section.js";

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected. Aggregating history by (itemId, machineCode)...");

  const aggregates = await DailyProductionHistory.aggregate([
    { $match: { hourlyMachineOutput: { $gt: 0 } } },
    {
      $group: {
        _id: { itemId: "$itemId", machineCode: "$machineCode" },
        section: { $first: "$section" },
        productDescription: { $first: "$productDescription" },
        avgOutputPerHour: { $avg: "$hourlyMachineOutput" },
        bestOutputPerHour: { $max: "$hourlyMachineOutput" },
        worstOutputPerHour: { $min: "$hourlyMachineOutput" },
        avgDowntimeMinutes: { $avg: { $divide: ["$downTimeSeconds", 60] } },
        lastProductionDate: { $max: "$productionDate" },
        runCount: { $sum: 1 },
        efficiencySum: {
          $sum: {
            $cond: [{ $gt: ["$bestHrOutput", 0] }, { $divide: ["$hourlyMachineOutput", "$bestHrOutput"] }, 0],
          },
        },
        efficiencyCount: {
          $sum: { $cond: [{ $gt: ["$bestHrOutput", 0] }, 1, 0] },
        },
        scrapRateSum: {
          $sum: {
            $cond: [{ $gt: [{ $add: ["$actualProductionPcs", "$scrapQty"] }, 0] }, { $divide: ["$scrapQty", { $add: ["$actualProductionPcs", "$scrapQty"] }] }, 0],
          },
        },
      },
    },
  ]);

  console.log(`Found ${aggregates.length} (item, machine) combinations to update.`);

  let updated = 0;
  let productsCreated = 0;
  let skipped = 0;

  for (const aggregate of aggregates) {
    const { itemId, machineCode } = aggregate._id;

    const machine = await InjectionMachine.findOne({ machineCode });
    if (!machine) {
      skipped += 1;
      continue;
    }

    let product = await Product.findOne({ product_code: itemId });
    if (!product) {
      let section = await Section.findOne({ code: aggregate.section });
      if (!section) {
        section = await Section.create({ code: aggregate.section, name: aggregate.section || itemId });
      }

      product = await Product.create({
        product_code: itemId,
        description: aggregate.productDescription || itemId,
        cycle_time: 1,
        standard_capacity: 1000,
        status: "Active",
      });
      productsCreated += 1;
    }

    const avgEfficiency = aggregate.efficiencyCount > 0 ? aggregate.efficiencySum / aggregate.efficiencyCount : undefined;
    const avgScrapRate = aggregate.runCount > 0 ? aggregate.scrapRateSum / aggregate.runCount : undefined;

    await MachineCapacity.findOneAndUpdate(
      { product: product._id, machine: machine._id },
      {
        product: product._id,
        machine: machine._id,
        avgOutputPerHour: Math.round(aggregate.avgOutputPerHour * 100) / 100,
        bestOutputPerHour: aggregate.bestOutputPerHour,
        worstOutputPerHour: aggregate.worstOutputPerHour,
        avgEfficiency: avgEfficiency !== undefined ? Math.round(avgEfficiency * 10000) / 10000 : undefined,
        avgScrapRate: avgScrapRate !== undefined ? Math.round(avgScrapRate * 10000) / 10000 : undefined,
        avgDowntimeMinutes: Math.round(aggregate.avgDowntimeMinutes * 100) / 100,
        lastProductionDate: aggregate.lastProductionDate,
        historicalRunCount: aggregate.runCount,
        $setOnInsert: { actualOutputPerHour: aggregate.bestOutputPerHour },
      },
      { upsert: true, new: true },
    );

    updated += 1;
  }

  console.log(`Updated/created: ${updated} capacity records`);
  console.log(`New products discovered from history: ${productsCreated}`);
  console.log(`Skipped (machine not in Machine Master): ${skipped}`);

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
