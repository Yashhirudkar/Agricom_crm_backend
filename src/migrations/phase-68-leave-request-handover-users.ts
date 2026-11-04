import { QueryInterface } from 'sequelize';

export const phase = '68';
export const name = 'leave-request-handover-users';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.sequelize.query(
      `
      CREATE TABLE IF NOT EXISTS leave_request_handover_users (
        id SERIAL PRIMARY KEY,
        "leaveRequestId" INTEGER NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
        "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "assignedBy" INTEGER REFERENCES users(id) ON DELETE SET NULL,
        "assignedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT uq_leave_request_handover_user UNIQUE ("leaveRequestId", "userId")
      );

      CREATE INDEX IF NOT EXISTS idx_lr_handover_leave_request_id ON leave_request_handover_users ("leaveRequestId");
      CREATE INDEX IF NOT EXISTS idx_lr_handover_user_id ON leave_request_handover_users ("userId");
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
      DROP TABLE IF EXISTS leave_request_handover_users CASCADE;
      `,
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
