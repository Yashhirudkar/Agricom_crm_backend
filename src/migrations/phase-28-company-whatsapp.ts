import { MigrationPhase } from './index';

export const phase = '28';
export const name = 'company-whatsapp';

export const up = async (queryInterface: any) => {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.addColumn(
      'companies',
      'whatsappEnabled',
      {
        type: queryInterface.sequelize.Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      { transaction },
    );

    await queryInterface.addColumn(
      'companies',
      'whatsappGroupId',
      {
        type: queryInterface.sequelize.Sequelize.STRING(255),
        allowNull: true,
      },
      { transaction },
    );

    await queryInterface.addColumn(
      'companies',
      'whatsappGroupName',
      {
        type: queryInterface.sequelize.Sequelize.STRING(255),
        allowNull: true,
      },
      { transaction },
    );

    await queryInterface.addColumn(
      'companies',
      'whatsappConnectedAt',
      {
        type: queryInterface.sequelize.Sequelize.DATE,
        allowNull: true,
      },
      { transaction },
    );

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

export const down = async (queryInterface: any) => {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.removeColumn('companies', 'whatsappEnabled', {
      transaction,
    });
    await queryInterface.removeColumn('companies', 'whatsappGroupId', {
      transaction,
    });
    await queryInterface.removeColumn('companies', 'whatsappGroupName', {
      transaction,
    });
    await queryInterface.removeColumn('companies', 'whatsappConnectedAt', {
      transaction,
    });

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};
