const { Client } = require('pg');
async function run() {
  const client = new Client({ host: 'localhost', port: 5432, user: 'postgres', password: 'admin', database: 'Agricom_db' });
  await client.connect();
  const res = await client.query("SELECT enquiry_no, status, deleted_at FROM enquiries WHERE enquiry_no IN ('ENQ-000057', 'ENQ-000050', 'ENQ-000049', 'ENQ-000041')");
  console.log(res.rows);
  await client.end();
}
run();
