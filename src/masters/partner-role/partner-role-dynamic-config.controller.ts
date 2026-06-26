import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { PartnerRoleDynamicConfigService } from './partner-role-dynamic-config.service';
import { CreateDynamicConfigDto } from './dto/create-dynamic-config.dto';
import { UpdateDynamicConfigDto } from './dto/update-dynamic-config.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { AuditLog } from '../../audit/decorators/audit-log.decorator';

/**
 * Partner Role Dynamic Schema Configuration Controller
 *
 * Permission model — all handled entirely by the existing RBAC system:
 *
 *   partner_dynamic_schema:view    → GET active config (any user with this perm)
 *   partner_dynamic_schema:create  → POST initial schema
 *   partner_dynamic_schema:update  → PUT schema version update
 *   partner_dynamic_schema:history → GET schema change history
 *
 * On every app boot, PermissionDiscoveryService scans all @RequirePermission()
 * decorators, creates ResourceAction rows for each permission key, and assigns
 * them to the Admin role automatically (see permission-discovery.service.ts).
 *
 * Super Admin bypasses all permission checks at the guard level (permissions.guard.ts L125).
 * The Admin role receives every discovered permission via findOrCreate on boot.
 * Any other role can receive these permissions through the permission assignment UI.
 *
 * NO hardcoded super_admin type checks. NO custom access logic. RBAC only.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('masters/partner-roles/:roleId/dynamic-config')
export class PartnerRoleDynamicConfigController {
  constructor(
    private readonly configService: PartnerRoleDynamicConfigService,
  ) {}

  /**
   * GET /masters/partner-roles/:roleId/dynamic-config
   *
   * Returns the currently active schema for a partner role.
   * Used by all users when rendering the Additional Information tab.
   * Permission: partner_dynamic_schema:view
   *
   * Response:
   * {
   *   "hasConfig": true,
   *   "config": { "id": 1, "configName": "Warehouse Config v1", "version": 1, "schemaJson": {...} }
   * }
   * or { "hasConfig": false, "config": null }
   */
  @Get()
  @RequirePermission('partner_dynamic_schema:view')
  async getActiveConfig(
    @Param('roleId', ParseIntPipe) roleId: number,
  ) {
    return this.configService.getActiveConfig(roleId);
  }

  /**
   * GET /masters/partner-roles/:roleId/dynamic-config/history
   *
   * Returns full schema change history for a role, most recent first.
   * Permission: partner_dynamic_schema:history
   * Query params: ?page=1&limit=20
   */
  @Get('history')
  @RequirePermission('partner_dynamic_schema:history')
  async getHistory(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.configService.getConfigHistory(
      roleId,
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
    );
  }

  /**
   * POST /masters/partner-roles/:roleId/dynamic-config
   *
   * Creates the INITIAL schema definition for a partner role.
   * Fails with 409 Conflict if an active config already exists.
   * Use PUT to version-update an existing schema.
   * Permission: partner_dynamic_schema:create
   *
   * Body: { configName, schemaJson, changeNote? }
   */
  @Post()
  @RequirePermission('partner_dynamic_schema:create')
  @AuditLog({ entityType: 'PartnerRoleDynamicConfig', action: 'CREATE' })
  @HttpCode(HttpStatus.CREATED)
  async createConfig(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() dto: CreateDynamicConfigDto,
    @Req() req: any,
  ) {
    return this.configService.createConfig(roleId, dto, req.user);
  }

  /**
   * PUT /masters/partner-roles/:roleId/dynamic-config
   *
   * Versions the schema:
   *   1. Deactivates current version.
   *   2. Creates new version row (version + 1).
   *   3. Writes history snapshot.
   *
   * Old partner data remains pinned to the previous config_id — no data loss.
   * Permission: partner_dynamic_schema:update
   *
   * Body: { configName, schemaJson, changeNote? }
   */
  @Put()
  @RequirePermission('partner_dynamic_schema:update')
  @AuditLog({ entityType: 'PartnerRoleDynamicConfig', action: 'UPDATE' })
  async updateConfig(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() dto: UpdateDynamicConfigDto,
    @Req() req: any,
  ) {
    return this.configService.updateConfig(roleId, dto, req.user);
  }

  /**
   * DELETE /masters/partner-roles/:roleId/dynamic-config
   *
   * Soft-deactivates the currently active schema for a role.
   * Sets is_active = false on the active config row.
   * Does NOT delete any rows — history and partner value records remain fully intact.
   *
   * Use case: Admin retires a bad schema before creating a corrected replacement via POST.
   * Permission: partner_dynamic_schema:delete
   */
  @Delete()
  @RequirePermission('partner_dynamic_schema:delete')
  @AuditLog({ entityType: 'PartnerRoleDynamicConfig', action: 'DELETE' })
  @HttpCode(HttpStatus.OK)
  async deactivateConfig(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Req() req: any,
  ) {
    return this.configService.deactivateConfig(roleId, req.user);
  }
}
