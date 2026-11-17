import { QueryInterface } from 'sequelize';

export const phase = '80';
export const name = 'make-product-category-and-country-optional';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(
    `ALTER TABLE products
     ALTER COLUMN category_id DROP NOT NULL,
     ALTER COLUMN country DROP NOT NULL`,
  );
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(
    `ALTER TABLE products
     ALTER COLUMN category_id SET NOT NULL,
     ALTER COLUMN country SET NOT NULL`,
  );
}
