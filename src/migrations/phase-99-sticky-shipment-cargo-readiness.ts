import { QueryInterface } from 'sequelize';

export const phase = '99';
export const name = 'preserve confirmed shipment cargo readiness';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    ALTER TABLE sales_contract_shipments
    ADD COLUMN IF NOT EXISTS cargo_ready_confirmed BOOLEAN;

    UPDATE sales_contract_shipments s
    SET cargo_ready_confirmed = TRUE
    WHERE s.cargo_ready_confirmed IS NULL
      AND (EXISTS (
      SELECT 1
      FROM cargo_shipment_allocations csa
      WHERE csa.shipment_id = s.id
        AND csa.status = 'Active'
        AND csa.allocated_qty > 0
    ) OR EXISTS (
      SELECT 1
      FROM cargo_loading cl
      WHERE cl.shipment_id = s.id
        AND cl.status <> 'Cancelled'
        AND cl.loaded_qty > 0
    ));
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    ALTER TABLE sales_contract_shipments
    DROP COLUMN IF EXISTS cargo_ready_confirmed;
  `);
}
