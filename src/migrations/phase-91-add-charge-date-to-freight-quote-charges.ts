import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '91';
export const name = 'add-charge-date-to-freight-quote-charges';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;
  await sequelize.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'freight_quote_charges' AND column_name = 'charge_date'
      ) THEN
        ALTER TABLE freight_quote_charges ADD COLUMN charge_date DATE;
      END IF;
    END $$;
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;
  await sequelize.query(`
    ALTER TABLE freight_quote_charges DROP COLUMN IF EXISTS charge_date;
  `);
}
