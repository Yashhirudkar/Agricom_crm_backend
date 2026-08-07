import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '32';
export const name = 'Add Biometric queue priority, retry scheduling, soft delete, and sidebar item';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const addCol = async (table: string, colName: string, spec: any) => {
    await queryInterface.addColumn(table, colName, spec).catch(() => {});
  };

  // 1. Add columns to biometric_devices
  await addCol('biometric_devices', 'deletedAt', {
    type: DataTypes.DATE,
    allowNull: true,
  });

  await addCol('biometric_devices', 'deletedBy', {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL',
  });

  await addCol('biometric_devices', 'configVersion', {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  });

  await addCol('biometric_devices', 'maintenanceMode', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });

  // 2. Add columns to biometric_punch_logs
  await addCol('biometric_punch_logs', 'priority', {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'NORMAL',
  });

  await addCol('biometric_punch_logs', 'correlationId', {
    type: DataTypes.STRING(255),
    allowNull: true,
  });

  await addCol('biometric_punch_logs', 'nextRetryAt', {
    type: DataTypes.DATE,
    allowNull: true,
  });

  await addCol('biometric_punch_logs', 'lastRetryAt', {
    type: DataTypes.DATE,
    allowNull: true,
  });

  // Add index on nextRetryAt and status for polling optimization
  await queryInterface.addIndex('biometric_punch_logs', ['status', 'nextRetryAt'], {
    name: 'idx_biometric_punches_retry_poll',
  }).catch(() => {});

  // 3. Register "Biometric Devices" under dynamic sidebar folder "Attendance"
  try {
    const [folders]: any = await queryInterface.sequelize.query(
      `SELECT id FROM sidebar_folders WHERE name = 'Attendance' LIMIT 1;`,
      { type: 'SELECT' }
    );

    if (folders && folders.id) {
      const folderId = folders.id;

      // Check if item already exists to prevent duplicate seeding
      const [existingItems]: any = await queryInterface.sequelize.query(
        `SELECT id FROM sidebar_items WHERE route = '/biometric' LIMIT 1;`,
        { type: 'SELECT' }
      );

      if (!existingItems) {
        // Insert item
        const [itemResult]: any = await queryInterface.sequelize.query(
          `INSERT INTO sidebar_items (name, route, icon_name, folder_id, sort_order, is_active, permission_link, "createdAt", "updatedAt")
           VALUES ('Biometric Devices', '/biometric', 'Cpu', ${folderId}, 60, true, 'attendance_activity:read', NOW(), NOW())
           RETURNING id;`
        );

        if (itemResult && itemResult.length > 0) {
          const itemId = itemResult[0].id;
          
          // Link access to all clients
          await queryInterface.sequelize.query(
            `INSERT INTO client_item_access (client_id, item_id, "createdAt", "updatedAt")
             SELECT id, ${itemId}, NOW(), NOW() FROM clients
             ON CONFLICT (client_id, item_id) DO NOTHING;`
          ).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error('⚠️ Failed to automatically register biometric sidebar menu item:', err);
  }

  console.log('✅ Phase 32 - Biometric Queue enhancements and sidebar registered.');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // 1. Unregister Sidebar Menu Item
  try {
    const [item]: any = await queryInterface.sequelize.query(
      `SELECT id FROM sidebar_items WHERE route = '/biometric' LIMIT 1;`,
      { type: 'SELECT' }
    );

    if (item && item.id) {
      await queryInterface.sequelize.query(`DELETE FROM client_item_access WHERE item_id = ${item.id};`).catch(() => {});
      await queryInterface.sequelize.query(`DELETE FROM sidebar_items WHERE id = ${item.id};`).catch(() => {});
    }
  } catch (err) {
    console.error('Failed to roll back sidebar seeder changes', err);
  }

  // 2. Remove index
  await queryInterface.removeIndex('biometric_punch_logs', 'idx_biometric_punches_retry_poll').catch(() => {});

  // 3. Remove columns from tables
  await queryInterface.removeColumn('biometric_punch_logs', 'lastRetryAt').catch(() => {});
  await queryInterface.removeColumn('biometric_punch_logs', 'nextRetryAt').catch(() => {});
  await queryInterface.removeColumn('biometric_punch_logs', 'correlationId').catch(() => {});
  await queryInterface.removeColumn('biometric_punch_logs', 'priority').catch(() => {});

  await queryInterface.removeColumn('biometric_devices', 'maintenanceMode').catch(() => {});
  await queryInterface.removeColumn('biometric_devices', 'configVersion').catch(() => {});
  await queryInterface.removeColumn('biometric_devices', 'deletedBy').catch(() => {});
  await queryInterface.removeColumn('biometric_devices', 'deletedAt').catch(() => {});

  console.log('📉 Phase 32 - Biometric Queue enhancements and sidebar rolled back.');
}
