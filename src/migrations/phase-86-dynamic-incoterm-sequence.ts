import { QueryInterface } from 'sequelize';

export const phase = '86';
export const name = 'dynamic-incoterm-sequence';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    // 1. Add sequence column to shipment_types table
    await queryInterface.sequelize.query(
      `ALTER TABLE shipment_types
       ADD COLUMN IF NOT EXISTS sequence INTEGER NOT NULL DEFAULT 1;`,
      { transaction },
    );

    // 2. Set Incoterm Master sequence numbers as single source of truth
    // EXW = 1
    await queryInterface.sequelize.query(
      `UPDATE shipment_types
       SET sequence = 1, stage_order = 1
       WHERE UPPER(code) = 'EXW' OR UPPER(name) LIKE 'EXW%';`,
      { transaction },
    );

    // FCA = 2
    await queryInterface.sequelize.query(
      `UPDATE shipment_types
       SET sequence = 2, stage_order = 2
       WHERE UPPER(code) = 'FCA' OR UPPER(name) LIKE 'FCA%';`,
      { transaction },
    );

    // FAS = 3
    await queryInterface.sequelize.query(
      `UPDATE shipment_types
       SET sequence = 3, stage_order = 3
       WHERE UPPER(code) = 'FAS' OR UPPER(name) LIKE 'FAS%';`,
      { transaction },
    );

    // FOB = 4
    await queryInterface.sequelize.query(
      `UPDATE shipment_types
       SET sequence = 4, stage_order = 4
       WHERE UPPER(code) = 'FOB' OR UPPER(name) LIKE 'FOB%';`,
      { transaction },
    );

    // CFR (CNF) = 5
    await queryInterface.sequelize.query(
      `UPDATE shipment_types
       SET sequence = 5, stage_order = 5
       WHERE UPPER(code) IN ('CFR', 'CNF') OR UPPER(name) LIKE 'CFR%' OR UPPER(name) LIKE 'CNF%';`,
      { transaction },
    );

    // CIF = 6
    await queryInterface.sequelize.query(
      `UPDATE shipment_types
       SET sequence = 6, stage_order = 6
       WHERE UPPER(code) = 'CIF' OR UPPER(name) LIKE 'CIF%';`,
      { transaction },
    );

    // CPT = 7
    await queryInterface.sequelize.query(
      `UPDATE shipment_types
       SET sequence = 7, stage_order = 7
       WHERE UPPER(code) = 'CPT' OR UPPER(name) LIKE 'CPT%';`,
      { transaction },
    );

    // CIP = 8
    await queryInterface.sequelize.query(
      `UPDATE shipment_types
       SET sequence = 8, stage_order = 8
       WHERE UPPER(code) = 'CIP' OR UPPER(name) LIKE 'CIP%';`,
      { transaction },
    );

    // DAP = 9
    await queryInterface.sequelize.query(
      `UPDATE shipment_types
       SET sequence = 9, stage_order = 9
       WHERE UPPER(code) = 'DAP' OR UPPER(name) LIKE 'DAP%';`,
      { transaction },
    );

    // DPU = 10 (and DAT = 10)
    await queryInterface.sequelize.query(
      `UPDATE shipment_types
       SET sequence = 10, stage_order = 10
       WHERE UPPER(code) IN ('DPU', 'DAT') OR UPPER(name) LIKE 'DPU%' OR UPPER(name) LIKE 'DAT%';`,
      { transaction },
    );

    // DDP = 11
    await queryInterface.sequelize.query(
      `UPDATE shipment_types
       SET sequence = 11, stage_order = 11
       WHERE UPPER(code) = 'DDP' OR UPPER(name) LIKE 'DDP%';`,
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
       DROP COLUMN IF EXISTS sequence;`,
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

