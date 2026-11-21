import { QueryInterface } from 'sequelize';

export const phase = '94';
export const name = 'bank management domestic and nostro accounts';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    const seq = queryInterface.sequelize;

    // 1. Create domestic_banks table
    await seq.query(
      `CREATE TABLE IF NOT EXISTS domestic_banks (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        bank_name VARCHAR(255) NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'INR',
        account_number VARCHAR(100) NOT NULL,
        swift_code VARCHAR(50) NOT NULL,
        bank_address TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'Active',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );`,
      { transaction },
    );

    await seq.query(
      `CREATE INDEX IF NOT EXISTS idx_domestic_banks_company_id ON domestic_banks(company_id);
       CREATE INDEX IF NOT EXISTS idx_domestic_banks_currency ON domestic_banks(currency);
       CREATE INDEX IF NOT EXISTS idx_domestic_banks_status ON domestic_banks(status);`,
      { transaction },
    );

    // 2. Create nostro_banks table
    await seq.query(
      `CREATE TABLE IF NOT EXISTS nostro_banks (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        domestic_bank_id INTEGER NOT NULL REFERENCES domestic_banks(id) ON DELETE CASCADE,
        currency VARCHAR(10) NOT NULL,
        bank_name VARCHAR(255) NOT NULL,
        account_name VARCHAR(255) NOT NULL,
        account_number VARCHAR(100) NOT NULL,
        swift_code VARCHAR(50) NOT NULL,
        bank_address TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'Active',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );`,
      { transaction },
    );

    await seq.query(
      `CREATE INDEX IF NOT EXISTS idx_nostro_banks_company_id ON nostro_banks(company_id);
       CREATE INDEX IF NOT EXISTS idx_nostro_banks_domestic_bank_id ON nostro_banks(domestic_bank_id);
       CREATE INDEX IF NOT EXISTS idx_nostro_banks_currency ON nostro_banks(currency);
       CREATE INDEX IF NOT EXISTS idx_nostro_banks_status ON nostro_banks(status);`,
      { transaction },
    );

    // 3. Seed default Domestic Bank & Nostro Banks if companies exist
    const companies: any[] = await seq.query(
      `SELECT id, name FROM companies ORDER BY id ASC LIMIT 1;`,
      { type: 'SELECT', transaction },
    );

    if (companies && companies.length > 0) {
      const companyId = companies[0].id;

      // Check if domestic bank already exists
      const existingDomestic: any[] = await seq.query(
        `SELECT id FROM domestic_banks WHERE company_id = :companyId AND account_number = '8871210000025878' LIMIT 1;`,
        { replacements: { companyId }, type: 'SELECT', transaction },
      );

      let domesticBankId: number;
      if (!existingDomestic || existingDomestic.length === 0) {
        const [insertedDomestic]: any[] = await seq.query(
          `INSERT INTO domestic_banks (
            company_id, bank_name, currency, account_number, swift_code, bank_address, status, "createdAt", "updatedAt"
          ) VALUES (
            :companyId,
            'DBS BANK INDIA LIMITED',
            'INR',
            '8871210000025878',
            'DBSSINBBXXX',
            'Plot No. 52, Ivy Park,\nMouza - Pandharabodi,\nCity Survey No. 853,\nWard No. 73,\nNMC House No. 317,\nNagpur - 440010, India',
            'Active',
            NOW(),
            NOW()
          ) RETURNING id;`,
          { replacements: { companyId }, transaction },
        );
        domesticBankId = insertedDomestic[0]?.id;
      } else {
        domesticBankId = existingDomestic[0].id;
      }

      if (domesticBankId) {
        // EUR Nostro
        await seq.query(
          `INSERT INTO nostro_banks (
            company_id, domestic_bank_id, currency, bank_name, account_name, account_number, swift_code, bank_address, status, "createdAt", "updatedAt"
          )
          SELECT
            :companyId,
            :domesticBankId,
            'EUR',
            'Barclays Bank, Frankfurt',
            'DBS Bank India Ltd. - Mumbai Branch',
            'DE17503104000210575900',
            'BARCDEFF',
            'Frankfurt, Germany',
            'Active',
            NOW(),
            NOW()
          WHERE NOT EXISTS (
            SELECT 1 FROM nostro_banks 
            WHERE domestic_bank_id = :domesticBankId AND currency = 'EUR' AND account_number = 'DE17503104000210575900'
          );`,
          { replacements: { companyId, domesticBankId }, transaction },
        );

        // USD Nostro
        await seq.query(
          `INSERT INTO nostro_banks (
            company_id, domestic_bank_id, currency, bank_name, account_name, account_number, swift_code, bank_address, status, "createdAt", "updatedAt"
          )
          SELECT
            :companyId,
            :domesticBankId,
            'USD',
            'JP MORGAN CHASE BANK, N.A.',
            'DBS Bank India Ltd.',
            '199253953',
            'CHASUS33',
            'New York, USA',
            'Active',
            NOW(),
            NOW()
          WHERE NOT EXISTS (
            SELECT 1 FROM nostro_banks 
            WHERE domestic_bank_id = :domesticBankId AND currency = 'USD' AND account_number = '199253953'
          );`,
          { replacements: { companyId, domesticBankId }, transaction },
        );
      }
    }

    // 4. Ensure AppModule "Accounts"
    await seq.query(
      `INSERT INTO app_modules (name, sort_order, "createdAt", "updatedAt")
       SELECT 'Accounts', 88, NOW(), NOW()
       WHERE NOT EXISTS (SELECT 1 FROM app_modules WHERE name = 'Accounts');`,
      { transaction },
    );

    const [accountsModule]: any[] = await seq.query(
      `SELECT id FROM app_modules WHERE name = 'Accounts' LIMIT 1;`,
      { type: 'SELECT', transaction },
    );
    const accountsModuleId = accountsModule?.id;

    if (accountsModuleId) {
      // 5. Ensure ModuleResource "bank_management"
      await seq.query(
        `INSERT INTO module_resources (name, display_name, module_id, sort_order, "createdAt", "updatedAt")
         SELECT 'bank_management', 'Bank Management', :accountsModuleId, 10, NOW(), NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM module_resources WHERE name = 'bank_management'
         );`,
        { replacements: { accountsModuleId }, transaction },
      );

      const [bankResource]: any[] = await seq.query(
        `SELECT id FROM module_resources WHERE name = 'bank_management' LIMIT 1;`,
        { type: 'SELECT', transaction },
      );
      const bankResourceId = bankResource?.id;

      if (bankResourceId) {
        // Resource actions: VIEW, CREATE, UPDATE, DELETE
        const actionsToCreate = [
          { name: 'VIEW', display: 'VIEW', order: 0 },
          { name: 'CREATE', display: 'CREATE', order: 10 },
          { name: 'UPDATE', display: 'UPDATE', order: 20 },
          { name: 'DELETE', display: 'DELETE', order: 30 },
        ];

        for (const act of actionsToCreate) {
          await seq.query(
            `INSERT INTO resource_actions (name, display_name, resource_id, sort_order, "createdAt", "updatedAt")
             SELECT :name, :display, :bankResourceId, :order, NOW(), NOW()
             WHERE NOT EXISTS (
               SELECT 1 FROM resource_actions
               WHERE name = :name AND resource_id = :bankResourceId
             );`,
            { replacements: { name: act.name, display: act.display, bankResourceId, order: act.order }, transaction },
          );
        }

        const actions: any[] = await seq.query(
          `SELECT id FROM resource_actions WHERE resource_id = :bankResourceId;`,
          { replacements: { bankResourceId }, type: 'SELECT', transaction },
        );

        // Grant to Admin & Client Admin roles
        const roles: any[] = await seq.query(
          `SELECT id FROM roles WHERE name IN ('Admin', 'Client Admin');`,
          { type: 'SELECT', transaction },
        );

        for (const role of roles) {
          for (const action of actions) {
            await seq.query(
              `INSERT INTO role_action_permissions (role_id, resource_action_id, "createdAt", "updatedAt")
               SELECT :roleId, :actionId, NOW(), NOW()
               WHERE NOT EXISTS (
                 SELECT 1 FROM role_action_permissions
                 WHERE role_id = :roleId AND resource_action_id = :actionId
               );`,
              { replacements: { roleId: role.id, actionId: action.id }, transaction },
            );
          }
        }

        // Grant client access
        const clients: any[] = await seq.query(
          `SELECT id FROM clients;`,
          { type: 'SELECT', transaction },
        );

        for (const client of clients) {
          await seq.query(
            `INSERT INTO client_module_access (client_id, module_id, created_at)
             SELECT :clientId, :accountsModuleId, NOW()
             WHERE NOT EXISTS (
               SELECT 1 FROM client_module_access
               WHERE client_id = :clientId AND module_id = :accountsModuleId
             );`,
            { replacements: { clientId: client.id, accountsModuleId }, transaction },
          );

          for (const action of actions) {
            await seq.query(
              `INSERT INTO client_action_access (client_id, resource_action_id, created_at)
               SELECT :clientId, :actionId, NOW()
               WHERE NOT EXISTS (
                 SELECT 1 FROM client_action_access
                 WHERE client_id = :clientId AND resource_action_id = :actionId
               );`,
              { replacements: { clientId: client.id, actionId: action.id }, transaction },
            );
          }
        }
      }
    }

    // 6. Ensure SidebarFolder "Accounts"
    const [existingFolder]: any[] = await seq.query(
      `SELECT id FROM sidebar_folders WHERE name = 'Accounts' LIMIT 1;`,
      { type: 'SELECT', transaction },
    );

    let folderId = existingFolder?.id;
    if (!folderId) {
      await seq.query(
        `INSERT INTO sidebar_folders (name, icon_name, sort_order, is_active, is_collapsible, "createdAt", "updatedAt")
         VALUES ('Accounts', 'Landmark', 88, true, true, NOW(), NOW());`,
        { transaction },
      );
      const [newFolder]: any[] = await seq.query(
        `SELECT id FROM sidebar_folders WHERE name = 'Accounts' LIMIT 1;`,
        { type: 'SELECT', transaction },
      );
      folderId = newFolder?.id;
    } else {
      await seq.query(
        `UPDATE sidebar_folders SET is_active = true, is_collapsible = true, sort_order = 88 WHERE id = :folderId;`,
        { replacements: { folderId }, transaction },
      );
    }

    if (folderId) {
      // 7. Ensure SidebarItem "Bank Management"
      const [existingItem]: any[] = await seq.query(
        `SELECT id FROM sidebar_items WHERE route = '/accounts/bank-management' LIMIT 1;`,
        { type: 'SELECT', transaction },
      );

      let itemId = existingItem?.id;
      if (!itemId) {
        await seq.query(
          `INSERT INTO sidebar_items (name, route, icon_name, folder_id, sort_order, is_active, permission_link, "createdAt", "updatedAt")
           VALUES ('Bank Management', '/accounts/bank-management', 'Building2', :folderId, 10, true, 'bank_management:view', NOW(), NOW());`,
          { replacements: { folderId }, transaction },
        );
        const [newItem]: any[] = await seq.query(
          `SELECT id FROM sidebar_items WHERE route = '/accounts/bank-management' LIMIT 1;`,
          { type: 'SELECT', transaction },
        );
        itemId = newItem?.id;
      }

      // Grant client folder & item access
      const clients: any[] = await seq.query(`SELECT id FROM clients;`, { type: 'SELECT', transaction });
      for (const client of clients) {
        await seq.query(
          `INSERT INTO client_folder_access (client_id, folder_id, created_at)
           SELECT :clientId, :folderId, NOW()
           WHERE NOT EXISTS (
             SELECT 1 FROM client_folder_access WHERE client_id = :clientId AND folder_id = :folderId
           );`,
          { replacements: { clientId: client.id, folderId }, transaction },
        );

        if (itemId) {
          await seq.query(
            `INSERT INTO client_item_access (client_id, item_id, created_at)
             SELECT :clientId, :itemId, NOW()
             WHERE NOT EXISTS (
               SELECT 1 FROM client_item_access WHERE client_id = :clientId AND item_id = :itemId
             );`,
            { replacements: { clientId: client.id, itemId }, transaction },
          );
        }
      }
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    const seq = queryInterface.sequelize;
    await seq.query(`DROP TABLE IF EXISTS nostro_banks CASCADE;`, { transaction });
    await seq.query(`DROP TABLE IF EXISTS domestic_banks CASCADE;`, { transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
