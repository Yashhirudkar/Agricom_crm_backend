import { Sequelize } from 'sequelize';

async function main() {
  const sequelize = new Sequelize('Agricom_db', 'postgres', 'admin', {
    host: 'localhost',
    dialect: 'postgres',
  });

  try {
    await sequelize.authenticate();
    
    // We will delete action 143 (the lowercase 'followup' we manually added)
    // and keep 144 (the uppercase 'FOLLOWUP' which the system auto-generated).
    
    const [action143] = await sequelize.query(`SELECT * FROM "resource_actions" WHERE id = 143;`);
    
    if (action143.length > 0) {
      console.log('Found action 143, deleting it...');
      
      // Delete from client_action_access first
      await sequelize.query(`DELETE FROM "client_action_access" WHERE resource_action_id = 143;`);
      
      // Delete from role_action_permissions if any
      await sequelize.query(`DELETE FROM "role_action_permissions" WHERE resource_action_id = 143;`);
      
      // Delete from resource_actions
      await sequelize.query(`DELETE FROM "resource_actions" WHERE id = 143;`);
      
      console.log('Action 143 deleted successfully.');
    } else {
      console.log('Action 143 not found.');
    }
    
    // Now let's update display_name of 144 to 'CHAT / FOLLOWUP'
    await sequelize.query(`
      UPDATE "resource_actions" 
      SET display_name = 'CHAT / FOLLOWUP', sort_order = 50
      WHERE id = 144;
    `);
    
    console.log('Action 144 updated successfully.');
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sequelize.close();
  }
}

main();
