import { QueryInterface } from 'sequelize';

export const phase = '49';
export const name = 'enforce-business-transaction-root-ownership';

const rootTableUpdateColumns: Record<string, string> = {
  enquiries: 'business_transaction_id',
  sales_contracts: 'business_transaction_id, enquiry_id',
  purchase_contracts:
    'business_transaction_id, sales_contract_id, purchase_type',
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;
  const transaction = await sequelize.transaction();

  try {
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_business_transactions_business_reference
       ON business_transactions (business_reference)`,
      { transaction },
    );
    await sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_business_transactions_origin
       ON business_transactions (origin_type, origin_id)`,
      { transaction },
    );
    await sequelize.query(
      `CREATE OR REPLACE FUNCTION enforce_business_transaction_root_owner()
       RETURNS trigger AS $$
       DECLARE
         transaction_origin_type VARCHAR(40);
         transaction_origin_id VARCHAR(64);
         parent_business_transaction_id BIGINT;
       BEGIN
         IF NEW.business_transaction_id IS NULL THEN
           RETURN NEW;
         END IF;

         SELECT origin_type, origin_id
           INTO transaction_origin_type, transaction_origin_id
           FROM business_transactions
          WHERE id = NEW.business_transaction_id
          FOR KEY SHARE;

         IF NOT FOUND THEN
           RAISE EXCEPTION 'Business Transaction % does not exist',
             NEW.business_transaction_id;
         END IF;

         IF TG_TABLE_NAME = 'enquiries' THEN
           IF transaction_origin_type <> 'Enquiry'
              OR transaction_origin_id <> NEW.id::text THEN
             RAISE EXCEPTION 'An Enquiry may only own its originating Business Transaction';
           END IF;
           IF (TG_OP = 'INSERT' OR OLD.business_transaction_id IS NULL)
              AND NEW.status <> 'CONFIRMED' THEN
             RAISE EXCEPTION 'Only a confirmed Enquiry may allocate a Business Transaction';
           END IF;
         ELSIF TG_TABLE_NAME = 'sales_contracts' THEN
           IF NEW.enquiry_id IS NULL THEN
             IF transaction_origin_type <> 'SalesContract'
                OR transaction_origin_id <> NEW.id::text THEN
               RAISE EXCEPTION 'A manual Sales Contract may only own its originating Business Transaction';
             END IF;
             IF (TG_OP = 'INSERT' OR OLD.business_transaction_id IS NULL)
                AND NEW.status <> 'Active' THEN
               RAISE EXCEPTION 'Only an active manual Sales Contract may allocate a Business Transaction';
             END IF;
           ELSE
             SELECT business_transaction_id
               INTO parent_business_transaction_id
               FROM enquiries
              WHERE id = NEW.enquiry_id
              FOR KEY SHARE;
             IF parent_business_transaction_id IS DISTINCT FROM NEW.business_transaction_id THEN
               RAISE EXCEPTION 'A Sales Contract linked to an Enquiry must inherit its Business Transaction';
             END IF;
           END IF;
         ELSIF TG_TABLE_NAME = 'purchase_contracts' THEN
           IF NEW.sales_contract_id IS NOT NULL THEN
             SELECT business_transaction_id
               INTO parent_business_transaction_id
               FROM sales_contracts
              WHERE id = NEW.sales_contract_id
              FOR KEY SHARE;
             IF parent_business_transaction_id IS DISTINCT FROM NEW.business_transaction_id THEN
               RAISE EXCEPTION 'A Purchase Contract linked to a Sales Contract must inherit its Business Transaction';
             END IF;
           ELSIF NEW.purchase_type = 'MTT' THEN
             IF transaction_origin_type <> 'PurchaseContract'
                OR transaction_origin_id <> NEW.id::text THEN
               RAISE EXCEPTION 'A standalone MTT Purchase Contract may only own its originating Business Transaction';
             END IF;
             IF (TG_OP = 'INSERT' OR OLD.business_transaction_id IS NULL)
                AND NEW.status <> 'In Progress' THEN
               RAISE EXCEPTION 'Only an in-progress standalone MTT Purchase Contract may allocate a Business Transaction';
             END IF;
           ELSE
             RAISE EXCEPTION 'Only a standalone MTT Purchase Contract may own a Business Transaction';
           END IF;
         END IF;

         RETURN NEW;
       END;
       $$ LANGUAGE plpgsql`,
      { transaction },
    );

    for (const [table, updateColumns] of Object.entries(
      rootTableUpdateColumns,
    )) {
      await sequelize.query(
        `DROP TRIGGER IF EXISTS ${table}_business_transaction_root_owner ON "${table}"`,
        { transaction },
      );
      await sequelize.query(
        `DROP TRIGGER IF EXISTS ${table}_business_transaction_root_owner_update ON "${table}"`,
        { transaction },
      );
      await sequelize.query(
        `CREATE TRIGGER ${table}_business_transaction_root_owner
         BEFORE INSERT
         ON "${table}"
         FOR EACH ROW
         EXECUTE FUNCTION enforce_business_transaction_root_owner()`,
        { transaction },
      );
      await sequelize.query(
        `CREATE TRIGGER ${table}_business_transaction_root_owner_update
         BEFORE UPDATE OF ${updateColumns}
         ON "${table}"
         FOR EACH ROW
         EXECUTE FUNCTION enforce_business_transaction_root_owner()`,
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
    for (const table of Object.keys(rootTableUpdateColumns)) {
      await sequelize.query(
        `DROP TRIGGER IF EXISTS ${table}_business_transaction_root_owner ON "${table}"`,
        { transaction },
      );
      await sequelize.query(
        `DROP TRIGGER IF EXISTS ${table}_business_transaction_root_owner_update ON "${table}"`,
        { transaction },
      );
    }
    await sequelize.query(
      'DROP FUNCTION IF EXISTS enforce_business_transaction_root_owner()',
      { transaction },
    );
    await sequelize.query(
      'DROP INDEX IF EXISTS uq_business_transactions_origin',
      { transaction },
    );
    await sequelize.query(
      'DROP INDEX IF EXISTS uq_business_transactions_business_reference',
      { transaction },
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
