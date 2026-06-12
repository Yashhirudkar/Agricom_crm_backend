import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Employee } from '../models/employee.model';
import { EmployeeDocument } from '../models/employee-document.model';
import { Department } from '../../companies/models/department.model';
import { Designation } from '../models/designation.model';
import { User } from '../../users/models/user.model';
import { UserCompany } from '../../users/models/user-company.model';
import { AuditService } from '../../audit/services/audit.service';
import { UsersService } from '../../users/services/users.service';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    @InjectModel(EmployeeDocument)
    private readonly employeeDocumentModel: typeof EmployeeDocument,
    @InjectModel(Department)
    private readonly departmentModel: typeof Department,
    @InjectModel(Designation)
    private readonly designationModel: typeof Designation,
    private readonly auditService: AuditService,
    private readonly usersService: UsersService,
  ) {}

  private async generateEmployeeCode(companyId: number): Promise<string> {
    const lastEmployee = await this.employeeModel.findOne({
      where: { companyId },
      order: [['id', 'DESC']],
    });

    let nextNumber = 1;
    if (lastEmployee && lastEmployee.employeeCode && lastEmployee.employeeCode.startsWith('EMP')) {
      const numStr = lastEmployee.employeeCode.replace('EMP', '');
      const num = parseInt(numStr, 10);
      if (!isNaN(num)) {
        nextNumber = num + 1;
      }
    }

    return `EMP${nextNumber.toString().padStart(4, '0')}`;
  }

  async createEmployee(companyId: number, data: any, actor?: any): Promise<Employee> {
    if (data.departmentId) {
      const dept = await this.departmentModel.findOne({ where: { id: data.departmentId, companyId } });
      if (!dept) throw new NotFoundException('Department not found');
    }

    if (data.designationId) {
      const desig = await this.designationModel.findOne({ where: { id: data.designationId, companyId } });
      if (!desig) throw new NotFoundException('Designation not found');
    }

    const employeeCode = await this.generateEmployeeCode(companyId);

    const t = await this.employeeModel.sequelize.transaction();
    try {
      let createdUser = null;
      if (data.createLogin && data.password) {
        const name = `${data.firstName} ${data.lastName}`.trim();
        createdUser = await this.usersService.createUser({
          name,
          email: data.email,
          password: data.password,
          clientId: actor?.clientId || null,
          status: data.status || 'Active',
          isActive: data.status === 'Active',
          companies: [{ companyId }]
        }, actor, t);
      }

      const employee = await this.employeeModel.create({
        ...data,
        companyId,
        userId: createdUser ? createdUser.id : null,
        employeeCode,
        status: data.status || 'Active',
        createdBy: actor?.userId || null,
      }, { transaction: t });

      await t.commit();

      if (actor) {
        await this.auditService.writeDiffLog({
          clientId: actor.clientId,
          companyId,
          userId: actor.userId,
          entityType: 'Employee',
          entityId: employee.id,
          action: 'CREATE',
          newRecord: employee,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });
      }

      return employee;
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async updateEmployee(id: number, companyId: number, data: any, actor?: any): Promise<Employee> {
    const employee = await this.employeeModel.findOne({ where: { id, companyId } });
    if (!employee) throw new NotFoundException('Employee not found');

    if (data.departmentId && data.departmentId !== employee.departmentId) {
      const dept = await this.departmentModel.findOne({ where: { id: data.departmentId, companyId } });
      if (!dept) throw new NotFoundException('Department not found');
    }

    if (data.designationId && data.designationId !== employee.designationId) {
      const desig = await this.designationModel.findOne({ where: { id: data.designationId, companyId } });
      if (!desig) throw new NotFoundException('Designation not found');
    }

    const oldRecord = employee.toJSON();

    const t = await this.employeeModel.sequelize.transaction();
    try {
      let updatedUserId = employee.userId;

      if (data.createLogin && data.password && !employee.userId) {
        const name = `${data.firstName || employee.firstName} ${data.lastName || employee.lastName}`.trim();
        const email = data.email || employee.email;
        
        const createdUser = await this.usersService.createUser({
          name,
          email: email,
          password: data.password,
          clientId: actor?.clientId || null,
          status: data.status || employee.status || 'Active',
          isActive: (data.status || employee.status) === 'Active',
          companies: [{ companyId, roleId: data.roleId }]
        }, actor, t);

        updatedUserId = createdUser.id;
      } else if (employee.userId) {
        const userUpdate: any = {};
        if (data.newPassword) userUpdate.password = data.newPassword;
        if (data.status) {
          userUpdate.status = data.status;
          userUpdate.isActive = data.status === 'Active';
        }
        
        if (Object.keys(userUpdate).length > 0) {
          await this.usersService.updateUser(employee.userId, userUpdate, actor, t);
        }
        if (data.roleId !== undefined) {
          await this.usersService.updateUserCompanyRole(employee.userId, companyId, data.roleId, t);
        }
      }

      await employee.update({
        ...data,
        userId: updatedUserId,
        updatedBy: actor?.userId || employee.updatedBy,
      }, { transaction: t });

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

      return updated;
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async deleteEmployee(id: number, companyId: number, actor?: any): Promise<{ message: string }> {
    const employee = await this.employeeModel.findOne({ where: { id, companyId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const oldRecord = employee.toJSON();

    if (actor) {
      await this.auditService.writeDiffLog({
        clientId: actor.clientId,
        companyId,
        userId: actor.userId,
        entityType: 'Employee',
        entityId: employee.id,
        action: 'DELETE',
        oldRecord,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }

    await employee.destroy();
    return { message: 'Employee deleted successfully' };
  }

  async getEmployees(companyId: number, query: any) {
    const { search, status, departmentId, designationId, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'DESC' } = query;

    const whereClause: any = { companyId };
    if (status) whereClause.status = status;
    if (departmentId) whereClause.departmentId = departmentId;
    if (designationId) whereClause.designationId = designationId;
    
    if (search) {
      whereClause[Op.or] = [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { employeeCode: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const offset = (page - 1) * limit;

    const { rows, count } = await this.employeeModel.findAndCountAll({
      where: whereClause,
      limit: Number(limit),
      offset: Number(offset),
      order: [[sortBy, sortOrder]],
      include: [
        { model: Department, attributes: ['id', 'name'] },
        { model: Designation, attributes: ['id', 'name'] },
      ]
    });

    return {
      data: rows,
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / limit),
    };
  }

  async getEmployeeById(id: number, companyId: number): Promise<Employee> {
    const employee = await this.employeeModel.findOne({
      where: { id, companyId },
      include: [
        { model: Department, attributes: ['id', 'name'] },
        { model: Designation, attributes: ['id', 'name'] },
        { 
          model: User, 
          as: 'user', 
          attributes: ['id', 'email', 'status', 'lastLogin'],
          include: [{ model: UserCompany, where: { companyId }, required: false }]
        },
      ]
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  // --- Documents ---

  async addDocument(employeeId: number, companyId: number, data: any, actor?: any): Promise<EmployeeDocument> {
    const employee = await this.employeeModel.findOne({ where: { id: employeeId, companyId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const document = await this.employeeDocumentModel.create({
      employeeId,
      documentType: data.documentType,
      fileName: data.fileName,
      fileUrl: data.fileUrl,
      uploadedBy: actor?.userId || null,
    } as any);

    if (actor) {
      await this.auditService.writeDiffLog({
        clientId: actor.clientId,
        companyId,
        userId: actor.userId,
        entityType: 'EmployeeDocument',
        entityId: document.id,
        action: 'CREATE',
        newRecord: document,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }

    return document;
  }

  async getDocuments(employeeId: number, companyId: number): Promise<EmployeeDocument[]> {
    const employee = await this.employeeModel.findOne({ where: { id: employeeId, companyId } });
    if (!employee) throw new NotFoundException('Employee not found');

    return this.employeeDocumentModel.findAll({
      where: { employeeId },
      include: [{ model: User, as: 'uploader', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']],
    });
  }

  async deleteDocument(employeeId: number, documentId: number, companyId: number, actor?: any): Promise<{ message: string }> {
    const employee = await this.employeeModel.findOne({ where: { id: employeeId, companyId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const document = await this.employeeDocumentModel.findOne({ where: { id: documentId, employeeId } });
    if (!document) throw new NotFoundException('Document not found');

    const oldRecord = document.toJSON();

    if (actor) {
      await this.auditService.writeDiffLog({
        clientId: actor.clientId,
        companyId,
        userId: actor.userId,
        entityType: 'EmployeeDocument',
        entityId: document.id,
        action: 'DELETE',
        oldRecord,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }

    await document.destroy();
    return { message: 'Document deleted successfully' };
  }
}
