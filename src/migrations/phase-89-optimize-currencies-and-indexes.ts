import { QueryInterface } from 'sequelize';

export const phase = '89';
export const name = 'optimize-currencies-and-indexes';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;

  // 1. Drop all duplicate unique constraints matching currencies_code_key%
  await sequelize.query(`
    DO $$
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'currencies'::regclass 
          AND conname LIKE 'currencies_code_key%'
      ) LOOP
        EXECUTE 'ALTER TABLE currencies DROP CONSTRAINT IF EXISTS "' || r.conname || '"';
      END LOOP;
    END $$;
  `);

  // 2. Ensure a clean unique constraint on code exists
  await sequelize.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'currencies'::regclass AND conname = 'currencies_code_unique'
      ) THEN
        ALTER TABLE currencies ADD CONSTRAINT currencies_code_unique UNIQUE (code);
      END IF;
    END $$;
  `);

  // 3. Create composite index on (status, code) for fast status filtering and code sorting
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_currencies_status_code ON currencies (status, code);
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;
  await sequelize.query(`DROP INDEX IF EXISTS idx_currencies_status_code;`);
}

