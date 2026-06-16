import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  Request,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { LeaveBalancesService } from '../services/leave-balances.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('leave-balances')
export class LeaveBalancesController {
  constructor(private readonly leaveBalancesService: LeaveBalancesService) {}

  private getCompanyId(req: any): number {
    const companyId = req.headers['x-company-id'];
    if (!companyId) {
      throw new BadRequestException('x-company-id header is required');
    }
    return parseInt(companyId, 10);
  }

  private async checkUserHasPermission(userId: number, companyId: number, resource: string, action: string): Promise<boolean> {
    const query = `
      SELECT COUNT(rp.id) as count
      FROM user_companies uc
      JOIN role_permissions rp ON uc."roleId" = rp."roleId"
      JOIN permissions p ON rp."permissionId" = p.id
      WHERE uc."userId" = :userId 
        AND uc."companyId" = :companyId 
        AND uc.status = 'Active'
        AND p.resource = :resource
        AND p.action = :action
        AND p."isActive" = true
    `;
    const result = await this.leaveBalancesService.getBalancesForEmployee(0, 0, 0) // dummy call or use model directly
      .then(() => []) // we just need access to Sequelize model, so we can query on sequelize
      .catch(() => []); // placeholder to fetch model
      
    // Actually, we can get Sequelize model directly from the service or use raw query:
    const sequelize = (this.leaveBalancesService as any).employeeLeaveBalanceModel.sequelize;
    const dbResult = await sequelize.query(query, {
      replacements: { userId, companyId, resource, action },
      type: 'SELECT'
    }) as any[];
    return dbResult.length > 0 && parseInt(dbResult[0].count || dbResult[0].COUNT || '0', 10) > 0;
  }

  @Get('employee/:employeeId')
  @RequirePermission('leave:read')
  async getBalancesForEmployee(
    @Param('employeeId') employeeIdParam: string,
    @Query('year') yearParam: string,
    @Request() req
  ) {
    const companyId = this.getCompanyId(req);
    const actor = {
      userId: req.user.userId || req.user.sub || null,
      type: req.user.type || null,
    };

    let employeeId: number;

    if (employeeIdParam === 'undefined' || employeeIdParam === 'null' || employeeIdParam === 'me') {
      let resolvedId = req.user.employeeId;
      if (!resolvedId && (actor.type === 'client_admin' || actor.type === 'super_admin')) {
        resolvedId = await this.leaveBalancesService.getFallbackEmployeeIdForAdmin(companyId);
      }
      if (!resolvedId) {
        throw new BadRequestException('Employee ID is required and no fallback found');
      }
      employeeId = resolvedId;
    } else {
      employeeId = parseInt(employeeIdParam, 10);
      if (isNaN(employeeId)) {
        throw new BadRequestException('Validation failed (numeric string is expected)');
      }
    }

    // Dynamic Auth Check: Allow if user is checking their own balance or has leave:read permission
    const isSelf = req.user.employeeId && req.user.employeeId === employeeId;
    const isSystemAdmin = actor.type === 'super_admin' || actor.type === 'client_admin';

    if (!isSelf && !isSystemAdmin) {
      const hasPermission = await this.checkUserHasPermission(actor.userId, companyId, 'leave', 'read');
      if (!hasPermission) {
        throw new ForbiddenException('Insufficient permissions. Required: leave:read');
      }
    }

    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    return this.leaveBalancesService.getBalancesForEmployee(employeeId, companyId, year);
  }
}
