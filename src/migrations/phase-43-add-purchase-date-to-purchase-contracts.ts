import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '43';
export const name = 'add-purchase-date-to-purchase-contracts';

export async function up(queryInterface: QueryInterface) {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.addColumn(
      'purchase_contracts',
      'purchase_date',
      {
        type: DataTypes.DATEONLY,
        allowNull: true,
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
    await queryInterface.removeColumn('purchase_contracts', 'purchase_date', {
      transaction,
    });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
