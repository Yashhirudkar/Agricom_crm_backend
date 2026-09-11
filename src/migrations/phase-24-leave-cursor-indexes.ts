import { QueryInterface } from 'sequelize';

export const phase = '24';
export const name = 'Leave Requests — Cursor Pagination Partial Indexes';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;

  /**
   * IMPORTANT: This project uses camelCase column names (companyId, createdAt, status).
   * CONCURRENTLY cannot be used inside a transaction — use plain CREATE INDEX IF NOT EXISTS.
   *
   * PENDING tab:
   *   WHERE "companyId" = ? AND status = 'PENDING'
   *   ORDER BY "createdAt" DESC, id DESC
   */
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_lr_company_pending_cursor
    ON leave_requests ("companyId", "createdAt" DESC, id DESC)
    WHERE status = 'PENDING';
  `);

  /**
   * HISTORY tab:
   *   WHERE "companyId" = ? AND status IN ('APPROVED','REJECTED','CANCELLED')
   *   ORDER BY "createdAt" DESC, id DESC
   *
   * Partial WHERE status <> 'PENDING' covers all history statuses.
   */
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_lr_company_history_cursor
    ON leave_requests ("companyId", "createdAt" DESC, id DESC)
    WHERE status <> 'PENDING';
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;

  await sequelize.query(
    `DROP INDEX IF EXISTS idx_lr_company_pending_cursor;`,
  );
  await sequelize.query(
    `DROP INDEX IF EXISTS idx_lr_company_history_cursor;`,
  );
}
