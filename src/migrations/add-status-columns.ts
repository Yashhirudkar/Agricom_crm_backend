import * as fs from 'fs';
import * as path from 'path';
import { Sequelize } from 'sequelize';

function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split('=');
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim();
    process.env[key] = value;
  });
}

loadEnv();

const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
const dbUser = process.env.DB_USERNAME || 'postgres';
const dbPass = process.env.DB_PASSWORD || 'admin';
const dbName = process.env.DB_NAME || 'agricom';

async function run() {
  const sequelize = new Sequelize(dbName, dbUser, dbPass, {
    host: dbHost,
    port: dbPort,
    dialect: 'postgres',
    logging: false,
  });

  try {
    await sequelize.authenticate();
    console.log('Connected.');

    await sequelize.query(`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "status" VARCHAR(50) DEFAULT 'Active';`);
    console.log('Added status to companies.');

    await sequelize.query(`ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "status" VARCHAR(50) DEFAULT 'Active';`);
    console.log('Added status to clients.');

    console.log('Done.');
  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
}

run();
