import { QueryInterface } from 'sequelize';

export const phase = '76';
export const name = 'increase shipment stuffing weight precision to three decimals';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.sequelize.query(
      `ALTER TABLE shipment_stuffings
         ALTER COLUMN gross_weight TYPE DECIMAL(12, 3)
           USING gross_weight::DECIMAL(12, 3),
         ALTER COLUMN net_weight TYPE DECIMAL(12, 3)
           USING net_weight::DECIMAL(12, 3)`,
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
      `ALTER TABLE shipment_stuffings
         ALTER COLUMN gross_weight TYPE DECIMAL(12, 2)
           USING gross_weight::DECIMAL(12, 2),
         ALTER COLUMN net_weight TYPE DECIMAL(12, 2)
           USING net_weight::DECIMAL(12, 2)`,
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
