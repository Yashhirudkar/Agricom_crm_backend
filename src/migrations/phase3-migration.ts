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
    console.log('[Phase 3 Migration] Connected to database.');

    // 1. user_invitations table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "user_invitations" (
        "id" SERIAL PRIMARY KEY,
        "email" VARCHAR(255) NOT NULL UNIQUE,
        "token" VARCHAR(255) NOT NULL UNIQUE,
        "clientId" INTEGER REFERENCES "clients" ("id") ON DELETE SET NULL,
        "roleId" INTEGER REFERENCES "roles" ("id") ON DELETE SET NULL,
        "companyIds" JSONB,
        "createdBy" INTEGER REFERENCES "users" ("id") ON DELETE SET NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "status" VARCHAR(50) DEFAULT 'Pending',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
      );
    `);
    console.log('[Phase 3 Migration] Checked/created "user_invitations".');

    // 2. audit_logs table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" SERIAL PRIMARY KEY,
        "clientId" INTEGER REFERENCES "clients" ("id") ON DELETE SET NULL,
        "companyId" INTEGER REFERENCES "companies" ("id") ON DELETE SET NULL,
        "userId" INTEGER REFERENCES "users" ("id") ON DELETE SET NULL,
        "entityType" VARCHAR(100) NOT NULL,
        "entityId" INTEGER,
        "action" VARCHAR(100) NOT NULL,
        "oldValue" JSONB,
        "newValue" JSONB,
        "ipAddress" VARCHAR(50),
        "userAgent" VARCHAR(255),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
      );
    `);
    console.log('[Phase 3 Migration] Checked/created "audit_logs".');

    // 3. notifications table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "title" VARCHAR(255) NOT NULL,
        "message" TEXT NOT NULL,
        "type" VARCHAR(50) DEFAULT 'INFO',
        "entityType" VARCHAR(100),
        "entityId" INTEGER,
        "isRead" BOOLEAN DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
      );
    `);
    console.log('[Phase 3 Migration] Checked/created "notifications".');

    // 4. notes table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "notes" (
        "id" SERIAL PRIMARY KEY,
        "entityType" VARCHAR(100) NOT NULL,
        "entityId" INTEGER NOT NULL,
        "content" TEXT NOT NULL,
        "createdBy" INTEGER REFERENCES "users" ("id") ON DELETE SET NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
      );
    `);
    console.log('[Phase 3 Migration] Checked/created "notes".');

    // 5. tags table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "tags" (
        "id" SERIAL PRIMARY KEY,
        "name" VARCHAR(100) NOT NULL UNIQUE,
        "color" VARCHAR(50),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
      );
    `);
    console.log('[Phase 3 Migration] Checked/created "tags".');

    // 6. departments table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "departments" (
        "id" SERIAL PRIMARY KEY,
        "companyId" INTEGER NOT NULL REFERENCES "companies" ("id") ON DELETE CASCADE,
        "name" VARCHAR(255) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
      );
    `);
    console.log('[Phase 3 Migration] Checked/created "departments".');

    console.log('[Phase 3 Migration] Migration finished successfully.');
  } catch (err) {
    console.error('[Phase 3 Migration] Failed:', err);
  } finally {
    await sequelize.close();
  }
}

run();
