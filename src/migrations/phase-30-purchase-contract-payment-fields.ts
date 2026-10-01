import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '30';
export const name = 'purchase-contract-payment-fields';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    const tableInfo = await queryInterface.describeTable('purchase_contracts');

    if (!tableInfo.payment_terms_text) {
      await queryInterface.addColumn('purchase_contracts', 'payment_terms_text', {
        type: DataTypes.TEXT,
        allowNull: true,
      }, { transaction });
    }

    if (!tableInfo.advance_percent) {
      await queryInterface.addColumn('purchase_contracts', 'advance_percent', {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
      }, { transaction });
    }

    if (!tableInfo.balance_percent) {
      await queryInterface.addColumn('purchase_contracts', 'balance_percent', {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
      }, { transaction });
    }

    if (!tableInfo.penalty_percent) {
      await queryInterface.addColumn('purchase_contracts', 'penalty_percent', {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
      }, { transaction });
    }

    if (!tableInfo.payment_due_date) {
      await queryInterface.addColumn('purchase_contracts', 'payment_due_date', {
        type: DataTypes.DATEONLY,
        allowNull: true,
      }, { transaction });
    }

    await transaction.commit();
    console.log('Phase 30 - Purchase Contract Payment Fields Migration Completed.');
  } catch (error) {
    await transaction.rollback();
    console.error('Migration failed:', error);
    throw error;
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    const tableInfo = await queryInterface.describeTable('purchase_contracts');

    if (tableInfo.payment_terms_text) {
      await queryInterface.removeColumn('purchase_contracts', 'payment_terms_text', { transaction });
    }
    if (tableInfo.advance_percent) {
      await queryInterface.removeColumn('purchase_contracts', 'advance_percent', { transaction });
    }
    if (tableInfo.balance_percent) {
      await queryInterface.removeColumn('purchase_contracts', 'balance_percent', { transaction });
    }
    if (tableInfo.penalty_percent) {
      await queryInterface.removeColumn('purchase_contracts', 'penalty_percent', { transaction });
    }
    if (tableInfo.payment_due_date) {
      await queryInterface.removeColumn('purchase_contracts', 'payment_due_date', { transaction });
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
