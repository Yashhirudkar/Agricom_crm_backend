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
  console.log('[Migration] Alter Enquiries Port Migration');
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
    await sequelize.transaction(async (transaction) => {
      console.log('[Migration] Altering pod_port_id to pod_port...');
      // Rename column and change type
      await sequelize.query(
        `ALTER TABLE "enquiries" ALTER COLUMN "pod_port_id" TYPE VARCHAR(255);`,
        { transaction }
      );
      await sequelize.query(
        `ALTER TABLE "enquiries" RENAME COLUMN "pod_port_id" TO "pod_port";`,
        { transaction }
      );
      console.log('[Migration] Column altered successfully.');
    });
  } catch (error) {
    console.error(error);
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  run();
}
export { run as runAlterPortMigration };
