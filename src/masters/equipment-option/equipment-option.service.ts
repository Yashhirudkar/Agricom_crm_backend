import {
  Injectable,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { EquipmentOption } from './equipment-option.model';

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
  ) { }

  async onModuleInit() {
    await this.autoSeedDefaults();
  }

  public async autoSeedDefaults() {
    try {
      await this.equipmentOptionModel.sync();
      const count = await this.equipmentOptionModel.count();
      if (count === 0) {
        const rowsToInsert: any[] = [];
        for (const [category, values] of Object.entries(DEFAULT_EQUIPMENT_SEED)) {
          values.forEach((value, idx) => {
            rowsToInsert.push({
              category,
              value,
              displayOrder: idx + 1,
              isActive: true,
            });
          });
        }
        if (rowsToInsert.length > 0) {
          await this.equipmentOptionModel.bulkCreate(rowsToInsert);
        }
      }
    } catch (err: any) {
      console.warn('[EquipmentOptionService] Auto-seed warning:', err.message);
    }
  }

  async findAll(category?: string) {
    await this.autoSeedDefaults();
    const where: any = { isActive: true };
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

  async create(dto: { category: string; value: string }) {
    if (!dto.category || !dto.category.trim()) {
      throw new BadRequestException('Category is required');
    }
    if (!dto.value || !dto.value.trim()) {
      throw new BadRequestException('Option value is required');
    }

    const category = dto.category.trim().toUpperCase();
    const value = dto.value.trim();

    if (value.length > 100) {
      throw new BadRequestException('Option value cannot exceed 100 characters');
    }

    // Case-insensitive duplicate check within same category
    const existing = await this.equipmentOptionModel.findOne({
      where: {
        category,
        value: { [Op.iLike]: value },
      },
    });

    if (existing) {
      throw new BadRequestException(`"${value}" already exists in ${category}.`);
    }

    const maxOrderRes: any = await this.equipmentOptionModel.max('displayOrder', {
      where: { category },
    });
    const displayOrder = (typeof maxOrderRes === 'number' ? maxOrderRes : 0) + 1;

    return await this.equipmentOptionModel.create({
      category,
      value,
      displayOrder,
      isActive: true,
    } as any);
  }
}
