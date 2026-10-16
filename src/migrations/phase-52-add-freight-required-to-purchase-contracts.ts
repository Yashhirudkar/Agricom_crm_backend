import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '52';
export const name = 'add-freight-required-to-purchase-contracts';

export async function up(queryInterface: QueryInterface) {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    // Add freight_required to purchase_contracts
    await queryInterface.addColumn(
      'purchase_contracts',
      'freight_required',
      {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      { transaction },
    );

    // Add purchase_contract_id to logistics table to link transport queue directly
    await queryInterface.addColumn(
      'logistics',
      'purchase_contract_id',
      {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'purchase_contracts', key: 'id' },
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
    await queryInterface.removeColumn('logistics', 'purchase_contract_id', {
      transaction,
    });
    await queryInterface.removeColumn('purchase_contracts', 'freight_required', {
      transaction,
    });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
