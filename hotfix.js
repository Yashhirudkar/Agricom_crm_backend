const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'agricom',
  process.env.DB_USERNAME || 'postgres',
  process.env.DB_PASSWORD || 'postgres',
  {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    dialect: 'postgres',
    logging: console.log,
  }
);

async function fix() {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');

    // Check sidebar_folders
    const folderCols = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name='sidebar_folders' AND column_name='icon_color';
    `);
    
    if (folderCols[0].length === 0) {
      console.log('Adding icon_color to sidebar_folders...');
      await sequelize.query('ALTER TABLE sidebar_folders ADD COLUMN icon_color VARCHAR(50);');
    } else {
      console.log('icon_color already exists on sidebar_folders');
    }

    // Check sidebar_items
    const itemCols = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name='sidebar_items' AND column_name='icon_color';
    `);

    if (itemCols[0].length === 0) {
      console.log('Adding icon_color to sidebar_items...');
      await sequelize.query('ALTER TABLE sidebar_items ADD COLUMN icon_color VARCHAR(50);');
    } else {
      console.log('icon_color already exists on sidebar_items');
    }

    // Attempt to drop tables
    try {
      console.log('Dropping ui_configurations...');
      await sequelize.query('DROP TABLE IF EXISTS ui_configurations CASCADE;');
      
      console.log('Dropping ui_config_versions...');
      await sequelize.query('DROP TABLE IF EXISTS ui_config_versions CASCADE;');
      
      console.log('Dropping ui_entity_registry...');
      await sequelize.query('DROP TABLE IF EXISTS ui_entity_registry CASCADE;');
      
      console.log('Dropping ui_themes...');
      await sequelize.query('DROP TABLE IF EXISTS ui_themes CASCADE;');
      
      console.log('Dropping ui_media_assets...');
      await sequelize.query('DROP TABLE IF EXISTS ui_media_assets CASCADE;');
      
      console.log('Dropping ui_icons...');
      await sequelize.query('DROP TABLE IF EXISTS ui_icons CASCADE;');
    } catch (e) {
      console.log('Error dropping tables:', e.message);
    }

    console.log('Done.');
    process.exit(0);
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    process.exit(1);
  }
}

fix();
