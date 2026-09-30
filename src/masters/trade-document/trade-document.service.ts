import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { TradeDocument } from './trade-document.model';
import { CreateTradeDocumentDto } from './dto/create-trade-document.dto';
import { UpdateTradeDocumentDto } from './dto/update-trade-document.dto';
import { QueryTradeDocumentDto } from './dto/query-trade-document.dto';

@Injectable()
export class TradeDocumentService {
  constructor(
    @InjectModel(TradeDocument)
    private readonly model: typeof TradeDocument,
  ) {}

  async create(dto: CreateTradeDocumentDto, user: any): Promise<TradeDocument> {
    if (dto.code) dto.code = dto.code.trim().toUpperCase();
    if (dto.name) dto.name = dto.name.trim();

    const whereCondition: any = { code: dto.code };
    if (user?.companyId) whereCondition.companyId = user.companyId;

    const existing = await this.model.findOne({
      where: whereCondition,
    });

    if (existing) {
      throw new BadRequestException('Trade Document Code already exists');
    }

    return this.model.create({
      ...dto,
      createdBy: user?.userId,
      companyId: user?.companyId,
    } as any);
  }

  async findAll(query: QueryTradeDocumentDto & { companyId?: number }) {
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

  async findOne(id: number, companyId?: number): Promise<TradeDocument> {
    const whereCondition: any = { id, status: 'Active' };
    if (companyId) whereCondition.companyId = companyId;

    const item = await this.model.findOne({
      where: whereCondition,
    });
    if (!item) {
      throw new NotFoundException('Trade Document not found');
    }
    return item;
  }

  async update(id: number, dto: UpdateTradeDocumentDto, user: any): Promise<TradeDocument> {
    const item = await this.findOne(id, user?.companyId);

    if (dto.code) {
      dto.code = dto.code.trim().toUpperCase();
      const checkCond: any = { code: dto.code, id: { [Op.ne]: id } };
      if (user?.companyId) checkCond.companyId = user.companyId;
      const existing = await this.model.findOne({
        where: checkCond,
      });
      if (existing) {
        throw new BadRequestException('Trade Document Code already exists');
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

  async remove(id: number, user?: any): Promise<TradeDocument> {
    const item = await this.findOne(id, user?.companyId);
    await item.update({ status: 'Inactive', updatedBy: user?.userId });
    return item.reload();
  }

  async removePermanent(id: number, companyId?: number): Promise<void> {
    const item = await this.findOne(id, companyId);
    await item.destroy();
  }
}
