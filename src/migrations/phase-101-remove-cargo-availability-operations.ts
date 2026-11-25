import { QueryInterface } from 'sequelize';

export const phase = '101';
export const name = 'remove cargo availability and exporter loading operations';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.sequelize.query(
      `
    UPDATE sales_contract_shipments
    SET cargo_ready_confirmed = CASE
      WHEN cargo_ready_status = 'Ready' THEN TRUE
      WHEN cargo_ready_status = 'Not Ready' THEN FALSE
      ELSE cargo_ready_confirmed
    END
    WHERE cargo_ready_status IN ('Ready', 'Not Ready');

    ALTER TABLE sales_contract_shipments
      DROP COLUMN IF EXISTS cargo_ready_status;

    DELETE FROM client_action_access
    WHERE resource_action_id IN (
      SELECT ra.id
      FROM resource_actions ra
      JOIN module_resources mr ON mr.id = ra.resource_id
      WHERE mr.name IN ('cargo_allocation', 'cargo_availability')
    );

    DELETE FROM role_action_permissions
    WHERE resource_action_id IN (
      SELECT ra.id
      FROM resource_actions ra
      JOIN module_resources mr ON mr.id = ra.resource_id
      WHERE mr.name IN ('cargo_allocation', 'cargo_availability')
    );

    DELETE FROM resource_actions
    WHERE resource_id IN (
      SELECT id
      FROM module_resources
      WHERE name IN ('cargo_allocation', 'cargo_availability')
    );

    DELETE FROM module_resources
    WHERE name IN ('cargo_allocation', 'cargo_availability');

    DELETE FROM client_module_access
    WHERE module_id IN (
      SELECT id FROM app_modules
      WHERE name IN ('Cargo Availability', 'Cargo Allocation')
    );

    DELETE FROM permission_group_modules
    WHERE module_id IN (
      SELECT id FROM app_modules
      WHERE name IN ('Cargo Availability', 'Cargo Allocation')
    );

    DELETE FROM app_modules
    WHERE name IN ('Cargo Availability', 'Cargo Allocation');

    DROP TABLE IF EXISTS cargo_documents;
    DROP TABLE IF EXISTS cargo_loading;
    DROP TABLE IF EXISTS cargo_shipment_allocations;
    DROP TABLE IF EXISTS cargo_readiness;
    DROP TABLE IF EXISTS cargo_availability;
  `,
      { transaction },
    );
  });
}

export function down(): Promise<void> {
  return Promise.reject(
    new Error(
      'Cargo Availability tables and their data were permanently removed; they cannot be restored by rollback.',
    ),
  );
}
