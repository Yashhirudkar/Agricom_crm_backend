import { QueryInterface } from 'sequelize';

export const phase = '88';
export const name = 'remove-freight-after-stage';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(
    `ALTER TABLE shipment_types
     DROP COLUMN IF EXISTS freight_required_after_stage;`,
  );
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(
    `ALTER TABLE shipment_types
     ADD COLUMN IF NOT EXISTS freight_required_after_stage BOOLEAN NOT NULL DEFAULT FALSE;`,
  );
}