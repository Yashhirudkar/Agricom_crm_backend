import { QueryInterface } from 'sequelize';

export const phase = '83';
export const name = 'dynamic-freight-rule-engine';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    // 1. Add metadata columns to shipment_types table
    await queryInterface.sequelize.query(
      `ALTER TABLE shipment_types
       ADD COLUMN IF NOT EXISTS stage_order INTEGER NOT NULL DEFAULT 1,
       ADD COLUMN IF NOT EXISTS location_type VARCHAR(50) NOT NULL DEFAULT 'Port of Loading (POL)',
       ADD COLUMN IF NOT EXISTS freight_required_after_stage BOOLEAN NOT NULL DEFAULT false;`,
      { transaction },
    );

    // 2. Seed / update standard metadata for existing shipment types based on specifications
    // Stage 1: Pickup Location
    await queryInterface.sequelize.query(
      `UPDATE shipment_types
       SET stage_order = 1,
           location_type = 'Pickup Location',
           freight_required_after_stage = false
       WHERE UPPER(code) IN ('FCA', 'EXW');`,
      { transaction },
    );

    // Stage 2: Port of Loading (POL)
    await queryInterface.sequelize.query(
      `UPDATE shipment_types
       SET stage_order = 2,
           location_type = 'Port of Loading (POL)',
           freight_required_after_stage = false
       WHERE UPPER(code) IN ('FOB', 'FAS');`,
      { transaction },
    );

    // Stage 3: Port of Destination (POD)
    await queryInterface.sequelize.query(
      `UPDATE shipment_types
       SET stage_order = 3,
           location_type = 'Port of Destination (POD)',
           freight_required_after_stage = true
       WHERE UPPER(code) IN ('CNF', 'CFR', 'CIF');`,
      { transaction },
    );

    // Stage 4: Final Destination (DAP, CPT, CIP)
    await queryInterface.sequelize.query(
      `UPDATE shipment_types
       SET stage_order = 4,
           location_type = 'Final Destination',
           freight_required_after_stage = true
       WHERE UPPER(code) IN ('DAP', 'CPT', 'CIP', 'DAT', 'DPU');`,
      { transaction },
    );

    // Stage 5: Final Destination (DDP)
    await queryInterface.sequelize.query(
      `UPDATE shipment_types
       SET stage_order = 5,
           location_type = 'Final Destination',
           freight_required_after_stage = true
       WHERE UPPER(code) IN ('DDP');`,
      { transaction },
    );

    // 3. Add freight tracking fields to sales_contract_shipments
    await queryInterface.sequelize.query(
      `ALTER TABLE sales_contract_shipments
       ADD COLUMN IF NOT EXISTS freight_required BOOLEAN DEFAULT TRUE,
       ADD COLUMN IF NOT EXISTS freight_currency VARCHAR(10) DEFAULT NULL,
       ADD COLUMN IF NOT EXISTS freight_description VARCHAR(500) DEFAULT NULL;`,
      { transaction },
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.sequelize.query(
      `ALTER TABLE shipment_types
       DROP COLUMN IF EXISTS stage_order,
       DROP COLUMN IF EXISTS location_type,
       DROP COLUMN IF EXISTS freight_required_after_stage;`,
      { transaction },
    );

    await queryInterface.sequelize.query(
      `ALTER TABLE sales_contract_shipments
       DROP COLUMN IF EXISTS freight_required,
       DROP COLUMN IF EXISTS freight_currency,
       DROP COLUMN IF EXISTS freight_description;`,
      { transaction },
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

