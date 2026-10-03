import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '31';
export const name = 'Add currency_code to purchase_contracts';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    const tableInfo = await queryInterface.describeTable('purchase_contracts');
    
    if (!tableInfo['currency_code']) {
      await queryInterface.addColumn(
        'purchase_contracts',
        'currency_code',
        {
          type: DataTypes.STRING(10),
          allowNull: true,
        },
        { transaction }
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
    if (tableInfo['currency_code']) {
      await queryInterface.removeColumn('purchase_contracts', 'currency_code', { transaction });
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
