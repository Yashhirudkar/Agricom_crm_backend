import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes } from 'sequelize';
import { Employee, EmployeeStatus } from '../models/employee.model';
import { EmployeeLifecycleLog } from '../models/employee-lifecycle-log.model';
import { EmployeeDocument, DocumentCategory, VerificationStatus } from '../models/employee-document.model';
import { Department } from '../../companies/models/department.model';
import { Designation } from '../models/designation.model';
import { User } from '../../users/models/user.model';
import { UserCompany } from '../../users/models/user-company.model';
import { AuditService } from '../../audit/services/audit.service';
import { UsersService } from '../../users/services/users.service';
import { StorageService } from './storage.service';
import { EmployeesOrgService } from './employees-org.service';
import { EmployeesDocumentService } from './employees-document.service';
import * as crypto from 'crypto';
import * as path from 'path';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    @InjectModel(EmployeeDocument)
    private readonly employeeDocumentModel: typeof EmployeeDocument,
    @InjectModel(EmployeeLifecycleLog)
    private readonly employeeLifecycleLogModel: typeof EmployeeLifecycleLog,
    @InjectModel(Department)
    private readonly departmentModel: typeof Department,
    @InjectModel(Designation)
    private readonly designationModel: typeof Designation,
    private readonly auditService: AuditService,
    private readonly usersService: UsersService,
    private readonly storageService: StorageService,
    private readonly eventEmitter: EventEmitter2,
    private readonly orgService: EmployeesOrgService,
    private readonly documentService: EmployeesDocumentService,
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

    return `EMP${nextNumber.toString().padStart(3, '0')}`;
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

    if (data.managerId) {
      const manager = await this.employeeModel.findOne({ where: { id: data.managerId } });
      if (!manager) throw new NotFoundException('Manager not found');
      if (manager.companyId !== companyId) {
        throw new BadRequestException('Manager must belong to the same company');
      }
      if (manager.status === EmployeeStatus.TERMINATED) {
        throw new BadRequestException('A terminated employee cannot be assigned as a manager');
      }
    }

    if (data.employeeCode) {
      const existing = await this.employeeModel.findOne({ where: { companyId, employeeCode: data.employeeCode } });
      if (existing) {
        throw new BadRequestException(`Employee code '${data.employeeCode}' already exists in this company`);
      }
    }

    const employeeCode = data.employeeCode || (await this.generateEmployeeCode(companyId));

    const t = await this.employeeModel.sequelize.transaction();
    try {
      let createdUser = null;
      if (data.createLogin) {
        if (!data.password) {
          throw new BadRequestException("Password is required when creating a login account.");
        }
        const name = `${data.firstName} ${data.lastName}`.trim();
        createdUser = await this.usersService.createUser({
          name,
          email: data.email,
          password: data.password,
          clientId: actor?.clientId || null,
          status: ['ACTIVE', 'PROBATION', 'NOTICE_PERIOD', 'CONFIRMED'].includes(data.status || 'DRAFT') ? 'Active' : 'Inactive',
          isActive: ['ACTIVE', 'PROBATION', 'NOTICE_PERIOD', 'CONFIRMED'].includes(data.status || 'DRAFT'),
          companies: [{ companyId, roleId: data.roleId || null }]
        }, actor, t);
      }

      if (data.userId) {
        const existingEmployeeForUser = await this.employeeModel.findOne({
          where: { userId: data.userId }
        });
        if (existingEmployeeForUser) {
          throw new BadRequestException('This user is already linked to another employee profile');
        }
      }

      const employee = await this.employeeModel.create({
        ...data,
        companyId,
        userId: createdUser ? createdUser.id : (data.userId || null),
        employeeCode: data.employeeCode || employeeCode,
        status: data.status || 'DRAFT',
        employmentType: data.employmentType || 'FULL_TIME',
        workMode: data.workMode || 'OFFICE',
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

  async transitionLifecycle(id: number, companyId: number, targetStatus: string, dto: any, actor: any): Promise<{ message: string, employee: Employee }> {
    const employee = await this.employeeModel.findOne({ where: { id, companyId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const currentStatus = employee.status;
    let newStatus = targetStatus as EmployeeStatus;

    // Workflow validation rules
    if (newStatus === EmployeeStatus.CONFIRMED && currentStatus === EmployeeStatus.TERMINATED) {
      throw new BadRequestException('A terminated employee cannot be confirmed');
    }
    if (newStatus === EmployeeStatus.ACTIVE && currentStatus === EmployeeStatus.RESIGNED) {
      throw new BadRequestException('A resigned employee cannot return to active without proper re-onboarding');
    }
    if (newStatus === EmployeeStatus.RESIGNED) {
      if (currentStatus !== EmployeeStatus.CONFIRMED && currentStatus !== EmployeeStatus.NOTICE_PERIOD) {
        throw new BadRequestException('Only confirmed or notice period employees can resign');
      }
    }

    if (currentStatus === newStatus) {
      throw new BadRequestException(`Employee is already in ${newStatus} state`);
    }

    const t = await this.employeeModel.sequelize.transaction();
    try {
      const oldRecord = employee.toJSON();

      await employee.update({ 
        status: newStatus,
        updatedBy: actor?.userId || employee.updatedBy
      }, { transaction: t });

      await this.employeeLifecycleLogModel.create({
        employeeId: employee.id,
        oldStatus: currentStatus,
        newStatus: newStatus,
        changedBy: actor?.userId || null,
        remarks: dto.remarks || null,
        effectiveDate: dto.effectiveDate || new Date(),
      }, { transaction: t });

      // If tied to user, update user status as well if it means deactivation
      if (employee.userId) {
        const isActiveStatus = ['ACTIVE', 'PROBATION', 'NOTICE_PERIOD', 'CONFIRMED'].includes(newStatus);
        await this.usersService.updateUser(employee.userId, { 
          status: isActiveStatus ? 'Active' : 'Inactive',
          isActive: isActiveStatus
        }, actor, t);
      }

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

      this.eventEmitter.emit(`employee.lifecycle.${newStatus.toLowerCase()}`, {
        employeeId: employee.id,
        companyId,
        oldStatus: currentStatus,
        newStatus,
        actor
      });

      return { message: `Employee successfully transitioned to ${newStatus}`, employee: updated };
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

    if (data.managerId !== undefined && data.managerId !== employee.managerId) {
      if (data.managerId === employee.id) {
        throw new BadRequestException('Employee cannot be their own manager');
      }
      if (data.managerId !== null) {
        const manager = await this.employeeModel.findOne({ where: { id: data.managerId } });
        if (!manager) throw new NotFoundException('Manager not found');
        if (manager.companyId !== companyId) {
          throw new BadRequestException('Manager must belong to the same company');
        }
        if (manager.status === EmployeeStatus.TERMINATED) {
          throw new BadRequestException('A terminated employee cannot be assigned as a manager');
        }
        const isCircular = await this.orgService.isCircularManager(employee.id, data.managerId, companyId);
        if (isCircular) {
          throw new BadRequestException('Circular reporting hierarchy detected (e.g. manager reports back to this employee)');
        }
      }
    }

    if (data.employeeCode && data.employeeCode !== employee.employeeCode) {
      const existing = await this.employeeModel.findOne({ where: { companyId, employeeCode: data.employeeCode } });
      if (existing) {
        throw new BadRequestException(`Employee code '${data.employeeCode}' already exists in this company`);
      }
    }

    const oldRecord = employee.toJSON();

    const t = await this.employeeModel.sequelize.transaction();
    try {
      let updatedUserId = data.userId !== undefined ? data.userId : employee.userId;

      if (data.userId) {
        const existingEmployeeForUser = await this.employeeModel.findOne({
          where: { userId: data.userId, id: { [Op.ne]: id } }
        });
        if (existingEmployeeForUser) {
          throw new BadRequestException('This user is already linked to another employee profile');
        }
      }

      if (data.createLogin && data.password && !employee.userId) {
        const name = `${data.firstName || employee.firstName} ${data.lastName || employee.lastName}`.trim();
        const email = data.email || employee.email;
        
        const createdUser = await this.usersService.createUser({
          name,
          email: email,
          password: data.password,
          clientId: actor?.clientId || null,
          status: ['ACTIVE', 'PROBATION', 'NOTICE_PERIOD', 'CONFIRMED'].includes(data.status || employee.status || 'DRAFT') ? 'Active' : 'Inactive',
          isActive: ['ACTIVE', 'PROBATION', 'NOTICE_PERIOD', 'CONFIRMED'].includes(data.status || employee.status || 'DRAFT'),
          companies: [{ companyId, roleId: data.roleId }]
        }, actor, t);

        updatedUserId = createdUser.id;
      } else if (updatedUserId) {
        const userUpdate: any = {};
        if (data.newPassword) userUpdate.password = data.newPassword;
        if (data.status) {
          const isActiveStatus = ['ACTIVE', 'PROBATION', 'NOTICE_PERIOD', 'CONFIRMED'].includes(data.status);
          userUpdate.status = isActiveStatus ? 'Active' : 'Inactive';
          userUpdate.isActive = isActiveStatus;
        }
        
        if (Object.keys(userUpdate).length > 0) {
          await this.usersService.updateUser(updatedUserId, userUpdate, actor, t);
        }
        if (data.roleId !== undefined) {
          await this.usersService.updateUserCompanyRole(updatedUserId, companyId, data.roleId, t);
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
        { model: Employee, as: 'manager', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { model: EmployeeLifecycleLog, attributes: ['id', 'oldStatus', 'newStatus', 'remarks', 'createdAt'] },
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
        { model: Employee, as: 'manager', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { 
          model: User, 
          as: 'user', 
          attributes: ['id', 'email', 'status', 'lastLogin'],
          include: [{ model: UserCompany, where: { companyId }, required: false }]
        },
        {
          model: EmployeeLifecycleLog,
          attributes: ['id', 'oldStatus', 'newStatus', 'remarks', 'effectiveDate', 'createdAt']
        }
      ]
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  // --- Organization Hierarchy ---

  async getOrgChart(companyId: number): Promise<any[]> {
    return this.orgService.getOrgChart(companyId);
  }

  async getTeam(managerId: number, companyId: number): Promise<Employee[]> {
    return this.orgService.getTeam(managerId, companyId);
  }

  async getAllSubordinates(managerId: number, companyId: number): Promise<any[]> {
    return this.orgService.getAllSubordinates(managerId, companyId);
  }

  async getReportingChain(employeeId: number, companyId: number): Promise<any[]> {
    return this.orgService.getReportingChain(employeeId, companyId);
  }

  async changeManager(employeeId: number, companyId: number, dto: any, actor: any): Promise<{ message: string }> {
    return this.orgService.changeManager(employeeId, companyId, dto, actor);
  }

  // --- Documents ---

  async addDocument(employeeId: number, companyId: number, data: any, file: Express.Multer.File, actor?: any): Promise<EmployeeDocument> {
    return this.documentService.addDocument(employeeId, companyId, data, file, actor);
  }

  async getDocuments(employeeId: number, companyId: number, actor?: any): Promise<EmployeeDocument[]> {
    return this.documentService.getDocuments(employeeId, companyId, actor);
  }

  async deleteDocument(employeeId: number, documentId: number, companyId: number, actor?: any): Promise<{ message: string }> {
    return this.documentService.deleteDocument(employeeId, documentId, companyId, actor);
  }

  async verifyDocument(employeeId: number, documentId: number, companyId: number, data: any, actor?: any): Promise<EmployeeDocument> {
    return this.documentService.verifyDocument(employeeId, documentId, companyId, data, actor);
  }

  async downloadDocument(employeeId: number, documentId: number, companyId: number, actor: any): Promise<string> {
    return this.documentService.downloadDocument(employeeId, documentId, companyId, actor);
  }
}
