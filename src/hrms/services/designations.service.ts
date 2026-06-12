import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
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

  async createDesignation(companyId: number, data: { departmentId: number; name: string; description?: string; status?: string }, actor?: any): Promise<Designation> {
    const department = await this.departmentModel.findOne({ where: { id: data.departmentId, companyId } });
    if (!department) throw new NotFoundException('Department not found');

    const designation = await this.designationModel.create({
      companyId,
      departmentId: data.departmentId,
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

  async updateDesignation(id: number, companyId: number, data: { name?: string; description?: string; status?: string; departmentId?: number }, actor?: any): Promise<Designation> {
    const designation = await this.designationModel.findOne({ where: { id, companyId } });
    if (!designation) throw new NotFoundException('Designation not found');

    if (data.departmentId && data.departmentId !== designation.departmentId) {
      const department = await this.departmentModel.findOne({ where: { id: data.departmentId, companyId } });
      if (!department) throw new NotFoundException('Department not found');
    }

    const oldRecord = designation.toJSON();

    await designation.update({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.status !== undefined && { status: data.status }),
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

    await designation.destroy();
    return { message: 'Designation deleted successfully' };
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
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / limit),
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
}
