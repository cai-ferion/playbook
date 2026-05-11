import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

// Read .env manually to avoid dotenv stdout pollution
const envContent = readFileSync('/home/ubuntu/playbook/.env', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
});

const c = await mysql.createConnection(envVars.DATABASE_URL);
const [r] = await c.query("SELECT ohr_id, full_name, actual_role, planning_group, supervisor_name, employement_status FROM io_employees WHERE actual_role != 'Agent' ORDER BY actual_role, full_name");

const byRole = {};
r.forEach(e => {
  if (!byRole[e.actual_role]) byRole[e.actual_role] = [];
  byRole[e.actual_role].push(e);
});

Object.keys(byRole).sort().forEach(role => {
  console.log(`\n=== ${role} (${byRole[role].length}) ===`);
  byRole[role].forEach(e => console.log(`  ${e.ohr_id} | ${e.full_name} | PG: ${e.planning_group} | Status: ${e.employement_status}`));
});

await c.end();
