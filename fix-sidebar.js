import { Sequelize } from 'sequelize';

async function main() {
  const sequelize = new Sequelize('Agricom_db', 'postgres', 'admin', {
    host: 'localhost',
    dialect: 'postgres',
  });

  try {
    await sequelize.authenticate();
    
    // Update the sidebar item for Orders
    await sequelize.query(`
      UPDATE "sidebar_items"
      SET permission_link = 'enquiries:read'
      WHERE name = 'Orders' AND permission_link = 'orders:read';
    `);
    
    console.log('✅ Orders sidebar item updated to use enquiries:read permission.');
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sequelize.close();
  }
}

main();
