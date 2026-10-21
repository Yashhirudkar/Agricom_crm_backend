import { QueryInterface } from 'sequelize';

export const phase = '54';
export const name = 'Sync executed shipment status in database';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    UPDATE sales_contract_shipments
    SET status = 'Executed'
    WHERE (
      id IN (SELECT shipment_id FROM purchase_contract_shipments)
      OR shipment_reference ILIKE '%00125/2%'
    )
    AND status != 'Executed';
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Reversible down step
}
