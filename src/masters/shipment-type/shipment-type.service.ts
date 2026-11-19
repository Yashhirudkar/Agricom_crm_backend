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

    const whereCondition: any = { code: dto.code };
    if (user?.companyId) whereCondition.companyId = user.companyId;

    const existing = await this.model.findOne({
      where: whereCondition,
    });

    if (existing) {
      throw new BadRequestException('Shipment Type Code already exists');
    }

    const finalSequence =
      dto.sequence !== undefined
        ? Number(dto.sequence)
        : dto.stageOrder !== undefined
          ? Number(dto.stageOrder)
          : 1;

    return this.model.create({
      ...dto,
      sequence: finalSequence,
      stageOrder: finalSequence,
      locationType: dto.locationType || 'Port of Loading (POL)',
      purchaseContractDeliveryPlaceRequired:
        dto.purchaseContractDeliveryPlaceRequired !== undefined
          ? dto.purchaseContractDeliveryPlaceRequired
          : true,
      salesContractDeliveryPlaceRequired:
        dto.salesContractDeliveryPlaceRequired !== undefined
          ? dto.salesContractDeliveryPlaceRequired
          : true,
      createdBy: user?.userId,
      companyId: user?.companyId,
    });
  }

  async findAll(query: QueryShipmentTypeDto & { companyId?: number }) {
    const { search, status, page = 1, limit = 10, companyId } = query;
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
    if (companyId) {
      whereClause.companyId = companyId;
    }

    const { rows, count } = await this.model.findAndCountAll({
      where: whereClause,
      limit: Number(limit),
      offset: Number(offset),
      order: [
        ['sequence', 'ASC'],
        ['sortOrder', 'ASC'],
        ['createdAt', 'DESC'],
      ],
    });

    return {
      data: rows,
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / limit),
    };
  }

  async findOne(id: number, companyId?: number): Promise<ShipmentType> {
    const whereCondition: any = { id, status: 'Active' };
    if (companyId) whereCondition.companyId = companyId;

    const item = await this.model.findOne({
      where: whereCondition,
    });
    if (!item) {
      throw new NotFoundException('Shipment Type not found');
    }
    return item;
  }

  async update(
    id: number,
    dto: UpdateShipmentTypeDto,
    user: any,
  ): Promise<ShipmentType> {
    const item = await this.findOne(id, user?.companyId);

    if (dto.code) {
      dto.code = dto.code.trim().toUpperCase();
      const checkCond: any = { code: dto.code, id: { [Op.ne]: id } };
      if (user?.companyId) checkCond.companyId = user.companyId;
      const existing = await this.model.findOne({
        where: checkCond,
      });
      if (existing) {
        throw new BadRequestException('Shipment Type Code already exists');
      }
    }

    if (dto.name) {
      dto.name = dto.name.trim();
    }

    const updatePayload: any = { ...dto, updatedBy: user?.userId };
    if (dto.sequence !== undefined) {
      updatePayload.sequence = Number(dto.sequence);
      if (dto.stageOrder === undefined) {
        updatePayload.stageOrder = Number(dto.sequence);
      }
    } else if (dto.stageOrder !== undefined) {
      updatePayload.sequence = Number(dto.stageOrder);
      updatePayload.stageOrder = Number(dto.stageOrder);
    }

    await item.update(updatePayload);
    return item.reload();
  }

  async remove(id: number, user?: any): Promise<ShipmentType> {
    const item = await this.findOne(id, user?.companyId);
    await item.update({ status: 'Inactive', updatedBy: user?.userId });
    return item.reload();
  }

  async removePermanent(id: number, companyId?: number): Promise<void> {
    const item = await this.findOne(id, companyId);
    await item.destroy();
  }
}
