import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '40';
export const name = 'add-place-of-loading-to-purchase-contracts';

export async function up(queryInterface: QueryInterface) {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.addColumn(
      'purchase_contracts',
      'place_of_loading',
      {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      { transaction }
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
    await queryInterface.removeColumn('purchase_contracts', 'place_of_loading', { transaction });
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
