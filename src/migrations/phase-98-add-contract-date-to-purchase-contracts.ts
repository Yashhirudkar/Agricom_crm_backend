import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '98';
export const name = 'add contract date to purchase contracts';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    const tableInfo = await queryInterface.describeTable('purchase_contracts');
    if (!tableInfo.contract_date) {
      await queryInterface.addColumn(
        'purchase_contracts',
        'contract_date',
        { type: DataTypes.DATEONLY, allowNull: true },
        { transaction },
      );
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
    const tableInfo = await queryInterface.describeTable('purchase_contracts');
    if (tableInfo.contract_date) {
      await queryInterface.removeColumn('purchase_contracts', 'contract_date', {
        transaction,
      });
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
