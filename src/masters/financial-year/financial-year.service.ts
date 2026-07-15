import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { FinancialYear } from './financial-year.model';
import { CreateFinancialYearDto } from './dto/create-financial-year.dto';
import { UpdateFinancialYearDto } from './dto/update-financial-year.dto';
import { QueryFinancialYearDto } from './dto/query-financial-year.dto';

@Injectable()
export class FinancialYearService {
  constructor(
    @InjectModel(FinancialYear)
    private readonly model: typeof FinancialYear,
  ) {}

  async create(dto: CreateFinancialYearDto, user: any): Promise<FinancialYear> {
    if (dto.year) dto.year = dto.year.trim();
    if (dto.displayName) dto.displayName = dto.displayName.trim();

    const existing = await this.model.findOne({
      where: { year: dto.year },
    });

    if (existing) {
      throw new BadRequestException('Financial Year already exists');
    }

    if (dto.isCurrent) {
      await this.model.update(
        { isCurrent: false },
        { where: { isCurrent: true } },
      );
    }

    return this.model.create({
      ...dto,
      createdBy: user?.userId,
    });
  }

  async findAll(query: QueryFinancialYearDto) {
    const { search, status, page = 1, limit = 10 } = query;
    const offset = (page - 1) * limit;

    const whereClause: any = {};
    if (search) {
      whereClause.displayName = { [Op.iLike]: `%${search}%` };
    }
    if (status !== undefined) {
      whereClause.status = status;
    }

    const { rows, count } = await this.model.findAndCountAll({
      where: whereClause,
      limit: Number(limit),
      offset: Number(offset),
      order: [['createdAt', 'DESC']],
    });

    return {
      data: rows,
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / limit),
    };
  }

  async findOne(id: number): Promise<FinancialYear> {
    const item = await this.model.findOne({
      where: { id, status: 'Active' },
    });
    if (!item) {
      throw new NotFoundException('Financial Year not found');
    }
    return item;
  }

  async update(id: number, dto: UpdateFinancialYearDto, user: any): Promise<FinancialYear> {
    const item = await this.findOne(id);

    if (dto.year) {
      dto.year = dto.year.trim();
      const existing = await this.model.findOne({
        where: { year: dto.year, id: { [Op.ne]: id } },
      });
      if (existing) {
        throw new BadRequestException('Financial Year already exists');
      }
    }

    if (dto.displayName) {
      dto.displayName = dto.displayName.trim();
    }

    if (dto.isCurrent && !item.isCurrent) {
      await this.model.update(
        { isCurrent: false },
        { where: { isCurrent: true, id: { [Op.ne]: id } } },
      );
    }

    await item.update({
      ...dto,
      updatedBy: user?.userId,
    });
    return item.reload();
  }

  async remove(id: number, user?: any): Promise<FinancialYear> {
    const item = await this.findOne(id);
    await item.update({ status: 'Inactive', updatedBy: user?.userId });
    return item.reload();
  }

  async removePermanent(id: number): Promise<void> {
    const item = await this.findOne(id);
    await item.destroy();
  }
}
