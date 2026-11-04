import { QueryInterface } from 'sequelize';

export const phase = '67';
export const name = 'cancel-approved-leave';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.sequelize.query(
      `
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_leave_requests_status') THEN
          ALTER TYPE "enum_leave_requests_status" ADD VALUE IF NOT EXISTS 'CANCELLED_AFTER_APPROVAL';
        END IF;
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_leave_approval_logs_action') THEN
          ALTER TYPE "enum_leave_approval_logs_action" ADD VALUE IF NOT EXISTS 'CANCELLED_AFTER_APPROVAL';
        END IF;
      END
      $$;
      `,
      { transaction },
    );

    await queryInterface.sequelize.query(
      `
      ALTER TABLE leave_requests
        ADD COLUMN IF NOT EXISTS "cancelledAfterApproval" BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS "cancelledById" INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT,
        ADD COLUMN IF NOT EXISTS "previousStatus" VARCHAR(50);
      `,
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
    await queryInterface.sequelize.query(
      `
      ALTER TABLE leave_requests
        DROP COLUMN IF EXISTS "cancelledAfterApproval",
        DROP COLUMN IF EXISTS "cancelledById",
        DROP COLUMN IF EXISTS "cancelledAt",
        DROP COLUMN IF EXISTS "cancellationReason",
        DROP COLUMN IF EXISTS "previousStatus";
      `,
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
