import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CompanyHrPolicy } from '../models/company-hr-policy.model';
import { AuditService } from '../../audit/services/audit.service';
import { AuditLog } from '../../audit/models/audit-log.model';
import { User } from '../../users/models/user.model';
import { UpsertCompanyHrPolicyDto } from '../dto/company-hr-policies.dto';
import { AttendancePolicyEngineService, PolicyPreviewResult } from '../../attendance/services/attendance-policy-engine.service';

@Injectable()
export class CompanyHrPoliciesService implements OnModuleInit {
  constructor(
    @InjectModel(CompanyHrPolicy)
    private readonly policyModel: typeof CompanyHrPolicy,
    @InjectModel(AuditLog)
    private readonly auditLogModel: typeof AuditLog,
    @InjectModel(User)
    private readonly userModel: typeof User,
    private readonly auditService: AuditService,
    private readonly policyEngineService: AttendancePolicyEngineService,
  ) {}

  async onModuleInit() {
    // Schema modifications are handled by database migrations (phase-02-hrms)
  }

  async getHrPolicies(companyId: number): Promise<CompanyHrPolicy | null> {
    const policy = await this.policyModel.findOne({
      where: { companyId },
      include: [{ model: User, as: 'updater', attributes: ['id', 'name', 'email'] }],
    });
    return policy;
  }

  async getPolicyPreview(dto: any): Promise<PolicyPreviewResult> {
    return this.policyEngineService.generatePolicyPreview(dto);
  }

  async getPolicyHistory(companyId: number): Promise<any[]> {
    const logs = await this.auditLogModel.findAll({
      where: {
        companyId,
        entityType: 'CompanyHrPolicy',
      },
      include: [{ model: User, attributes: ['id', 'name', 'email'] }],
      order: [['createdAt', 'DESC']],
      limit: 20,
    });

    return logs.map((log, index) => {
      const verNumber = `v1.${logs.length - index}`;
      return {
        id: log.id,
        versionNumber: verNumber,
        createdAt: log.createdAt,
        createdBy: log.user?.name || log.user?.email || 'System Admin',
        oldValue: log.oldValue,
        newValue: log.newValue,
      };
    });
  }

  async getPolicyImpact(companyId: number): Promise<{ affectedEmployees: number }> {
    const activeEmployees = await this.userModel.count({
      where: {
        companyId,
        isActive: true,
      },
    });
    return { affectedEmployees: activeEmployees };
  }

  async upsertHrPolicies(
    companyId: number,
    data: UpsertCompanyHrPolicyDto,
    actor?: any,
  ): Promise<CompanyHrPolicy> {
    let policy = await this.policyModel.findOne({ where: { companyId } });

    const t = await this.policyModel.sequelize.transaction();
    try {
      if (!policy) {
        policy = await this.policyModel.create(
          {
            ...data,
            companyId,
            updatedBy: actor?.userId || null,
          },
          { transaction: t },
        );

        if (actor) {
          await this.auditService.writeDiffLog({
            clientId: actor.clientId,
            companyId,
            userId: actor.userId,
            entityType: 'CompanyHrPolicy',
            entityId: policy.id,
            action: 'CREATE',
            newRecord: policy,
            ipAddress: actor.ipAddress,
            userAgent: actor.userAgent,
          });
        }
      } else {
        const oldRecord = policy.toJSON();

        await policy.update(
          {
            ...data,
            updatedBy: actor?.userId || policy.updatedBy,
          },
          { transaction: t },
        );

        const updated = await policy.reload({
          include: [{ model: User, as: 'updater', attributes: ['id', 'name', 'email'] }],
        });

        if (actor) {
          await this.auditService.writeDiffLog({
            clientId: actor.clientId,
            companyId,
            userId: actor.userId,
            entityType: 'CompanyHrPolicy',
            entityId: policy.id,
            action: 'UPDATE',
            oldRecord,
            newRecord: updated,
            ipAddress: actor.ipAddress,
            userAgent: actor.userAgent,
          });
        }
      }

      await t.commit();
      return this.getHrPolicies(companyId);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }
}
