import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '27';
export const name = 'Add avatarUrl to conversations';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('conversations', 'avatarUrl', {
    type: DataTypes.TEXT,
    allowNull: true,
  }).catch(() => {});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('conversations', 'avatarUrl').catch(() => {});
}
