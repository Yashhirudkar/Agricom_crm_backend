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
    console.log(JSON.stringify(results, null, 2));
    
    // Also let's check client_item_access
    const itemIds = results.map(r => r.id);
    if (itemIds.length > 0) {
      const [access] = await sequelize.query(`
        SELECT client_id, item_id FROM client_item_access WHERE item_id IN (${itemIds.join(',')})
      `);
      console.log('Client Access:', access.length, 'records');
      console.log(JSON.stringify(access, null, 2));
    }
    
  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
}

run();
