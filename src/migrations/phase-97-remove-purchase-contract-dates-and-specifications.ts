import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '97';
export const name = 'remove purchase contract purchase date and specification fields';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    const tableInfo = await queryInterface.describeTable('purchase_contracts');
    for (const column of [
      'purchase_date',
      'specification_no',
      'specification_date',
    ]) {
      if (tableInfo[column]) {
        await queryInterface.removeColumn('purchase_contracts', column, {
          transaction,
        });
      }
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
    const columns = [
      ['purchase_date', DataTypes.DATEONLY],
      ['specification_no', DataTypes.STRING(100)],
      ['specification_date', DataTypes.DATEONLY],
    ] as const;
    for (const [column, type] of columns) {
      if (!tableInfo[column]) {
        await queryInterface.addColumn(
          'purchase_contracts',
          column,
          { type, allowNull: true },
          { transaction },
        );
      }
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
