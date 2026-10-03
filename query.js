const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('Agricom_db1', 'postgres', 'admin', {
  host: 'localhost',
  dialect: 'postgres',
});

async function run() {
  try {
    const [results] = await sequelize.query(`
      SELECT id, name, route, permission_link 
      FROM sidebar_items 
      WHERE name IN ('Sales Contracts', 'Confirmed Orders');
    `);
    console.log(results);
    
    // Also let's check what permissions are available for Sales Contract
    const [resActions] = await sequelize.query(`
      SELECT r.name as resource, a.name as action
      FROM module_resources r
      JOIN resource_actions a ON r.id = a.resource_id
      WHERE r.name ILIKE '%sale%' OR r.name ILIKE '%contract%';
    `);
    console.log(resActions);
    
  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
}

run();
