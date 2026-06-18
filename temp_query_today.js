const { Client } = require('pg');

const client = new Client({
  user: 'postgres',
  password: 'admin',
  host: 'localhost',
  port: 5432,
  database: 'Agricom_db'
});

async function run() {
  await client.connect();
  
  console.log('Querying record for 2026-06-17:');
  const res = await client.query(`
    SELECT * 
    FROM "attendance_records" 
    WHERE date = '2026-06-17';
  `).catch(async () => {
    return await client.query(`
      SELECT * 
      FROM attendance_records 
      WHERE date = '2026-06-17';
    `);
  });
  console.log(JSON.stringify(res.rows, null, 2));

  await client.end();
}

run().catch(err => {
  console.error(err);
  client.end();
});
