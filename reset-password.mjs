import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/playbook/.env' });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Find Darryl Castillo - first check io_employees for OHR ID
const [emps] = await conn.execute(
  "SELECT ohr_id, full_name FROM io_employees WHERE full_name LIKE '%Castillo%' OR full_name LIKE '%Darryl%'"
);
console.log('Employees found:', JSON.stringify(emps, null, 2));

// Check users table by name or by OHR from employees
const [users] = await conn.execute(
  "SELECT id, openId, name, email, role FROM users WHERE name LIKE '%Castillo%' OR name LIKE '%Darryl%'"
);
console.log('Users found by name:', JSON.stringify(users, null, 2));

let deleted = false;
if (users.length > 0) {
  for (const u of users) {
    console.log(`Deleting user ID ${u.id} (${u.name}, openId: ${u.openId})...`);
    await conn.execute("DELETE FROM users WHERE id = ?", [u.id]);
    console.log('Done - user deleted. They can now sign up fresh.');
    deleted = true;
  }
}

// Also try matching by OHR ID from employees table
for (const emp of emps) {
  const [userByOhr] = await conn.execute(
    "SELECT id, openId, name, email, role FROM users WHERE openId = ?", [emp.ohr_id]
  );
  if (userByOhr.length > 0 && !deleted) {
    for (const u of userByOhr) {
      console.log(`Deleting user ID ${u.id} (openId: ${u.openId}, OHR: ${emp.ohr_id})...`);
      await conn.execute("DELETE FROM users WHERE id = ?", [u.id]);
      console.log('Done - user deleted. They can now sign up fresh.');
    }
  }
}

await conn.end();
