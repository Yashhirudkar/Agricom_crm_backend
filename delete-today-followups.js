const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'admin',
  database: process.env.DB_NAME || 'Agricom_db',
});

async function run() {
  await client.connect();
  console.log('Connected to database. Resolving today\'s date boundaries...');

  try {
    // Resolve dates in 'Asia/Kolkata' timezone to match the backend service boundaries
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
    const startOfToday = new Date(`${todayStr}T00:00:00.000Z`);
    const endOfToday = new Date(`${todayStr}T23:59:59.999Z`);

    console.log(`Today is ${todayStr}`);
    console.log(`Boundary start: ${startOfToday.toISOString()}`);
    console.log(`Boundary end: ${endOfToday.toISOString()}`);

    // Query today's follow-ups
    const findRes = await client.query(`
      SELECT f.id, f.next_followup_date, f.status, p.entity_name
      FROM partner_followups f
      JOIN partners p ON f.partner_id = p.id
      WHERE f.next_followup_date >= $1 AND f.next_followup_date <= $2 AND f.is_active = true;
    `, [startOfToday, endOfToday]);

    console.log(`Found ${findRes.rows.length} active follow-ups for today:`);
    findRes.rows.forEach(r => {
      console.log(`- [ID ${r.id}] Partner: ${r.entity_name}, Next Date: ${r.next_followup_date.toISOString()}, Status: ${r.status}`);
    });

    if (findRes.rows.length === 0) {
      console.log('No followups found to delete.');
      return;
    }

    // Delete today's follow-ups
    console.log('Deleting today\'s follow-ups...');
    const deleteRes = await client.query(`
      DELETE FROM partner_followups
      WHERE next_followup_date >= $1 AND next_followup_date <= $2;
    `, [startOfToday, endOfToday]);

    console.log(`Successfully deleted ${deleteRes.rowCount} follow-up records.`);
  } catch (err) {
    console.error('Error during execution:', err);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
