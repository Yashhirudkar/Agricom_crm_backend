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
    const companyId = req.headers['x-company-id'] || req.activeCompanyId;
    if (!companyId) {
      throw new BadRequestException('x-company-id header is required');
    }
    return parseInt(companyId, 10);
  }

  private async checkUserHasPermission(userId: number, companyId: number, resource: string, action: string): Promise<boolean> {
    const query = `
      SELECT COUNT(rap.id) as count
      FROM user_companies uc
      JOIN role_action_permissions rap ON uc."roleId" = rap.role_id
      JOIN resource_actions ra ON rap.resource_action_id = ra.id
      JOIN module_resources mr ON ra.resource_id = mr.id
      WHERE uc."userId" = :userId 
        AND uc."companyId" = :companyId 
        AND uc.status = 'Active'
        AND mr.name = :resource
        AND ra.name = :action
    `;
    const sequelize = (this.leaveBalancesService as any).employeeLeaveBalanceModel.sequelize;
    const dbResult = await sequelize.query(query, {
      replacements: { userId, companyId, resource, action: action.toUpperCase() },
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
      if (!resolvedId) {
        return []; // Admin with no profile has no balances
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
      const hasPermission = await this.checkUserHasPermission(actor.userId, companyId, 'leave', 'approve');
      if (!hasPermission) {
        throw new ForbiddenException('Insufficient permissions. Required: leave:approve');
      }
    }

    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    return this.leaveBalancesService.getBalancesForEmployee(employeeId, companyId, year);
  }
}
