import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes } from 'sequelize';
import { Designation } from '../models/designation.model';
import { Employee } from '../models/employee.model';
import { Department } from '../../companies/models/department.model';
import { AuditService } from '../../audit/services/audit.service';

@Injectable()
export class DesignationsService {
  constructor(
    @InjectModel(Designation)
    private readonly designationModel: typeof Designation,
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    @InjectModel(Department)
    private readonly departmentModel: typeof Department,
    private readonly auditService: AuditService,
  ) {}

  async createDesignation(companyId: number, data: any, actor?: any): Promise<Designation> {
    const department = await this.departmentModel.findOne({ where: { id: data.departmentId, companyId } });
    if (!department) throw new NotFoundException('Department not found');

    if (data.designationCode) {
      const existing = await this.designationModel.findOne({ where: { companyId, designationCode: data.designationCode } });
      if (existing) {
        throw new ConflictException(`Designation code '${data.designationCode}' already exists in this company`);
      }
    }

    if (data.parentDesignationId) {
      const parent = await this.designationModel.findOne({ where: { id: data.parentDesignationId, companyId } });
      if (!parent) throw new NotFoundException('Parent designation not found');
    }

    if (data.salaryBandMin !== undefined && data.salaryBandMax !== undefined) {
      if (Number(data.salaryBandMin) > Number(data.salaryBandMax)) {
        throw new ConflictException('Salary band min cannot be greater than salary band max');
      }
    }

    const designation = await this.designationModel.create({
      companyId,
      departmentId: data.departmentId,
      name: data.name,
      designationCode: data.designationCode || null,
      level: data.level || null,
      parentDesignationId: data.parentDesignationId || null,
      salaryBandMin: data.salaryBandMin || null,
      salaryBandMax: data.salaryBandMax || null,
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
        entityType: 'Designation',
        entityId: designation.id,
        action: 'CREATE',
        newRecord: designation,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }

    return designation;
  }

  private async isCircularDesignation(designationId: number, newParentId: number, companyId: number): Promise<boolean> {
    if (designationId === newParentId) return true;
    
    // We will use CTE to get all descendants and check if newParentId is one of them.
    const query = `
      WITH RECURSIVE desig_tree AS (
        SELECT d.*, 0 AS depth
        FROM designations d
        WHERE d.id = :designationId AND d."companyId" = :companyId AND d."isActive" = true

        UNION ALL

        SELECT d.*, dt.depth + 1 AS depth
        FROM designations d
        INNER JOIN desig_tree dt ON d."parentDesignationId" = dt.id
        WHERE d."companyId" = :companyId AND d."isActive" = true
      )
      SELECT * FROM desig_tree;
    `;

    const subDesignations = await this.designationModel.sequelize!.query(query, {
      replacements: { companyId, designationId },
      type: QueryTypes.SELECT,
    }) as any[];

    return subDesignations.some(sub => sub.id === newParentId);
  }

  async updateDesignation(id: number, companyId: number, data: any, actor?: any): Promise<Designation> {
    const designation = await this.designationModel.findOne({ where: { id, companyId } });
    if (!designation) throw new NotFoundException('Designation not found');

    if (data.departmentId && data.departmentId !== designation.departmentId) {
      const department = await this.departmentModel.findOne({ where: { id: data.departmentId, companyId } });
      if (!department) throw new NotFoundException('Department not found');
    }

    if (data.designationCode && data.designationCode !== designation.designationCode) {
      const existing = await this.designationModel.findOne({ where: { companyId, designationCode: data.designationCode } });
      if (existing) {
        throw new ConflictException(`Designation code '${data.designationCode}' already exists in this company`);
      }
    }

    if (data.parentDesignationId && data.parentDesignationId !== designation.parentDesignationId) {
      const parent = await this.designationModel.findOne({ where: { id: data.parentDesignationId, companyId } });
      if (!parent) throw new NotFoundException('Parent designation not found');
      const isCircular = await this.isCircularDesignation(designation.id, data.parentDesignationId, companyId);
      if (isCircular) {
        throw new ConflictException('Circular designation hierarchy detected');
      }
    }

    const newMin = data.salaryBandMin !== undefined ? Number(data.salaryBandMin) : Number(designation.salaryBandMin || 0);
    const newMax = data.salaryBandMax !== undefined ? Number(data.salaryBandMax) : Number(designation.salaryBandMax || Number.MAX_VALUE);
    
    if (data.salaryBandMin !== undefined || data.salaryBandMax !== undefined) {
      if (newMin > newMax) {
        throw new ConflictException('Salary band min cannot be greater than salary band max');
      }
    }

    const oldRecord = designation.toJSON();

    await designation.update({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.designationCode !== undefined && { designationCode: data.designationCode }),
      ...(data.level !== undefined && { level: data.level }),
      ...(data.parentDesignationId !== undefined && { parentDesignationId: data.parentDesignationId }),
      ...(data.salaryBandMin !== undefined && { salaryBandMin: data.salaryBandMin }),
      ...(data.salaryBandMax !== undefined && { salaryBandMax: data.salaryBandMax }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.departmentId !== undefined && { departmentId: data.departmentId }),
      updatedBy: actor?.userId || designation.updatedBy,
    });

    const updated = await designation.reload();

    if (actor) {
      await this.auditService.writeDiffLog({
        clientId: actor.clientId,
        companyId,
        userId: actor.userId,
        entityType: 'Designation',
        entityId: designation.id,
        action: 'UPDATE',
        oldRecord,
        newRecord: updated,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }

    return updated;
  }

  async deleteDesignation(id: number, companyId: number, actor?: any): Promise<{ message: string }> {
    const designation = await this.designationModel.findOne({ where: { id, companyId } });
    if (!designation) throw new NotFoundException('Designation not found');

    const employeeCount = await this.employeeModel.count({ where: { designationId: id } });
    if (employeeCount > 0) {
      throw new ConflictException(`Cannot delete designation because it is linked to ${employeeCount} employee(s).`);
    }

    const oldRecord = designation.toJSON();

    if (actor) {
      await this.auditService.writeDiffLog({
        clientId: actor.clientId,
        companyId,
        userId: actor.userId,
        entityType: 'Designation',
        entityId: designation.id,
        action: 'DELETE',
        oldRecord,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }

    await designation.update({ isActive: false });
    return { message: 'Designation deactivated successfully' };
  }

  async getDesignations(
    companyId: number,
    query: { search?: string; status?: string; page?: number; limit?: number; sortBy?: string; sortOrder?: 'ASC' | 'DESC'; departmentId?: number }
  ) {
    const { search, status, departmentId, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'DESC' } = query;

    const whereClause: any = { companyId };
    if (status) whereClause.status = status;
    if (departmentId) whereClause.departmentId = departmentId;
    if (search) whereClause.name = { [Op.iLike]: `%${search}%` };

    const offset = (page - 1) * limit;

    const { rows, count } = await this.designationModel.findAndCountAll({
      where: whereClause,
      limit: Number(limit),
      offset: Number(offset),
      order: [[sortBy, sortOrder]],
      include: [
        { model: Department, attributes: ['id', 'name'] },
        { model: Employee, attributes: ['id'] },
      ]
    });

    const data = rows.map(row => {
      const json = row.toJSON();
      return {
        ...json,
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

  async getDesignationById(id: number, companyId: number): Promise<any> {
    const designation = await this.designationModel.findOne({
      where: { id, companyId },
      include: [
        { model: Department, attributes: ['id', 'name'] },
        { model: Employee, attributes: ['id', 'firstName', 'lastName', 'email', 'status'] },
      ]
    });
    if (!designation) throw new NotFoundException('Designation not found');

    const json = designation.toJSON();
    return {
      ...json,
      employeeCount: designation.employees?.length || 0,
    };
  }

  async getDesignationHierarchy(companyId: number): Promise<any[]> {
    const query = `
      WITH RECURSIVE desig_tree AS (
        SELECT d.*, 0 AS depth
        FROM designations d
        WHERE d."companyId" = :companyId AND d."isActive" = true AND d."parentDesignationId" IS NULL

        UNION ALL

        SELECT d.*, dt.depth + 1 AS depth
        FROM designations d
        INNER JOIN desig_tree dt ON d."parentDesignationId" = dt.id
        WHERE d."companyId" = :companyId AND d."isActive" = true
      )
      SELECT * FROM desig_tree;
    `;

    const rawData = await this.designationModel.sequelize!.query(query, {
      replacements: { companyId },
      type: QueryTypes.SELECT,
    }) as any[];

    const map = new Map<number, any>();
    const roots: any[] = [];

    rawData.forEach(item => {
      map.set(item.id, { ...item, subDesignations: [] });
    });

    rawData.forEach(item => {
      if (item.parentDesignationId) {
        const parent = map.get(item.parentDesignationId);
        if (parent) {
          parent.subDesignations.push(map.get(item.id));
        } else {
          roots.push(map.get(item.id));
        }
      } else {
        roots.push(map.get(item.id));
      }
    });

    return roots;
  }
}
