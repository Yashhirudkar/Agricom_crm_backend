import { QueryInterface } from 'sequelize';

export const phase = '36';
export const name = 'Add year_of_establishment to partners & create partner_dnb_reports table with unique is_latest partial index';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // 1. Add year_of_establishment to partners table
  await queryInterface.sequelize.query(`
    ALTER TABLE partners 
    ADD COLUMN IF NOT EXISTS year_of_establishment INT;
  `);

  // 2. Create partner_dnb_reports table
  await queryInterface.sequelize.query(`
    CREATE TABLE IF NOT EXISTS partner_dnb_reports (
      id SERIAL PRIMARY KEY,
      partner_id INT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      report_date DATE NOT NULL,
      report_file VARCHAR(500) NOT NULL,
      original_file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      file_size INT NOT NULL,
      risk_factor VARCHAR(20) NOT NULL,
      credit_limit NUMERIC(15, 2) NOT NULL,
      failure_score VARCHAR(50) NOT NULL,
      paydex INT NOT NULL,
      dnb_rating VARCHAR(50) NOT NULL,
      source VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
      is_latest BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 3. Create unique partial index to enforce exactly one is_latest = true per partner
  await queryInterface.sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS partner_dnb_reports_single_latest 
    ON partner_dnb_reports (partner_id) 
    WHERE is_latest = true;
  `);

  console.log('✅ Phase 36 - partner_dnb_reports table & partner year_of_establishment created successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    DROP INDEX IF EXISTS partner_dnb_reports_single_latest;
    DROP TABLE IF EXISTS partner_dnb_reports;
    ALTER TABLE partners DROP COLUMN IF EXISTS year_of_establishment;
  `);
  console.log('✅ Phase 36 - partner_dnb_reports table reverted');
}
