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
      console.log('Partner resource found:', partnerResource);
      
      // Check if followup action exists for partner
      const [actions] = await sequelize.query(`SELECT * FROM "resource_actions" WHERE resource_id = ${partnerResource.id} AND name = 'followup';`);
      
      if (actions.length === 0) {
        console.log('Followup action not found, inserting it...');
        await sequelize.query(`
          INSERT INTO "resource_actions" (name, display_name, sort_order, resource_id, "createdAt", "updatedAt")
          VALUES ('followup', 'CHAT / FOLLOWUP', 50, ${partnerResource.id}, NOW(), NOW());
        `);
        console.log('Followup action inserted successfully.');
      } else {
        console.log('Followup action already exists:', actions[0]);
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
