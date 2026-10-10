const { Client } = require('pg');
async function run() {
  const client = new Client({ host: 'localhost', port: 5432, user: 'postgres', password: 'admin', database: 'Agricom_db' });
  await client.connect();
  const res = await client.query("UPDATE enquiries SET deleted_at = NULL WHERE status = 'PENDING' AND deleted_at IS NOT NULL");
  console.log("Restored", res.rowCount, "pending enquiries");
  
  // also force ENQ-000057 to PENDING
  await client.query("UPDATE enquiries SET status = 'PENDING' WHERE enquiry_no = 'ENQ-000057'");
  console.log("Forced ENQ-000057 to PENDING");
  
  await client.end();
}
run();
