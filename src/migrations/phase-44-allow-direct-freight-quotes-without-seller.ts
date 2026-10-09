import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '44';
export const name = 'allow-direct-freight-quotes-without-seller';

export async function up(queryInterface: QueryInterface) {
  await queryInterface.changeColumn('freight_quotes', 'seller_id', {
    type: DataTypes.INTEGER,
    allowNull: true,
  });
}

export async function down(queryInterface: QueryInterface) {
  await queryInterface.changeColumn('freight_quotes', 'seller_id', {
    type: DataTypes.INTEGER,
    allowNull: false,
  });
}
