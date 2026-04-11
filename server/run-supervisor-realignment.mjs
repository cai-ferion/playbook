import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";
import dotenv from "dotenv";
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(DATABASE_URL);
const db = drizzle(conn);

// Helper to run raw SQL
async function run(query) {
  const [result] = await conn.execute(query);
  console.log(`  → affected: ${result.affectedRows}`);
  return result;
}

console.log("=== PART 1: Update io_employees (current supervisor) ===\n");

// Agents 1-2: Nimer, Amurao → Aspera (already Aspera in DB, but table says from Chacko)
console.log("Nimer + Amurao → Aspera");
await run(`UPDATE io_employees SET supervisor_name = 'Aspera, Brianna Veloso', supervisor_email = 'asperajoshua@meta.com' WHERE ohr_id IN ('740054135', '740054050')`);

// Agents 3-4: Natividad, Orjalo → Abiang
console.log("Natividad + Orjalo → Abiang");
await run(`UPDATE io_employees SET supervisor_name = 'Abiang, Jerome Anthony Navarra', supervisor_email = 'abjeromeanthony@meta.com' WHERE ohr_id IN ('740041868', '740032659')`);

// Agents 5-7: Canete, Soliven, Romero → Bantasan
console.log("Canete + Soliven + Romero → Bantasan");
await run(`UPDATE io_employees SET supervisor_name = 'Bantasan, Arvin Maurice Hernandez', supervisor_email = 'banarvinmaurice@meta.com' WHERE ohr_id IN ('740032190', '740052326', '740027103')`);

// Agents 8-9: Manalo, Magomnang → Escamillas
console.log("Manalo + Magomnang → Escamillas");
await run(`UPDATE io_employees SET supervisor_name = 'Escamillas, Julius Docena', supervisor_email = 'escamillajulius@meta.com' WHERE ohr_id IN ('740037450', '740053852')`);

// Agents 10-12: Berja, Aquino, Cabural → Galula
console.log("Berja + Aquino + Cabural → Galula");
await run(`UPDATE io_employees SET supervisor_name = 'Galula, Brunie Mar Lapara', supervisor_email = 'galulabruniemar@meta.com' WHERE ohr_id IN ('740037488', '740044795', '740053897')`);

// Agent 13: Molina → Javier
console.log("Molina → Javier");
await run(`UPDATE io_employees SET supervisor_name = 'Javier, Ferodelyn Ballesteros', supervisor_email = 'ferodelyn@meta.com' WHERE ohr_id = '740053748'`);

// Agent 14: Dominguez → Natividad Gabriel
console.log("Dominguez → Natividad Gabriel");
await run(`UPDATE io_employees SET supervisor_name = 'Natividad, Gabriel Miguel Arandia', supervisor_email = 'nagabrielmiguel@meta.com' WHERE ohr_id = '740053835'`);

// Agent 15: Jamen → Esmino
console.log("Jamen → Esmino");
await run(`UPDATE io_employees SET supervisor_name = 'Esmino, Eden Zamora', supervisor_email = 'esminoeden@meta.com' WHERE ohr_id = '740031291'`);

// Renier Marilao → Cris Dacanay David
console.log("Marilao → David");
await run(`UPDATE io_employees SET supervisor_name = 'David, Cris Erickson Dacanay', supervisor_email = 'dacanaydavicris@meta.com' WHERE ohr_id = '740037493'`);

console.log("\n=== PART 2: Update io_attendance snap_supervisor ===\n");

// 15 agents: effective April 7, 2026 onward
console.log("Nimer + Amurao attendance → Aspera (>= 2026-04-07)");
await run(`UPDATE io_attendance SET snap_supervisor = 'Aspera, Brianna Veloso' WHERE ohr_id IN ('740054135', '740054050') AND log_date >= '2026-04-07'`);

console.log("Natividad + Orjalo attendance → Abiang (>= 2026-04-07)");
await run(`UPDATE io_attendance SET snap_supervisor = 'Abiang, Jerome Anthony Navarra' WHERE ohr_id IN ('740041868', '740032659') AND log_date >= '2026-04-07'`);

console.log("Canete + Soliven + Romero attendance → Bantasan (>= 2026-04-07)");
await run(`UPDATE io_attendance SET snap_supervisor = 'Bantasan, Arvin Maurice Hernandez' WHERE ohr_id IN ('740032190', '740052326', '740027103') AND log_date >= '2026-04-07'`);

console.log("Manalo + Magomnang attendance → Escamillas (>= 2026-04-07)");
await run(`UPDATE io_attendance SET snap_supervisor = 'Escamillas, Julius Docena' WHERE ohr_id IN ('740037450', '740053852') AND log_date >= '2026-04-07'`);

console.log("Berja + Aquino + Cabural attendance → Galula (>= 2026-04-07)");
await run(`UPDATE io_attendance SET snap_supervisor = 'Galula, Brunie Mar Lapara' WHERE ohr_id IN ('740037488', '740044795', '740053897') AND log_date >= '2026-04-07'`);

console.log("Molina attendance → Javier (>= 2026-04-07)");
await run(`UPDATE io_attendance SET snap_supervisor = 'Javier, Ferodelyn Ballesteros' WHERE ohr_id = '740053748' AND log_date >= '2026-04-07'`);

console.log("Dominguez attendance → Natividad Gabriel (>= 2026-04-07)");
await run(`UPDATE io_attendance SET snap_supervisor = 'Natividad, Gabriel Miguel Arandia' WHERE ohr_id = '740053835' AND log_date >= '2026-04-07'`);

console.log("Jamen attendance → Esmino (>= 2026-04-07)");
await run(`UPDATE io_attendance SET snap_supervisor = 'Esmino, Eden Zamora' WHERE ohr_id = '740031291' AND log_date >= '2026-04-07'`);

// Renier Marilao: effective Feb 23, 2026 onward
console.log("Marilao attendance → David (>= 2026-02-23)");
await run(`UPDATE io_attendance SET snap_supervisor = 'David, Cris Erickson Dacanay' WHERE ohr_id = '740037493' AND log_date >= '2026-02-23'`);

console.log("\n=== DONE ===");
await conn.end();
process.exit(0);
