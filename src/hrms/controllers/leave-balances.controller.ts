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



    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    return this.leaveBalancesService.getBalancesForEmployee(employeeId, companyId, year);
  }
}
