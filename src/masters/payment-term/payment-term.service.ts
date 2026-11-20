import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Sequelize } from 'sequelize';
import { PaymentTerm } from './payment-term.model';
import { CreatePaymentTermDto } from './dto/create-payment-term.dto';
import { UpdatePaymentTermDto } from './dto/update-payment-term.dto';
import { QueryPaymentTermDto } from './dto/query-payment-term.dto';

@Injectable()
export class PaymentTermService {
  constructor(
    @InjectModel(PaymentTerm)
    private readonly model: typeof PaymentTerm,
  ) {}

  async create(dto: CreatePaymentTermDto, user?: any): Promise<PaymentTerm> {
    const trimmedName = (dto.name || '').trim();
    if (!trimmedName) {
      throw new BadRequestException('Payment Term name cannot be empty');
    }

    // Prevent duplicate Payment Terms (case-insensitive)
    const existingByName = await this.model.findOne({
      where: Sequelize.where(
        Sequelize.fn('LOWER', Sequelize.fn('TRIM', Sequelize.col('name'))),
        trimmedName.toLowerCase(),
      ),
    });

    if (existingByName) {
      throw new BadRequestException(`Payment Term "${trimmedName}" already exists`);
    }

    // Auto-generate code if not provided
    let code = (dto.code || '').trim().toUpperCase();
    if (!code) {
      const baseCode =
        trimmedName
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 40) || 'PT';

      code = baseCode;
      let counter = 1;
      while (await this.model.findOne({ where: { code } })) {
        code = `${baseCode.slice(0, 35)}_${counter++}`;
      }
    } else {
      const existingByCode = await this.model.findOne({ where: { code } });
      if (existingByCode) {
        throw new BadRequestException(`Payment Term Code "${code}" already exists`);
      }
    }

    // Auto-extract credit days if not given (e.g. "30 Days Credit" -> 30)
    let creditDays = dto.creditDays ?? 0;
    if (!dto.creditDays) {
      const match = trimmedName.match(/^(\d+)\s*days?/i);
      if (match) {
        creditDays = parseInt(match[1], 10);
      }
    }

    return this.model.create({
      ...dto,
      code,
      name: trimmedName,
      creditDays,
      status: dto.status || 'Active',
      createdBy: user?.userId,
      companyId: user?.companyId,
    } as any);
  }

  async findAll(query: QueryPaymentTermDto & { companyId?: number }) {
    const { search, status, page, limit, companyId } = query;
    const isUnpaginated = !page && !limit;
    const effectiveLimit = limit ? Number(limit) : isUnpaginated ? 1000 : 10;
    const effectivePage = page ? Number(page) : 1;
    const offset = (effectivePage - 1) * effectiveLimit;

    const whereConditions: any[] = [];

    // Filter by active status by default unless status is specified
    if (status !== undefined) {
      if (status !== 'all' && status !== '') {
        whereConditions.push({ status });
      }
    } else {
      whereConditions.push({ status: 'Active' });
    }

    // Search query on code or name
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      whereConditions.push({
        [Op.or]: [
          { code: { [Op.iLike]: term } },
          { name: { [Op.iLike]: term } },
        ],
      });
    }

    // Company tenancy: terms for this company OR global terms (companyId is null)
    if (companyId) {
      whereConditions.push({
        [Op.or]: [{ companyId }, { companyId: null }],
      });
    }

    const whereClause = whereConditions.length > 0 ? { [Op.and]: whereConditions } : {};

    const { rows, count } = await this.model.findAndCountAll({
      where: whereClause,
      limit: effectiveLimit,
      offset,
      order: [
        ['sortOrder', 'ASC'],
        ['name', 'ASC'],
        ['createdAt', 'DESC'],
      ],
    });

    return {
      data: rows,
      total: count,
      page: effectivePage,
      limit: effectiveLimit,
      totalPages: Math.ceil(count / effectiveLimit),
    };
  }

  async findOne(id: number, companyId?: number): Promise<PaymentTerm> {
    const whereConditions: any[] = [{ id, status: 'Active' }];
    if (companyId) {
      whereConditions.push({
        [Op.or]: [{ companyId }, { companyId: null }],
      });
    }

    const item = await this.model.findOne({
      where: { [Op.and]: whereConditions },
    });
    if (!item) {
      throw new NotFoundException('Payment Term not found');
    }
    return item;
  }

  async update(
    id: number,
    dto: UpdatePaymentTermDto,
    user?: any,
  ): Promise<PaymentTerm> {
    const item = await this.findOne(id, user?.companyId);

    if (dto.code) {
      dto.code = dto.code.trim().toUpperCase();
      const existing = await this.model.findOne({
        where: { code: dto.code, id: { [Op.ne]: id } },
      });
      if (existing) {
        throw new BadRequestException('Payment Term Code already exists');
      }
    }

    if (dto.name) {
      dto.name = dto.name.trim();
      const existingByName = await this.model.findOne({
        where: {
          id: { [Op.ne]: id },
          ...Sequelize.where(
            Sequelize.fn('LOWER', Sequelize.fn('TRIM', Sequelize.col('name'))),
            dto.name.toLowerCase(),
          ),
        },
      });
      if (existingByName) {
        throw new BadRequestException(`Payment Term "${dto.name}" already exists`);
      }
    }

    await item.update({
      ...dto,
      updatedBy: user?.userId,
    });
    return item.reload();
  }

  async remove(id: number, user?: any): Promise<PaymentTerm> {
    const item = await this.findOne(id, user?.companyId);
    await item.update({ status: 'Inactive', updatedBy: user?.userId });
    return item.reload();
  }

  async removePermanent(id: number, companyId?: number): Promise<void> {
    const item = await this.findOne(id, companyId);
    await item.destroy();
  }
}
