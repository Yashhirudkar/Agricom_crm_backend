import { QueryInterface } from 'sequelize';

export const phase = '87';
export const name = 'freight-required-default-no';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(
    `ALTER TABLE sales_contract_shipments
     ALTER COLUMN freight_required SET DEFAULT FALSE;`,
  );
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(
    `ALTER TABLE sales_contract_shipments
     ALTER COLUMN freight_required SET DEFAULT TRUE;`,
  );
}