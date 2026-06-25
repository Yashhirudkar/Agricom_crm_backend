import { Controller, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ClientsAccessService } from '../services/clients-access.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { AuditLog } from '../../audit/decorators/audit-log.decorator';
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clients')
export class ClientsAccessController {
  constructor(private readonly clientsAccessService: ClientsAccessService) {}

  @Post(':id/access-config')
  @RequirePermission('system:manage_clients') // Only Super Admin should have this
  @AuditLog({ entityType: 'ClientAccessConfig', action: 'UPDATE' })
  async updateAccessConfig(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    dto: {
      folder_ids: number[];
      item_ids: number[];
      module_ids: number[];
      action_ids: number[];
    },
  ) {
    return this.clientsAccessService.updateAccessConfig(
      req.user.id,
      parseInt(id, 10),
      dto,
    );
  }
}
