import { Sequelize } from 'sequelize-typescript';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'agricom',
  process.env.DB_USERNAME || 'postgres',
  process.env.DB_PASSWORD || 'postgres',
  {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    dialect: 'postgres',
    logging: false,
    models: [path.join(__dirname, '..', '**', '*.model.ts')],
  }
);

async function run() {
  try {
    console.log('--- Syncing DB ---');
    await sequelize.sync({ alter: true });
    console.log('DB Sync completed.');
  } catch (error) {
    console.error('Sync failed:', error);
  } finally {
    await sequelize.close();
  }
}

run();
