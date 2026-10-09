import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '37';
export const name = 'add-freight-container-rates';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    // 1. Create freight_quote_container_rates table
    await queryInterface.createTable(
      'freight_quote_container_rates',
      {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        quote_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'freight_quotes', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        container_type: {
          type: DataTypes.STRING(50),
          allowNull: false,
        },
        container_size: {
          type: DataTypes.STRING(50),
          allowNull: false,
        },
        freight_amount: {
          type: DataTypes.DECIMAL(15, 4),
          allowNull: false,
          defaultValue: 0,
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        deleted_at: {
          type: DataTypes.DATE,
          allowNull: true,
        },
      },
      { transaction },
    );

    // 2. Add container_rate_id to freight_quote_charges
    await queryInterface.addColumn(
      'freight_quote_charges',
      'container_rate_id',
      {
        type: DataTypes.INTEGER,
        allowNull: true, // true for backward compatibility
        references: { model: 'freight_quote_container_rates', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      { transaction },
    );

    // 3. Optional: Make freight_quotes container/freight fields nullable since they are moving
    // We will just leave them as they are for backward compatibility,
    // but future entries might have them null if we change the model.
    // However, the model has AllowNull(true) for container_type and container_size already.
    // freight_amount is AllowNull(false), we can keep it as 0 for multi-rate quotes.

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.removeColumn(
      'freight_quote_charges',
      'container_rate_id',
      { transaction },
    );
    await queryInterface.dropTable('freight_quote_container_rates', {
      transaction,
    });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
