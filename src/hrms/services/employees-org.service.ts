import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Employee } from '../models/employee.model';
import { Department } from '../../companies/models/department.model';
import { Designation } from '../models/designation.model';
import { AuditService } from '../../audit/services/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class EmployeesOrgService {
  constructor(
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async isCircularManager(employeeId: number, managerId: number, companyId: number): Promise<boolean> {
    if (employeeId === managerId) return true;
    const subordinates = await this.getAllSubordinates(employeeId, companyId);
    return subordinates.some(sub => sub.id === managerId);
  }

  private async executeRecursiveCTE(
    companyId: number,
    startCondition: string,
    joinCondition: string,
    replacements: any
  ): Promise<any[]> {
    const query = `
      WITH RECURSIVE org_tree AS (
        SELECT e.*, 0 AS depth
        FROM employees e
        WHERE e."companyId" = :companyId AND ${startCondition}

        UNION ALL

        SELECT e.*, ot.depth + 1 AS depth
        FROM employees e
        INNER JOIN org_tree ot ON ${joinCondition}
        WHERE e."companyId" = :companyId
      )
      SELECT * FROM org_tree;
    `;

    return this.employeeModel.sequelize!.query(query, {
      replacements: { companyId, ...replacements },
      type: QueryTypes.SELECT,
    });
  }

  async getOrgChart(companyId: number): Promise<any[]> {
    const rawData = await this.executeRecursiveCTE(
      companyId,
      '"managerId" IS NULL',
      'e."managerId" = ot.id',
      {}
    );

    // Build nested tree
    const map = new Map<number, any>();
    const roots: any[] = [];

    rawData.forEach(item => {
      map.set(item.id, { ...item, children: [] });
    });

    rawData.forEach(item => {
      if (item.managerId) {
        const parent = map.get(item.managerId);
        if (parent) {
          parent.children.push(map.get(item.id));
        } else {
          roots.push(map.get(item.id));
        }
      } else {
        roots.push(map.get(item.id));
      }
    });

    return roots;
  }

  async getTeam(managerId: number, companyId: number): Promise<Employee[]> {
    return this.employeeModel.findAll({
      where: { managerId, companyId },
      include: [
        { model: Department, attributes: ['id', 'name'] },
        { model: Designation, attributes: ['id', 'name'] },
      ]
    });
  }

  async getAllSubordinates(managerId: number, companyId: number): Promise<any[]> {
    return this.executeRecursiveCTE(
      companyId,
      'id = :managerId',
      'e."managerId" = ot.id',
      { managerId }
    );
  }

  async getReportingChain(employeeId: number, companyId: number): Promise<any[]> {
    return this.executeRecursiveCTE(
      companyId,
      'id = :employeeId',
      'e.id = ot."managerId"',
      { employeeId }
    );
  }

  private async checkMaxHierarchyDepth(employeeId: number, newManagerId: number, companyId: number): Promise<void> {
    if (!newManagerId) return;

    // 1. Get deepest subordinate level of the employee
    const subordinates = await this.getAllSubordinates(employeeId, companyId);
    let maxSubordinateDepth = 0;
    subordinates.forEach(sub => {
      if (sub.depth > maxSubordinateDepth) maxSubordinateDepth = sub.depth;
    });

    // 2. Get manager depth from CEO
    const managerChain = await this.getReportingChain(newManagerId, companyId);
    const managerDepth = managerChain.length; // includes the manager themselves up to CEO

    if (managerDepth + maxSubordinateDepth > 15) {
      throw new BadRequestException(`Hierarchy depth limit exceeded. Maximum allowed depth is 15. Proposed depth would be ${managerDepth + maxSubordinateDepth}.`);
    }
  }

  async changeManager(employeeId: number, companyId: number, dto: any, actor: any): Promise<{ message: string }> {
    const employee = await this.employeeModel.findOne({ where: { id: employeeId, companyId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const newManagerId = dto.newManagerId;

    if (newManagerId === employee.managerId) {
      throw new BadRequestException('New manager is the same as the current manager');
    }

    if (newManagerId) {
      if (newManagerId === employee.id) {
        throw new BadRequestException('Employee cannot be their own manager');
      }

      const manager = await this.employeeModel.findOne({ where: { id: newManagerId, companyId } });
      if (!manager) throw new NotFoundException('Manager not found');

      if (!['ACTIVE', 'CONFIRMED'].includes(manager.status)) {
        throw new BadRequestException('Manager must be ACTIVE or CONFIRMED');
      }

      // Loop Prevention
      const subordinates = await this.getAllSubordinates(employee.id, companyId);
      if (subordinates.some(sub => sub.id === newManagerId)) {
        throw new BadRequestException('Circular reporting hierarchy detected (new manager is currently a subordinate)');
      }

      // Max Depth Check
      await this.checkMaxHierarchyDepth(employee.id, newManagerId, companyId);
    }

    const oldRecord = employee.toJSON();
    const oldManagerId = employee.managerId;

    const t = await this.employeeModel.sequelize!.transaction();
    try {
      await employee.update({ managerId: newManagerId || null, updatedBy: actor?.userId }, { transaction: t });

      await t.commit();
      const updated = await employee.reload();

      if (actor) {
        await this.auditService.writeDiffLog({
          clientId: actor.clientId,
          companyId,
          userId: actor.userId,
          entityType: 'Employee',
          entityId: employee.id,
          action: 'UPDATE',
          oldRecord,
          newRecord: updated,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });
      }

      this.eventEmitter.emit('employee.manager.changed', {
        employeeId: employee.id,
        companyId,
        oldManagerId,
        newManagerId,
        effectiveDate: dto.effectiveDate || new Date().toISOString(),
        actor,
      });

      return { message: 'Manager updated successfully' };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }
}
