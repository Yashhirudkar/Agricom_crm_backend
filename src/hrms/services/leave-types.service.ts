import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { LeaveType } from '../models/leave-type.model';
import { CreateLeaveTypeDto, UpdateLeaveTypeDto } from '../dto/leave-types.dto';
import { AuditService } from '../../audit/services/audit.service';
import { Op } from 'sequelize';

@Injectable()
export class LeaveTypesService {
  constructor(
    @InjectModel(LeaveType)
    private readonly leaveTypeModel: typeof LeaveType,
    private readonly auditService: AuditService,
  ) {}

  async createLeaveType(companyId: number, dto: CreateLeaveTypeDto, actor?: any): Promise<LeaveType> {
    const existing = await this.leaveTypeModel.findOne({
      where: { companyId, code: dto.code },
    });

    if (existing) {
      throw new BadRequestException(`Leave type with code '${dto.code}' already exists`);
    }

    const t = await this.leaveTypeModel.sequelize.transaction();
    try {
      const leaveType = await this.leaveTypeModel.create({
        ...dto,
        companyId,
        createdBy: actor?.userId || null,
      } as any, { transaction: t });

      await t.commit();

      if (actor) {
        await this.auditService.writeDiffLog({
          clientId: actor.clientId,
          companyId,
          userId: actor.userId,
          entityType: 'LeaveType',
          entityId: leaveType.id,
          action: 'CREATE',
          newRecord: leaveType,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });
      }

      return leaveType;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async getLeaveTypes(companyId: number): Promise<LeaveType[]> {
    return this.leaveTypeModel.findAll({
      where: { companyId, isActive: true },
      order: [['name', 'ASC']],
    });
  }

  async getLeaveTypeById(id: number, companyId: number): Promise<LeaveType> {
    const leaveType = await this.leaveTypeModel.findOne({
      where: { id, companyId, isActive: true },
    });

    if (!leaveType) {
      throw new NotFoundException('Leave type not found');
    }
    return leaveType;
  }

  async updateLeaveType(id: number, companyId: number, dto: UpdateLeaveTypeDto, actor?: any): Promise<LeaveType> {
    const leaveType = await this.leaveTypeModel.findOne({
      where: { id, companyId, isActive: true },
    });

    if (!leaveType) {
      throw new NotFoundException('Leave type not found');
    }

    if (dto.code && dto.code !== leaveType.code) {
      const existing = await this.leaveTypeModel.findOne({
        where: { companyId, code: dto.code },
      });
      if (existing) {
        throw new BadRequestException(`Leave type with code '${dto.code}' already exists`);
      }
    }

    const oldRecord = leaveType.toJSON();

    const t = await this.leaveTypeModel.sequelize.transaction();
    try {
      await leaveType.update({
        ...dto,
        updatedBy: actor?.userId || leaveType.updatedBy,
      }, { transaction: t });

      await t.commit();
      const updated = await leaveType.reload();

      if (actor) {
        await this.auditService.writeDiffLog({
          clientId: actor.clientId,
          companyId,
          userId: actor.userId,
          entityType: 'LeaveType',
          entityId: leaveType.id,
          action: 'UPDATE',
          oldRecord,
          newRecord: updated,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });
      }

      return updated;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async deleteLeaveType(id: number, companyId: number, actor?: any): Promise<{ message: string }> {
    const leaveType = await this.leaveTypeModel.findOne({
      where: { id, companyId, isActive: true },
    });

    if (!leaveType) {
      throw new NotFoundException('Leave type not found');
    }

    const oldRecord = leaveType.toJSON();

    const t = await this.leaveTypeModel.sequelize.transaction();
    try {
      await leaveType.update({
        isActive: false,
        updatedBy: actor?.userId || leaveType.updatedBy,
      }, { transaction: t });

      await t.commit();
      const updated = await leaveType.reload();

      if (actor) {
        await this.auditService.writeDiffLog({
          clientId: actor.clientId,
          companyId,
          userId: actor.userId,
          entityType: 'LeaveType',
          entityId: leaveType.id,
          action: 'DELETE',
          oldRecord,
          newRecord: updated,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });
      }

      return { message: 'Leave type deleted successfully' };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }
}
