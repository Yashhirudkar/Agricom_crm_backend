const { Client } = require('pg');
const fs = require('fs');

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
      SELECT 
        e.enquiry_no, 
        e.status as enquiry_status, 
        e.enquiry_date, 
        p.entity_name as partner_name, 
        pr.name as product_name,
        e.quantity,
        e.created_at,
        e.deleted_at,
        sc.contract_number as sales_contract_no,
        sc.status as sales_contract_status
      FROM enquiries e
      LEFT JOIN partners p ON e.partner_id = p.id
      LEFT JOIN products pr ON e.product_id = pr.id
      LEFT JOIN sales_contracts sc ON sc.enquiry_id = e.id
      ORDER BY e.created_at DESC;
    `);
    
    fs.writeFileSync('enquiries_dump.json', JSON.stringify(res.rows, null, 2));
    console.log("Dumped", res.rows.length, "enquiries");

    const auditRes = await client.query(`
      SELECT * FROM audit_logs 
      WHERE entity_type = 'Enquiry' OR entity_type = 'SalesContract' 
      ORDER BY created_at DESC LIMIT 50;
    `);
    fs.writeFileSync('audit_dump.json', JSON.stringify(auditRes.rows, null, 2));
    
  } catch (err) {
    console.error("Error:", err.message);
  }

  await client.end();
}

run().catch(console.error);
