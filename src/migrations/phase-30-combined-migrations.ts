import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '30';
export const name = 'combined-migrations-30-to-36';

export async function up(queryInterface: QueryInterface): Promise<void> {
  try {
    // 30 - Purchase Contract Payment Fields
    const tableInfo = await queryInterface
      .describeTable('purchase_contracts')
      .catch(() => null);
    if (tableInfo && !tableInfo.payment_terms_text) {
      await queryInterface.addColumn(
        'purchase_contracts',
        'payment_terms_text',
        {
          type: DataTypes.TEXT,
          allowNull: true,
        },
      );
    }
    if (tableInfo && !tableInfo.advance_percent) {
      await queryInterface.addColumn('purchase_contracts', 'advance_percent', {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
      });
    }
    if (tableInfo && !tableInfo.balance_percent) {
      await queryInterface.addColumn('purchase_contracts', 'balance_percent', {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
      });
    }
    if (tableInfo && !tableInfo.penalty_percent) {
      await queryInterface.addColumn('purchase_contracts', 'penalty_percent', {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
      });
    }
    if (tableInfo && !tableInfo.payment_due_date) {
      await queryInterface.addColumn('purchase_contracts', 'payment_due_date', {
        type: DataTypes.DATEONLY,
        allowNull: true,
      });
    }

    // 31 - Enquiry Loading Points
    await queryInterface.createTable(
      'enquiry_loading_points',
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
          allowNull: false,
        },
        company_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: 'companies', key: 'id' },
          onDelete: 'CASCADE',
        },
        enquiry_id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: { model: 'enquiries', key: 'id' },
          onDelete: 'CASCADE',
        },
        loading_point: {
          type: DataTypes.STRING(500),
          allowNull: false,
        },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      },
      { ifNotExists: true } as any,
    );

    await queryInterface
      .addIndex('enquiry_loading_points', ['enquiry_id'], {
        name: 'elp_enquiry_id_idx',
      })
      .catch(() => {});
    await queryInterface
      .addIndex('enquiry_loading_points', ['company_id'], {
        name: 'elp_company_id_idx',
      })
      .catch(() => {});

    // 32 - Enquiry Destinations
    await queryInterface.createTable(
      'enquiry_destinations',
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
          allowNull: false,
        },
        company_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: 'companies', key: 'id' },
          onDelete: 'CASCADE',
        },
        enquiry_id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: { model: 'enquiries', key: 'id' },
          onDelete: 'CASCADE',
        },
        destination: {
          type: DataTypes.STRING(500),
          allowNull: false,
        },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      },
      { ifNotExists: true } as any,
    );

    await queryInterface
      .addIndex('enquiry_destinations', ['enquiry_id'], {
        name: 'ed_enquiry_id_idx',
      })
      .catch(() => {});
    await queryInterface
      .addIndex('enquiry_destinations', ['company_id'], {
        name: 'ed_company_id_idx',
      })
      .catch(() => {});

    // 32 / 34 - Freight Quote Route
    const freightQuotesTableInfo = await queryInterface
      .describeTable('freight_quotes')
      .catch(() => null);
    if (freightQuotesTableInfo && !freightQuotesTableInfo.route) {
      await queryInterface.addColumn('freight_quotes', 'route', {
        type: DataTypes.STRING(255),
        allowNull: true,
      });
    }

    // 33 - Enquiry bid_type and note fields
    const enquiriesTableInfo = await queryInterface
      .describeTable('enquiries')
      .catch(() => null);
    if (enquiriesTableInfo && !enquiriesTableInfo.bid_type) {
      await queryInterface.addColumn('enquiries', 'bid_type', {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'TARGET',
      });
    }
    if (enquiriesTableInfo && !enquiriesTableInfo.note) {
      await queryInterface.addColumn('enquiries', 'note', {
        type: DataTypes.TEXT,
        allowNull: true,
      });
    }

    // 35 - Logistics Routes
    await queryInterface.createTable('logistics_routes', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      logistics_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'logistics',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      origin: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      destination: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });

    if (freightQuotesTableInfo && !freightQuotesTableInfo.route_id) {
      await queryInterface.addColumn('freight_quotes', 'route_id', {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'logistics_routes',
          key: 'id',
        },
        onDelete: 'SET NULL',
      });
    }

    // 36 - Logistics is_viewed
    const logisticsTableInfo = await queryInterface
      .describeTable('logistics')
      .catch(() => null);
    if (logisticsTableInfo && !logisticsTableInfo.is_viewed) {
      await queryInterface.addColumn('logistics', 'is_viewed', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    console.log('Phase 30 Combined Migration Completed.');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  try {
    // 36
    const logisticsTableInfo = await queryInterface
      .describeTable('logistics')
      .catch(() => null);
    if (logisticsTableInfo && logisticsTableInfo.is_viewed) {
      await queryInterface.removeColumn('logistics', 'is_viewed');
    }

    // 35
    const freightQuotesTableInfo = await queryInterface
      .describeTable('freight_quotes')
      .catch(() => null);
    if (freightQuotesTableInfo && freightQuotesTableInfo.route_id) {
      await queryInterface.removeColumn('freight_quotes', 'route_id');
    }
    await queryInterface.dropTable('logistics_routes').catch(() => {});

    if (freightQuotesTableInfo && freightQuotesTableInfo.route) {
      await queryInterface.removeColumn('freight_quotes', 'route');
    }

    // 33
    const enquiriesTableInfo = await queryInterface
      .describeTable('enquiries')
      .catch(() => null);
    if (enquiriesTableInfo && enquiriesTableInfo.note) {
      await queryInterface.removeColumn('enquiries', 'note');
    }
    if (enquiriesTableInfo && enquiriesTableInfo.bid_type) {
      await queryInterface.removeColumn('enquiries', 'bid_type');
    }

    await queryInterface.dropTable('enquiry_destinations').catch(() => {});

    // 31
    await queryInterface.dropTable('enquiry_loading_points').catch(() => {});

    // 30
    const tableInfo = await queryInterface
      .describeTable('purchase_contracts')
      .catch(() => null);
    if (tableInfo && tableInfo.payment_terms_text)
      await queryInterface.removeColumn(
        'purchase_contracts',
        'payment_terms_text',
      );
    if (tableInfo && tableInfo.advance_percent)
      await queryInterface.removeColumn(
        'purchase_contracts',
        'advance_percent',
      );
    if (tableInfo && tableInfo.balance_percent)
      await queryInterface.removeColumn(
        'purchase_contracts',
        'balance_percent',
      );
    if (tableInfo && tableInfo.penalty_percent)
      await queryInterface.removeColumn(
        'purchase_contracts',
        'penalty_percent',
      );
    if (tableInfo && tableInfo.payment_due_date)
      await queryInterface.removeColumn(
        'purchase_contracts',
        'payment_due_date',
      );
  } catch (error) {
    throw error;
  }
}
