import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '35';
export const name = 'Add specification fields to purchase_contracts';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.addColumn(
      'purchase_contracts',
      'specification_no',
      {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      { transaction },
    );

    await queryInterface.addColumn(
      'purchase_contracts',
      'specification_date',
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

export async function down(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.removeColumn(
      'purchase_contracts',
      'specification_no',
      { transaction },
    );
    await queryInterface.removeColumn(
      'purchase_contracts',
      'specification_date',
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
