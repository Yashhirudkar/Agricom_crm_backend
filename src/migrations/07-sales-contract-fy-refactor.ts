import * as fs from 'fs';
import * as path from 'path';
import { Sequelize, QueryTypes } from 'sequelize';

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

/**
 * Derive a financial year string from a contract date.
 * Financial Year starts on 1 April.
 * If month >= 4 (April): FY = year-(year+1)
 * If month < 4 (before April): FY = (year-1)-year
 */
function deriveFyFromDate(dateStr: string | null): string {
  const now = new Date();
  const date = dateStr ? new Date(dateStr) : now;
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-indexed
  if (month >= 4) {
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
}

async function run() {
  console.log('----------------------------------------------------');
  console.log('[Migration 07] Sales Contract FY Refactor');
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
      console.log('[Migration] Step 1: Adding financial_year column (nullable initially)...');
      await sequelize.query(
        `ALTER TABLE "sales_contracts" ADD COLUMN IF NOT EXISTS "financial_year" VARCHAR(20);`,
        { transaction },
      );

      console.log('[Migration] Step 2: Populating financial_year from financial_years table (valid FKs)...');
      await sequelize.query(
        `
        UPDATE "sales_contracts" sc
        SET "financial_year" = fy."year"
        FROM "financial_years" fy
        WHERE sc."financial_year_id" = fy."id"
          AND sc."financial_year" IS NULL;
        `,
        { transaction },
      );

      console.log('[Migration] Step 3: Fetching contracts with NULL financial_year (orphan FKs or missing records)...');
      const orphans = (await sequelize.query(
        `SELECT id, contract_date FROM "sales_contracts" WHERE "financial_year" IS NULL;`,
        { type: QueryTypes.SELECT, transaction },
      )) as Array<{ id: number; contract_date: string | null }>;

      if (orphans.length > 0) {
        console.log(`[Migration] Found ${orphans.length} contract(s) with missing FY — deriving from contract_date...`);
        for (const row of orphans) {
          const fy = deriveFyFromDate(row.contract_date);
          await sequelize.query(
            `UPDATE "sales_contracts" SET "financial_year" = :fy WHERE id = :id;`,
            { replacements: { fy, id: row.id }, transaction },
          );
          console.log(`  → Contract ID ${row.id}: contract_date=${row.contract_date || 'NULL'} → derived FY: ${fy}`);
        }
      } else {
        console.log('[Migration] No orphan contracts found. All rows mapped cleanly.');
      }

      console.log('[Migration] Step 4: Verifying no NULL values remain...');
      const nullCheck = (await sequelize.query(
        `SELECT COUNT(*) as null_count FROM "sales_contracts" WHERE "financial_year" IS NULL;`,
        { type: QueryTypes.SELECT, transaction },
      )) as Array<{ null_count: string }>;
      const nullCount = parseInt(nullCheck[0]?.null_count || '0', 10);
      if (nullCount > 0) {
        throw new Error(`[Migration] ABORT: ${nullCount} row(s) still have NULL financial_year after derivation. Cannot proceed.`);
      }
      console.log('[Migration] Verification passed — zero NULL rows.');

      console.log('[Migration] Step 5: Setting financial_year NOT NULL...');
      await sequelize.query(
        `ALTER TABLE "sales_contracts" ALTER COLUMN "financial_year" SET NOT NULL;`,
        { transaction },
      );

      console.log('[Migration] Step 6: Dropping FK constraint on financial_year_id...');
      // Find the FK constraint name dynamically
      const fkResult = (await sequelize.query(
        `
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'sales_contracts'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'financial_year_id';
        `,
        { type: QueryTypes.SELECT, transaction },
      )) as Array<{ constraint_name: string }>;

      if (fkResult.length > 0) {
        const constraintName = fkResult[0].constraint_name;
        console.log(`  → Dropping FK constraint: ${constraintName}`);
        await sequelize.query(
          `ALTER TABLE "sales_contracts" DROP CONSTRAINT IF EXISTS "${constraintName}";`,
          { transaction },
        );
      } else {
        console.log('  → No FK constraint found on financial_year_id (already removed or never existed).');
      }

      console.log('[Migration] Step 7: Dropping old index idx_sales_contracts_fy...');
      await sequelize.query(
        `DROP INDEX IF EXISTS "idx_sales_contracts_fy";`,
        { transaction },
      );

      console.log('[Migration] Step 8: Dropping financial_year_id column...');
      await sequelize.query(
        `ALTER TABLE "sales_contracts" DROP COLUMN IF EXISTS "financial_year_id";`,
        { transaction },
      );

      console.log('[Migration] Step 9: Creating index on financial_year...');
      await sequelize.query(
        `CREATE INDEX IF NOT EXISTS "idx_sales_contracts_financial_year" ON "sales_contracts"("financial_year");`,
        { transaction },
      );

      console.log('[Migration] Step 10: Final verification — listing sample data...');
      const sample = (await sequelize.query(
        `SELECT id, contract_number, financial_year FROM "sales_contracts" LIMIT 10;`,
        { type: QueryTypes.SELECT, transaction },
      )) as Array<{ id: number; contract_number: string; financial_year: string }>;
      if (sample.length > 0) {
        console.log('[Migration] Sample rows after migration:');
        sample.forEach(r => console.log(`  → ID: ${r.id} | Contract: ${r.contract_number} | FY: ${r.financial_year}`));
      } else {
        console.log('[Migration] No rows in sales_contracts yet (fresh database).');
      }
    });

    console.log('----------------------------------------------------');
    console.log('[Migration 07] COMPLETED SUCCESSFULLY.');
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
