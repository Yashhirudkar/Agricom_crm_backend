import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '32';
export const name = 'Role Partner Role Access — junction table linking RBAC roles to allowed partner roles';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ─── role_partner_role_access ─────────────────────────────────────────────────
  await queryInterface.createTable(
    'role_partner_role_access',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'roles', key: 'id' },
        onDelete: 'CASCADE',
      },
      partner_role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'partner_roles', key: 'id' },
        onDelete: 'CASCADE',
      },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { ifNotExists: true } as any,
  );

  // Indexes
  await queryInterface
    .addIndex('role_partner_role_access', ['role_id'], {
      name: 'role_partner_role_access_role_id',
    })
    .catch(() => {});

  await queryInterface
    .addIndex('role_partner_role_access', ['partner_role_id'], {
      name: 'role_partner_role_access_partner_role_id',
    })
    .catch(() => {});

  // Unique constraint: a partner role can only be assigned once per RBAC role
  await queryInterface
    .addIndex('role_partner_role_access', ['role_id', 'partner_role_id'], {
      name: 'role_partner_role_access_unique',
      unique: true,
    })
    .catch(() => {});

  console.log('✅ Phase 32 - role_partner_role_access table created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('role_partner_role_access').catch(() => {});
  console.log('✅ Phase 32 - role_partner_role_access table dropped');
}
