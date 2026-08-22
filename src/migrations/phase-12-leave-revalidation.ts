import { QueryInterface } from 'sequelize';

export const phase = '12';
export const name = 'Leave Revalidation Audit Enum';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;

  // Add 'RECALCULATED' to enum_leave_approval_logs_action if not already present
  await sequelize.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_leave_approval_logs_action') THEN
        ALTER TYPE "enum_leave_approval_logs_action" ADD VALUE IF NOT EXISTS 'RECALCULATED';
      END IF;
    END
    $$;
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // PostgreSQL does not support easily removing values from enum types in down migration
}
