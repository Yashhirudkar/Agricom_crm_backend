import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '26';
export const name = 'Add birthdayMetadata to user_preferences';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('user_preferences', 'birthdayMetadata', {
    type: DataTypes.JSONB,
    allowNull: true,
  }).catch(() => {});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('user_preferences', 'birthdayMetadata').catch(() => {});
}
