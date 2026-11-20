import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '92';
export const name = 'add-payment-term-id-to-freight-quotes';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;
  await sequelize.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'freight_quotes' AND column_name = 'payment_term_id'
      ) THEN
        ALTER TABLE freight_quotes 
        ADD COLUMN payment_term_id INTEGER REFERENCES payment_terms(id) ON DELETE SET NULL;
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_freight_quotes_payment_term_id 
    ON freight_quotes(payment_term_id);

    -- Backfill payment_term_id from existing payment_terms string if matching
    UPDATE freight_quotes fq
    SET payment_term_id = pt.id
    FROM payment_terms pt
    WHERE fq.payment_term_id IS NULL 
      AND fq.payment_terms IS NOT NULL 
      AND LOWER(TRIM(fq.payment_terms)) = LOWER(TRIM(pt.name));
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;
  await sequelize.query(`
    DROP INDEX IF EXISTS idx_freight_quotes_payment_term_id;
    ALTER TABLE freight_quotes DROP COLUMN IF EXISTS payment_term_id;
  `);
}
