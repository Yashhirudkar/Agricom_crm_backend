import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '41';
export const name = 'add-freight-routes-and-rates';

export async function up(queryInterface: QueryInterface) {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.createTable('freight_routes', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      quote_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'freight_quotes',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      origin: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      destination: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    }, { transaction });

    await queryInterface.createTable('freight_rates', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      route_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'freight_routes',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      partner_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'partners',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      equipment: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      transit_days: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'INR',
      },
      amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
      },
      valid_till: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'Active',
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    }, { transaction });

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function down(queryInterface: QueryInterface) {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.dropTable('freight_rates', { transaction });
    await queryInterface.dropTable('freight_routes', { transaction });
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
