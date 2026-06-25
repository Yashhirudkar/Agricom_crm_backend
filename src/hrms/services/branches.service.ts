import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Branch } from '../models/branch.model';
import { Employee, EmployeeStatus } from '../models/employee.model';
import { AuditService } from '../../audit/services/audit.service';

@Injectable()
export class BranchesService {
  constructor(
    @InjectModel(Branch)
    private readonly branchModel: typeof Branch,
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    private readonly auditService: AuditService,
  ) {}

  async createBranch(
    companyId: number,
    dto: any,
    actor?: any,
  ): Promise<Branch> {
    const t = await this.branchModel.sequelize.transaction();

    try {
      // 1. Validation A: Unique branch_code per company
      const existingCode = await this.branchModel.findOne({
        where: { companyId, branchCode: dto.branchCode },
        transaction: t,
      });
      if (existingCode) {
        throw new BadRequestException(
          `Branch code '${dto.branchCode}' already exists in this company`,
        );
      }

      const existingName = await this.branchModel.findOne({
        where: { companyId, branchName: dto.branchName },
        transaction: t,
      });
      if (existingName) {
        throw new BadRequestException(
          `Branch name '${dto.branchName}' already exists in this company`,
        );
      }

      // 2. Validation B: Only one head office per company
      if (dto.isHeadOffice === true) {
        const existingHeadOffice = await this.branchModel.findOne({
          where: { companyId, isHeadOffice: true },
          transaction: t,
        });
        if (existingHeadOffice) {
          throw new BadRequestException(
            'Only one head office per company is allowed',
          );
        }
      }

      // 3. Validation C: Branch manager company must match branch company
      if (dto.managerId) {
        const manager = await this.employeeModel.findOne({
          where: { id: dto.managerId },
          transaction: t,
        });
        if (!manager) {
          throw new BadRequestException('Branch manager employee not found');
        }
        if (manager.companyId !== companyId) {
          throw new BadRequestException(
            'Branch manager must belong to the same company',
          );
        }
      }

      const branch = await this.branchModel.create(
        {
          ...dto,
          companyId,
          createdBy: actor?.userId || null,
        },
        { transaction: t },
      );

      await t.commit();

      if (actor) {
        await this.auditService.writeDiffLog({
          clientId: actor.clientId,
          companyId,
          userId: actor.userId,
          entityType: 'Branch',
          entityId: branch.id,
          action: 'CREATE',
          newRecord: branch,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });
      }

      return branch;
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async getBranches(companyId: number, query: any) {
    const { search, page = 1, limit = 10 } = query;
    const offset = (page - 1) * limit;

    const whereClause: any = { companyId };
    if (search) {
      whereClause[Op.or] = [
        { branchName: { [Op.iLike]: `%${search}%` } },
        { branchCode: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { rows, count } = await this.branchModel.findAndCountAll({
      where: whereClause,
      limit: Number(limit),
      offset: Number(offset),
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: Employee,
          as: 'manager',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
      ],
    });

    return {
      data: rows,
      meta: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  async getBranchById(id: number, companyId: number): Promise<Branch> {
    const branch = await this.branchModel.findOne({
      where: { id, companyId },
      include: [
        {
          model: Employee,
          as: 'manager',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
      ],
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return branch;
  }

  async updateBranch(
    id: number,
    companyId: number,
    dto: any,
    actor?: any,
  ): Promise<Branch> {
    const branch = await this.branchModel.findOne({ where: { id, companyId } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const oldRecord = branch.toJSON();
    const t = await this.branchModel.sequelize.transaction();

    try {
      // 1. Validation A: Unique branch_code per company
      if (dto.branchCode && dto.branchCode !== branch.branchCode) {
        const existingCode = await this.branchModel.findOne({
          where: { companyId, branchCode: dto.branchCode, id: { [Op.ne]: id } },
          transaction: t,
        });
        if (existingCode) {
          throw new BadRequestException(
            `Branch code '${dto.branchCode}' already exists in this company`,
          );
        }
      }

      if (dto.branchName && dto.branchName !== branch.branchName) {
        const existingName = await this.branchModel.findOne({
          where: { companyId, branchName: dto.branchName, id: { [Op.ne]: id } },
          transaction: t,
        });
        if (existingName) {
          throw new BadRequestException(
            `Branch name '${dto.branchName}' already exists in this company`,
          );
        }
      }

      // 2. Validation B: Only one head office per company
      if (dto.isHeadOffice === true && branch.isHeadOffice !== true) {
        const existingHeadOffice = await this.branchModel.findOne({
          where: { companyId, isHeadOffice: true, id: { [Op.ne]: id } },
          transaction: t,
        });
        if (existingHeadOffice) {
          throw new BadRequestException(
            'Only one head office per company is allowed',
          );
        }
      }

      // 3. Validation C: Branch manager company must match branch company
      if (dto.managerId && dto.managerId !== branch.managerId) {
        const manager = await this.employeeModel.findOne({
          where: { id: dto.managerId },
          transaction: t,
        });
        if (!manager) {
          throw new BadRequestException('Branch manager employee not found');
        }
        if (manager.companyId !== companyId) {
          throw new BadRequestException(
            'Branch manager must belong to the same company',
          );
        }
      }

      // 4. Validation D: Cannot deactivate branch if active employees assigned
      if (dto.isActive === false && branch.isActive === true) {
        const activeEmployeesCount = await this.employeeModel.count({
          where: {
            branchId: id,
            companyId,
            status: {
              [Op.in]: [
                EmployeeStatus.ACTIVE,
                EmployeeStatus.PROBATION,
                EmployeeStatus.CONFIRMED,
                EmployeeStatus.ONBOARDING,
                EmployeeStatus.NOTICE_PERIOD,
              ],
            },
          },
          transaction: t,
        });

        if (activeEmployeesCount > 0) {
          throw new BadRequestException(
            'Cannot deactivate branch with active employees assigned',
          );
        }
      }

      await branch.update(
        {
          ...dto,
          updatedBy: actor?.userId || null,
        },
        { transaction: t },
      );

      await t.commit();
      const updated = await branch.reload();

      if (actor) {
        await this.auditService.writeDiffLog({
          clientId: actor.clientId,
          companyId,
          userId: actor.userId,
          entityType: 'Branch',
          entityId: branch.id,
          action: 'UPDATE',
          oldRecord,
          newRecord: updated,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });
      }

      return updated;
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async deleteBranch(
    id: number,
    companyId: number,
    actor?: any,
  ): Promise<{ message: string }> {
    const branch = await this.branchModel.findOne({ where: { id, companyId } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    // Friendly validation: check if any employees are linked to this branch
    const employeesCount = await this.employeeModel.count({
      where: { branchId: id },
    });
    if (employeesCount > 0) {
      throw new BadRequestException(
        'Cannot delete branch that has employees assigned to it',
      );
    }

    const oldRecord = branch.toJSON();
    const t = await this.branchModel.sequelize.transaction();

    try {
      await branch.destroy({ transaction: t });
      await t.commit();

      if (actor) {
        await this.auditService.writeDiffLog({
          clientId: actor.clientId,
          companyId,
          userId: actor.userId,
          entityType: 'Branch',
          entityId: id,
          action: 'DELETE',
          oldRecord,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });
      }

      return { message: 'Branch deleted successfully' };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async getBranchesForOptions(
    companyId: number,
    search?: string,
    page: string = '1',
    limit: string = '10',
  ) {
    const where: any = { companyId, isActive: true };

    if (search) {
      where[Op.or] = [
        { branchName: { [Op.iLike]: `%${search}%` } },
        { branchCode: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const parsedPage = parseInt(page, 10) || 1;
    const parsedLimit = parseInt(limit, 10) || 10;

    const { rows, count } = await this.branchModel.findAndCountAll({
      where,
      attributes: ['id', 'branchName', 'branchCode'],
      limit: parsedLimit,
      offset: (parsedPage - 1) * parsedLimit,
      order: [['branchName', 'ASC']],
    });

    return {
      data: rows.map((r) => ({
        value: r.id,
        label: r.branchCode
          ? `${r.branchName} (${r.branchCode})`
          : r.branchName,
      })),
      meta: {
        page: parsedPage,
        limit: parsedLimit,
        total: count,
        totalPages: Math.ceil(count / parsedLimit),
      },
    };
  }
}
