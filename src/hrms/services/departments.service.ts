import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
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

  async createDepartment(companyId: number, data: { name: string; description?: string; status?: string }, actor?: any): Promise<Department> {
    const department = await this.departmentModel.create({
      companyId,
      name: data.name,
      description: data.description || null,
      status: data.status || 'Active',
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

  async updateDepartment(id: number, companyId: number, data: { name?: string; description?: string; status?: string }, actor?: any): Promise<Department> {
    const department = await this.departmentModel.findOne({ where: { id, companyId } });
    if (!department) throw new NotFoundException('Department not found');

    const oldRecord = department.toJSON();

    await department.update({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.status !== undefined && { status: data.status }),
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

    await department.destroy();
    return { message: 'Department deleted successfully' };
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
        { model: Employee, attributes: ['id'] },
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
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / limit),
    };
  }

  async getDepartmentById(id: number, companyId: number): Promise<any> {
    const department = await this.departmentModel.findOne({
      where: { id, companyId },
      include: [
        { model: Designation, attributes: ['id', 'name', 'status'] },
        { model: Employee, attributes: ['id', 'firstName', 'lastName', 'email', 'status'] },
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
}
