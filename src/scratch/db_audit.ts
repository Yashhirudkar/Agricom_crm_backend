import { Sequelize } from 'sequelize-typescript';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load env
dotenv.config({ path: resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL!, {
  logging: false,
});

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Database connection successful.');
    
    // Check tables
    const tables = await sequelize.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `, { type: 'SELECT' });
    
    const tableNames = (tables as any[]).map((t: any) => t.table_name);
    console.log('Tables found:', tableNames);
    
    const requiredTables = [
      'app_modules', 'module_resources', 'resource_actions',
      'sidebar_folders', 'sidebar_items',
      'client_folder_access', 'client_item_access',
      'client_module_access', 'client_action_access'
    ];
    
    for (const req of requiredTables) {
      if (!tableNames.includes(req)) {
        console.log(`[ERROR] Missing table: ${req}`);
      }
    }
    
    console.log('DB Check complete.');
  } catch (error) {
    console.error('DB Check Failed:', error);
  } finally {
    await sequelize.close();
  }
}

run();
