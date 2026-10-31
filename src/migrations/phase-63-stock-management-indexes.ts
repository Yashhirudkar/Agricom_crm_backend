import { QueryInterface } from 'sequelize';

export const phase = '63';
export const name = 'stock-management-indexes';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_pc_loading_country ON purchase_contracts(loading_country);`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_pc_contract_number ON purchase_contracts(contract_number);`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_pc_status ON purchase_contracts(status);`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_pci_product_id ON purchase_contract_items(product_id);`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_pcs_shipment_id ON purchase_contract_shipments(shipment_id);`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_pcs_allocated_qty ON purchase_contract_shipments(allocated_quantity);`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_ports_country_id ON ports(country_id);`,
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
      `DROP INDEX IF EXISTS idx_pc_loading_country;`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS idx_pc_contract_number;`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS idx_pc_status;`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS idx_pci_product_id;`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS idx_pcs_shipment_id;`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS idx_pcs_allocated_qty;`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS idx_ports_country_id;`,
      { transaction },
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
