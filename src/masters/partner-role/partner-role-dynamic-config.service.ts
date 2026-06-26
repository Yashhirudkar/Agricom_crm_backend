import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Op } from 'sequelize';
import { PartnerRoleDynamicConfig } from './partner-role-dynamic-config.model';
import { PartnerDynamicConfigHistory } from './partner-dynamic-config-history.model';
import { PartnerRole } from './partner-role.model';
import { PartnerDynamicValues } from '../partner/partner-dynamic-values.model';
import { User } from '../../users/models/user.model';
import { CreateDynamicConfigDto } from './dto/create-dynamic-config.dto';
import { UpdateDynamicConfigDto } from './dto/update-dynamic-config.dto';
import { AuditService } from '../../audit/services/audit.service';

// ---------------------------------------------------------------------------
// Allowed field types — single source of truth for schema validation
// ---------------------------------------------------------------------------
const ALLOWED_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'email',
  'date',
  'select',
  'multiselect',
  'checkbox',
] as const;

type AllowedFieldType = (typeof ALLOWED_FIELD_TYPES)[number];

const TYPES_REQUIRING_OPTIONS: AllowedFieldType[] = ['select', 'multiselect'];

@Injectable()
export class PartnerRoleDynamicConfigService {
  constructor(
    @InjectModel(PartnerRoleDynamicConfig)
    private readonly configModel: typeof PartnerRoleDynamicConfig,
    @InjectModel(PartnerDynamicConfigHistory)
    private readonly historyModel: typeof PartnerDynamicConfigHistory,
    @InjectModel(PartnerRole)
    private readonly partnerRoleModel: typeof PartnerRole,
    @InjectModel(PartnerDynamicValues)
    private readonly valuesModel: typeof PartnerDynamicValues,
    private readonly sequelize: Sequelize,
    private readonly auditService: AuditService,
  ) {}

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  /**
   * Validate that a partner role exists and is active.
   */
  private async validateRole(roleId: number): Promise<PartnerRole> {
    const role = await this.partnerRoleModel.findOne({
      where: { id: roleId, isActive: true },
    });
    if (!role) {
      throw new NotFoundException(
        `Partner Role with id=${roleId} not found or inactive`,
      );
    }
    return role;
  }

  /**
   * Validate a single field definition (parent or child level).
   *
   * Required fields validated:
   *   key   — non-empty string
   *   label — non-empty string
   *   type  — must be one of ALLOWED_FIELD_TYPES
   *
   * Conditional validation:
   *   select / multiselect → options[] required (non-empty, each item a non-empty string)
   *   children (top-level only) → must be plain object; each child array validated recursively
   *
   * Optional metadata passthrough (Fix 4):
   *   required, placeholder, helpText, defaultValue, displayOrder
   *   Frontend will use these for rendering. Backend stores them in JSONB as-is.
   *   Lightweight type checks applied where type is predictable.
   *
   * @param field        The field object to validate
   * @param ref          Human-readable path for error messages (e.g. "fields[0]")
   * @param allowChildren Whether to recurse into children (false for child fields)
   */
  private validateField(
    field: any,
    ref: string,
    allowChildren: boolean,
  ): void {
    // --- key ---
    if (!field.key || typeof field.key !== 'string' || !field.key.trim()) {
      throw new BadRequestException(
        `Invalid schema format: ${ref}.key is required and must be a non-empty string.`,
      );
    }

    // --- label ---
    if (
      !field.label ||
      typeof field.label !== 'string' ||
      !field.label.trim()
    ) {
      throw new BadRequestException(
        `Invalid schema format: ${ref}.label is required and must be a non-empty string.`,
      );
    }

    // --- type ---
    if (!field.type || typeof field.type !== 'string') {
      throw new BadRequestException(
        `Invalid schema format: ${ref}.type is required.`,
      );
    }
    if (!ALLOWED_FIELD_TYPES.includes(field.type as AllowedFieldType)) {
      throw new BadRequestException(
        `Invalid schema format: ${ref}.type "${field.type}" is not allowed. ` +
          `Allowed types: ${ALLOWED_FIELD_TYPES.join(', ')}.`,
      );
    }

    // --- options (required for select / multiselect) ---
    if (TYPES_REQUIRING_OPTIONS.includes(field.type as AllowedFieldType)) {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        throw new BadRequestException(
          `Invalid schema format: ${ref} has type "${field.type}" and requires ` +
            `a non-empty options array.`,
        );
      }
      field.options.forEach((opt: any, idx: number) => {
        if (typeof opt !== 'string' || !opt.trim()) {
          throw new BadRequestException(
            `Invalid schema format: ${ref}.options[${idx}] must be a non-empty string.`,
          );
        }
      });
    }

