import { DataTypes, QueryInterface } from 'sequelize';

export const phase = '53';
export const name = 'Add manual ready override fields to sales_contract_shipments';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const table = 'sales_contract_shipments';

  await queryInterface
    .addColumn(table, 'manual_ready_override', {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: null,
    })
    .catch(() => {});

  await queryInterface
    .addColumn(table, 'manual_ready_by', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    })
    .catch(() => {});

  await queryInterface
    .addColumn(table, 'manual_ready_at', {
      type: DataTypes.DATE,
      allowNull: true,
    })
    .catch(() => {});

  await queryInterface
    .addColumn(table, 'manual_ready_reason', {
      type: DataTypes.TEXT,
      allowNull: true,
    })
    .catch(() => {});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const table = 'sales_contract_shipments';
  await queryInterface.removeColumn(table, 'manual_ready_override').catch(() => {});
  await queryInterface.removeColumn(table, 'manual_ready_by').catch(() => {});
  await queryInterface.removeColumn(table, 'manual_ready_at').catch(() => {});
  await queryInterface.removeColumn(table, 'manual_ready_reason').catch(() => {});
}
