import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '46';
export const name = 'add-freight-required-to-enquiries';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.addColumn(
      'enquiries',
      'freight_required',
      {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
    await queryInterface.removeColumn('enquiries', 'freight_required', {
      transaction,
    });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
