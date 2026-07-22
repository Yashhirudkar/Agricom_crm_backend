import * as fs from 'fs';
import * as path from 'path';
import { Sequelize } from 'sequelize';

function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const parts = trimmed.split('=');
      const key = parts[0].trim();
      if (process.env[key] === undefined) {
        process.env[key] = parts.slice(1).join('=').trim();
      }
    });
  }
}

async function run() {
  console.log('----------------------------------------------------');
  console.log('[Migration 08] Add terms column to sales_contracts');
  console.log('----------------------------------------------------');

  loadEnv();

  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
  const dbUser = process.env.DB_USERNAME || 'postgres';
  const dbPass = process.env.DB_PASSWORD || 'admin';
  const dbName = process.env.DB_NAME || 'agricom';

  const sequelize = new Sequelize(dbName, dbUser, dbPass, {
    host: dbHost,
    port: dbPort,
    dialect: 'postgres',
    logging: false,
  });

  try {
    await sequelize.authenticate();
    console.log('[Migration] Database connection verified successfully.');

    await sequelize.transaction(async (transaction) => {
      console.log('[Migration] Step 1: Adding "terms" JSONB column (nullable)...');
      await sequelize.query(
        `ALTER TABLE "sales_contracts" ADD COLUMN IF NOT EXISTS "terms" JSONB DEFAULT '[]'::jsonb;`,
        { transaction },
      );

      console.log('[Migration] Step 2: Verifying column was added...');
      const colCheck = await sequelize.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_name = 'sales_contracts' AND column_name = 'terms';`,
        { transaction },
      );
      console.log('[Migration] Column check result:', JSON.stringify(colCheck[0]));
    });

    console.log('----------------------------------------------------');
    console.log('[Migration 08] COMPLETED SUCCESSFULLY.');
    console.log('----------------------------------------------------');
  } catch (error) {
    console.error('[Migration] Critical Failure:');
    console.error(error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
