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
    const res = await client.query(`
      SELECT id, enquiry_no, status, created_at, 
        (SELECT COUNT(*) FROM sales_contracts WHERE enquiry_id = enquiries.id) as sales_contracts_count,
        (SELECT COUNT(*) FROM purchase_contracts pc JOIN sales_contracts sc ON pc.sales_contract_id = sc.id WHERE sc.enquiry_id = enquiries.id) as purchase_contracts_count
      FROM enquiries 
      WHERE company_id = 1 AND deleted_at IS NULL
      ORDER BY created_at DESC;
    `);
    console.table(res.rows);
  } catch (err) {
    console.error("Error:", err.message);
  }

  await client.end();
}

run().catch(console.error);
