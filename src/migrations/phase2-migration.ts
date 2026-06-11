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
    console.log('[Phase 2 Migration] Connected to database.');

    // 1. DDL: Add columns to roles
    await sequelize.query(`
      ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "clientId" INTEGER REFERENCES "clients" ("id") ON DELETE SET NULL;
    `);
    console.log('[Phase 2 Migration] Added "clientId" to "roles".');

    await sequelize.query(`
      ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "isSystemRole" BOOLEAN DEFAULT false;
    `);
    console.log('[Phase 2 Migration] Added "isSystemRole" to "roles".');

    // 2. Data migration: Migrate existing roles
    // System roles (like "Admin" and "Client Admin" which had null companyId)
    await sequelize.query(`
      UPDATE "roles"
      SET "isSystemRole" = true, "clientId" = null
      WHERE "companyId" IS NULL;
    `);
    console.log('[Phase 2 Migration] Updated system roles (Admin, Client Admin).');

    // Company roles (custom roles) -> update to Client level scoping
    const [companyRoles] = await sequelize.query(`
      SELECT r.id, r."companyId", c."clientId"
      FROM "roles" r
      JOIN "companies" c ON r."companyId" = c.id
      WHERE r."companyId" IS NOT NULL;
    `);
    console.log(`[Phase 2 Migration] Found ${companyRoles.length} company-scoped roles to migrate to client-scoped.`);

    for (const role of companyRoles as any) {
      await sequelize.query(`
        UPDATE "roles"
        SET "clientId" = :clientId, "isSystemRole" = false
        WHERE id = :id;
      `, {
        replacements: { clientId: role.clientId, id: role.id }
      });
    }

    console.log('[Phase 2 Migration] Migration finished successfully.');
  } catch (err) {
    console.error('[Phase 2 Migration] Failed:', err);
  } finally {
    await sequelize.close();
  }
}

run();
