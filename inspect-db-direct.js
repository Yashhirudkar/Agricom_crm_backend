const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Parse .env manually
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.substring(1, value.length - 1);
    }
    env[match[1]] = value;
  }
});

async function main() {
  const client = new Client({
    host: env.DB_HOST,
    port: parseInt(env.DB_PORT || '5432', 10),
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: 'postgres',
  });

  await client.connect();
  console.log('Connected to postgres database');

  const modules = await client.query('SELECT * FROM modules');
  console.log('=== MODULES ===');
  console.table(modules.rows);

  const subModules = await client.query('SELECT * FROM sub_modules');
  console.log('=== SUB MODULES ===');
  console.table(subModules.rows);

  await client.end();
}

main().catch(err => {
  console.error(err);
});
