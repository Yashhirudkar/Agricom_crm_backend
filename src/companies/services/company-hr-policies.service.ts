import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CompanyHrPolicy } from '../models/company-hr-policy.model';
import { AuditService } from '../../audit/services/audit.service';
import { UpsertCompanyHrPolicyDto } from '../dto/company-hr-policies.dto';

@Injectable()
export class CompanyHrPoliciesService {
  constructor(
    @InjectModel(CompanyHrPolicy)
    private readonly policyModel: typeof CompanyHrPolicy,
    private readonly auditService: AuditService,
  ) {}

  async getHrPolicies(companyId: number): Promise<CompanyHrPolicy> {
    let policy = await this.policyModel.findOne({ where: { companyId } });
    if (!policy) {
      // Return defaults if none created yet
      policy = this.policyModel.build({ companyId });
    }
    return policy;
  }

  async upsertHrPolicies(companyId: number, data: UpsertCompanyHrPolicyDto, actor?: any): Promise<CompanyHrPolicy> {
    let policy = await this.policyModel.findOne({ where: { companyId } });

    const t = await this.policyModel.sequelize.transaction();
    try {
      if (!policy) {
        policy = await this.policyModel.create({
          ...data,
          companyId,
          updatedBy: actor?.userId || null,
        } as any, { transaction: t });

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

        await policy.update({
          ...data,
          updatedBy: actor?.userId || policy.updatedBy,
        }, { transaction: t });

        const updated = await policy.reload();

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
      return policy;
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }
}
