import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '38';
export const name = 'add-direct-freight-quotes';

export async function up(queryInterface: QueryInterface) {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.changeColumn(
      'freight_quotes',
      'logistics_id',
      {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      { transaction }
    );

    await queryInterface.addColumn(
      'freight_quotes',
      'is_direct',
      {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      { transaction }
    );

    await queryInterface.addColumn(
      'freight_quotes',
      'product_id',
      {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'products', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      { transaction }
    );

    await queryInterface.addColumn(
      'freight_quotes',
      'loading_point',
      {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      { transaction }
    );

    await queryInterface.addColumn(
      'freight_quotes',
      'destination',
      {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      { transaction }
    );

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function down(queryInterface: QueryInterface) {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.removeColumn('freight_quotes', 'destination', { transaction });
    await queryInterface.removeColumn('freight_quotes', 'loading_point', { transaction });
    await queryInterface.removeColumn('freight_quotes', 'product_id', { transaction });
    await queryInterface.removeColumn('freight_quotes', 'is_direct', { transaction });

    // Note: Reverting logistics_id to allowNull: false might fail if there are direct quotes, 
    // so in a real rollback we'd either delete direct quotes or assign them a dummy logistics_id.
    await queryInterface.changeColumn(
      'freight_quotes',
      'logistics_id',
      {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      { transaction }
    );

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
