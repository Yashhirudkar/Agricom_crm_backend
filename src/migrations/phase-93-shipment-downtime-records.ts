import { QueryInterface } from 'sequelize';

export const phase = '93';
export const name = 'add shipment downtime records';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    ALTER TABLE shipment_stuffings
    ADD COLUMN IF NOT EXISTS downtime_records JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    ALTER TABLE shipment_stuffings
    DROP COLUMN IF EXISTS downtime_records;
  `);
}