    // Fix 4 — Optional metadata field validation (lightweight type checks)
    // These are stored in JSONB as-is and used by frontend for rendering.
    if (field.required !== undefined && typeof field.required !== 'boolean') {
      throw new BadRequestException(
        `Invalid schema format: ${ref}.required must be a boolean if provided.`,
      );
    }
    if (
      field.placeholder !== undefined &&
      (typeof field.placeholder !== 'string')
    ) {
      throw new BadRequestException(
        `Invalid schema format: ${ref}.placeholder must be a string if provided.`,
      );
    }
    if (
      field.helpText !== undefined &&
      typeof field.helpText !== 'string'
    ) {
      throw new BadRequestException(
        `Invalid schema format: ${ref}.helpText must be a string if provided.`,
      );
    }
    if (
      field.displayOrder !== undefined &&
      typeof field.displayOrder !== 'number'
    ) {
      throw new BadRequestException(
        `Invalid schema format: ${ref}.displayOrder must be a number if provided.`,
      );
    }
    // defaultValue is intentionally not type-checked — can be string, array, boolean, null

    // --- children (only top-level fields, not child fields) ---
    if (allowChildren && field.children !== undefined) {
      if (
        typeof field.children !== 'object' ||
        Array.isArray(field.children) ||
        field.children === null
      ) {
        throw new BadRequestException(
          `Invalid schema format: ${ref}.children must be a plain object ` +
            `mapping option values to arrays of child field definitions.`,
        );
      }

      for (const [optionKey, childFields] of Object.entries(field.children)) {
        if (!Array.isArray(childFields)) {
          throw new BadRequestException(
            `Invalid schema format: ${ref}.children["${optionKey}"] must be ` +
              `an array of child field definitions.`,
          );
        }

        // Fix 2 — Duplicate child key detection within this option group
        const childKeys = (childFields as any[])
          .map((c: any) => c.key)
          .filter((k): k is string => typeof k === 'string' && !!k.trim());
        const childKeySet = new Set(childKeys);
        if (childKeySet.size !== childKeys.length) {
          const duplicates = [
            ...new Set(
              childKeys.filter((k, idx) => childKeys.indexOf(k) !== idx),
            ),
          ];
          throw new BadRequestException(
            `Invalid schema format: Duplicate child field key(s) "${duplicates.join(', ')}" ` +
              `detected in ${ref}.children["${optionKey}"]. All child field keys must be unique within a condition group.`,
          );
        }

        (childFields as any[]).forEach((child, j) => {
          this.validateField(
            child,
            `${ref}.children["${optionKey}"][${j}]`,
            false, // children cannot have their own children — max depth = 1
          );
        });
      }
    }
  }

  /**
   * Validate the full schema_json structure.
   * Called before CREATE and UPDATE. Never trusts frontend input.
   *
   * Validation rules:
   *  1. schema_json must be a plain object
   *  2. schema_json.fields must be an array
   *  3. Each field: key, label, type required
   *  4. type must be from ALLOWED_FIELD_TYPES
   *  5. select/multiselect require non-empty options[]
   *  6. Fix 2: No duplicate root-level field keys
   *  7. children (if present): plain object, each child array validated recursively
   *  8. Fix 2: No duplicate child field keys within a condition group
   *  9. Fix 4: Optional metadata fields (required, placeholder, helpText, displayOrder, defaultValue) validated lightly
   */
  private validateSchemaJson(schemaJson: Record<string, any>): void {
    if (
      !schemaJson ||
      typeof schemaJson !== 'object' ||
      Array.isArray(schemaJson)
    ) {
      throw new BadRequestException(
        'Invalid schema format: schema_json must be a plain object.',
      );
    }

    if (!Array.isArray(schemaJson.fields)) {
      throw new BadRequestException(
        'Invalid schema format: schema_json.fields must be an array.',
      );
    }

    // Fix 2 — Detect duplicate root-level field keys before deep validation
    const rootKeys = (schemaJson.fields as any[])
      .map((f: any) => f.key)
      .filter((k): k is string => typeof k === 'string' && !!k.trim());
    const rootKeySet = new Set(rootKeys);
    if (rootKeySet.size !== rootKeys.length) {
      const duplicates = [
        ...new Set(rootKeys.filter((k, i) => rootKeys.indexOf(k) !== i)),
      ];
      throw new BadRequestException(
        `Invalid schema format: Duplicate field key(s) detected in root fields: "${duplicates.join('", "')}". ` +
          `All field keys must be unique.`,
      );
    }

    // Validate each field individually (includes children + child key duplicate check)
    (schemaJson.fields as any[]).forEach((field: any, i: number) => {
      this.validateField(field, `fields[${i}]`, true);
    });
  }

  /**
   * Fix 1 — Get the highest version number ever used for a role across all configs
   * (active or inactive). Returns 0 if no configs exist yet.
   */
  private async getMaxVersionForRole(roleId: number): Promise<number> {
    const latestConfig = await this.configModel.findOne({
      where: { partnerRoleId: roleId },
      order: [['version', 'DESC']],
      attributes: ['version'],
    });
    return latestConfig ? latestConfig.version : 0;
  }

  // =========================================================================
  // PUBLIC API METHODS
  // =========================================================================

  /**
   * GET /masters/partner-roles/:roleId/dynamic-config
   *
   * Returns the currently active config schema for a role.
   * Returns null if no config has been created or all configs are deactivated.
   */
  async getActiveConfig(roleId: number): Promise<{
    config: PartnerRoleDynamicConfig | null;
    hasConfig: boolean;
  }> {
    await this.validateRole(roleId);

    const config = await this.configModel.findOne({
      where: { partnerRoleId: roleId, isActive: true },
      order: [['version', 'DESC']],
    });

    return {
      config,
      hasConfig: !!config,
    };
  }

  /**
   * GET /masters/partner-roles/:roleId/dynamic-config/history
   *
   * Returns the full schema change history for a role, ordered most-recent-first.
   */
  async getConfigHistory(
    roleId: number,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    data: PartnerDynamicConfigHistory[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    await this.validateRole(roleId);

    const configs = await this.configModel.findAll({
      where: { partnerRoleId: roleId },
      attributes: ['id'],
    });
    const configIds = configs.map((c) => c.id);

    if (configIds.length === 0) {
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }

    const finalLimit = Number(limit) || 20;
    const offset = (Number(page) - 1) * finalLimit;

    const { rows, count } = await this.historyModel.findAndCountAll({
      where: { configId: { [Op.in]: configIds } },
      include: [
        {
          model: PartnerRoleDynamicConfig,
          attributes: ['id', 'configName', 'version'],
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: finalLimit,
      offset,
    });

    return {
      data: rows,
      total: count,
      page: Number(page),
      limit: finalLimit,
      totalPages: Math.ceil(count / finalLimit),
    };
  }

  /**
   * POST /masters/partner-roles/:roleId/dynamic-config
   *
   * Creates a new schema config for a role.
   * Fix 1: Version continues from MAX(version) across all configs for this role,
   *        even if previous versions are deactivated. Version is NEVER reset to 1.
   * Validates schema_json before saving.
   * Writes a history snapshot immediately on creation.
   */
  async createConfig(
    roleId: number,
    dto: CreateDynamicConfigDto,
    user?: any,
  ): Promise<PartnerRoleDynamicConfig> {
    await this.validateRole(roleId);

    // Task 2: Validate schema structure before touching the DB
    this.validateSchemaJson(dto.schemaJson);

    // Guard: prevent duplicate active config
    const existingActive = await this.configModel.findOne({
      where: { partnerRoleId: roleId, isActive: true },
    });
    if (existingActive) {
      throw new ConflictException(
        `An active config already exists for this role (version ${existingActive.version}). ` +
          `Use PUT to create a new version, or DELETE to deactivate the current one first.`,
      );
    }

    // Fix 1 — Version continuity: always continue from the highest version
    // ever used for this role, regardless of deactivations.
    // Example: v1 → v2 → v3 → DELETE → POST = v4 (never resets to v1).
    const maxVersion = await this.getMaxVersionForRole(roleId);
    const newVersion = maxVersion + 1;

    return await this.sequelize.transaction(async (transaction) => {
      const config = await this.configModel.create(
        {
          partnerRoleId: roleId,
          configName: dto.configName.trim(),
          schemaJson: dto.schemaJson,
          version: newVersion,
          isActive: true,
        },
        { transaction },
      );

      await this.historyModel.create(
        {
          configId: config.id,
          schemaJson: dto.schemaJson,
          changeNote:
            dto.changeNote?.trim() ||
            (newVersion === 1
              ? 'Initial schema created'
              : `Schema re-created as version ${newVersion}`),
          createdBy: user?.id || user?.userId || null,
        },
        { transaction },
      );

      return config;
    });
  }

  /**
   * PUT /masters/partner-roles/:roleId/dynamic-config
   *
   * Versions the schema:
   *   1. Validates schema_json.
   *   2. Deactivates the current active config row.
   *   3. Creates a new config row with version = MAX(version) + 1.
   *   4. Writes a history snapshot.
   *
   * Old partner value records remain linked to their original config_id.
   */
  async updateConfig(
    roleId: number,
    dto: UpdateDynamicConfigDto,
    user?: any,
  ): Promise<PartnerRoleDynamicConfig> {
    await this.validateRole(roleId);

    // Task 2: Validate schema structure before touching the DB
    this.validateSchemaJson(dto.schemaJson);

    const currentConfig = await this.configModel.findOne({
      where: { partnerRoleId: roleId, isActive: true },
      order: [['version', 'DESC']],
    });

    if (!currentConfig) {
      throw new NotFoundException(
        `No active config found for this role. Use POST to create a new config.`,
      );
    }

    // Fix 1 — Version continuity (consistent with createConfig)
    const maxVersion = await this.getMaxVersionForRole(roleId);
    const nextVersion = maxVersion + 1;

    return await this.sequelize.transaction(async (transaction) => {
      await currentConfig.update({ isActive: false }, { transaction });

      const newConfig = await this.configModel.create(
        {
          partnerRoleId: roleId,
          configName: dto.configName.trim(),
          schemaJson: dto.schemaJson,
          version: nextVersion,
          isActive: true,
        },
        { transaction },
      );

      await this.historyModel.create(
        {
          configId: newConfig.id,
          schemaJson: dto.schemaJson,
          changeNote:
            dto.changeNote?.trim() ||
            `Schema updated to version ${nextVersion}`,
          createdBy: user?.id || user?.userId || null,
        },
        { transaction },
      );

      await this.auditService.writeLog({
        clientId: user?.clientId || null,
        companyId: user?.companyId || null,
        userId: user?.userId || null,
        entityType: 'PartnerRoleDynamicConfig',
        entityId: newConfig.id,
        action: 'UPDATE',
        oldValue: {
          configId: currentConfig.id,
          version: currentConfig.version,
          configName: currentConfig.configName,
        },
        newValue: {
          configId: newConfig.id,
          version: newConfig.version,
          configName: newConfig.configName,
        },
      });

      return newConfig;
    });
  }

  /**
   * DELETE /masters/partner-roles/:roleId/dynamic-config
   *
   * Soft-deactivates the currently active schema (sets is_active = false).
   * No rows are ever deleted. History and value records remain fully intact.
   *
   * Fix 3 — Safety check: Blocked if any partner_dynamic_values rows are
   * currently linked to this config_id. Prevents accidental retirement of a
   * schema that has active production data against it.
   *
   * Error returned:
   *   409 Conflict — "Cannot deactivate schema: N partner(s) have data linked to this config."
   *
   * To proceed: either migrate/delete the linked value records first, or use
   * PUT to create a new version (which does not affect existing value records).
   */
  async deactivateConfig(
    roleId: number,
    user?: any,
  ): Promise<{
    message: string;
    deactivatedConfigId: number;
    version: number;
  }> {
    await this.validateRole(roleId);

    const currentConfig = await this.configModel.findOne({
      where: { partnerRoleId: roleId, isActive: true },
      order: [['version', 'DESC']],
    });

    if (!currentConfig) {
      throw new NotFoundException(
        `No active config found for this role. Nothing to deactivate.`,
      );
    }

    // Fix 3 — Safety check: reject if any partners have value records
    // linked to this config. Production data must not be orphaned accidentally.
    const linkedPartnerCount = await this.valuesModel.count({
      where: { configId: currentConfig.id },
    });

    if (linkedPartnerCount > 0) {
      throw new ConflictException(
        `Cannot deactivate schema: ${linkedPartnerCount} partner record(s) have ` +
          `saved data linked to config version ${currentConfig.version}. ` +
          `Deactivating this schema will not delete their data, but no new partners ` +
          `will be able to use this role until a new schema is created via POST. ` +
          `If you still want to proceed, first ensure all ${linkedPartnerCount} partner(s) ` +
          `are updated or reassigned, then retry.`,
      );
    }

    await currentConfig.update({ isActive: false });

    await this.auditService.writeLog({
      clientId: user?.clientId || null,
      companyId: user?.companyId || null,
      userId: user?.id || user?.userId || null,
      entityType: 'PartnerRoleDynamicConfig',
      entityId: currentConfig.id,
      action: 'DELETE',
      oldValue: {
        configId: currentConfig.id,
        version: currentConfig.version,
        configName: currentConfig.configName,
        isActive: true,
      },
      newValue: {
        configId: currentConfig.id,
        version: currentConfig.version,
        configName: currentConfig.configName,
        isActive: false,
      },
    });

    return {
      message:
        `Schema config v${currentConfig.version} deactivated successfully. ` +
        `Historical records preserved. Use POST to create a replacement schema.`,
      deactivatedConfigId: currentConfig.id,
      version: currentConfig.version,
    };
  }

  /**
   * Find a config by its primary key. Used internally by the values service.
   */
  async findById(configId: number): Promise<PartnerRoleDynamicConfig> {
    const config = await this.configModel.findByPk(configId);
    if (!config) {
      throw new NotFoundException(
        `Dynamic config with id=${configId} not found`,
      );
    }
    return config;
  }
}
