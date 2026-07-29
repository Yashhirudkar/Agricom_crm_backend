import { Sequelize } from 'sequelize';

async function main() {
  const sequelize = new Sequelize('Agricom_db', 'postgres', 'admin', {
    host: 'localhost',
    dialect: 'postgres',
  });

  try {
    await sequelize.authenticate();
    
    // Check missing actions
    const [missing] = await sequelize.query(`
      SELECT * FROM "resource_actions" WHERE id >= 141;
    `);
    
    console.log('Actions >= 141:', missing);
    
    // Grant all these actions to clients if they don't have it
    const [clients] = await sequelize.query(`SELECT id FROM "clients";`);
    
    for (const action of missing) {
      for (const client of clients) {
        const [access] = await sequelize.query(`
          SELECT * FROM "client_action_access" 
          WHERE client_id = ${client.id} AND resource_action_id = ${action.id};
        `);
        
        if (access.length === 0) {
          await sequelize.query(`
            INSERT INTO "client_action_access" (client_id, resource_action_id, "created_at")
            VALUES (${client.id}, ${action.id}, NOW());
          `);
          console.log(`Granted access for action ${action.id} to client ${client.id}`);
        }
      }
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sequelize.close();
  }
}

main();
