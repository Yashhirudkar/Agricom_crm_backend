import { Sequelize, QueryTypes } from 'sequelize';

const sequelize = new Sequelize('Agricom_db1', 'postgres', 'admin', {
  host: 'localhost',
  port: 5432,
  dialect: 'postgres',
  logging: false,
});

const tables = [
  'trade_documents', 'shipment_types', 'products', 'payment_terms', 'partner_roles',
  'partners', 'partner_products', 'partner_followups', 'partner_dynamic_values',
  'partner_dnb_reports', 'partner_contacts', 'categories', 'bag_types', 'packing_types',
  'bag_specifications', 'product_bag_assignments', 'equipment_options',
  'partner_role_dynamic_configs', 'partner_dynamic_config_history',
  'enquiries',
  'quotations', 'quotation_items', 'quotation_sequences',
  'sales_contracts', 'sales_contract_items', 'sales_contract_shipments', 'sales_contract_documents', 'sales_contract_document_files',
  'purchase_contracts', 'purchase_contract_items', 'purchase_contract_shipments', 'purchase_contract_activities', 'purchase_contract_attachments', 'purchase_contract_required_documents',
  'cargo_availability', 'cargo_documents', 'cargo_loading', 'cargo_readiness', 'cargo_shipment_allocations',
  'logistics', 'freight_quotes', 'freight_charge_master', 'freight_quote_charges',
  'monthly_stock_summary_countries', 'monthly_stock_sections', 'monthly_stock_section_rows', 'monthly_stock_section_columns', 'monthly_stock_row_cells',
  'tasks', 'task_activities', 'task_assignees', 'task_attachments', 'task_checklists', 'task_comment_histories', 'task_comment_mentions', 'task_comments', 'task_custom_field_values', 'task_custom_fields', 'task_dependencies', 'task_label_maps', 'task_labels', 'task_priorities', 'task_recurrence_exceptions', 'task_recurrences', 'task_sequences', 'task_sla_rules', 'task_status_transitions', 'task_statuses', 'task_template_items', 'task_templates', 'task_time_logs',
  'attachments', 'attachment_tags', 'attachment_audit_logs',
  'notifications', 'notification_logs'
];

async function main() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected.');
    
    // Check if companies table exists and get the first company (Agricom Impex)
    const companies = await sequelize.query('SELECT id, name FROM companies ORDER BY id ASC LIMIT 1', { type: QueryTypes.SELECT });
    
    if (companies.length === 0) {
      console.log('❌ No companies found! Cannot map records.');
      return;
    }
    
    const companyId = (companies[0] as any).id;
    console.log(`🚀 Mapping all existing unassigned records to Company ID: ${companyId} (${(companies[0] as any).name})`);

    for (const table of tables) {
      try {
        const [results, metadata] = await sequelize.query(`UPDATE "${table}" SET company_id = ${companyId} WHERE company_id IS NULL`);
        if ((metadata as any).rowCount > 0) {
           console.log(`✅ Updated ${(metadata as any).rowCount} records in ${table}`);
        }
      } catch (e: any) {
        if (e.message.includes('does not exist')) {
          // console.log(`Table ${table} does not exist. Skipping.`);
        } else if (e.message.includes('column "company_id" of relation')) {
          // ignore
        } else {
          console.error(`❌ Error updating ${table}: ${e.message}`);
        }
      }
    }
    
    // Also update audit_logs targetCompanyId
    try {
      const [results, metadata] = await sequelize.query(`UPDATE "audit_logs" SET "targetCompanyId" = ${companyId} WHERE "targetCompanyId" IS NULL`);
      if ((metadata as any).rowCount > 0) {
         console.log(`✅ Updated ${(metadata as any).rowCount} records in audit_logs`);
      }
    } catch (e: any) {}

    console.log('🎉 Data migration complete. All records should now be visible in the UI!');
  } catch (error) {
    console.error('❌ Connection failed:', error);
  } finally {
    await sequelize.close();
  }
}

main();
