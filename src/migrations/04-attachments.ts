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
  console.log('[Migration] Attachments & Documents Migration');
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
      console.log('[Migration] Executing attachments migration...');

      // 1. Create attachments table
      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS "attachments" (
          "id" SERIAL PRIMARY KEY,
          "original_name" VARCHAR(255) NOT NULL,
          "stored_name" VARCHAR(255) NOT NULL,
          "extension" VARCHAR(10) NOT NULL,
          "mime_type" VARCHAR(100) NOT NULL,
          "file_size" INTEGER NOT NULL,
          "storage_path" VARCHAR(500) NOT NULL,
          "storage_disk" VARCHAR(50) NOT NULL,
          "uploaded_by" INTEGER,
          "company_id" INTEGER,
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "deleted_at" TIMESTAMP WITH TIME ZONE
        );
      `,
        { transaction },
      );

      // 2. Create sales_contract_document_files mapping table
      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS "sales_contract_document_files" (
          "id" SERIAL PRIMARY KEY,
          "sales_contract_id" INTEGER NOT NULL REFERENCES "sales_contracts"("id") ON DELETE CASCADE,
          "trade_document_id" INTEGER NOT NULL REFERENCES "trade_documents"("id") ON DELETE CASCADE,
          "attachment_id" INTEGER NOT NULL REFERENCES "attachments"("id") ON DELETE CASCADE,
          "uploaded_by" INTEGER,
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          CONSTRAINT "unique_sales_contract_trade_document" UNIQUE ("sales_contract_id", "trade_document_id")
        );
      `,
        { transaction },
      );

      console.log(
        '[Migration] Attachments and mappings tables created successfully.',
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

// Allow being called directly or exported
if (require.main === module) {
  run();
}
export { run as runAttachmentsMigration };
