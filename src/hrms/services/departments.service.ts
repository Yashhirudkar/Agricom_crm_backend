import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes } from 'sequelize';
import { Department } from '../../companies/models/department.model';
import { Designation } from '../models/designation.model';
import { Employee } from '../models/employee.model';
import { AuditService } from '../../audit/services/audit.service';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectModel(Department)
    private readonly departmentModel: typeof Department,
    @InjectModel(Designation)
    private readonly designationModel: typeof Designation,
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    private readonly auditService: AuditService,
  ) {}

  async createDepartment(companyId: number, data: any, actor?: any): Promise<Department> {
    if (data.departmentCode) {
      const existing = await this.departmentModel.findOne({ where: { companyId, departmentCode: data.departmentCode } });
      if (existing) {
        throw new ConflictException(`Department code '${data.departmentCode}' already exists in this company`);
      }
    }

    if (data.parentDepartmentId) {
      const parent = await this.departmentModel.findOne({ where: { id: data.parentDepartmentId, companyId } });
      if (!parent) throw new NotFoundException('Parent department not found');
    }

    if (data.departmentHeadId) {
      const head = await this.employeeModel.findOne({ where: { id: data.departmentHeadId, companyId } });
      if (!head) throw new NotFoundException('Department head not found');
    }

    const department = await this.departmentModel.create({
      companyId,
      name: data.name,
      departmentCode: data.departmentCode || null,
      parentDepartmentId: data.parentDepartmentId || null,
      departmentHeadId: data.departmentHeadId || null,
      description: data.description || null,
      status: data.status || 'Active',
      isActive: data.isActive !== undefined ? data.isActive : true,
      createdBy: actor?.userId || null,
    } as any);

    if (actor) {
      await this.auditService.writeDiffLog({
        clientId: actor.clientId,
        companyId,
        userId: actor.userId,
        entityType: 'Department',
        entityId: department.id,
        action: 'CREATE',
        newRecord: department,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }

    return department;
  }

  private async isCircularDepartment(departmentId: number, newParentId: number, companyId: number): Promise<boolean> {
    if (departmentId === newParentId) return true;
    const subDepartments = await this.getSubDepartments(departmentId, companyId);
    return subDepartments.some(sub => sub.id === newParentId);
  }

  async updateDepartment(id: number, companyId: number, data: any, actor?: any): Promise<Department> {
    const department = await this.departmentModel.findOne({ where: { id, companyId } });
    if (!department) throw new NotFoundException('Department not found');

    if (data.departmentCode && data.departmentCode !== department.departmentCode) {
      const existing = await this.departmentModel.findOne({ where: { companyId, departmentCode: data.departmentCode } });
      if (existing) {
        throw new ConflictException(`Department code '${data.departmentCode}' already exists in this company`);
      }
    }

    if (data.parentDepartmentId && data.parentDepartmentId !== department.parentDepartmentId) {
      const parent = await this.departmentModel.findOne({ where: { id: data.parentDepartmentId, companyId } });
      if (!parent) throw new NotFoundException('Parent department not found');
      const isCircular = await this.isCircularDepartment(department.id, data.parentDepartmentId, companyId);
      if (isCircular) {
        throw new ConflictException('Circular department hierarchy detected');
      }
    }

    if (data.departmentHeadId && data.departmentHeadId !== department.departmentHeadId) {
      const head = await this.employeeModel.findOne({ where: { id: data.departmentHeadId, companyId } });
      if (!head) throw new NotFoundException('Department head not found');
    }

    const oldRecord = department.toJSON();

    await department.update({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.departmentCode !== undefined && { departmentCode: data.departmentCode }),
      ...(data.parentDepartmentId !== undefined && { parentDepartmentId: data.parentDepartmentId }),
      ...(data.departmentHeadId !== undefined && { departmentHeadId: data.departmentHeadId }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      updatedBy: actor?.userId || department.updatedBy,
    });

    const updated = await department.reload();

    if (actor) {
      await this.auditService.writeDiffLog({
        clientId: actor.clientId,
        companyId,
        userId: actor.userId,
        entityType: 'Department',
        entityId: department.id,
        action: 'UPDATE',
        oldRecord,
        newRecord: updated,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }

    return updated;
  }

  async deleteDepartment(id: number, companyId: number, actor?: any): Promise<{ message: string }> {
    const department = await this.departmentModel.findOne({ where: { id, companyId } });
    if (!department) throw new NotFoundException('Department not found');

    const designationCount = await this.designationModel.count({ where: { departmentId: id } });
    if (designationCount > 0) {
      throw new ConflictException(`Cannot delete department because it is linked to ${designationCount} designation(s).`);
    }

    const employeeCount = await this.employeeModel.count({ where: { departmentId: id } });
    if (employeeCount > 0) {
      throw new ConflictException(`Cannot delete department because it is linked to ${employeeCount} employee(s).`);
    }

    const oldRecord = department.toJSON();

    if (actor) {
      await this.auditService.writeDiffLog({
        clientId: actor.clientId,
        companyId,
        userId: actor.userId,
        entityType: 'Department',
        entityId: department.id,
        action: 'DELETE',
        oldRecord,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }

    await department.update({ isActive: false });
    return { message: 'Department deactivated successfully' };
  }

  async getDepartments(
    companyId: number,
    query: { search?: string; status?: string; page?: number; limit?: number; sortBy?: string; sortOrder?: 'ASC' | 'DESC' }
  ) {
    const { search, status, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'DESC' } = query;

    const whereClause: any = { companyId };
    if (status) {
      whereClause.status = status;
    }
    if (search) {
      whereClause.name = { [Op.iLike]: `%${search}%` };
    }

    const offset = (page - 1) * limit;

    const { rows, count } = await this.departmentModel.findAndCountAll({
      where: whereClause,
      limit: Number(limit),
      offset: Number(offset),
      order: [[sortBy, sortOrder]],
      include: [
        { model: Designation, attributes: ['id'] },
        { model: Employee, as: 'employees', attributes: ['id'] },
      ]
    });

    const data = rows.map(row => {
      const json = row.toJSON();
      return {
        ...json,
        designationCount: row.designations?.length || 0,
        employeeCount: row.employees?.length || 0,
      };
    });

    return {
      data,
      meta: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / limit),
      }
    };
  }

  async getDepartmentById(id: number, companyId: number): Promise<any> {
    const department = await this.departmentModel.findOne({
      where: { id, companyId },
      include: [
        { model: Designation, attributes: ['id', 'name', 'status'] },
        { model: Employee, as: 'departmentHead', attributes: ['id', 'firstName', 'lastName', 'email', 'status'] },
        { model: Employee, as: 'employees', attributes: ['id', 'firstName', 'lastName', 'email', 'status'] },
      ]
    });
    if (!department) throw new NotFoundException('Department not found');

    const json = department.toJSON();
    return {
      ...json,
      designationCount: department.designations?.length || 0,
      employeeCount: department.employees?.length || 0,
    };
  }

  // --- Department Hierarchy ---
  private async executeRecursiveCTE(
    companyId: number,
    startCondition: string,
    joinCondition: string,
    replacements: any
  ): Promise<any[]> {
    const query = `
      WITH RECURSIVE dept_tree AS (
        SELECT d.*, 0 AS depth
        FROM departments d
        WHERE d."companyId" = :companyId AND d."isActive" = true AND ${startCondition}

        UNION ALL

        SELECT d.*, dt.depth + 1 AS depth
        FROM departments d
        INNER JOIN dept_tree dt ON ${joinCondition}
        WHERE d."companyId" = :companyId AND d."isActive" = true
      )
      SELECT * FROM dept_tree;
    `;

    return this.departmentModel.sequelize!.query(query, {
      replacements: { companyId, ...replacements },
      type: QueryTypes.SELECT,
    });
  }

  async getDepartmentTree(companyId: number): Promise<any[]> {
    const rawData = await this.executeRecursiveCTE(
      companyId,
      '"parentDepartmentId" IS NULL',
      'd."parentDepartmentId" = dt.id',
      {}
    );

    const map = new Map<number, any>();
    const roots: any[] = [];

    rawData.forEach(item => {
      map.set(item.id, { ...item, subDepartments: [] });
    });

    rawData.forEach(item => {
      if (item.parentDepartmentId) {
        const parent = map.get(item.parentDepartmentId);
        if (parent) {
          parent.subDepartments.push(map.get(item.id));
        } else {
          roots.push(map.get(item.id));
        }
      } else {
        roots.push(map.get(item.id));
      }
    });

    return roots;
  }

  async getSubDepartments(departmentId: number, companyId: number): Promise<any[]> {
    return this.executeRecursiveCTE(
      companyId,
      'id = :departmentId',
      'd."parentDepartmentId" = dt.id',
      { departmentId }
    );
  }
}
