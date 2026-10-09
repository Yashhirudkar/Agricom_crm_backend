import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  Req,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FollowUpManagementService } from '../services/follow-up-management.service';
import { QueryFollowUpDto } from '../dto/query-followup.dto';
import { RescheduleFollowUpDto } from '../dto/reschedule-followup.dto';
import { CompleteFollowUpDto } from '../dto/complete-followup.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';

interface CustomRequest {
  headers: Record<string, string | undefined>;
  user?: {
    userId?: number | string;
    id?: number | string;
    sub?: number | string;
    type?: string;
  };
  userPermissions?: Set<string>;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('follow-ups')
export class FollowUpManagementController {
  constructor(
    private readonly followUpManagementService: FollowUpManagementService,
  ) {}

  private getCompanyId(req: CustomRequest): number {
    const companyId = req.headers['x-company-id'];
    if (!companyId) {
      throw new BadRequestException('x-company-id header is required');
    }
    return parseInt(companyId, 10);
  }

  private getUserId(req: CustomRequest): number {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) {
      throw new BadRequestException('User session is invalid');
    }
    return parseInt(String(userId), 10);
  }

  @Get('dashboard/stats')
  @RequirePermission('follow_up:view')
  async getDashboardStats(@Req() req: CustomRequest) {
    const companyId = this.getCompanyId(req);
    const userId = this.getUserId(req);
    const permissions: Set<string> = req.userPermissions || new Set<string>();
    const userType = req.user?.type || '';
    return this.followUpManagementService.getDashboardStats(
      companyId,
      userId,
      userType,
      permissions,
    );
  }

  @Get('dashboard/list')
  @RequirePermission('follow_up:view')
  async getDashboardList(
    @Query() query: QueryFollowUpDto,
    @Req() req: CustomRequest,
  ) {
    const companyId = this.getCompanyId(req);
    const userId = this.getUserId(req);
    const permissions: Set<string> = req.userPermissions || new Set<string>();
    const userType = req.user?.type || '';
    return this.followUpManagementService.getDashboardList(
      companyId,
      userId,
      query,
      userType,
      permissions,
    );
  }

  @Get('header')
  @RequirePermission('follow_up:view')
  async getHeaderDrawer(@Req() req: CustomRequest) {
    const companyId = this.getCompanyId(req);
    const userId = this.getUserId(req);
    const permissions: Set<string> = req.userPermissions || new Set<string>();
    const userType = req.user?.type || '';
    return this.followUpManagementService.getHeaderDrawer(
      companyId,
      userId,
      userType,
      permissions,
    );
  }

  @Patch(':id/complete')
  @RequirePermission('follow_up:update')
  @HttpCode(HttpStatus.OK)
  async completeFollowUp(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteFollowUpDto,
    @Req() req: CustomRequest,
  ) {
    const companyId = this.getCompanyId(req);
    const userId = this.getUserId(req);
    const permissions: Set<string> = req.userPermissions || new Set<string>();
    const userType = req.user?.type || '';
    return this.followUpManagementService.completeFollowUp(
      id,
      companyId,
      userId,
      dto,
      userType,
      permissions,
    );
  }

  @Patch(':id/reschedule')
  @RequirePermission('follow_up:update')
  @HttpCode(HttpStatus.OK)
  async rescheduleFollowUp(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RescheduleFollowUpDto,
    @Req() req: CustomRequest,
  ) {
    const companyId = this.getCompanyId(req);
    const userId = this.getUserId(req);
    const permissions: Set<string> = req.userPermissions || new Set<string>();
    const userType = req.user?.type || '';
    return this.followUpManagementService.rescheduleFollowUp(
      id,
      companyId,
      userId,
      dto,
      userType,
      permissions,
    );
  }

  @Get('reminders')
  @RequirePermission('follow_up:view')
  async getMarqueeReminders(@Req() req: CustomRequest) {
    const companyId = this.getCompanyId(req);
    const userId = this.getUserId(req);
    const permissions: Set<string> = req.userPermissions || new Set<string>();
    const userType = req.user?.type || '';
    return this.followUpManagementService.getMarqueeReminders(
      companyId,
      userId,
      permissions,
      userType,
    );
  }
}
