import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '23';
export const name = 'Add deletedAt to message_read_states';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('message_read_states', 'deletedAt', {
    type: DataTypes.DATE,
    allowNull: true,
  }).catch(() => {});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('message_read_states', 'deletedAt').catch(() => {});
}
