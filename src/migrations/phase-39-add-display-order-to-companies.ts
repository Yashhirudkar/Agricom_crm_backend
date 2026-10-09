import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '39';
export const name = 'add-display-order-to-companies';

export async function up(queryInterface: QueryInterface) {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.addColumn(
      'companies',
      'display_order',
      {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      { transaction },
    );

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function down(queryInterface: QueryInterface) {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.removeColumn('companies', 'display_order', {
      transaction,
    });
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
