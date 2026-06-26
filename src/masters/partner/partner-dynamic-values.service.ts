import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { PartnerDynamicValues } from './partner-dynamic-values.model';
import { PartnerRoleDynamicConfig } from '../partner-role/partner-role-dynamic-config.model';
import { Partner } from './partner.model';
import { SavePartnerDynamicValuesDto } from './dto/save-partner-dynamic-values.dto';
import { AuditService } from '../../audit/services/audit.service';

@Injectable()
export class PartnerDynamicValuesService {
  constructor(
    @InjectModel(PartnerDynamicValues)
    private readonly valuesModel: typeof PartnerDynamicValues,
    @InjectModel(PartnerRoleDynamicConfig)
    private readonly configModel: typeof PartnerRoleDynamicConfig,
    @InjectModel(Partner)
    private readonly partnerModel: typeof Partner,
    private readonly sequelize: Sequelize,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Validate partner exists and is active.
   */
  private async validatePartner(partnerId: number): Promise<Partner> {
    const partner = await this.partnerModel.findOne({
      where: { id: partnerId, isActive: true },
    });
    if (!partner) {
      throw new NotFoundException(`Partner with id=${partnerId} not found or inactive`);
    }
    return partner;
  }

  /**
   * GET /masters/partners/:partnerId/additional-info
   *
   * Returns both:
   *   1. The currently active schema for the partner's role (for frontend rendering).
   *   2. The partner's saved values (if any have been submitted before).
   *
   * If no config exists for the role → returns { hasConfig: false, schema: null, values: null }
   * If no values saved yet → returns { hasConfig: true, schema: {...}, values: null, configId: N }
   */
  async getAdditionalInfo(partnerId: number): Promise<{
    hasConfig: boolean;
    configId: number | null;
    version: number | null;
    schemaJson: Record<string, any> | null;
    configName: string | null;
    values: Record<string, any> | null;
    schemaVersion: number | null;
  }> {
    const partner = await this.validatePartner(partnerId);

    // Get the active config for this partner's role
    const activeConfig = await this.configModel.findOne({
      where: { partnerRoleId: partner.partnerRoleId, isActive: true },
      order: [['version', 'DESC']],
    });

    if (!activeConfig) {
      return {
        hasConfig: false,
        configId: null,
        version: null,
        schemaJson: null,
        configName: null,
        values: null,
        schemaVersion: null,
      };
    }

    // Get this partner's saved values (if any) — most recent for this partner
    const savedValues = await this.valuesModel.findOne({
      where: { partnerId },
      include: [
        {
          model: PartnerRoleDynamicConfig,
          attributes: ['id', 'configName', 'version', 'schemaJson'],
        },
      ],
      order: [['updatedAt', 'DESC']],
    });

    return {
      hasConfig: true,
      configId: activeConfig.id,
      version: activeConfig.version,
      schemaJson: activeConfig.schemaJson,
      configName: activeConfig.configName,
      values: savedValues?.valuesJson || null,
      schemaVersion: savedValues?.schemaVersion || null,
    };
  }

  /**
   * PUT /masters/partners/:partnerId/additional-info
   *
   * Upserts the partner's dynamic field values.
   *
   * Business rules enforced:
   * 1. Partner must exist and be active.
   * 2. The submitted configId must belong to the partner's current role.
   * 3. configId must be active (not an old deactivated version).
   * 4. schema_version is captured from the config row at save time (Correction 3).
   * 5. UNIQUE(partner_id, config_id) handles the upsert logic.
   *    - If a record exists for this partner+config → UPDATE values_json.
   *    - If no record exists → INSERT new row.
   */
  async saveAdditionalInfo(
    partnerId: number,
    dto: SavePartnerDynamicValuesDto,
    user?: any,
  ): Promise<PartnerDynamicValues> {
    const partner = await this.validatePartner(partnerId);

    // Guard: Partner's role must have an active dynamic schema configured.
    // Without a schema, saving values is meaningless and should be rejected.
    const activeConfigForRole = await this.configModel.findOne({
      where: { partnerRoleId: partner.partnerRoleId, isActive: true },
    });
    if (!activeConfigForRole) {
      throw new BadRequestException(
        'Dynamic configuration not defined for selected partner role. ' +
          'A Super Admin must configure the Additional Information schema first.',
      );
    }

    // Validate the submitted configId is active
    const config = await this.configModel.findOne({
      where: { id: dto.configId, isActive: true },
    });

    if (!config) {
      throw new BadRequestException(
        `Config with id=${dto.configId} is not active. ` +
          `Fetch the current config first and resubmit.`,
      );
    }

    // Verify configId belongs to the partner's actual role — prevent cross-role injection
    if (config.partnerRoleId !== partner.partnerRoleId) {
      throw new BadRequestException(
        `Config id=${dto.configId} does not belong to this partner's role. ` +
          `Mismatched role configuration submission rejected.`,
      );
    }

    return await this.sequelize.transaction(async (transaction) => {
      // Check if a values record already exists for this partner+config combination
      const existing = await this.valuesModel.findOne({
        where: { partnerId, configId: dto.configId },
        transaction,
      });

      let result: PartnerDynamicValues;
      const isCreate = !existing;

      if (existing) {
        // Update existing values
        await existing.update(
          {
            valuesJson: dto.valuesJson,
            schemaVersion: config.version, // Refresh schema_version on every save
          },
          { transaction },
        );
        result = await existing.reload({ transaction });
      } else {
        // Create new values record
        result = await this.valuesModel.create(
          {
            partnerId,
            configId: dto.configId,
            schemaVersion: config.version, // Capture version at save time (Correction 3)
            valuesJson: dto.valuesJson,
          },
          { transaction },
        );
      }

      // Audit log
      await this.auditService.writeLog({
        clientId: user?.clientId || null,
        companyId: user?.companyId || null,
        userId: user?.userId || null,
        entityType: 'PartnerAdditionalInfo',
        entityId: partnerId,
        action: isCreate ? 'CREATE' : 'UPDATE',
        oldValue: isCreate ? null : { configId: dto.configId, schemaVersion: existing?.schemaVersion },
        newValue: {
          configId: dto.configId,
          schemaVersion: config.version,
          valuesJson: dto.valuesJson,
        },
      });

      return result;
    });
  }
}
