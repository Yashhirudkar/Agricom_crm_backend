import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '28';
export const name = 'Add posting policy columns to conversations';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // 1. Add postingPolicy ENUM column (default EVERYONE = backward compatible)
  await queryInterface
    .addColumn('conversations', 'postingPolicy', {
      type: DataTypes.ENUM('EVERYONE', 'ADMINS', 'OWNER', 'SELECTED_ROLES', 'SELECTED_USERS'),
      allowNull: false,
      defaultValue: 'EVERYONE',
    })
    .catch(() => {});

  // 2. Add allowedPosters JSONB column (array of userId numbers)
  await queryInterface
    .addColumn('conversations', 'allowedPosters', {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    })
    .catch(() => {});

  // 3. Add allowedRoles JSONB column (array of role name strings)
  await queryInterface
    .addColumn('conversations', 'allowedRoles', {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    })
    .catch(() => {});
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('conversations', 'postingPolicy').catch(() => {});
  await queryInterface.removeColumn('conversations', 'allowedPosters').catch(() => {});
  await queryInterface.removeColumn('conversations', 'allowedRoles').catch(() => {});

  // Drop ENUM type (PostgreSQL specific)
  await queryInterface.sequelize
    .query('DROP TYPE IF EXISTS "enum_conversations_postingPolicy";')
    .catch(() => {});
}
