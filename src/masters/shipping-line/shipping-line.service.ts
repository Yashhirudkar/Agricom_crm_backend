import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, fn, col } from 'sequelize';
import { ShippingLine } from './shipping-line.model';
import { Port, PortShippingLine } from '../port/port.model';
import { CreateShippingLineDto } from './dto/create-shipping-line.dto';
import { UpdateShippingLineDto } from './dto/update-shipping-line.dto';
import { QueryShippingLineDto } from './dto/query-shipping-line.dto';

@Injectable()
export class ShippingLineService {
  constructor(
    @InjectModel(ShippingLine)
    private readonly shippingLineModel: typeof ShippingLine,
    @InjectModel(PortShippingLine)
    private readonly portShippingLineModel: typeof PortShippingLine,
  ) {}

  async findAll(query: QueryShippingLineDto) {
    const where: any = {};

    if (query.isActive !== undefined && query.isActive !== 'all' && query.isActive !== '') {
      where.isActive = String(query.isActive) === 'true';
    }

    if (query.search) {
      const q = `%${query.search.trim().toLowerCase()}%`;
      where[Op.or] = [
        { lineName: { [Op.iLike]: q } },
        { lineCode: { [Op.iLike]: q } },
        { contactEmail: { [Op.iLike]: q } },
      ];
    }

    const page = query.page ? Math.max(1, parseInt(query.page)) : 1;
    const limit = query.limit ? Math.max(1, parseInt(query.limit)) : 50;
    const offset = (page - 1) * limit;

    const { count, rows } = await this.shippingLineModel.findAndCountAll({
      where,
      order: [['lineName', 'ASC']],
      limit,
      offset,
      distinct: true,
      include: [
        {
          model: PortShippingLine,
          as: 'portMappings',
          attributes: ['id', 'portId'],
          include: [
            {
              model: Port,
              as: 'port',
              attributes: ['id', 'portName', 'portType', 'countryId'],
            },
          ],
        },
      ],
    });

    const items = rows.map((r: any) => {
      const json = r.toJSON();
      const ports = (json.portMappings || []).map((m: any) => m.port).filter(Boolean);
      return {
        ...json,
        name: json.lineName,
        code: json.lineCode,
        portsCount: ports.length,
        ports,
      };
    });

    // Compute stats
    const totalCount = await this.shippingLineModel.count();
    const activeCount = await this.shippingLineModel.count({ where: { isActive: true } });

    return {
      data: items,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit) || 1,
      stats: {
        total: totalCount,
        active: activeCount,
        inactive: totalCount - activeCount,
      },
    };
  }

  async findOne(id: number) {
    const item = await this.shippingLineModel.findByPk(id, {
      include: [
        {
          model: PortShippingLine,
          as: 'portMappings',
          include: [
            {
              model: Port,
              as: 'port',
            },
          ],
        },
      ],
    });

    if (!item) {
      throw new NotFoundException(`Shipping Line with ID ${id} not found`);
    }

    const json = item.toJSON();
    const ports = (json.portMappings || []).map((m: any) => m.port).filter(Boolean);

    return {
      ...json,
      name: json.lineName,
      code: json.lineCode,
      portsCount: ports.length,
      ports,
    };
  }

  async create(dto: CreateShippingLineDto, user?: any) {
    const rawName = (dto.line_name || dto.lineName || '').trim();
    if (!rawName) {
      throw new BadRequestException('Shipping line name is required');
    }

    // Check unique (case-insensitive)
    const existing = await this.shippingLineModel.findOne({
      where: {
        lineName: { [Op.iLike]: rawName },
      },
    });

    if (existing) {
      throw new BadRequestException(`Shipping Line "${rawName}" already exists`);
    }

    const created = await this.shippingLineModel.create({
      lineName: rawName,
      lineCode: (dto.line_code || dto.lineCode || '').trim() || null,
      website: (dto.website || '').trim() || null,
      contactEmail: (dto.contact_email || dto.contactEmail || '').trim() || null,
      contactPhone: (dto.contact_phone || dto.contactPhone || '').trim() || null,
      isActive: dto.is_active !== undefined ? dto.is_active : dto.isActive !== undefined ? dto.isActive : true,
    } as any);

    return created;
  }

  async update(id: number, dto: UpdateShippingLineDto, user?: any) {
    const item = await this.shippingLineModel.findByPk(id);
    if (!item) {
      throw new NotFoundException(`Shipping Line with ID ${id} not found`);
    }

    const rawName = (dto.line_name || dto.lineName || '').trim();
    if (rawName && rawName.toLowerCase() !== item.lineName.toLowerCase()) {
      const existing = await this.shippingLineModel.findOne({
        where: {
          id: { [Op.ne]: id },
          lineName: { [Op.iLike]: rawName },
        },
      });
      if (existing) {
        throw new BadRequestException(`Shipping Line "${rawName}" already exists`);
      }
      item.lineName = rawName;
    }

    if (dto.line_code !== undefined || dto.lineCode !== undefined) {
      item.lineCode = (dto.line_code || dto.lineCode || '').trim() || null;
    }
    if (dto.website !== undefined) {
      item.website = (dto.website || '').trim() || null;
    }
    if (dto.contact_email !== undefined || dto.contactEmail !== undefined) {
      item.contactEmail = (dto.contact_email || dto.contactEmail || '').trim() || null;
    }
    if (dto.contact_phone !== undefined || dto.contactPhone !== undefined) {
      item.contactPhone = (dto.contact_phone || dto.contactPhone || '').trim() || null;
    }
    if (dto.is_active !== undefined || dto.isActive !== undefined) {
      item.isActive = dto.is_active !== undefined ? dto.is_active : !!dto.isActive;
    }

    await item.save();
    return item;
  }

  async toggleStatus(id: number) {
    const item = await this.shippingLineModel.findByPk(id);
    if (!item) {
      throw new NotFoundException(`Shipping Line with ID ${id} not found`);
    }
    item.isActive = !item.isActive;
    await item.save();
    return item;
  }

  async remove(id: number) {
    const item = await this.shippingLineModel.findByPk(id);
    if (!item) {
      throw new NotFoundException(`Shipping Line with ID ${id} not found`);
    }

    // Deleting shipping line removes relations (ON DELETE CASCADE in DB) but does not delete ports
    await this.portShippingLineModel.destroy({ where: { shippingLineId: id } });
    await item.destroy();

    return {
      success: true,
      message: `Shipping Line "${item.lineName}" deleted successfully. Ports remain intact.`,
    };
  }
}
