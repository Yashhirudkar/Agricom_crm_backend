import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '42';
export const name = 'add-shipment-sequence';

export async function up(queryInterface: QueryInterface) {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    const tables = [
      'sales_contract_shipments',
      'purchase_contract_shipments',
      'purchase_contracts',
      'freight_quotes',
      'logistics'
    ];

    for (const table of tables) {
      const tableInfo = await queryInterface.describeTable(table).catch(() => null);
      if (tableInfo && !tableInfo.shipment_sequence) {
        await queryInterface.addColumn(
          table,
          'shipment_sequence',
          {
            type: DataTypes.INTEGER,
            allowNull: true,
          },
          { transaction }
        );
      }
    }

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function down(queryInterface: QueryInterface) {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    const tables = [
      'sales_contract_shipments',
      'purchase_contract_shipments',
      'purchase_contracts',
      'freight_quotes',
      'logistics'
    ];

    for (const table of tables) {
      const tableInfo = await queryInterface.describeTable(table).catch(() => null);
      if (tableInfo && tableInfo.shipment_sequence) {
        await queryInterface.removeColumn(table, 'shipment_sequence', { transaction });
      }
    }

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
