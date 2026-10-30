import { QueryInterface } from 'sequelize';

export const phase = '61';
export const name = 'shipment-based-freight-quotes';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;
  const transaction = await sequelize.transaction();
  try {
    // 1. Add shipment_id and purchase_contract_id columns to freight_quotes
    await sequelize.query(
      `
      ALTER TABLE freight_quotes
      ADD COLUMN IF NOT EXISTS shipment_id INTEGER REFERENCES sales_contract_shipments(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS purchase_contract_id INTEGER REFERENCES purchase_contracts(id) ON DELETE SET NULL;
    `,
      { transaction },
    );

    // 2. Add indexes for fast lookup and relational integrity
    await sequelize.query(
      `
      CREATE INDEX IF NOT EXISTS idx_freight_quotes_shipment_id ON freight_quotes(shipment_id);
      CREATE INDEX IF NOT EXISTS idx_freight_quotes_purchase_contract_id ON freight_quotes(purchase_contract_id);
    `,
      { transaction },
    );

    // 3. Backfill purchase_contract_id from logistics if available
    await sequelize.query(
      `
      UPDATE freight_quotes fq
      SET purchase_contract_id = l.purchase_contract_id
      FROM logistics l
      WHERE fq.logistics_id = l.id
        AND fq.purchase_contract_id IS NULL
        AND l.purchase_contract_id IS NOT NULL;
    `,
      { transaction },
    );

    // 4. Backfill shipment_id where unambiguous (e.g. 1 shipment linked to purchase contract or logistics)
    await sequelize.query(
      `
      UPDATE freight_quotes fq
      SET shipment_id = pcs.shipment_id
      FROM purchase_contract_shipments pcs
      WHERE fq.shipment_id IS NULL
        AND fq.purchase_contract_id IS NOT NULL
        AND fq.purchase_contract_id = pcs.purchase_contract_id
        AND (
          SELECT COUNT(*) 
          FROM purchase_contract_shipments pcs2 
          WHERE pcs2.purchase_contract_id = fq.purchase_contract_id
        ) = 1;
    `,
      { transaction },
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;
  const transaction = await sequelize.transaction();
  try {
    await sequelize.query(
      `
      DROP INDEX IF EXISTS idx_freight_quotes_purchase_contract_id;
      DROP INDEX IF EXISTS idx_freight_quotes_shipment_id;
      ALTER TABLE freight_quotes
      DROP COLUMN IF EXISTS shipment_id,
      DROP COLUMN IF EXISTS purchase_contract_id;
    `,
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

