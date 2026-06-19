import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Employee } from '../models/employee.model';
import { EmployeeDocument, VerificationStatus } from '../models/employee-document.model';
import { User } from '../../users/models/user.model';
import { AuditService } from '../../audit/services/audit.service';
import { StorageService } from './storage.service';
import { EmployeesOrgService } from './employees-org.service';
import * as crypto from 'crypto';
import * as path from 'path';

@Injectable()
export class EmployeesDocumentService {
  constructor(
    @InjectModel(Employee)
    private readonly employeeModel: typeof Employee,
    @InjectModel(EmployeeDocument)
    private readonly employeeDocumentModel: typeof EmployeeDocument,
    private readonly auditService: AuditService,
    private readonly storageService: StorageService,
    private readonly employeesOrgService: EmployeesOrgService,
  ) {}

  async checkDocumentAccess(employeeId: number, companyId: number, actor: any): Promise<void> {
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
      const isManager = await this.employeesOrgService.isCircularManager(actorEmployee.id, employee.id, companyId);
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
