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
  ) {}

  private async isCircularManager(employeeId: number, managerId: number, companyId: number): Promise<boolean> {
    if (employeeId === managerId) return true;
    const subordinates = await this.getAllSubordinates(employeeId, companyId);
    return subordinates.some(sub => sub.id === managerId);
  }

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
        const isCircular = await this.isCircularManager(employee.id, data.managerId, companyId);
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

  // --- Documents ---

  private async checkDocumentAccess(employeeId: number, companyId: number, actor: any): Promise<void> {
    const employee = await this.employeeModel.findOne({ where: { id: employeeId, companyId } });
    if (!employee) throw new NotFoundException('Employee not found');

    if (actor.type === 'super_admin' || actor.type === 'client_admin') {
      return;
    }

    const isSelf = employee.userId && employee.userId === actor.userId;
    if (isSelf) {
      return;
    }

    const actorEmployee = await this.employeeModel.findOne({ where: { userId: actor.userId, companyId } });
    if (actorEmployee) {
      const isManager = await this.isCircularManager(actorEmployee.id, employee.id, companyId);
      if (isManager) {
        return;
      }
    }

    throw new ForbiddenException('Access denied to this employee documents');
  }

  async addDocument(employeeId: number, companyId: number, data: any, file: Express.Multer.File, actor?: any): Promise<EmployeeDocument> {
    const employee = await this.employeeModel.findOne({ where: { id: employeeId, companyId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const relativeDir = `tenants/${companyId}/employees/${employeeId}/documents`;
    const uniqueFilename = `${crypto.randomUUID()}${path.extname(file.originalname)}`;
    const filePath = await this.storageService.uploadFile(file, relativeDir, uniqueFilename);

    const t = await this.employeeModel.sequelize!.transaction();
    try {
      const existingDoc = await this.employeeDocumentModel.findOne({
        where: { employeeId, documentType: data.documentType, isActive: true },
        order: [['version', 'DESC']],
        transaction: t,
      });

      let version = 1;
      if (existingDoc) {
        version = existingDoc.version + 1;
        await existingDoc.update({ isActive: false }, { transaction: t });
      }

      const document = await this.employeeDocumentModel.create({
        employeeId,
        companyId,
        documentCategory: data.documentCategory,
        documentType: data.documentType,
        documentName: data.documentName || data.documentType,
        fileName: file.originalname,
        fileUrl: '', // Populated next
        filePath,
        fileSize: file.size,
        mimeType: file.mimetype,
        documentNumber: data.documentNumber || null,
        issueDate: data.issueDate || null,
        expiryDate: data.expiryDate || null,
        notifyBeforeExpiryDays: data.notifyBeforeExpiryDays || null,
        verificationStatus: VerificationStatus.PENDING,
        isMandatory: data.isMandatory === 'true' || data.isMandatory === true,
        version,
        isActive: true,
        uploadedBy: actor?.userId || null,
      } as any, { transaction: t });

      const fileUrl = `/employees/${employeeId}/documents/${document.id}/download`;
      await document.update({ fileUrl }, { transaction: t });

      await t.commit();

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
    } catch (err) {
      await t.rollback();
      await this.storageService.deleteFile(filePath).catch(() => {});
      throw err;
    }
  }

  async getDocuments(employeeId: number, companyId: number, actor?: any): Promise<EmployeeDocument[]> {
    if (actor) {
      await this.checkDocumentAccess(employeeId, companyId, actor);
    }

    return this.employeeDocumentModel.findAll({
      where: { employeeId, isActive: true },
      include: [
        { model: User, as: 'uploader', attributes: ['id', 'name'] },
        { model: User, as: 'verifier', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  async deleteDocument(employeeId: number, documentId: number, companyId: number, actor?: any): Promise<{ message: string }> {
    const employee = await this.employeeModel.findOne({ where: { id: employeeId, companyId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const document = await this.employeeDocumentModel.findOne({
      where: { id: documentId, employeeId, companyId }
    });
    if (!document) throw new NotFoundException('Document not found');

    if (actor) {
      const isSelf = employee.userId !== null && employee.userId !== undefined && employee.userId === actor.userId;
      const isAdmin = actor.type === 'super_admin' || actor.type === 'client_admin';

      if (!isSelf && !isAdmin) {
        throw new ForbiddenException('Access denied to delete this document');
      }

      if (isSelf && !isAdmin) {
        if (document.verificationStatus === VerificationStatus.VERIFIED) {
          throw new BadRequestException('Verified documents cannot be deleted by the employee');
        }
      }
    }

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

    if (document.filePath) {
      await this.storageService.deleteFile(document.filePath);
    }

    await document.destroy();
    return { message: 'Document deleted successfully' };
  }

  async verifyDocument(employeeId: number, documentId: number, companyId: number, data: any, actor?: any): Promise<EmployeeDocument> {
    const document = await this.employeeDocumentModel.findOne({
      where: { id: documentId, employeeId, companyId }
    });
    if (!document) throw new NotFoundException('Document not found');

    if (document.expiryDate && new Date(document.expiryDate) < new Date()) {
      throw new BadRequestException('Cannot verify an expired document');
    }

    const oldRecord = document.toJSON();

    const t = await this.employeeDocumentModel.sequelize!.transaction();
    try {
      await document.update({
        verificationStatus: data.verificationStatus,
        verificationRemarks: data.verificationRemarks || null,
        verifiedBy: actor?.userId || null,
        verifiedAt: new Date(),
      }, { transaction: t });

      await t.commit();
      const updated = await document.reload();

      if (actor) {
        await this.auditService.writeDiffLog({
          clientId: actor.clientId,
          companyId,
          userId: actor.userId,
          entityType: 'EmployeeDocument',
          entityId: document.id,
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

  async downloadDocument(employeeId: number, documentId: number, companyId: number, actor: any): Promise<string> {
    await this.checkDocumentAccess(employeeId, companyId, actor);

    const document = await this.employeeDocumentModel.findOne({
      where: { id: documentId, employeeId, companyId }
    });
    if (!document) throw new NotFoundException('Document not found');

    return this.storageService.getAbsoluteFilePath(document.filePath);
  }
}
