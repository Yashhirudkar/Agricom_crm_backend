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
  console.log('[Migration] Enquiries Migration');
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
      console.log('[Migration] Executing enquiries migration...');

      await sequelize.query(
        `CREATE SEQUENCE IF NOT EXISTS "enquiries_no_seq" START 1;`,
        { transaction }
      );

      await sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS "enquiries" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "enquiry_no" VARCHAR(50) NOT NULL UNIQUE,
          "enquiry_date" DATE NOT NULL,
          "partner_role_id" INTEGER NOT NULL REFERENCES "partner_roles"("id"),
          "partner_id" INTEGER NOT NULL REFERENCES "partners"("id"),
          "product_id" INTEGER NOT NULL REFERENCES "products"("id"),
          "origin_country_id" INTEGER REFERENCES "countries"("id"),
          "purity" VARCHAR(50),
          "packing_type_id" INTEGER REFERENCES "packing_types"("id"),
          "pod_port_id" INTEGER,
          "shipment_type" VARCHAR(50),
          "quantity" DECIMAL(15, 4),
          "shipment_date" DATE,
          "buying_interest" DECIMAL(15, 4),
          "potential_enquiry" BOOLEAN NOT NULL DEFAULT true,
          "status" VARCHAR(50) NOT NULL DEFAULT 'NEW',
          "created_by" INTEGER REFERENCES "users"("id"),
          "updated_by" INTEGER REFERENCES "users"("id"),
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "deleted_at" TIMESTAMP WITH TIME ZONE
        );
      `,
        { transaction },
      );

      await sequelize.query(
        `
        CREATE INDEX IF NOT EXISTS "enquiries_enquiry_no_idx" ON "enquiries" ("enquiry_no");
        CREATE INDEX IF NOT EXISTS "enquiries_partner_role_id_idx" ON "enquiries" ("partner_role_id");
        CREATE INDEX IF NOT EXISTS "enquiries_partner_id_idx" ON "enquiries" ("partner_id");
        CREATE INDEX IF NOT EXISTS "enquiries_product_id_idx" ON "enquiries" ("product_id");
        CREATE INDEX IF NOT EXISTS "enquiries_origin_country_id_idx" ON "enquiries" ("origin_country_id");
        CREATE INDEX IF NOT EXISTS "enquiries_packing_type_id_idx" ON "enquiries" ("packing_type_id");
        CREATE INDEX IF NOT EXISTS "enquiries_status_idx" ON "enquiries" ("status");
        CREATE INDEX IF NOT EXISTS "enquiries_shipment_date_idx" ON "enquiries" ("shipment_date");
        CREATE INDEX IF NOT EXISTS "enquiries_created_at_idx" ON "enquiries" ("created_at");
        `,
        { transaction },
      );

      console.log(
        '[Migration] Enquiries table created successfully.',
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
export { run as runEnquiriesMigration };
