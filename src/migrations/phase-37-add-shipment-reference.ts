import { QueryInterface, QueryTypes } from 'sequelize';

export const phase = '37';
export const name = 'Add shipment_reference column and index to sales_contract_shipments with data backfill';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // 1. Add shipment_reference column
  await queryInterface.sequelize.query(`
    ALTER TABLE sales_contract_shipments 
    ADD COLUMN IF NOT EXISTS shipment_reference VARCHAR(100);
  `);

  // 2. Backfill existing records with generated references (Month and Year format)
  const shipments = await queryInterface.sequelize.query<any>(
    `SELECT s.id, s.sales_contract_id, s.shipment_date, s.no_of_containers, s.quantity, c.contract_number 
     FROM sales_contract_shipments s 
     JOIN sales_contracts c ON s.sales_contract_id = c.id 
     ORDER BY s.sales_contract_id, s.shipment_date, s.id`,
    { type: QueryTypes.SELECT }
  );

  const groups: { [key: number]: any[] } = {};
  for (const s of shipments) {
    if (!groups[s.sales_contract_id]) {
      groups[s.sales_contract_id] = [];
    }
    groups[s.sales_contract_id].push(s);
  }

  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  for (const contractId of Object.keys(groups)) {
    const groupShipments = groups[Number(contractId)];
    for (let i = 0; i < groupShipments.length; i++) {
      const s = groupShipments[i];
      const dateObj = new Date(s.shipment_date);
      if (Number.isNaN(dateObj.getTime())) continue;

      const monthStr = months[dateObj.getMonth()] || 'JAN';
      const containerCount = s.no_of_containers !== null && s.no_of_containers !== undefined ? s.no_of_containers : 0;
      const containerStr = `C${containerCount}`;
      const yearStr = String(dateObj.getFullYear()).slice(-2);
      const shipmentNo = i + 1;
      const shipmentReference = `${s.contract_number}/${shipmentNo}/${containerStr}/${monthStr}/${yearStr}`;

      await queryInterface.sequelize.query(
        `UPDATE sales_contract_shipments SET shipment_reference = :shipmentReference WHERE id = :id`,
        {
          replacements: { shipmentReference, id: s.id },
          type: QueryTypes.UPDATE
        }
      );
    }
  }

  // 3. Create index on shipment_reference column for fast future lookups
  await queryInterface.sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_sales_contract_shipments_shipment_ref 
    ON sales_contract_shipments (shipment_reference);
  `);

  console.log('✅ Phase 37 - shipment_reference column, data backfill, & index completed successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    DROP INDEX IF EXISTS idx_sales_contract_shipments_shipment_ref;
    ALTER TABLE sales_contract_shipments 
    DROP COLUMN IF EXISTS shipment_reference;
  `);
  console.log('✅ Phase 37 - shipment_reference column & index reverted');
}
