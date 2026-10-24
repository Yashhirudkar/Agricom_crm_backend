import { QueryInterface } from 'sequelize';

export const phase = '55';
export const name = 'add-broker-to-enquiries';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.sequelize.query(
      `ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS broker_role_id INTEGER REFERENCES partner_roles(id) ON DELETE SET NULL;`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS broker_id INTEGER REFERENCES partners(id) ON DELETE SET NULL;`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS enquiries_broker_role_id ON enquiries(broker_role_id);`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS enquiries_broker_id ON enquiries(broker_id);`,
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
      `DROP INDEX IF EXISTS enquiries_broker_id;`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS enquiries_broker_role_id;`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE enquiries DROP COLUMN IF EXISTS broker_id;`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE enquiries DROP COLUMN IF EXISTS broker_role_id;`,
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
