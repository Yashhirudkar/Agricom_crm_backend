import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { AuditService } from '../services/audit.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  @RequirePermission('users:read')
  async getLogs(
    @Request() req,
    @Query('entityType') entityType?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('clientId') filterClientId?: string,
  ) {
    const isSuper = req.user.type === 'super_admin';
    const clientId = isSuper
      ? (filterClientId ? parseInt(filterClientId, 10) : null)
      : req.user.clientId;

    return this.auditService.getLogs({
      clientId,
      entityType,
      action,
      userId: userId ? parseInt(userId, 10) : undefined,
    });
  }
}
