import { QueryInterface } from 'sequelize';

export const phase = '54';
export const name = 'Preserve shipment execution status';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query('SELECT 1');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query('SELECT 1');
}
