import { QueryInterface, QueryTypes } from 'sequelize';

export const phase = '48';
export const name = 'business-transactions-and-permanent-references';

const referenceColumns = [
  'enquiries',
  'quotations',
  'sales_contracts',
  'purchase_contracts',
  'sales_contract_shipments',
  'logistics',
  'freight_quotes',
  'cargo_availability',
  'cargo_loading',
];

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;
  const transaction = await sequelize.transaction();

  try {
    await sequelize.query(
      `CREATE TABLE IF NOT EXISTS business_transactions (
        id BIGSERIAL PRIMARY KEY,
        business_reference VARCHAR(20) NOT NULL UNIQUE,
        origin_type VARCHAR(40) NOT NULL,
        origin_id VARCHAR(64) NOT NULL,
        company_id INTEGER NULL REFERENCES companies(id) ON DELETE SET NULL,
        created_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT business_transactions_origin_unique UNIQUE (origin_type, origin_id)
      )`,
      { transaction },
    );

    await sequelize.query(
      `CREATE TABLE IF NOT EXISTS business_transaction_counters (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_value BIGINT NOT NULL CHECK (last_value >= 0)
      )`,
      { transaction },
    );
    await sequelize.query(
      `INSERT INTO business_transaction_counters (id, last_value)
       VALUES (1, 0) ON CONFLICT (id) DO NOTHING`,
      { transaction },
    );

    for (const table of referenceColumns) {
      await sequelize.query(
        `ALTER TABLE "${table}"
         ADD COLUMN IF NOT EXISTS business_transaction_id BIGINT NULL`,
        { transaction },
      );
      await sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_${table}_business_transaction_id
         ON "${table}" (business_transaction_id)`,
        { transaction },
      );
      await sequelize.query(
        `DO $$
         BEGIN
           IF NOT EXISTS (
             SELECT 1 FROM pg_constraint
             WHERE conname = 'fk_${table}_business_transaction'
           ) THEN
             ALTER TABLE "${table}"
             ADD CONSTRAINT fk_${table}_business_transaction
             FOREIGN KEY (business_transaction_id)
             REFERENCES business_transactions(id) ON DELETE RESTRICT;
           END IF;
         END $$`,
        { transaction },
      );
    }

    await sequelize.query(
      `ALTER TABLE quotations ADD COLUMN IF NOT EXISTS enquiry_id UUID NULL`,
      { transaction },
    );
    await sequelize.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotations_enquiry'
         ) THEN
           ALTER TABLE quotations
           ADD CONSTRAINT fk_quotations_enquiry
           FOREIGN KEY (enquiry_id) REFERENCES enquiries(id) ON DELETE SET NULL;
         END IF;
       END $$`,
      { transaction },
    );
    await sequelize.query(
      'CREATE INDEX IF NOT EXISTS idx_quotations_enquiry_id ON quotations(enquiry_id)',
      { transaction },
    );

    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_enquiries_business_transaction
       ON enquiries(business_transaction_id)
       WHERE business_transaction_id IS NOT NULL`,
      { transaction },
    );
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_manual_sales_contract_business_transaction
       ON sales_contracts(business_transaction_id)
       WHERE business_transaction_id IS NOT NULL AND enquiry_id IS NULL`,
      { transaction },
    );
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_standalone_mtt_business_transaction
       ON purchase_contracts(business_transaction_id)
       WHERE business_transaction_id IS NOT NULL
         AND sales_contract_id IS NULL AND purchase_type = 'MTT'`,
      { transaction },
    );

    await sequelize.query(
      `CREATE OR REPLACE FUNCTION prevent_business_transaction_delete()
       RETURNS trigger AS $$
       BEGIN
         RAISE EXCEPTION 'Business transactions and allocated references cannot be deleted';
       END;
       $$ LANGUAGE plpgsql`,
      { transaction },
    );
    await sequelize.query(
      `DROP TRIGGER IF EXISTS business_transactions_no_delete ON business_transactions`,
      { transaction },
    );
    await sequelize.query(
      `CREATE TRIGGER business_transactions_no_delete
       BEFORE DELETE ON business_transactions
       FOR EACH ROW EXECUTE FUNCTION prevent_business_transaction_delete()`,
      { transaction },
    );
    await sequelize.query(
      `CREATE OR REPLACE FUNCTION prevent_business_reference_change()
       RETURNS trigger AS $$
       BEGIN
         IF NEW.business_reference IS DISTINCT FROM OLD.business_reference
            OR NEW.origin_type IS DISTINCT FROM OLD.origin_type
            OR NEW.origin_id IS DISTINCT FROM OLD.origin_id THEN
           RAISE EXCEPTION 'Business transaction identity is immutable';
         END IF;
         RETURN NEW;
       END;
       $$ LANGUAGE plpgsql`,
      { transaction },
    );
    await sequelize.query(
      `DROP TRIGGER IF EXISTS business_transactions_reference_immutable ON business_transactions`,
      { transaction },
    );
    await sequelize.query(
      `CREATE TRIGGER business_transactions_reference_immutable
       BEFORE UPDATE OF business_reference, origin_type, origin_id ON business_transactions
       FOR EACH ROW EXECUTE FUNCTION prevent_business_reference_change()`,
      { transaction },
    );

    const roots = await sequelize.query<{
      root_type: string;
      root_id: string;
      company_id: number | null;
      created_at: Date;
    }>(
      `SELECT 'Enquiry' AS root_type, id::text AS root_id, company_id, created_at
         FROM enquiries WHERE status = 'CONFIRMED' AND deleted_at IS NULL
       UNION ALL
       SELECT 'SalesContract', id::text, company_id, created_at
         FROM sales_contracts
         WHERE enquiry_id IS NULL AND status = 'Active'
       UNION ALL
       SELECT 'PurchaseContract', id::text, company_id, created_at
         FROM purchase_contracts
         WHERE sales_contract_id IS NULL AND purchase_type = 'MTT'
           AND status = 'In Progress'
       ORDER BY created_at, root_type, root_id`,
      { type: QueryTypes.SELECT, transaction },
    );

    for (const root of roots) {
      const [counterRows] = await sequelize.query<{ last_value: string }>(
        `UPDATE business_transaction_counters
         SET last_value = last_value + 1 WHERE id = 1
         RETURNING last_value`,
        { type: QueryTypes.SELECT, transaction },
      );
      const reference = `REF-${String(counterRows.last_value).padStart(6, '0')}`;
      const [inserted] = await sequelize.query<{ id: string }>(
        `INSERT INTO business_transactions
           (business_reference, origin_type, origin_id, company_id, created_at)
         VALUES (:reference, :rootType, :rootId, :companyId, :createdAt)
         RETURNING id`,
        {
          replacements: {
            reference,
            rootType: root.root_type,
            rootId: root.root_id,
            companyId: root.company_id,
            createdAt: root.created_at,
          },
          type: QueryTypes.SELECT,
          transaction,
        },
      );
      const businessTransactionId = inserted.id;
      const table =
        root.root_type === 'Enquiry'
          ? 'enquiries'
          : root.root_type === 'SalesContract'
            ? 'sales_contracts'
            : 'purchase_contracts';
      await sequelize.query(
        `UPDATE "${table}" SET business_transaction_id = :businessTransactionId
         WHERE id::text = :rootId`,
        {
          replacements: { businessTransactionId, rootId: root.root_id },
          transaction,
        },
      );
    }

    await sequelize.query(
      `UPDATE sales_contracts sc
       SET business_transaction_id = e.business_transaction_id
       FROM enquiries e
       WHERE sc.enquiry_id = e.id
         AND sc.business_transaction_id IS NULL
         AND e.business_transaction_id IS NOT NULL`,
      { transaction },
    );
    await sequelize.query(
      `UPDATE purchase_contracts pc
       SET business_transaction_id = sc.business_transaction_id
       FROM sales_contracts sc
       WHERE pc.sales_contract_id = sc.id
         AND pc.business_transaction_id IS NULL
         AND sc.business_transaction_id IS NOT NULL`,
      { transaction },
    );
    await sequelize.query(
      `UPDATE sales_contract_shipments s
       SET business_transaction_id = sc.business_transaction_id
       FROM sales_contracts sc
       WHERE s.sales_contract_id = sc.id
         AND s.business_transaction_id IS NULL
         AND sc.business_transaction_id IS NOT NULL`,
      { transaction },
    );
    await sequelize.query(
      `UPDATE logistics l
       SET business_transaction_id = e.business_transaction_id
       FROM enquiries e
       WHERE l.enquiry_id = e.id
         AND l.business_transaction_id IS NULL
         AND e.business_transaction_id IS NOT NULL`,
      { transaction },
    );
    await sequelize.query(
      `UPDATE freight_quotes fq
       SET business_transaction_id = l.business_transaction_id
       FROM logistics l
       WHERE fq.logistics_id = l.id
         AND fq.business_transaction_id IS NULL
         AND l.business_transaction_id IS NOT NULL`,
      { transaction },
    );
    await sequelize.query(
      `UPDATE cargo_availability ca
       SET business_transaction_id = pc.business_transaction_id
       FROM purchase_contracts pc
       WHERE ca.purchase_contract_id = pc.id
         AND ca.business_transaction_id IS NULL
         AND pc.business_transaction_id IS NOT NULL`,
      { transaction },
    );
    await sequelize.query(
      `UPDATE cargo_loading cl
       SET business_transaction_id = s.business_transaction_id
       FROM sales_contract_shipments s
       WHERE cl.shipment_id = s.id
         AND cl.business_transaction_id IS NULL
         AND s.business_transaction_id IS NOT NULL`,
      { transaction },
    );
    await sequelize.query(
      `UPDATE quotations q
       SET business_transaction_id = e.business_transaction_id
       FROM enquiries e
       WHERE q.enquiry_id = e.id
         AND q.business_transaction_id IS NULL
         AND e.business_transaction_id IS NOT NULL`,
      { transaction },
    );

    await sequelize.query(
      `CREATE OR REPLACE FUNCTION prevent_business_transaction_reassignment()
       RETURNS trigger AS $$
       BEGIN
         IF OLD.business_transaction_id IS NOT NULL
            AND NEW.business_transaction_id IS DISTINCT FROM OLD.business_transaction_id THEN
           RAISE EXCEPTION 'Business Transaction links are immutable once assigned';
         END IF;
         RETURN NEW;
       END;
       $$ LANGUAGE plpgsql`,
      { transaction },
    );
    for (const table of referenceColumns) {
      await sequelize.query(
        `DROP TRIGGER IF EXISTS ${table}_business_transaction_immutable ON "${table}"`,
        { transaction },
      );
      await sequelize.query(
        `CREATE TRIGGER ${table}_business_transaction_immutable
         BEFORE UPDATE OF business_transaction_id ON "${table}"
         FOR EACH ROW EXECUTE FUNCTION prevent_business_transaction_reassignment()`,
        { transaction },
      );
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;
  const transaction = await sequelize.transaction();
  try {
    await sequelize.query(
      'LOCK TABLE business_transactions IN ACCESS EXCLUSIVE MODE',
      { transaction },
    );
    const rows = await sequelize.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM business_transactions',
      { type: QueryTypes.SELECT, transaction },
    );
    if (Number(rows[0]?.count ?? 0) > 0) {
      throw new Error(
        'Cannot roll back phase 48 after Business Transactions have been created; preserve permanent references and use a forward migration.',
      );
    }

    for (const table of referenceColumns) {
      await sequelize.query(
        `DROP TRIGGER IF EXISTS ${table}_business_transaction_immutable ON "${table}"`,
        { transaction },
      );
    }
    await sequelize.query(
      'DROP FUNCTION IF EXISTS prevent_business_transaction_reassignment()',
      { transaction },
    );
    await sequelize.query(
      'DROP TRIGGER IF EXISTS business_transactions_reference_immutable ON business_transactions',
      { transaction },
    );
    await sequelize.query(
      'DROP TRIGGER IF EXISTS business_transactions_no_delete ON business_transactions',
      { transaction },
    );
    await sequelize.query('DROP FUNCTION IF EXISTS prevent_business_reference_change()', {
      transaction,
    });
    await sequelize.query('DROP FUNCTION IF EXISTS prevent_business_transaction_delete()', {
      transaction,
    });

    await sequelize.query(
      'DROP INDEX IF EXISTS uq_standalone_mtt_business_transaction',
      { transaction },
    );
    await sequelize.query(
      'DROP INDEX IF EXISTS uq_manual_sales_contract_business_transaction',
      { transaction },
    );
    await sequelize.query(
      'DROP INDEX IF EXISTS uq_enquiries_business_transaction',
      { transaction },
    );

    for (const table of [...referenceColumns].reverse()) {
      await queryInterface.removeColumn(table, 'business_transaction_id', {
        transaction,
      });
    }
    await queryInterface.removeColumn('quotations', 'enquiry_id', {
      transaction,
    });
    await queryInterface.dropTable('business_transaction_counters', {
      transaction,
    });
    await queryInterface.dropTable('business_transactions', { transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
