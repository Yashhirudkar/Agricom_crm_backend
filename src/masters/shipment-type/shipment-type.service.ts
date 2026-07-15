import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { ShipmentType } from './shipment-type.model';
import { CreateShipmentTypeDto } from './dto/create-shipment-type.dto';
import { UpdateShipmentTypeDto } from './dto/update-shipment-type.dto';
import { QueryShipmentTypeDto } from './dto/query-shipment-type.dto';

@Injectable()
export class ShipmentTypeService {
  constructor(
    @InjectModel(ShipmentType)
    private readonly model: typeof ShipmentType,
  ) {}

  async create(dto: CreateShipmentTypeDto, user: any): Promise<ShipmentType> {
    if (dto.code) dto.code = dto.code.trim().toUpperCase();
    if (dto.name) dto.name = dto.name.trim();

    const existing = await this.model.findOne({
      where: { code: dto.code },
    });

    if (existing) {
      throw new BadRequestException('Shipment Type Code already exists');
    }

    return this.model.create({
      ...dto,
      createdBy: user?.userId,
    });
  }

  async findAll(query: QueryShipmentTypeDto) {
    const { search, status, page = 1, limit = 10 } = query;
    const offset = (page - 1) * limit;

    const whereClause: any = {};
    if (search) {
      whereClause[Op.or] = [
        { code: { [Op.iLike]: `%${search}%` } },
        { name: { [Op.iLike]: `%${search}%` } },
      ];
    }
    if (status !== undefined) {
      whereClause.status = status;
    }

    const { rows, count } = await this.model.findAndCountAll({
      where: whereClause,
      limit: Number(limit),
      offset: Number(offset),
      order: [['sortOrder', 'ASC'], ['createdAt', 'DESC']],
    });

    return {
      data: rows,
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / limit),
    };
  }

  async findOne(id: number): Promise<ShipmentType> {
    const item = await this.model.findOne({
      where: { id, status: 'Active' },
    });
    if (!item) {
      throw new NotFoundException('Shipment Type not found');
    }
    return item;
  }

  async update(id: number, dto: UpdateShipmentTypeDto, user: any): Promise<ShipmentType> {
    const item = await this.findOne(id);

    if (dto.code) {
      dto.code = dto.code.trim().toUpperCase();
      const existing = await this.model.findOne({
        where: { code: dto.code, id: { [Op.ne]: id } },
      });
      if (existing) {
        throw new BadRequestException('Shipment Type Code already exists');
      }
    }

    if (dto.name) {
      dto.name = dto.name.trim();
    }

    await item.update({
      ...dto,
      updatedBy: user?.userId,
    });
    return item.reload();
  }

  async remove(id: number, user?: any): Promise<ShipmentType> {
    const item = await this.findOne(id);
    await item.update({ status: 'Inactive', updatedBy: user?.userId });
    return item.reload();
  }

  async removePermanent(id: number): Promise<void> {
    const item = await this.findOne(id);
    await item.destroy();
  }
}
