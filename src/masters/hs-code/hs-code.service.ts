import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { HSCode } from './hs-code.model';
import { CreateHSCodeDto } from './dto/create-hs-code.dto';
import { UpdateHSCodeDto } from './dto/update-hs-code.dto';
import { QueryHSCodeDto } from './dto/query-hs-code.dto';
import { DeletionValidatorService } from '../deletion-validator.service';
import { AuditService } from '../../audit/services/audit.service';

@Injectable()
export class HSCodeService {
  constructor(
    @InjectModel(HSCode)
    private readonly hsCodeModel: typeof HSCode,
    private readonly deletionValidator: DeletionValidatorService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateHSCodeDto): Promise<HSCode> {
    const normalizedCode = dto.code.trim().toUpperCase();

    const existing = await this.hsCodeModel.findOne({
      where: { code: normalizedCode },
    });

    if (existing) {
      throw new BadRequestException(
        `HS Code '${normalizedCode}' already exists`,
      );
    }

    return this.hsCodeModel.create({
      ...dto,
      code: normalizedCode,
    });
  }

  async findAll(query: QueryHSCodeDto) {
    const { search, isActive, page = 1, limit = 10 } = query;
    const offset = (page - 1) * limit;

    const whereClause: any = {};

    if (search) {
      whereClause[Op.or] = [
        { code: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (isActive !== undefined) {
      whereClause.isActive = isActive;
    }

    const { rows, count } = await this.hsCodeModel.findAndCountAll({
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

  async findOne(id: number): Promise<HSCode> {
    const hsCode = await this.hsCodeModel.findOne({
      where: { id, isActive: true },
    });
    if (!hsCode) {
      throw new NotFoundException('HS Code not found');
    }
    return hsCode;
  }

  async findOneActive(id: number): Promise<HSCode> {
    return this.findOne(id);
  }

  async findOneAnyState(id: number): Promise<HSCode> {
    const hsCode = await this.hsCodeModel.findByPk(id);
    if (!hsCode) {
      throw new NotFoundException('HS Code not found');
    }
    return hsCode;
  }

  async update(id: number, dto: UpdateHSCodeDto): Promise<HSCode> {
    const hsCode = await this.findOneActive(id);

    if (dto.code) {
      const normalizedCode = dto.code.trim().toUpperCase();

      const existing = await this.hsCodeModel.findOne({
        where: {
          code: normalizedCode,
          id: { [Op.ne]: id },
        },
      });

      if (existing) {
        throw new BadRequestException(
          `HS Code '${normalizedCode}' already exists`,
        );
      }

      dto.code = normalizedCode;
    }

    await hsCode.update(dto);
    return hsCode.reload();
  }

  async restore(id: number, user: any): Promise<HSCode> {
    const hsCode = await this.findOneAnyState(id);
    const oldIsActive = hsCode.isActive;
    await hsCode.update({ isActive: true });

    await this.auditService.writeLog({
      clientId: user.clientId || null,
      companyId: user.companyId || null,
      userId: user.userId,
      entityType: 'HSCode',
      entityId: hsCode.id,
      action: 'RESTORE',
      oldValue: { isActive: oldIsActive },
      newValue: { isActive: true },
    });

    return hsCode.reload();
  }

  async remove(id: number, reason?: string, user?: any): Promise<HSCode> {
    const hsCode = await this.findOneActive(id);
    await hsCode.update({ isActive: false });

    if (user) {
      await this.auditService.writeLog({
        clientId: user.clientId || null,
        companyId: user.companyId || null,
        userId: user.userId,
        entityType: 'HSCode',
        entityId: id,
        action: 'DELETE',
        oldValue: {
          isActive: true,
          deletedAt: new Date(),
          deletedBy: user.userId,
          deleteReason: reason || 'Deactivated',
        },
        newValue: { isActive: false },
      });
    }

    return hsCode.reload();
  }

  async removePermanent(id: number, reason: string, user: any): Promise<void> {
    const hsCode = await this.findOneAnyState(id);
    await this.deletionValidator.validateHSCodeDelete(id);

    const oldValue = {
      ...hsCode.toJSON(),
      deletedAt: new Date(),
      deletedBy: user.userId,
      deleteReason: reason || 'No reason provided',
    };

    await hsCode.destroy();

    await this.auditService.writeLog({
      clientId: user.clientId || null,
      companyId: user.companyId || null,
      userId: user.userId,
      entityType: 'HSCode',
      entityId: id,
      action: 'FORCE_DELETE',
      oldValue,
      newValue: null,
    });
  }
}
