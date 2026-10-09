import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '29';
export const name = 'enterprise-multi-tenant';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    const tablesToMigrate = [
      'trade_documents',
      'shipment_types',
      'products',
      'payment_terms',
      'partner_roles',
      'partners',
      'partner_products',
      'partner_followups',
      'partner_dynamic_values',
      'partner_dnb_reports',
      'partner_contacts',
      'categories',
      'bag_types',
      'packing_types',
      'bag_specifications',
      'product_bag_assignments',
      'equipment_options',
      'partner_role_dynamic_configs',
      'partner_dynamic_config_history',
      'enquiries',
      'quotations',
      'quotation_items',
      'quotation_sequences',
      'sales_contracts',
      'sales_contract_items',
      'sales_contract_shipments',
      'sales_contract_documents',
      'sales_contract_document_files',
      'purchase_contracts',
      'purchase_contract_items',
      'purchase_contract_shipments',
      'purchase_contract_activities',
      'purchase_contract_attachments',
      'purchase_contract_required_documents',
      'cargo_availability',
      'cargo_documents',
      'cargo_loading',
      'cargo_readiness',
      'cargo_shipment_allocations',
      'logistics',
      'freight_quotes',
      'freight_charge_master',
      'freight_quote_charges',
      'monthly_stock_summary_countries',
      'monthly_stock_sections',
      'monthly_stock_section_rows',
      'monthly_stock_section_columns',
      'monthly_stock_row_cells',
      'tasks',
      'task_activities',
      'task_assignees',
      'task_attachments',
      'task_checklists',
      'task_comment_histories',
      'task_comment_mentions',
      'task_comments',
      'task_custom_field_values',
      'task_custom_fields',
      'task_dependencies',
      'task_label_maps',
      'task_labels',
      'task_priorities',
      'task_recurrence_exceptions',
      'task_recurrences',
      'task_sequences',
      'task_sla_rules',
      'task_status_transitions',
      'task_statuses',
      'task_template_items',
      'task_templates',
      'task_time_logs',
      'attachments',
      'attachment_tags',
      'attachment_audit_logs',
      'notifications',
      'notification_logs',
    ];

    for (const table of tablesToMigrate) {
      let tableInfo: any;
      try {
        tableInfo = await queryInterface.describeTable(table);
      } catch (e) {
        console.log(`Table ${table} does not exist, skipping...`);
        continue;
      }

      if (!tableInfo.company_id) {
        await queryInterface.addColumn(
          table,
          'company_id',
          {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
              model: 'companies',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          { transaction },
        );

        // Check if index exists before adding
        const [indexResults] = await queryInterface.sequelize.query(
          `
          SELECT indexname
          FROM pg_indexes
          WHERE tablename = '${table}' AND indexname = '${table}_company_id_idx' OR indexname = '${table}_company_id';
        `,
          { transaction },
        );

        if ((indexResults as any[]).length === 0) {
          await queryInterface.addIndex(table, ['company_id'], { transaction });
        }
      } else {
        console.log(
          `Column company_id already exists in ${table}, skipping addColumn...`,
        );
      }
    }

    // Special fix for quotation_sequences unique index
    const [removeIdxResults] = await queryInterface.sequelize.query(
      `
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'quotation_sequences' AND indexname = 'quotation_sequences_period';
    `,
      { transaction },
    );

    if ((removeIdxResults as any[]).length > 0) {
      await queryInterface.removeIndex(
        'quotation_sequences',
        'quotation_sequences_period',
        { transaction },
      );
    }

    const [addIdxResults] = await queryInterface.sequelize.query(
      `
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'quotation_sequences' AND indexname = 'quotation_sequences_period_company_id';
    `,
      { transaction },
    );

    if ((addIdxResults as any[]).length === 0) {
      await queryInterface.addIndex(
        'quotation_sequences',
        ['period', 'company_id'],
        {
          unique: true,
          name: 'quotation_sequences_period_company_id',
          transaction,
        },
      );
    }

    // Special fields for audit_logs
    let auditLogsInfo: any;
    try {
      auditLogsInfo = await queryInterface.describeTable('audit_logs');
    } catch (e) {}

    if (auditLogsInfo) {
      if (!auditLogsInfo.targetCompanyId) {
        await queryInterface.addColumn(
          'audit_logs',
          'targetCompanyId',
          {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'companies', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          { transaction },
        );
      }
      if (!auditLogsInfo.requestPath) {
        await queryInterface.addColumn(
          'audit_logs',
          'requestPath',
          {
            type: DataTypes.STRING(255),
            allowNull: true,
          },
          { transaction },
        );
      }
    }

    await transaction.commit();
    console.log('Phase 29 - Enterprise Multi-Tenant Migration Completed.');
  } catch (error) {
    await transaction.rollback();
    console.error('Migration failed:', error);
    throw error;
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    // Revert special index
    const [removeIdxResults] = await queryInterface.sequelize.query(
      `
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'quotation_sequences' AND indexname = 'quotation_sequences_period_company_id';
    `,
      { transaction },
    );

    if ((removeIdxResults as any[]).length > 0) {
      await queryInterface.removeIndex(
        'quotation_sequences',
        'quotation_sequences_period_company_id',
        { transaction },
      );
    }

    const [addIdxResults] = await queryInterface.sequelize.query(
      `
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'quotation_sequences' AND indexname = 'quotation_sequences_period';
    `,
      { transaction },
    );

    if ((addIdxResults as any[]).length === 0) {
      await queryInterface.addIndex('quotation_sequences', ['period'], {
        unique: true,
        name: 'quotation_sequences_period',
        transaction,
      });
    }

    const tablesToMigrate = [
      'trade_documents',
      'shipment_types',
      'products',
      'payment_terms',
      'partner_roles',
      'partners',
      'partner_products',
      'partner_followups',
      'partner_dynamic_values',
      'partner_dnb_reports',
      'partner_contacts',
      'categories',
      'bag_types',
      'packing_types',
      'bag_specifications',
      'product_bag_assignments',
      'equipment_options',
      'partner_role_dynamic_configs',
      'partner_dynamic_config_history',
      'enquiries',
      'quotations',
      'quotation_items',
      'quotation_sequences',
      'sales_contracts',
      'sales_contract_items',
      'sales_contract_shipments',
      'sales_contract_documents',
      'sales_contract_document_files',
      'purchase_contracts',
      'purchase_contract_items',
      'purchase_contract_shipments',
      'purchase_contract_activities',
      'purchase_contract_attachments',
      'purchase_contract_required_documents',
      'cargo_availability',
      'cargo_documents',
      'cargo_loading',
      'cargo_readiness',
      'cargo_shipment_allocations',
      'logistics',
      'freight_quotes',
      'freight_charge_master',
      'freight_quote_charges',
      'monthly_stock_summary_countries',
      'monthly_stock_sections',
      'monthly_stock_section_rows',
      'monthly_stock_section_columns',
      'monthly_stock_row_cells',
      'tasks',
      'task_activities',
      'task_assignees',
      'task_attachments',
      'task_checklists',
      'task_comment_histories',
      'task_comment_mentions',
      'task_comments',
      'task_custom_field_values',
      'task_custom_fields',
      'task_dependencies',
      'task_label_maps',
      'task_labels',
      'task_priorities',
      'task_recurrence_exceptions',
      'task_recurrences',
      'task_sequences',
      'task_sla_rules',
      'task_status_transitions',
      'task_statuses',
      'task_template_items',
      'task_templates',
      'task_time_logs',
      'attachments',
      'attachment_tags',
      'attachment_audit_logs',
      'notifications',
      'notification_logs',
    ];

    for (const table of tablesToMigrate) {
      let tableInfo: any;
      try {
        tableInfo = await queryInterface.describeTable(table);
      } catch (e) {
        continue;
      }

      if (tableInfo.company_id) {
        await queryInterface.removeColumn(table, 'company_id', { transaction });
      }
    }

    let auditLogsInfo: any;
    try {
      auditLogsInfo = await queryInterface.describeTable('audit_logs');
    } catch (e) {}

    if (auditLogsInfo) {
      if (auditLogsInfo.targetCompanyId) {
        await queryInterface.removeColumn('audit_logs', 'targetCompanyId', {
          transaction,
        });
      }
      if (auditLogsInfo.requestPath) {
        await queryInterface.removeColumn('audit_logs', 'requestPath', {
          transaction,
        });
      }
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
