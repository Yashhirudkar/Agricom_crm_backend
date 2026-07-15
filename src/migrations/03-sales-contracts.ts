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
  console.log('[Migration] Sales Contracts Migration');
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
      console.log('[Migration] Executing sales contracts migration...');

      // 1. Create sales_contracts table
      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS "sales_contracts" (
          "id" SERIAL PRIMARY KEY,
          "contract_number" VARCHAR(50) NOT NULL UNIQUE,
          "financial_year_id" INTEGER NOT NULL REFERENCES "financial_years"("id"),
          "contract_date" DATE NOT NULL,
          "buyer_id" INTEGER NOT NULL REFERENCES "partners"("id"),
          "broker_id" INTEGER REFERENCES "partners"("id"),
          "currency_id" INTEGER NOT NULL REFERENCES "currencies"("id"),
          "total_quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
          "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
          "shipment_type_id" INTEGER NOT NULL REFERENCES "shipment_types"("id"),
          "payment_term_id" INTEGER NOT NULL REFERENCES "payment_terms"("id"),
          "origin_country_id" INTEGER NOT NULL REFERENCES "countries"("id"),
          "destination_country_id" INTEGER NOT NULL REFERENCES "countries"("id"),
          "port_of_loading" VARCHAR(255),
          "port_of_discharge" VARCHAR(255),
          "remarks" TEXT,
          "status" VARCHAR(20) NOT NULL DEFAULT 'Draft',
          "created_by" INTEGER,
          "updated_by" INTEGER,
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `,
        { transaction },
      );

      // 2. Create sales_contract_items table
      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS "sales_contract_items" (
          "id" SERIAL PRIMARY KEY,
          "sales_contract_id" INTEGER NOT NULL REFERENCES "sales_contracts"("id") ON DELETE CASCADE,
          "product_id" INTEGER NOT NULL REFERENCES "products"("id"),
          "quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
          "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0,
          "amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
          "bag_type_id" INTEGER NOT NULL REFERENCES "bag_types"("id"),
          "packing_type_id" INTEGER NOT NULL REFERENCES "packing_types"("id"),
          "bag_specification_id" INTEGER REFERENCES "bag_specifications"("id"),
          "remarks" VARCHAR(500),
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `,
        { transaction },
      );

      // 3. Create sales_contract_shipments table
      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS "sales_contract_shipments" (
          "id" SERIAL PRIMARY KEY,
          "sales_contract_id" INTEGER NOT NULL REFERENCES "sales_contracts"("id") ON DELETE CASCADE,
          "shipment_date" DATE NOT NULL,
          "quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
          "remarks" VARCHAR(500),
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `,
        { transaction },
      );

      // 4. Create sales_contract_documents table
      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS "sales_contract_documents" (
          "id" SERIAL PRIMARY KEY,
          "sales_contract_id" INTEGER NOT NULL REFERENCES "sales_contracts"("id") ON DELETE CASCADE,
          "trade_document_id" INTEGER NOT NULL REFERENCES "trade_documents"("id"),
          "is_mandatory" BOOLEAN NOT NULL DEFAULT false,
          "remarks" VARCHAR(500),
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `,
        { transaction },
      );

      // Indexes
      await sequelize.query(`CREATE INDEX IF NOT EXISTS "idx_sales_contracts_status" ON "sales_contracts"("status");`, { transaction });
      await sequelize.query(`CREATE INDEX IF NOT EXISTS "idx_sales_contracts_number" ON "sales_contracts"("contract_number");`, { transaction });
      await sequelize.query(`CREATE INDEX IF NOT EXISTS "idx_sales_contracts_buyer" ON "sales_contracts"("buyer_id");`, { transaction });
      await sequelize.query(`CREATE INDEX IF NOT EXISTS "idx_sales_contracts_fy" ON "sales_contracts"("financial_year_id");`, { transaction });

      console.log(
        '[Migration] Sales contracts tables created successfully.',
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
