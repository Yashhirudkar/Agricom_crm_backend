import { Injectable, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { EquipmentOption } from './equipment-option.model';
import { measureStartupStep } from '../../common/startup-timing';
import {
  DEFAULT_TRUCK_CAPACITIES,
  normalizeTruckCapacity,
  canonicalCapacityKey,
  extractCapacityNumber,
} from '../../common/utils/truck-capacity.util';

export const DEFAULT_EQUIPMENT_SEED: Record<string, string[]> = {
  TRUCK_TYPE: [
    'Mini Truck',
    'Pickup',
    'Tata Ace',
    '14 FT Truck',
    '17 FT Truck',
    '20 FT Truck',
    '22 FT Truck',
    '24 FT Truck',
    '32 FT Single Axle',
    '32 FT Multi Axle',
    'Trailer',
    'Flatbed Trailer',
    'Low Bed Trailer',
    'Hydraulic Trailer',
    'Tanker',
    'Refrigerated Truck',
    'Open Body Truck',
    'Closed Body Truck',
  ],
  TRUCK_CAPACITY: DEFAULT_TRUCK_CAPACITIES,
  CONTAINER_TYPE: [
    'Standard (Dry)',
    'High Cube',
    'Open Top',
    'Hard Top',
    'Flat Rack',
    'Platform',
    'Reefer',
    'Ventilated',
    'Tank Container',
  ],
  CONTAINER_SIZE: [
    '10 FT',
    '20 FT',
    '40 FT',
    '40 FT High Cube',
    '45 FT High Cube',
  ],
  WAGON_TYPE: [
    'BOXN',
    'BOXNHL',
    'BCN',
    'BTPN',
    'BRN',
    'Flat Wagon',
    'Covered Wagon',
    'Tank Wagon',
    'Hopper Wagon',
    'Parcel Van',
  ],
  WAGON_CAPACITY: [
    '20 MT',
    '30 MT',
    '40 MT',
    '50 MT',
    '60 MT',
    '70 MT',
    '80 MT',
  ],
};

@Injectable()
export class EquipmentOptionService implements OnModuleInit {
  constructor(
    @InjectModel(EquipmentOption)
    private readonly equipmentOptionModel: typeof EquipmentOption,
  ) {}

  async onModuleInit() {
    await measureStartupStep('EquipmentOptionService.autoSeedDefaults()', () =>
      this.autoSeedDefaults(),
    );
  }

  public async autoSeedDefaults() {
    const transaction = await this.equipmentOptionModel.sequelize.transaction();
    try {
      await this.equipmentOptionModel.sequelize.query(
        `SELECT pg_advisory_xact_lock(hashtext('agricom_equipment_option_seed'))`,
        { transaction },
      );
      const existing = await this.equipmentOptionModel.findOne({
        attributes: ['id'],
        raw: true,
        transaction,
      });
      if (!existing) {
        const rowsToInsert = Object.entries(DEFAULT_EQUIPMENT_SEED).flatMap(
          ([category, values]) =>
            values.map((value, index) => ({
              category,
              value,
              displayOrder: index + 1,
              isActive: true,
            })),
        );
        if (rowsToInsert.length > 0) {
          await this.equipmentOptionModel.bulkCreate(rowsToInsert, {
            transaction,
          });
        }
      } else {
        // Ensure TRUCK_CAPACITY rows are normalized, deduplicated, and defaults exist
        await this.normalizeExistingData(transaction);
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error('[EquipmentOptionService] Auto-seed failed:', error);
      throw error;
    }
  }

  private async normalizeExistingData(transaction: any) {
    try {
      const options = await this.equipmentOptionModel.findAll({
        where: { category: 'TRUCK_CAPACITY' },
        transaction,
      });

      const seen = new Set<string>();
      for (const opt of options) {
        const norm = normalizeTruckCapacity(opt.value);
        const key = canonicalCapacityKey(norm);
        if (seen.has(key)) {
          // Remove duplicate record
          await opt.destroy({ transaction });
        } else {
          seen.add(key);
          if (opt.value !== norm) {
            await opt.update({ value: norm }, { transaction });
          }
        }
      }

      // Ensure all standard default capacities exist
      for (let i = 0; i < DEFAULT_TRUCK_CAPACITIES.length; i++) {
        const defCap = DEFAULT_TRUCK_CAPACITIES[i];
        const key = canonicalCapacityKey(defCap);
        if (!seen.has(key)) {
          seen.add(key);
          await this.equipmentOptionModel.create(
            {
              category: 'TRUCK_CAPACITY',
              value: defCap,
              displayOrder: i + 1,
              isActive: true,
            },
            { transaction },
          );
        }
      }

      // Normalize any existing truck_capacity in freight_quotes table
      const [quotes]: any = await this.equipmentOptionModel.sequelize.query(
        `SELECT id, truck_capacity FROM freight_quotes WHERE truck_capacity IS NOT NULL AND truck_capacity != ''`,
        { transaction },
      );
      if (Array.isArray(quotes)) {
        for (const q of quotes) {
          const raw = q.truck_capacity;
          const norm = normalizeTruckCapacity(raw);
          if (raw !== norm) {
            await this.equipmentOptionModel.sequelize.query(
              `UPDATE freight_quotes SET truck_capacity = :norm WHERE id = :id`,
              { replacements: { norm, id: q.id }, transaction },
            );
          }
        }
      }
      // Ensure charge_date column exists in freight_quote_charges
      await this.equipmentOptionModel.sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'freight_quote_charges' AND column_name = 'charge_date'
          ) THEN
            ALTER TABLE freight_quote_charges ADD COLUMN charge_date DATE;
          END IF;
        END $$;
      `, { transaction });
    } catch (err) {
      // Best-effort cleanup during startup
      console.warn('[EquipmentOptionService] Cleanup notice:', err?.message || err);
    }
  }

  async findAll(category?: string, companyId?: number) {
    const where: any = { isActive: true };
    if (companyId) {
      where.companyId = companyId;
    }
    if (category && category.trim()) {
      where.category = category.trim().toUpperCase();
    }
    const list = await this.equipmentOptionModel.findAll({
      where,
      order: [
        ['category', 'ASC'],
        ['displayOrder', 'ASC'],
        ['id', 'ASC'],
      ],
    });

    const isTruckCapacityQuery =
      category && category.trim().toUpperCase() === 'TRUCK_CAPACITY';

    // Normalize and deduplicate any TRUCK_CAPACITY records
    const seenCapacities = new Set<string>();
    const deduplicatedList: EquipmentOption[] = [];

    for (const item of list) {
      if (item.category === 'TRUCK_CAPACITY') {
        const norm = normalizeTruckCapacity(item.value);
        const key = canonicalCapacityKey(norm);
        if (seenCapacities.has(key)) {
          continue; // drop duplicate
        }
        seenCapacities.add(key);
        item.value = norm;
        deduplicatedList.push(item);
      } else {
        deduplicatedList.push(item);
      }
    }

    if (isTruckCapacityQuery) {
      deduplicatedList.sort((a, b) => {
        return extractCapacityNumber(a.value) - extractCapacityNumber(b.value);
      });
    }

    return deduplicatedList;
  }

  async create(dto: { category: string; value: string }, companyId?: number) {
    if (!dto.category || !dto.category.trim()) {
      throw new BadRequestException('Category is required');
    }
    if (!dto.value || !dto.value.trim()) {
      throw new BadRequestException('Option value is required');
    }

    const category = dto.category.trim().toUpperCase();
    let value = dto.value.trim();

    if (category === 'TRUCK_CAPACITY') {
      value = normalizeTruckCapacity(value);
      if (!value) {
        throw new BadRequestException('A valid truck capacity is required');
      }

      // Check for duplicate normalized value within same category & company
      const allCapacities = await this.equipmentOptionModel.findAll({
        where: companyId ? { category, companyId } : { category },
      });
      const targetKey = canonicalCapacityKey(value);
      const existing = allCapacities.find(
        (opt) => canonicalCapacityKey(opt.value) === targetKey,
      );

      if (existing) {
        // Requirement 4: If the normalized value already exists, do not create another record. Instead, select the existing one.
        return existing;
      }
    } else {
      if (value.length > 100) {
        throw new BadRequestException(
          'Option value cannot exceed 100 characters',
        );
      }

      // Case-insensitive duplicate check within same category
      const whereCondition: any = {
        category,
        value: { [Op.iLike]: value },
      };
      if (companyId) {
        whereCondition.companyId = companyId;
      }

      const existing = await this.equipmentOptionModel.findOne({
        where: whereCondition,
      });

      if (existing) {
        return existing;
      }
    }

    const maxOrderRes: any = await this.equipmentOptionModel.max(
      'displayOrder',
      {
        where: { category },
      },
    );
    const displayOrder =
      (typeof maxOrderRes === 'number' ? maxOrderRes : 0) + 1;

    return await this.equipmentOptionModel.create({
      category,
      value,
      displayOrder,
      isActive: true,
      companyId,
    });
  }
}
