import { QueryInterface } from 'sequelize';

export const phase = '73';
export const name = 'Create monthly_targets table';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS monthly_targets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      target_mt NUMERIC(12, 2) NOT NULL,
      is_locked BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_monthly_targets_user_month_year UNIQUE (user_id, month, year)
    );
  `);

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_monthly_targets_user_year_month 
    ON monthly_targets (user_id, year, month);
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;
  await sequelize.query(`
    DROP TABLE IF EXISTS monthly_targets;
  `);
}

