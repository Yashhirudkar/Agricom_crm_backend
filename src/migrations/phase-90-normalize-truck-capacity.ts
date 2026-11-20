import { QueryInterface } from 'sequelize';
import {
  DEFAULT_TRUCK_CAPACITIES,
  normalizeTruckCapacity,
  canonicalCapacityKey,
} from '../common/utils/truck-capacity.util';

export const phase = '90';
export const name = 'normalize-truck-capacity';

export async function up(queryInterface: QueryInterface): Promise<void> {
  const sequelize = queryInterface.sequelize;

  // 1. Clean up, normalize, and deduplicate equipment_options for TRUCK_CAPACITY
  try {
    const [rows]: any = await sequelize.query(`
      SELECT id, category, value, display_order, is_active, company_id
      FROM equipment_options
      WHERE UPPER(category) = 'TRUCK_CAPACITY'
      ORDER BY id ASC
    `);

    if (Array.isArray(rows) && rows.length > 0) {
      const seen = new Set<string>();
      for (const row of rows) {
        const norm = normalizeTruckCapacity(row.value);
        const key = canonicalCapacityKey(norm);
        if (seen.has(key)) {
          // Delete duplicate
          await sequelize.query(
            `DELETE FROM equipment_options WHERE id = :id`,
            { replacements: { id: row.id } },
          );
        } else {
          seen.add(key);
          if (row.value !== norm) {
            await sequelize.query(
              `UPDATE equipment_options SET value = :norm WHERE id = :id`,
              { replacements: { norm, id: row.id } },
            );
          }
        }
      }

      // Ensure all DEFAULT_TRUCK_CAPACITIES exist
      for (let i = 0; i < DEFAULT_TRUCK_CAPACITIES.length; i++) {
        const defCap = DEFAULT_TRUCK_CAPACITIES[i];
        const key = canonicalCapacityKey(defCap);
        if (!seen.has(key)) {
          seen.add(key);
          await sequelize.query(
            `INSERT INTO equipment_options (category, value, display_order, is_active, created_at, updated_at)
             VALUES ('TRUCK_CAPACITY', :defCap, :order, true, NOW(), NOW())`,
            { replacements: { defCap, order: i + 1 } },
          );
        }
      }
    }
  } catch (err) {
    console.warn('[phase-90] Notice during equipment_options migration:', err?.message || err);
  }

  // 2. Normalize truck_capacity in freight_quotes
  try {
    const [quotes]: any = await sequelize.query(`
      SELECT id, truck_capacity
      FROM freight_quotes
      WHERE truck_capacity IS NOT NULL AND TRIM(truck_capacity) != ''
    `);

    if (Array.isArray(quotes) && quotes.length > 0) {
      for (const q of quotes) {
        const norm = normalizeTruckCapacity(q.truck_capacity);
        if (q.truck_capacity !== norm) {
          await sequelize.query(
            `UPDATE freight_quotes SET truck_capacity = :norm WHERE id = :id`,
            { replacements: { norm, id: q.id } },
          );
        }
      }
    }
  } catch (err) {
    console.warn('[phase-90] Notice during freight_quotes migration:', err?.message || err);
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Irreversible normalization
}
