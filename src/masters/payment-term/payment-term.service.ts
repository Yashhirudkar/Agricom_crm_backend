import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
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

  async create(dto: CreatePaymentTermDto, user: any): Promise<PaymentTerm> {
    if (dto.code) dto.code = dto.code.trim().toUpperCase();
    if (dto.name) dto.name = dto.name.trim();

    const whereCondition: any = { code: dto.code };
    if (user?.companyId) whereCondition.companyId = user.companyId;

    const existing = await this.model.findOne({
      where: whereCondition,
    });

    if (existing) {
      throw new BadRequestException('Payment Term Code already exists');
    }

    return this.model.create({
      ...dto,
      createdBy: user?.userId,
      companyId: user?.companyId,
    });
  }

  async findAll(query: QueryPaymentTermDto & { companyId?: number }) {
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

  async findOne(id: number, companyId?: number): Promise<PaymentTerm> {
    const whereCondition: any = { id, status: 'Active' };
    if (companyId) whereCondition.companyId = companyId;

    const item = await this.model.findOne({
      where: whereCondition,
    });
    if (!item) {
      throw new NotFoundException('Payment Term not found');
    }
    return item;
  }

  async update(
    id: number,
    dto: UpdatePaymentTermDto,
    user: any,
  ): Promise<PaymentTerm> {
    const item = await this.findOne(id, user?.companyId);

    if (dto.code) {
      dto.code = dto.code.trim().toUpperCase();
      const checkCond: any = { code: dto.code, id: { [Op.ne]: id } };
      if (user?.companyId) checkCond.companyId = user.companyId;
      const existing = await this.model.findOne({
        where: checkCond,
      });
      if (existing) {
        throw new BadRequestException('Payment Term Code already exists');
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
