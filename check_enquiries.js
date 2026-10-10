const { Client } = require('pg');

async function run() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'admin',
    database: 'Agricom_db',
  });

  await client.connect();

  try {
    const res = await client.query(`SELECT COUNT(*) FROM enquiries WHERE company_id = 1 AND deleted_at IS NULL;`);
    console.log(`Total active enquiries for company 1: ${res.rows[0].count}`);
    
    const resAll = await client.query(`SELECT COUNT(*) FROM enquiries WHERE deleted_at IS NULL;`);
    console.log(`Total active enquiries overall: ${resAll.rows[0].count}`);

    const res2 = await client.query(`SELECT id, enquiry_no, company_id, deleted_at FROM enquiries ORDER BY created_at DESC LIMIT 5;`);
    console.log("Recent enquiries:", res2.rows);
  } catch (err) {
    console.error("Error:", err.message);
  }

  await client.end();
}

run().catch(console.error);
