import { QueryInterface, QueryTypes } from 'sequelize';

export const phase = '13';
export const name = 'Add Followup Permission to Partner Resource';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  
  try {
    // 1. Find the 'partner' resource
    const resources = await queryInterface.sequelize.query(
      `SELECT id FROM "module_resources" WHERE name = 'partner';`,
      { type: QueryTypes.SELECT, transaction }
    ) as any[];

    if (resources.length > 0) {
      const partnerResourceId = resources[0].id;

      // 2. Check if FOLLOWUP action already exists
      const existingActions = await queryInterface.sequelize.query(
        `SELECT id FROM "resource_actions" WHERE resource_id = :resourceId AND name = 'FOLLOWUP';`,
        { 
          replacements: { resourceId: partnerResourceId },
          type: QueryTypes.SELECT, 
          transaction 
        }
      ) as any[];

      let actionId;

      if (existingActions.length === 0) {
        // 3. Insert FOLLOWUP action
        const result = await queryInterface.sequelize.query(
          `INSERT INTO "resource_actions" (name, display_name, sort_order, resource_id, "createdAt", "updatedAt")
           VALUES ('FOLLOWUP', 'CHAT / FOLLOWUP', 50, :resourceId, NOW(), NOW())
           RETURNING id;`,
          {
            replacements: { resourceId: partnerResourceId },
            type: QueryTypes.INSERT,
            transaction
          }
        ) as any[];
        
        actionId = result[0][0].id;
        console.log(`✅ Inserted FOLLOWUP action with ID ${actionId} for partner resource.`);
      } else {
        actionId = existingActions[0].id;
        console.log(`✅ FOLLOWUP action already exists with ID ${actionId}. Updating display name...`);
        
        await queryInterface.sequelize.query(
          `UPDATE "resource_actions" SET display_name = 'CHAT / FOLLOWUP' WHERE id = :actionId;`,
          {
            replacements: { actionId },
            type: QueryTypes.UPDATE,
            transaction
          }
        );
      }

      // 4. Grant access to all existing clients in client_action_access
      const clients = await queryInterface.sequelize.query(
        `SELECT id FROM "clients";`,
        { type: QueryTypes.SELECT, transaction }
      ) as any[];

      for (const client of clients) {
        // Check if access already granted
        const existingAccess = await queryInterface.sequelize.query(
          `SELECT id FROM "client_action_access" WHERE client_id = :clientId AND resource_action_id = :actionId;`,
          {
            replacements: { clientId: client.id, actionId },
            type: QueryTypes.SELECT,
            transaction
          }
        ) as any[];

        if (existingAccess.length === 0) {
          await queryInterface.sequelize.query(
            `INSERT INTO "client_action_access" (client_id, resource_action_id, "created_at")
             VALUES (:clientId, :actionId, NOW());`,
            {
              replacements: { clientId: client.id, actionId },
              type: QueryTypes.INSERT,
              transaction
            }
          );
        }
      }
      console.log(`✅ Granted FOLLOWUP access to ${clients.length} clients.`);
    } else {
      console.log('⚠️ Partner resource not found. Skipping Followup permission seeding.');
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    const resources = await queryInterface.sequelize.query(
      `SELECT id FROM "module_resources" WHERE name = 'partner';`,
      { type: QueryTypes.SELECT, transaction }
    ) as any[];

    if (resources.length > 0) {
      const partnerResourceId = resources[0].id;
      
      const actions = await queryInterface.sequelize.query(
        `SELECT id FROM "resource_actions" WHERE resource_id = :resourceId AND name = 'FOLLOWUP';`,
        { 
          replacements: { resourceId: partnerResourceId },
          type: QueryTypes.SELECT, 
          transaction 
        }
      ) as any[];

      if (actions.length > 0) {
        const actionId = actions[0].id;
        // Delete from client_action_access (Cascade might not be set up safely)
        await queryInterface.sequelize.query(
          `DELETE FROM "client_action_access" WHERE resource_action_id = :actionId;`,
          { replacements: { actionId }, type: QueryTypes.DELETE, transaction }
        );
        // Delete from role_action_permissions
        await queryInterface.sequelize.query(
          `DELETE FROM "role_action_permissions" WHERE resource_action_id = :actionId;`,
          { replacements: { actionId }, type: QueryTypes.DELETE, transaction }
        );
        // Delete action
        await queryInterface.sequelize.query(
          `DELETE FROM "resource_actions" WHERE id = :actionId;`,
          { replacements: { actionId }, type: QueryTypes.DELETE, transaction }
        );
      }
    }
    await transaction.commit();
    console.log('✅ Phase 13 - Partner Followup permission removed');
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
