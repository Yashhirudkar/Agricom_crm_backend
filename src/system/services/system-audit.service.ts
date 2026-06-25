import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { SystemAuditLog } from '../models/system-audit-log.model';

@Injectable()
export class SystemAuditService {
  constructor(
    @InjectModel(SystemAuditLog)
    private readonly systemAuditLogModel: typeof SystemAuditLog,
  ) {}

  async logAction(userId: number | null, action: string, payload: any) {
    return this.systemAuditLogModel.create({
      user_id: userId,
      action,
      payload,
    });
  }
}
