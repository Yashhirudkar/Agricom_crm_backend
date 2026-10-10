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
    const contractId = 19;
    
    // Delete from dependent tables first
    try { await client.query(`DELETE FROM sales_contract_products WHERE contract_id = $1`, [contractId]); } catch (e) {}
    try { await client.query(`DELETE FROM sales_contract_schedules WHERE contract_id = $1`, [contractId]); } catch (e) {}
    try { await client.query(`DELETE FROM sales_contract_documents WHERE contract_id = $1`, [contractId]); } catch (e) {}
    try { await client.query(`DELETE FROM sales_contract_terms WHERE contract_id = $1`, [contractId]); } catch (e) {}
    try { await client.query(`DELETE FROM sales_contract_conditions WHERE contract_id = $1`, [contractId]); } catch (e) {}
    
    const res = await client.query(`DELETE FROM sales_contracts WHERE contract_number = 'VA.2432627' RETURNING enquiry_id`);
    console.log(`Deleted ${res.rowCount} row(s) from sales_contracts (id: 19)`);
    
    if (res.rowCount > 0 && res.rows[0].enquiry_id) {
      const enquiryId = res.rows[0].enquiry_id;
      // Revert enquiry status to PENDING
      await client.query(`UPDATE enquiries SET status = 'PENDING' WHERE id = $1`, [enquiryId]);
      console.log(`Updated enquiry ${enquiryId} status to PENDING`);
    }
    
  } catch (err) {
    console.error("Error:", err.message);
  }

  await client.end();
}

run().catch(console.error);
