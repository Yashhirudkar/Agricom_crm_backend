import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '51';
export const name = 'add-shipment-type-to-purchase-contracts';

export async function up(queryInterface: QueryInterface) {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.addColumn(
      'purchase_contracts',
      'shipment_type_id',
      {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'shipment_types', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      { transaction },
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function down(queryInterface: QueryInterface) {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.removeColumn('purchase_contracts', 'shipment_type_id', {
      transaction,
    });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
