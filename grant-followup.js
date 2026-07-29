import { Sequelize } from 'sequelize';

async function main() {
  const sequelize = new Sequelize('Agricom_db', 'postgres', 'admin', {
    host: 'localhost',
    dialect: 'postgres',
  });

  try {
    await sequelize.authenticate();
    
    // Check if partner resource exists
    const [resources] = await sequelize.query(`SELECT * FROM "module_resources" WHERE name = 'partner';`);
    const partnerResource = resources[0];
    
    if (partnerResource) {
      // Find the followup action
      const [actions] = await sequelize.query(`SELECT * FROM "resource_actions" WHERE resource_id = ${partnerResource.id} AND name = 'followup';`);
      
      if (actions.length > 0) {
        const actionId = actions[0].id;
        console.log('Followup action ID:', actionId);
        
        // Find all client IDs
        const [clients] = await sequelize.query(`SELECT id FROM "clients";`);
        
        for (const client of clients) {
          // Check if client already has access
          const [access] = await sequelize.query(`
            SELECT * FROM "client_action_access" 
            WHERE client_id = ${client.id} AND resource_action_id = ${actionId};
          `);
          
          if (access.length === 0) {
            await sequelize.query(`
              INSERT INTO "client_action_access" (client_id, resource_action_id, "created_at")
              VALUES (${client.id}, ${actionId}, NOW());
            `);
            console.log(`Granted access for action ${actionId} to client ${client.id}`);
          } else {
            console.log(`Client ${client.id} already has access to action ${actionId}`);
          }
        }
      } else {
        console.log('Followup action not found!');
      }
    } else {
      console.log('Partner resource not found!');
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sequelize.close();
  }
}

main();
