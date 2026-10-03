import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '33';
export const name = 'Add unloading_date to purchase_contracts';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    const tableInfo = await queryInterface.describeTable('purchase_contracts');
    
    if (!tableInfo['unloading_date']) {
      await queryInterface.addColumn(
        'purchase_contracts',
        'unloading_date',
        {
          type: DataTypes.DATEONLY,
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
    if (tableInfo['unloading_date']) {
      await queryInterface.removeColumn('purchase_contracts', 'unloading_date', { transaction });
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
