import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import { PartnerDynamicValuesService } from './partner-dynamic-values.service';
import { SavePartnerDynamicValuesDto } from './dto/save-partner-dynamic-values.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { AuditLog } from '../../audit/decorators/audit-log.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('masters/partners/:partnerId/additional-info')
export class PartnerDynamicValuesController {
  constructor(
    private readonly valuesService: PartnerDynamicValuesService,
  ) {}

  /**
   * GET /masters/partners/:partnerId/additional-info
   *
   * Returns the active schema + the partner's previously saved values in one call.
   * Available to all users with partner view access.
   *
   * Frontend uses this to:
   *   1. Render the Additional Information tab dynamically (from schemaJson).
   *   2. Pre-fill the form with the partner's existing saved values.
   *
   * Response:
   * {
   *   "hasConfig": true,
   *   "configId": 3,
   *   "version": 1,
   *   "configName": "Warehouse Config v1",
   *   "schemaJson": { "fields": [...] },
   *   "values": { "warehouse_type": ["Storage", "Cleaning"] },
   *   "schemaVersion": 1
   * }
   *
   * If no schema configured for this role:
   * { "hasConfig": false, "configId": null, ... all null }
   */
  @Get()
  @RequirePermission('partner:view')
  async getAdditionalInfo(
    @Param('partnerId', ParseIntPipe) partnerId: number,
  ) {
    return this.valuesService.getAdditionalInfo(partnerId);
  }

  /**
   * PUT /masters/partners/:partnerId/additional-info
   *
   * Saves or updates the partner's dynamic field values.
   * Available to all users with partner update access.
   * Normal users fill in values — they cannot change schema structure.
   *
   * Upsert: UNIQUE(partner_id, config_id) handles create vs update internally.
   *
   * Body: { configId: number, valuesJson: object }
   *
   * Enforced validations:
   * - Partner must exist and be active.
   * - The partner's role must have an active dynamic config (schema must exist).
   * - configId must be active and must belong to this partner's role.
   * - schema_version is captured automatically from the config at save time.
   */
  @Put()
  @RequirePermission('partner:update')
  @AuditLog({ entityType: 'PartnerAdditionalInfo', action: 'UPDATE' })
  async saveAdditionalInfo(
    @Param('partnerId', ParseIntPipe) partnerId: number,
    @Body() dto: SavePartnerDynamicValuesDto,
    @Req() req: any,
  ) {
    return this.valuesService.saveAdditionalInfo(partnerId, dto, req.user);
  }
}
