import * as fs from 'fs';
import * as path from 'path';
import { Sequelize } from 'sequelize';
import {
  runEmployeeMigrations,
  runDocumentMigrations,
  runBranchMigrations,
  runLeaveMigrations,
  runAttendanceMigrations,
  runMastersSidebarMigrations,
} from './migration-tasks';

/**
 * Enterprise Safe Migration Runner
 * 
 * Future-Proof & Scalable Approach:
 * 1. This script safely loads the database configuration from the environment.
 * 2. It connects to the database and verifies the connection.
 * 3. It establishes a transactional scope for safe DDL and Data operations.
 * 
 * Note: Since NestJS is currently configured with `sync: { alter: true }` in 
 * app.module.ts, structural schema updates happen automatically during development.
 * This script is reserved for complex data migrations or production-level manual 
 * schema alterations that `alter: true` cannot handle natively.
 */

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
  console.log('[Migration] Starting Future-Proof Migration Runner');
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
    logging: false, // Set to true to see SQL queries during migration
  });

  try {
    await sequelize.authenticate();
    console.log('[Migration] Database connection verified successfully.');

    // Start a managed transaction for safe migrations
    await sequelize.transaction(async (transaction) => {
      console.log('[Migration] Executing migration tasks within transaction...');

      await runEmployeeMigrations(sequelize, transaction);
      await runDocumentMigrations(sequelize, transaction);
      await runBranchMigrations(sequelize, transaction);
      await runLeaveMigrations(sequelize, transaction);
      await runAttendanceMigrations(sequelize, transaction);
      await runMastersSidebarMigrations(sequelize, transaction);
    });

    console.log('[Migration] All migration tasks executed successfully.');
    console.log('----------------------------------------------------');

  } catch (error) {
    console.error('[Migration] Critical Failure during migration sequence:');
    console.error(error);
    console.log('[Migration] Transaction rolled back. Database state preserved.');
    process.exit(1);
  } finally {
    await sequelize.close();
    console.log('[Migration] Database connection closed safely.');
  }
}

run();
