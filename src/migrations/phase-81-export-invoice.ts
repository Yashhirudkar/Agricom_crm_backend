import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '81';
export const name = 'create export invoices module tables rbac and sidebar';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    const seq = queryInterface.sequelize;

    // 1. Create table export_invoices
    await seq.query(
      `CREATE TABLE IF NOT EXISTS export_invoices (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        sales_contract_id INTEGER REFERENCES sales_contracts(id) ON DELETE SET NULL,
        shipment_id INTEGER REFERENCES sales_contract_shipments(id) ON DELETE SET NULL,
        purchase_contract_id INTEGER REFERENCES purchase_contracts(id) ON DELETE SET NULL,
        invoice_number VARCHAR(100) NOT NULL UNIQUE,
        sequence_number INTEGER NOT NULL DEFAULT 1,
        invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
        status VARCHAR(50) NOT NULL DEFAULT 'Draft',
        exporter_ref VARCHAR(100) NOT NULL DEFAULT 'I.E.C. NO.0307027422',
        seller_order_no VARCHAR(100),
        seller_order_date DATE,
        other_ref VARCHAR(255),
        buyer_order_no VARCHAR(100),
        buyer_order_date DATE,
        seller_details JSONB,
        consignee_details JSONB,
        notify_party_details JSONB,
        buyer_other_than_consignee JSONB,
        country_of_origin VARCHAR(150),
        country_of_final_destination VARCHAR(150),
        terms_of_delivery_payment TEXT,
        carriage_by VARCHAR(100) DEFAULT 'ROAD',
        place_of_loading VARCHAR(255),
        place_of_unloading VARCHAR(255),
        final_destination VARCHAR(255),
        truck_numbers JSONB DEFAULT '[]'::jsonb,
        container_numbers JSONB DEFAULT '[]'::jsonb,
        goods_items JSONB DEFAULT '[]'::jsonb,
        currency VARCHAR(10) NOT NULL DEFAULT 'USD',
        total_quantity DECIMAL(14, 3) NOT NULL DEFAULT 0,
        total_amount DECIMAL(16, 2) NOT NULL DEFAULT 0,
        amount_chargeable DECIMAL(16, 2) NOT NULL DEFAULT 0,
        amount_in_words TEXT,
        bank_key VARCHAR(100),
        bank_details JSONB,
        declaration TEXT DEFAULT 'WE HEREBY CERTIFY THAT THE GOODS SUPPLIED ARE OF 100% KAZAKHSTAN ORIGIN.',
        signature_url TEXT,
        stamp_url TEXT,
        signatory_name VARCHAR(255),
        signatory_designation VARCHAR(255),
        remarks TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
      { transaction },
    );

    // 2. Indexes for export_invoices
    await seq.query(
      `CREATE INDEX IF NOT EXISTS idx_export_invoices_invoice_number ON export_invoices(invoice_number);
       CREATE INDEX IF NOT EXISTS idx_export_invoices_sales_contract_id ON export_invoices(sales_contract_id);
       CREATE INDEX IF NOT EXISTS idx_export_invoices_shipment_id ON export_invoices(shipment_id);
       CREATE INDEX IF NOT EXISTS idx_export_invoices_company_id ON export_invoices(company_id);
       CREATE INDEX IF NOT EXISTS idx_export_invoices_status ON export_invoices(status);
       CREATE INDEX IF NOT EXISTS idx_export_invoices_invoice_date ON export_invoices(invoice_date);`,
      { transaction },
    );

    // 3. Create table export_invoice_sequences
    await seq.query(
      `CREATE TABLE IF NOT EXISTS export_invoice_sequences (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        prefix VARCHAR(50) NOT NULL DEFAULT 'EXP',
        current_sequence INTEGER NOT NULL DEFAULT 0,
        padding_length INTEGER NOT NULL DEFAULT 3,
        format_pattern VARCHAR(100) NOT NULL DEFAULT '{PREFIX}-{SEQ}-{CONTRACT}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_company_prefix UNIQUE (company_id, prefix)
      );`,
      { transaction },
    );

    // 4. Ensure AppModule "Documents"
    await seq.query(
      `INSERT INTO app_modules (name, sort_order, "createdAt", "updatedAt")
       SELECT 'Documents', 85, NOW(), NOW()
       WHERE NOT EXISTS (SELECT 1 FROM app_modules WHERE name = 'Documents');`,
      { transaction },
    );

    const [docModule]: any[] = await seq.query(
      `SELECT id FROM app_modules WHERE name = 'Documents' LIMIT 1;`,
      { type: 'SELECT', transaction },
    );
    const docModuleId = docModule?.id;

    if (docModuleId) {
      // 5. Ensure ModuleResource "export_invoice"
      await seq.query(
        `INSERT INTO module_resources (name, display_name, module_id, sort_order, "createdAt", "updatedAt")
         SELECT 'export_invoice', 'Export Invoice', :docModuleId, 20, NOW(), NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM module_resources WHERE name = 'export_invoice'
         );`,
        { replacements: { docModuleId }, transaction },
      );

      const [invoiceResource]: any[] = await seq.query(
        `SELECT id FROM module_resources WHERE name = 'export_invoice' LIMIT 1;`,
        { type: 'SELECT', transaction },
      );
      const invoiceResourceId = invoiceResource?.id;

      if (invoiceResourceId) {
        // Actions: VIEW, CREATE, UPDATE, DELETE
        const actions = ['VIEW', 'CREATE', 'UPDATE', 'DELETE'];
        for (let i = 0; i < actions.length; i++) {
          const action = actions[i];
          await seq.query(
            `INSERT INTO resource_actions (name, display_name, resource_id, sort_order, "createdAt", "updatedAt")
             SELECT :action, :action, :invoiceResourceId, :order, NOW(), NOW()
             WHERE NOT EXISTS (
               SELECT 1 FROM resource_actions
               WHERE name = :action AND resource_id = :invoiceResourceId
             );`,
            {
              replacements: { action, invoiceResourceId, order: i * 10 },
              transaction,
            },
          );
        }

        const resActions: any[] = await seq.query(
          `SELECT id FROM resource_actions WHERE resource_id = :invoiceResourceId;`,
          {
            replacements: { invoiceResourceId },
            type: 'SELECT',
            transaction,
          },
        );

        // Grant to Admin & Client Admin roles
        const roles: any[] = await seq.query(
          `SELECT id FROM roles WHERE name IN ('Admin', 'Client Admin');`,
          { type: 'SELECT', transaction },
        );

        for (const role of roles) {
          for (const action of resActions) {
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
        const clients: any[] = await seq.query(
          `SELECT id FROM clients;`,
          { type: 'SELECT', transaction },
        );

        for (const client of clients) {
          await seq.query(
            `INSERT INTO client_module_access (client_id, module_id, created_at)
             SELECT :clientId, :docModuleId, NOW()
             WHERE NOT EXISTS (
               SELECT 1 FROM client_module_access
               WHERE client_id = :clientId AND module_id = :docModuleId
             );`,
            { replacements: { clientId: client.id, docModuleId }, transaction },
          );

          for (const action of resActions) {
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

    // 6. Sidebar Folder "Documents"
    const [existingFolder]: any[] = await seq.query(
      `SELECT id FROM sidebar_folders WHERE name = 'Documents' LIMIT 1;`,
      { type: 'SELECT', transaction },
    );

    let folderId = existingFolder?.id;
    if (!folderId) {
      await seq.query(
        `INSERT INTO sidebar_folders (name, icon_name, sort_order, is_active, is_collapsible, "createdAt", "updatedAt")
         VALUES ('Documents', 'Folder', 85, true, true, NOW(), NOW());`,
        { transaction },
      );
      const [newFolder]: any[] = await seq.query(
        `SELECT id FROM sidebar_folders WHERE name = 'Documents' LIMIT 1;`,
        { type: 'SELECT', transaction },
      );
      folderId = newFolder?.id;
    }

    if (folderId) {
      // 7. Ensure SidebarItem "Export Invoice"
      const [existingItem]: any[] = await seq.query(
        `SELECT id FROM sidebar_items WHERE route = '/documents/export-invoices' LIMIT 1;`,
        { type: 'SELECT', transaction },
      );

      let itemId = existingItem?.id;
      if (!itemId) {
        await seq.query(
          `INSERT INTO sidebar_items (name, route, icon_name, folder_id, sort_order, is_active, permission_link, "createdAt", "updatedAt")
           VALUES ('Export Invoice', '/documents/export-invoices', 'Receipt', :folderId, 20, true, 'export_invoice:view', NOW(), NOW());`,
          { replacements: { folderId }, transaction },
        );
        const [newItem]: any[] = await seq.query(
          `SELECT id FROM sidebar_items WHERE route = '/documents/export-invoices' LIMIT 1;`,
          { type: 'SELECT', transaction },
        );
        itemId = newItem?.id;
      } else {
        await seq.query(
          `UPDATE sidebar_items SET name = 'Export Invoice', folder_id = :folderId, icon_name = 'Receipt', permission_link = 'export_invoice:view', is_active = true WHERE id = :itemId;`,
          { replacements: { folderId, itemId }, transaction },
        );
      }

      // Grant client access to item
      const clients: any[] = await seq.query(
        `SELECT id FROM clients;`,
        { type: 'SELECT', transaction },
      );

      for (const client of clients) {
        if (itemId) {
          await seq.query(
            `INSERT INTO client_item_access (client_id, item_id, created_at)
             SELECT :clientId, :itemId, NOW()
             WHERE NOT EXISTS (
               SELECT 1 FROM client_item_access
               WHERE client_id = :clientId AND item_id = :itemId
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
    await seq.query(
      `DELETE FROM sidebar_items WHERE route = '/documents/export-invoices';`,
      { transaction },
    );
    await seq.query(
      `DROP TABLE IF EXISTS export_invoices CASCADE;`,
      { transaction },
    );
    await seq.query(
      `DROP TABLE IF EXISTS export_invoice_sequences CASCADE;`,
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

