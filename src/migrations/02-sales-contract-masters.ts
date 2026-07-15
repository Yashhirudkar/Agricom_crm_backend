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
  console.log('[Migration] Sales Contract Masters Migration');
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
      console.log('[Migration] Executing sales contract masters migration...');

      // 1. Create financial_years table
      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS "financial_years" (
          "id" SERIAL PRIMARY KEY,
          "year" VARCHAR(20) NOT NULL UNIQUE,
          "display_name" VARCHAR(100) NOT NULL,
          "start_date" DATE NOT NULL,
          "end_date" DATE NOT NULL,
          "is_current" BOOLEAN NOT NULL DEFAULT false,
          "status" VARCHAR(20) NOT NULL DEFAULT 'Active',
          "remarks" VARCHAR(500),
          "created_by" INTEGER,
          "updated_by" INTEGER,
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `,
        { transaction },
      );

      // 2. Create currencies table
      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS "currencies" (
          "id" SERIAL PRIMARY KEY,
          "code" VARCHAR(10) NOT NULL UNIQUE,
          "name" VARCHAR(100) NOT NULL,
          "symbol" VARCHAR(10) NOT NULL,
          "decimal_places" INTEGER NOT NULL DEFAULT 2,
          "status" VARCHAR(20) NOT NULL DEFAULT 'Active',
          "remarks" VARCHAR(500),
          "created_by" INTEGER,
          "updated_by" INTEGER,
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `,
        { transaction },
      );

      // 3. Create shipment_types table
      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS "shipment_types" (
          "id" SERIAL PRIMARY KEY,
          "code" VARCHAR(50) NOT NULL UNIQUE,
          "name" VARCHAR(100) NOT NULL,
          "description" VARCHAR(500),
          "sort_order" INTEGER NOT NULL DEFAULT 0,
          "status" VARCHAR(20) NOT NULL DEFAULT 'Active',
          "remarks" VARCHAR(500),
          "created_by" INTEGER,
          "updated_by" INTEGER,
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `,
        { transaction },
      );

      // 4. Create payment_terms table
      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS "payment_terms" (
          "id" SERIAL PRIMARY KEY,
          "code" VARCHAR(50) NOT NULL UNIQUE,
          "name" VARCHAR(100) NOT NULL,
          "credit_days" INTEGER NOT NULL DEFAULT 0,
          "description" VARCHAR(500),
          "sort_order" INTEGER NOT NULL DEFAULT 0,
          "status" VARCHAR(20) NOT NULL DEFAULT 'Active',
          "remarks" VARCHAR(500),
          "created_by" INTEGER,
          "updated_by" INTEGER,
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `,
        { transaction },
      );

      // 5. Create trade_documents table
      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS "trade_documents" (
          "id" SERIAL PRIMARY KEY,
          "code" VARCHAR(50) NOT NULL UNIQUE,
          "name" VARCHAR(100) NOT NULL,
          "description" VARCHAR(500),
          "mandatory_by_default" BOOLEAN NOT NULL DEFAULT false,
          "sort_order" INTEGER NOT NULL DEFAULT 0,
          "status" VARCHAR(20) NOT NULL DEFAULT 'Active',
          "remarks" VARCHAR(500),
          "created_by" INTEGER,
          "updated_by" INTEGER,
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `,
        { transaction },
      );

      // Indexes
      await sequelize.query(`CREATE INDEX IF NOT EXISTS "idx_financial_years_status" ON "financial_years"("status");`, { transaction });
      await sequelize.query(`CREATE INDEX IF NOT EXISTS "idx_financial_years_is_current" ON "financial_years"("is_current");`, { transaction });
      await sequelize.query(`CREATE INDEX IF NOT EXISTS "idx_currencies_status" ON "currencies"("status");`, { transaction });
      await sequelize.query(`CREATE INDEX IF NOT EXISTS "idx_shipment_types_status" ON "shipment_types"("status");`, { transaction });
      await sequelize.query(`CREATE INDEX IF NOT EXISTS "idx_payment_terms_status" ON "payment_terms"("status");`, { transaction });
      await sequelize.query(`CREATE INDEX IF NOT EXISTS "idx_trade_documents_status" ON "trade_documents"("status");`, { transaction });

      console.log(
        '[Migration] Sales contract masters tables created successfully.',
      );
    });

    console.log('[Migration] All migration tasks executed successfully.');
  } catch (error) {
    console.error('[Migration] Critical Failure during migration sequence:');
    console.error(error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
