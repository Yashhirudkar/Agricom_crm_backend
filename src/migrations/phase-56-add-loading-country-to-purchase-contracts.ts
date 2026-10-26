import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '56';
export const name = 'add-loading-country-to-purchase-contracts';

export async function up(queryInterface: QueryInterface) {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    const tableInfo: any = await queryInterface.describeTable('purchase_contracts');
    if (!tableInfo.loading_country) {
      await queryInterface.addColumn(
        'purchase_contracts',
        'loading_country',
        {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        { transaction },
      );
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
    const tableInfo: any = await queryInterface.describeTable('purchase_contracts');
    if (tableInfo.loading_country) {
      await queryInterface.removeColumn(
        'purchase_contracts',
        'loading_country',
        { transaction },
      );
    }
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
