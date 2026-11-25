import { QueryInterface } from 'sequelize';

export const phase = '100';
export const name = 'store cargo readiness status and date per shipment';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    ALTER TABLE sales_contract_shipments
      ADD COLUMN IF NOT EXISTS cargo_ready_status VARCHAR(50),
      ADD COLUMN IF NOT EXISTS cargo_ready_date DATE;

    WITH matching_readiness AS (
      SELECT
        s.id AS shipment_id,
        cr.status AS readiness_status,
        cr.ready_date,
        ROW_NUMBER() OVER (
          PARTITION BY s.id
          ORDER BY cr.updated_at DESC, cr.id DESC, ca.id DESC
        ) AS row_number
      FROM sales_contract_shipments s
      LEFT JOIN sales_contracts sc ON sc.id = s.sales_contract_id
      JOIN LATERAL (
        SELECT pc.id
        FROM purchase_contracts pc
        LEFT JOIN purchase_contract_shipments pcs
          ON pcs.purchase_contract_id = pc.id
        WHERE (
          pcs.shipment_id = s.id
          OR pc.sales_contract_id = s.sales_contract_id
          OR pc.business_transaction_id = COALESCE(
            s.business_transaction_id,
            sc.business_transaction_id
          )
        )
          AND EXISTS (
            SELECT 1
            FROM cargo_availability ca
            JOIN cargo_readiness cr
              ON cr.cargo_availability_id = ca.id
            WHERE ca.purchase_contract_id = pc.id
              AND cr.status IN ('Ready', 'Approved', 'Not Ready')
          )
        ORDER BY
          CASE
            WHEN pcs.shipment_id = s.id THEN 0
            WHEN pc.sales_contract_id = s.sales_contract_id THEN 1
            ELSE 2
          END,
          pc.updated_at DESC,
          pc.id DESC
        LIMIT 1
      ) pc ON TRUE
      JOIN cargo_availability ca ON ca.purchase_contract_id = pc.id
      JOIN cargo_readiness cr ON cr.cargo_availability_id = ca.id
      WHERE cr.status IN ('Ready', 'Approved', 'Not Ready')
    )
    UPDATE sales_contract_shipments s
    SET
      cargo_ready_confirmed = matching_readiness.readiness_status IN ('Ready', 'Approved'),
      cargo_ready_status = CASE
        WHEN matching_readiness.readiness_status IN ('Ready', 'Approved') THEN 'Ready'
        ELSE 'Not Ready'
      END,
      cargo_ready_date = CASE
        WHEN matching_readiness.readiness_status IN ('Ready', 'Approved')
          THEN matching_readiness.ready_date
        ELSE NULL
      END
    FROM matching_readiness
    WHERE matching_readiness.shipment_id = s.id
      AND matching_readiness.row_number = 1;

    UPDATE sales_contract_shipments
    SET cargo_ready_status = 'Ready'
    WHERE cargo_ready_confirmed = TRUE
      AND cargo_ready_status IS NULL;
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    ALTER TABLE sales_contract_shipments
      DROP COLUMN IF EXISTS cargo_ready_date,
      DROP COLUMN IF EXISTS cargo_ready_status;
  `);
}
