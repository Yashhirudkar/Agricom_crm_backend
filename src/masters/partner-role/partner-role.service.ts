import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { PartnerRole } from './partner-role.model';
import { CreatePartnerRoleDto } from './dto/create-partner-role.dto';
import { UpdatePartnerRoleDto } from './dto/update-partner-role.dto';
import { QueryPartnerRoleDto } from './dto/query-partner-role.dto';
import { DeletionValidatorService } from '../deletion-validator.service';
import { AuditService } from '../../audit/services/audit.service';

@Injectable()
export class PartnerRoleService {
  constructor(
    @InjectModel(PartnerRole)
    private readonly partnerRoleModel: typeof PartnerRole,
    private readonly deletionValidator: DeletionValidatorService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreatePartnerRoleDto): Promise<PartnerRole> {
    const normalizedName = dto.name.trim().toUpperCase();

    const existing = await this.partnerRoleModel.findOne({
      where: { name: normalizedName },
    });

    if (existing) {
      throw new BadRequestException(
        `Partner Role '${normalizedName}' already exists`,
      );
    }

    const payload = {
      ...dto,
      name: normalizedName,
    };

    if (payload.description) {
      payload.description = payload.description.trim();
    }

    return this.partnerRoleModel.create(payload);
  }

  async findAll(query: QueryPartnerRoleDto) {
    const { search, isActive, page = 1, limit = 10 } = query;
    const offset = (page - 1) * limit;

    const whereClause: any = {};

    if (search) {
      whereClause.name = { [Op.iLike]: `%${search}%` };
    }

    if (isActive !== undefined) {
      whereClause.isActive = isActive;
    }

    const { rows, count } = await this.partnerRoleModel.findAndCountAll({
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

  async findOne(id: number): Promise<PartnerRole> {
    const partnerRole = await this.partnerRoleModel.findOne({
      where: { id, isActive: true },
    });
    if (!partnerRole) {
      throw new NotFoundException('Partner Role not found');
    }
    return partnerRole;
  }

  async findOneActive(id: number): Promise<PartnerRole> {
    return this.findOne(id);
  }

  async findOneAnyState(id: number): Promise<PartnerRole> {
    const partnerRole = await this.partnerRoleModel.findByPk(id);
    if (!partnerRole) {
      throw new NotFoundException('Partner Role not found');
    }
    return partnerRole;
  }

  async update(id: number, dto: UpdatePartnerRoleDto): Promise<PartnerRole> {
    const partnerRole = await this.findOneActive(id);

    if (dto.name) {
      const normalizedName = dto.name.trim().toUpperCase();

      const existing = await this.partnerRoleModel.findOne({
        where: {
          name: normalizedName,
          id: { [Op.ne]: id },
        },
      });

      if (existing) {
        throw new BadRequestException(
          `Partner Role '${normalizedName}' already exists`,
        );
      }

      dto.name = normalizedName;
    }

    if (dto.description) {
      dto.description = dto.description.trim();
    }

    await partnerRole.update(dto);
    return partnerRole.reload();
  }

  async restore(id: number, user: any): Promise<PartnerRole> {
    const partnerRole = await this.findOneAnyState(id);
    const oldIsActive = partnerRole.isActive;
    await partnerRole.update({ isActive: true });

    await this.auditService.writeLog({
      clientId: user.clientId || null,
      companyId: user.companyId || null,
      userId: user.userId,
      entityType: 'PartnerRole',
      entityId: partnerRole.id,
      action: 'RESTORE',
      oldValue: { isActive: oldIsActive },
      newValue: { isActive: true },
    });

    return partnerRole.reload();
  }

  async remove(id: number, reason?: string, user?: any): Promise<PartnerRole> {
    const partnerRole = await this.findOneActive(id);
    await partnerRole.update({ isActive: false });

    if (user) {
      await this.auditService.writeLog({
        clientId: user.clientId || null,
        companyId: user.companyId || null,
        userId: user.userId,
        entityType: 'PartnerRole',
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

    return partnerRole.reload();
  }

  async removePermanent(id: number, reason: string, user: any): Promise<void> {
    const partnerRole = await this.findOneAnyState(id);
    await this.deletionValidator.validatePartnerRoleDelete(id);

    const oldValue = {
      ...partnerRole.toJSON(),
      deletedAt: new Date(),
      deletedBy: user.userId,
      deleteReason: reason || 'No reason provided',
    };

    await partnerRole.destroy();

    await this.auditService.writeLog({
      clientId: user.clientId || null,
      companyId: user.companyId || null,
      userId: user.userId,
      entityType: 'PartnerRole',
      entityId: id,
      action: 'FORCE_DELETE',
      oldValue,
      newValue: null,
    });
  }
}
