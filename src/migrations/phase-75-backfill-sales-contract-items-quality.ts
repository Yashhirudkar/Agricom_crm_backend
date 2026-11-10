import { QueryInterface } from 'sequelize';

export const phase = '75';
export const name = 'backfill-sales-contract-items-quality';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    // 1. Backfill quality from sales_contracts.print_overrides (quality_0, quality_1, etc.)
    await queryInterface.sequelize.query(
      `UPDATE sales_contract_items
       SET quality = TRIM(COALESCE(
         NULLIF(sc.print_overrides->>('quality_' || ir.item_idx), ''),
         NULLIF(sc.print_overrides->>'quality_0', '')
       ))
       FROM (
         SELECT id, sales_contract_id,
                (ROW_NUMBER() OVER (PARTITION BY sales_contract_id ORDER BY id ASC) - 1) as item_idx
         FROM sales_contract_items
       ) ir
       JOIN sales_contracts sc ON sc.id = ir.sales_contract_id
       WHERE sales_contract_items.id = ir.id
         AND (sales_contract_items.quality IS NULL OR TRIM(sales_contract_items.quality) = '')
         AND sc.print_overrides IS NOT NULL
         AND (
           (sc.print_overrides ? ('quality_' || ir.item_idx) AND TRIM(sc.print_overrides->>('quality_' || ir.item_idx)) <> '')
           OR (sc.print_overrides ? 'quality_0' AND TRIM(sc.print_overrides->>'quality_0') <> '')
         );`,
      { transaction },
    );

    // 2. Backfill from linked enquiry purity if quality is still null or empty
    await queryInterface.sequelize.query(
      `UPDATE sales_contract_items
       SET quality = TRIM(e.purity)
       FROM sales_contracts sc
       JOIN enquiries e ON sc.enquiry_id = e.id
       WHERE sales_contract_items.sales_contract_id = sc.id
         AND (sales_contract_items.quality IS NULL OR TRIM(sales_contract_items.quality) = '')
         AND e.purity IS NOT NULL
         AND TRIM(e.purity) <> '';`,
      { transaction },
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Backfill cannot be cleanly reverted without knowing which rows previously had null quality
}

