import { Sequelize, Transaction } from 'sequelize';

export async function runTaskDisplayOrderMigration(
  sequelize: Sequelize,
  transaction: Transaction,
): Promise<void> {
  console.log('[Migration] Safely adding displayOrder column to tasks...');

  await sequelize.query(
    `
    ALTER TABLE "tasks"
    ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER NOT NULL DEFAULT 0;
  `,
    { transaction },
  );

  console.log('[Migration] tasks.displayOrder column ready.');
}
