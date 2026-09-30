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

  async create(dto: CreatePartnerRoleDto, user?: any): Promise<PartnerRole> {
    const companyId: number = user?.companyId;
    const normalizedName = dto.name.trim().toUpperCase();

    const existing = await this.partnerRoleModel.findOne({
      where: { name: normalizedName, companyId },
    });

    if (existing) {
      throw new BadRequestException(
        `Partner Role '${normalizedName}' already exists`,
      );
    }

    const payload: any = { ...dto, name: normalizedName, companyId };
    if (payload.description) payload.description = payload.description.trim();

    return this.partnerRoleModel.create(payload);
  }

  async findAll(query: QueryPartnerRoleDto & { allowedIds?: number[] | null; companyId?: number }) {
    const { search, isActive, page = 1, limit = 10, allowedIds } = query;
    const offset = (page - 1) * limit;

    const whereClause: any = {};
    // Tenant isolation
    if (query.companyId) whereClause.companyId = query.companyId;

    if (search) {
      whereClause.name = { [Op.iLike]: `%${search}%` };
    }

    if (isActive !== undefined) {
      whereClause.isActive = isActive;
    }

    // RBAC-based filter: when allowedIds is a non-null array, restrict to those IDs
    if (allowedIds !== null && allowedIds !== undefined) {
      if (allowedIds.length === 0) {
        // Fully restricted — no partner roles accessible
        return {
          data: [],
          total: 0,
          page: Number(page),
          limit: Number(limit),
          totalPages: 0,
        };
      }
      whereClause.id = { [Op.in]: allowedIds };
    }

    const { rows, count } = await this.partnerRoleModel.findAndCountAll({
      where: whereClause,
      limit: Number(limit),
      offset: Number(offset),
      order: [['name', 'ASC']],
    });

    return {
      data: rows,
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / limit),
    };
  }

  async findOne(id: number, companyId?: number): Promise<PartnerRole> {
    const where: any = { id, isActive: true };
    if (companyId) where.companyId = companyId;
    const partnerRole = await this.partnerRoleModel.findOne({ where });
    if (!partnerRole) {
      throw new NotFoundException('Partner Role not found');
    }
    return partnerRole;
  }

  async findOneActive(id: number, companyId?: number): Promise<PartnerRole> {
    return this.findOne(id, companyId);
  }

  async findOneAnyState(id: number, companyId?: number): Promise<PartnerRole> {
    const where: any = { id };
    if (companyId) where.companyId = companyId;
    const partnerRole = await this.partnerRoleModel.findOne({ where });
    if (!partnerRole) {
      throw new NotFoundException('Partner Role not found');
    }
    return partnerRole;
  }

  async update(id: number, dto: UpdatePartnerRoleDto, user?: any): Promise<PartnerRole> {
    const companyId = user?.companyId;
    const partnerRole = await this.findOneActive(id, companyId);

    if (dto.name) {
      const normalizedName = dto.name.trim().toUpperCase();
      const where: any = { name: normalizedName, id: { [Op.ne]: id } };
      if (companyId) where.companyId = companyId;
      const existing = await this.partnerRoleModel.findOne({ where });

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
    const partnerRole = await this.findOneAnyState(id, user?.companyId);
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
    const partnerRole = await this.findOneActive(id, user?.companyId);
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
    const partnerRole = await this.findOneAnyState(id, user?.companyId);
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
