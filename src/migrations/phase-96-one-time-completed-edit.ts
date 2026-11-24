import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '96';
export const name = 'one-time-completed-edit';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const seq = queryInterface.sequelize;
  const transaction = await seq.transaction();

  try {
    const tables = ['cargo_availability', 'freight_quotes', 'shipment_stuffings'];

    for (const table of tables) {
      // Check if table exists
      const [tableExists]: any = await seq.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = :table;`,
        { replacements: { table }, transaction },
      );

      if (tableExists && tableExists.length > 0) {
        // Add one_time_completed_edit_used
        await seq.query(
          `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "one_time_completed_edit_used" BOOLEAN NOT NULL DEFAULT FALSE;`,
          { transaction },
        );
        // Add one_time_completed_edit_by
        await seq.query(
          `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "one_time_completed_edit_by" INTEGER NULL;`,
          { transaction },
        );
        // Add one_time_completed_edit_at
        await seq.query(
          `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "one_time_completed_edit_at" TIMESTAMP WITH TIME ZONE NULL;`,
          { transaction },
        );
      }
    }

    // Also update existing cargo_availability records whose allocated_qty >= purchase_qty to Completed status
    await seq.query(
      `UPDATE cargo_availability ca
       SET status = 'Completed'
       WHERE ca.purchase_qty > 0 
         AND ca.id IN (
           SELECT csa.cargo_availability_id
           FROM cargo_shipment_allocations csa
           WHERE csa.status = 'Active'
           GROUP BY csa.cargo_availability_id
           HAVING SUM(csa.allocated_qty) >= ca.purchase_qty
         );`,
      { transaction },
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const seq = queryInterface.sequelize;
  const transaction = await seq.transaction();

  try {
    const tables = ['cargo_availability', 'freight_quotes', 'shipment_stuffings'];
    for (const table of tables) {
      await seq.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "one_time_completed_edit_used";`,
        { transaction },
      );
      await seq.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "one_time_completed_edit_by";`,
        { transaction },
      );
      await seq.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "one_time_completed_edit_at";`,
        { transaction },
      );
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
