import { QueryInterface } from 'sequelize';

export const phase = '33';
export const name = 'Add Logistics Fields to Enquiries (shipment_mode, origin_port, destination_port, origin_state, origin_city, destination_country, destination_state, destination_city, bid_currency)';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Add columns to enquiries table using idempotent ALTER TABLE syntax
  await queryInterface.sequelize.query(`
    ALTER TABLE enquiries 
    ADD COLUMN IF NOT EXISTS shipment_mode VARCHAR(50),
    ADD COLUMN IF NOT EXISTS origin_port VARCHAR(100),
    ADD COLUMN IF NOT EXISTS destination_port VARCHAR(100),
    ADD COLUMN IF NOT EXISTS origin_state VARCHAR(100),
    ADD COLUMN IF NOT EXISTS origin_city VARCHAR(100),
    ADD COLUMN IF NOT EXISTS destination_country VARCHAR(100),
    ADD COLUMN IF NOT EXISTS destination_state VARCHAR(100),
    ADD COLUMN IF NOT EXISTS destination_city VARCHAR(100),
    ADD COLUMN IF NOT EXISTS bid_currency VARCHAR(10);
  `);

  // Copy values from pod_port to destination_port if destination_port is null
  await queryInterface.sequelize.query(`
    UPDATE enquiries 
    SET destination_port = pod_port 
    WHERE destination_port IS NULL AND pod_port IS NOT NULL;
  `);

  console.log('✅ Phase 33 - enquiries table altered successfully with logistics fields');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Drop columns if exists
  await queryInterface.sequelize.query(`
    ALTER TABLE enquiries 
    DROP COLUMN IF EXISTS shipment_mode,
    DROP COLUMN IF EXISTS origin_port,
    DROP COLUMN IF EXISTS destination_port,
    DROP COLUMN IF EXISTS origin_state,
    DROP COLUMN IF EXISTS origin_city,
    DROP COLUMN IF EXISTS destination_country,
    DROP COLUMN IF EXISTS destination_state,
    DROP COLUMN IF EXISTS destination_city,
    DROP COLUMN IF EXISTS bid_currency;
  `);

  console.log('✅ Phase 33 - enquiries logistics fields dropped');
}
