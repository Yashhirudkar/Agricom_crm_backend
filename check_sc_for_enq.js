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
    const res = await client.query(`SELECT id, contract_number, enquiry_id, status FROM sales_contracts WHERE enquiry_id = '0015b533-1b59-43da-a75f-e4fde6a2b0dc';`);
    console.table(res.rows);
  } catch (err) {
    console.error("Error:", err.message);
  }

  await client.end();
}

run().catch(console.error);
