import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AuditLog } from '../models/audit-log.model';
import { User } from '../../users/models/user.model';
import { Op } from 'sequelize';

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog)
    private readonly auditLogModel: typeof AuditLog,
  ) {}

  async writeLog(params: {
    clientId: number | null;
    companyId: number | null;
    userId: number | null;
    entityType: string;
    entityId: number | null;
    action: string;
    oldValue?: any;
    newValue?: any;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuditLog> {
    return this.auditLogModel.create({
      clientId: params.clientId,
      companyId: params.companyId,
      userId: params.userId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      oldValue: params.oldValue || null,
      newValue: params.newValue || null,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
    } as any);
  }

  async writeDiffLog(params: {
    clientId: number | null;
    companyId: number | null;
    userId: number | null;
    entityType: string;
    entityId: number | null;
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    oldRecord?: any;
    newRecord?: any;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuditLog | null> {
    let oldValue: any = null;
    let newValue: any = null;

    const sensitiveFields = ['password', 'accessToken', 'refreshToken', 'sessionId', 'createdAt', 'updatedAt'];

    const sanitizeRecord = (rec: any) => {
      if (!rec) return null;
      const clean: any = {};
      const raw = typeof rec.toJSON === 'function' ? rec.toJSON() : rec;
      for (const key of Object.keys(raw)) {
        if (sensitiveFields.includes(key)) continue;
        clean[key] = raw[key];
      }
      return clean;
    };

    if (params.action === 'CREATE') {
      newValue = sanitizeRecord(params.newRecord);
    } else if (params.action === 'DELETE') {
      oldValue = sanitizeRecord(params.oldRecord);
    } else if (params.action === 'UPDATE') {
      const cleanOld = sanitizeRecord(params.oldRecord) || {};
      const cleanNew = sanitizeRecord(params.newRecord) || {};

      const allKeys = new Set([...Object.keys(cleanOld), ...Object.keys(cleanNew)]);
      let hasChanges = false;

      const diffOld: any = {};
      const diffNew: any = {};

      for (const key of allKeys) {
        const oldVal = cleanOld[key];
        const newVal = cleanNew[key];
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          diffOld[key] = oldVal === undefined ? null : oldVal;
          diffNew[key] = newVal === undefined ? null : newVal;
          hasChanges = true;
        }
      }

      if (!hasChanges) {
        return null;
      }
      oldValue = diffOld;
      newValue = diffNew;
    }

    return this.writeLog({
      clientId: params.clientId,
      companyId: params.companyId,
      userId: params.userId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      oldValue,
      newValue,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
  }

  async getLogs(params: {
    clientId?: number | null;
    entityType?: string;
    action?: string;
    userId?: number;
  }): Promise<AuditLog[]> {
    const where: any = {};

    if (params.clientId !== undefined && params.clientId !== null) {
      where.clientId = params.clientId;
    }
    if (params.entityType) {
      where.entityType = params.entityType;
    }
    if (params.action) {
      where.action = params.action;
    }
    if (params.userId) {
      where.userId = params.userId;
    }

    return this.auditLogModel.findAll({
      where,
      include: [
        { model: User, attributes: ['id', 'name', 'email'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 100, // safety limit
    });
  }
}
