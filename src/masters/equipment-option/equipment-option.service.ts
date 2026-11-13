import { Injectable, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { EquipmentOption } from './equipment-option.model';
import { measureStartupStep } from '../../common/startup-timing';

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
  TRUCK_CAPACITY: [
    '1 MT',
    '2 MT',
    '3 MT',
    '5 MT',
    '7 MT',
    '9 MT',
    '10 MT',
    '12 MT',
    '15 MT',
    '18 MT',
    '20 MT',
    '25 MT',
    '30 MT',
    '35 MT',
    '40 MT',
  ],
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
      if (existing) {
        await transaction.commit();
        return;
      }

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
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error('[EquipmentOptionService] Auto-seed failed:', error);
      throw error;
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
    return await this.equipmentOptionModel.findAll({
      where,
      order: [
        ['category', 'ASC'],
        ['displayOrder', 'ASC'],
        ['id', 'ASC'],
      ],
    });
  }

  async create(dto: { category: string; value: string }, companyId?: number) {
    if (!dto.category || !dto.category.trim()) {
      throw new BadRequestException('Category is required');
    }
    if (!dto.value || !dto.value.trim()) {
      throw new BadRequestException('Option value is required');
    }

    const category = dto.category.trim().toUpperCase();
    const value = dto.value.trim();

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
      throw new BadRequestException(
        `"${value}" already exists in ${category}.`,
      );
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
