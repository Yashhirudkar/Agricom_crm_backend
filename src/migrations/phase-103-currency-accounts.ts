import { QueryInterface } from 'sequelize';

export const phase = '103';
export const name = 'currency accounts module with domestic bank linking';

interface IdRow {
  id: number;
}

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const seq = queryInterface.sequelize;

    // 1. Create currency_accounts table (linked strictly to domestic_banks, no Nostro FK)
    await seq.query(
      `CREATE TABLE IF NOT EXISTS currency_accounts (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        domestic_bank_id INTEGER NOT NULL REFERENCES domestic_banks(id) ON DELETE CASCADE,
        currency VARCHAR(10) NOT NULL,
        account_name VARCHAR(255),
        account_number VARCHAR(100) NOT NULL,
        swift_code VARCHAR(50),
        iban VARCHAR(100),
        branch_name VARCHAR(255),
        address TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'Active',
        remarks TEXT,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );`,
      { transaction },
    );

    // 2. Standard indexes + unique account number scoped per Domestic Bank
    await seq.query(
      `CREATE INDEX IF NOT EXISTS idx_currency_accounts_company_id ON currency_accounts(company_id);
       CREATE INDEX IF NOT EXISTS idx_currency_accounts_domestic_bank_id ON currency_accounts(domestic_bank_id);
       CREATE INDEX IF NOT EXISTS idx_currency_accounts_currency ON currency_accounts(currency);
       CREATE INDEX IF NOT EXISTS idx_currency_accounts_status ON currency_accounts(status);
       CREATE UNIQUE INDEX IF NOT EXISTS uq_currency_accounts_domestic_bank_account_number
         ON currency_accounts (domestic_bank_id, LOWER(TRIM(account_number)));`,
      { transaction },
    );

    // 3. Ensure AppModule "Accounts"
    await seq.query(
      `INSERT INTO app_modules (name, sort_order, "createdAt", "updatedAt")
       SELECT 'Accounts', 88, NOW(), NOW()
       WHERE NOT EXISTS (SELECT 1 FROM app_modules WHERE name = 'Accounts');`,
      { transaction },
    );

    const accountsModules = (await seq.query(
      `SELECT id FROM app_modules WHERE name = 'Accounts' LIMIT 1;`,
      { type: 'SELECT', transaction },
    )) as IdRow[];
    const accountsModuleId = accountsModules[0]?.id;

    if (accountsModuleId) {
      // 4. Ensure ModuleResource "currency_accounts" under Accounts
      await seq.query(
        `INSERT INTO module_resources (name, display_name, module_id, sort_order, "createdAt", "updatedAt")
         SELECT 'currency_accounts', 'Currency Accounts', :accountsModuleId, 20, NOW(), NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM module_resources WHERE name = 'currency_accounts'
         );`,
        { replacements: { accountsModuleId }, transaction },
      );

      await seq.query(
        `UPDATE module_resources
         SET module_id = :accountsModuleId, display_name = 'Currency Accounts'
         WHERE name = 'currency_accounts';`,
        { replacements: { accountsModuleId }, transaction },
      );

      const resources = (await seq.query(
        `SELECT id FROM module_resources WHERE name = 'currency_accounts' LIMIT 1;`,
        { type: 'SELECT', transaction },
      )) as IdRow[];
      const resourceId = resources[0]?.id;

      if (resourceId) {
        const actionsToCreate = [
          { name: 'VIEW', display: 'VIEW', order: 0 },
          { name: 'CREATE', display: 'CREATE', order: 10 },
          { name: 'UPDATE', display: 'UPDATE', order: 20 },
          { name: 'DELETE', display: 'DELETE', order: 30 },
        ];

        for (const act of actionsToCreate) {
          await seq.query(
            `INSERT INTO resource_actions (name, display_name, resource_id, sort_order, "createdAt", "updatedAt")
             SELECT :name, :display, :resourceId, :order, NOW(), NOW()
             WHERE NOT EXISTS (
               SELECT 1 FROM resource_actions
               WHERE name = :name AND resource_id = :resourceId
             );`,
            {
              replacements: {
                name: act.name,
                display: act.display,
                resourceId,
                order: act.order,
              },
              transaction,
            },
          );
        }

        const actions = (await seq.query(
          `SELECT id FROM resource_actions WHERE resource_id = :resourceId;`,
          { replacements: { resourceId }, type: 'SELECT', transaction },
        )) as IdRow[];

        // Grant to Admin & Client Admin roles
        const roles = (await seq.query(
          `SELECT id FROM roles WHERE name IN ('Admin', 'Client Admin');`,
          { type: 'SELECT', transaction },
        )) as IdRow[];

        for (const role of roles) {
          for (const action of actions) {
            await seq.query(
              `INSERT INTO role_action_permissions (role_id, resource_action_id, "createdAt", "updatedAt")
               SELECT :roleId, :actionId, NOW(), NOW()
               WHERE NOT EXISTS (
                 SELECT 1 FROM role_action_permissions
                 WHERE role_id = :roleId AND resource_action_id = :actionId
               );`,
              {
                replacements: { roleId: role.id, actionId: action.id },
                transaction,
              },
            );
          }
        }

        // Grant client access
        const clients = (await seq.query(`SELECT id FROM clients;`, {
          type: 'SELECT',
          transaction,
        })) as IdRow[];

        for (const client of clients) {
          await seq.query(
            `INSERT INTO client_module_access (client_id, module_id, created_at)
             SELECT :clientId, :accountsModuleId, NOW()
             WHERE NOT EXISTS (
               SELECT 1 FROM client_module_access
               WHERE client_id = :clientId AND module_id = :accountsModuleId
             );`,
            {
              replacements: { clientId: client.id, accountsModuleId },
              transaction,
            },
          );

          for (const action of actions) {
            await seq.query(
              `INSERT INTO client_action_access (client_id, resource_action_id, created_at)
               SELECT :clientId, :actionId, NOW()
               WHERE NOT EXISTS (
                 SELECT 1 FROM client_action_access
                 WHERE client_id = :clientId AND resource_action_id = :actionId
               );`,
              {
                replacements: { clientId: client.id, actionId: action.id },
                transaction,
              },
            );
          }
        }
      }
    }

    // Currency Accounts live inside Domestic Bank Detail Drawer (no standalone sidebar menu item)
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    const seq = queryInterface.sequelize;

    await seq.query(
      `DELETE FROM client_item_access
       WHERE item_id IN (
         SELECT id FROM sidebar_items WHERE route = '/accounts/currency-accounts'
       );`,
      { transaction },
    );
    await seq.query(
      `DELETE FROM sidebar_items WHERE route = '/accounts/currency-accounts';`,
      { transaction },
    );
    await seq.query(
      `DELETE FROM client_action_access
       WHERE resource_action_id IN (
         SELECT ra.id FROM resource_actions ra
         JOIN module_resources mr ON mr.id = ra.resource_id
         WHERE mr.name = 'currency_accounts'
       );`,
      { transaction },
    );
    await seq.query(
      `DELETE FROM role_action_permissions
       WHERE resource_action_id IN (
         SELECT ra.id FROM resource_actions ra
         JOIN module_resources mr ON mr.id = ra.resource_id
         WHERE mr.name = 'currency_accounts'
       );`,
      { transaction },
    );
    await seq.query(
      `DELETE FROM resource_actions
       WHERE resource_id IN (
         SELECT id FROM module_resources WHERE name = 'currency_accounts'
       );`,
      { transaction },
    );
    await seq.query(
      `DELETE FROM module_resources WHERE name = 'currency_accounts';`,
      { transaction },
    );
    await seq.query(`DROP TABLE IF EXISTS currency_accounts CASCADE;`, {
      transaction,
    });
  });
}
