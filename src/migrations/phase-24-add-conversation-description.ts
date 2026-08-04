import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '24';
export const name = 'Add description to conversations';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('conversations', 'description', {
    type: DataTypes.TEXT,
    allowNull: true,
  }).catch(() => {});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('conversations', 'description').catch(() => {});
}
