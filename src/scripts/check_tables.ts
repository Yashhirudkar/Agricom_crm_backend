import { Sequelize } from 'sequelize';
import * as dotenv from 'dotenv';
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
  }
);

async function run() {
  try {
    const [results] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `);
    
    const tables = (results as any[]).map(r => r.table_name);
    
    console.log('--- TABLES ---');
    console.log(tables.join('\n'));
    
    const legacyTables = ['permissions', 'role_permissions', 'menu_items'];
    console.log('\n--- LEGACY CHECK ---');
    for (const lt of legacyTables) {
      console.log(`${lt} exists: ${tables.includes(lt)}`);
    }
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sequelize.close();
  }
}

run();
