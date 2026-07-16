const { Client } = require('pg');
const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'Agricom_db',
  password: 'admin',
  port: 5432,
});

async function run() {
  await client.connect();
  try {
    await client.query("ALTER TABLE partner_followups ADD COLUMN entity_type VARCHAR(50);");
    console.log("Added entity_type");
  } catch (err) {
    console.error("Error adding entity_type (may already exist):", err.message);
  }

  try {
    await client.query("ALTER TABLE partner_followups ADD COLUMN entity_id INTEGER;");
    console.log("Added entity_id");
  } catch (err) {
    console.error("Error adding entity_id (may already exist):", err.message);
  }
  
  await client.end();
}
run();
