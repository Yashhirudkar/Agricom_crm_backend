import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '45';
export const name = 'make-validity-date-nullable';

export async function up(queryInterface: QueryInterface) {
  await queryInterface.changeColumn('freight_quotes', 'validity_date', {
    type: DataTypes.DATEONLY,
    allowNull: true,
  });
}

export async function down(queryInterface: QueryInterface) {
  await queryInterface.changeColumn('freight_quotes', 'validity_date', {
    type: DataTypes.DATEONLY,
    allowNull: false,
  });
}
