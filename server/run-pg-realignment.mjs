import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(DATABASE_URL);

async function run(label, query) {
  console.log(label);
  const [result] = await conn.execute(query);
  console.log(`  → affected: ${result.affectedRows}`);
  return result;
}

// S-ABF agents (under Galula, Bantasan, Escamillas, Abiang, Javier)
const sabfOhrs = [
  '740037488', '740044795', '740053897',  // Galula: Berja, Aquino, Cabural
  '740032190', '740052326', '740027103',  // Bantasan: Canete, Soliven, Romero
  '740037450', '740053852',               // Escamillas: Manalo, Magomnang
  '740041868', '740032659',               // Abiang: Natividad MAJ, Orjalo
  '740053748'                             // Javier: Molina
];

// CS-ABF agents (under Esmino, Natividad Gabriel)
const csabfOhrs = [
  '740031291',   // Esmino: Jamen
  '740053835'    // Natividad Gabriel: Dominguez
];

const sabfList = sabfOhrs.map(o => `'${o}'`).join(',');
const csabfList = csabfOhrs.map(o => `'${o}'`).join(',');

console.log("=== PART 1: Update io_employees planning_group ===\n");

await run("S-ABF group (11 agents) → io_employees",
  `UPDATE io_employees SET planning_group = 'S-ABF' WHERE ohr_id IN (${sabfList})`);

await run("CS-ABF group (2 agents) → io_employees",
  `UPDATE io_employees SET planning_group = 'CS-ABF' WHERE ohr_id IN (${csabfList})`);

console.log("\n=== PART 2: Update io_attendance snap_planning_group (>= 2026-04-07) ===\n");

await run("S-ABF group → io_attendance snap_planning_group",
  `UPDATE io_attendance SET snap_planning_group = 'S-ABF' WHERE ohr_id IN (${sabfList}) AND log_date >= '2026-04-07'`);

await run("CS-ABF group → io_attendance snap_planning_group",
  `UPDATE io_attendance SET snap_planning_group = 'CS-ABF' WHERE ohr_id IN (${csabfList}) AND log_date >= '2026-04-07'`);

console.log("\n=== PART 3: Update io_attendance planning_group (billing PG) (>= 2026-04-07) ===\n");

await run("S-ABF group → io_attendance planning_group (billing)",
  `UPDATE io_attendance SET planning_group = 'S-ABF' WHERE ohr_id IN (${sabfList}) AND log_date >= '2026-04-07'`);

await run("CS-ABF group → io_attendance planning_group (billing)",
  `UPDATE io_attendance SET planning_group = 'CS-ABF' WHERE ohr_id IN (${csabfList}) AND log_date >= '2026-04-07'`);

console.log("\n=== DONE ===");
await conn.end();
process.exit(0);
