import { QueryInterface } from 'sequelize';

export const phase = '74';
export const name = 'Create exchange_rates table';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    CREATE TABLE IF NOT EXISTS exchange_rates (
      id SERIAL PRIMARY KEY,
      base_currency VARCHAR(3) NOT NULL,
      target_currency VARCHAR(3) NOT NULL,
      exchange_rate NUMERIC(20, 10) NOT NULL CHECK (exchange_rate > 0),
      effective_date DATE NOT NULL,
      source VARCHAR(100) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_exchange_rates_pair_date
        UNIQUE (base_currency, target_currency, effective_date)
    );
  `);

}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query('DROP TABLE IF EXISTS exchange_rates;');
}
