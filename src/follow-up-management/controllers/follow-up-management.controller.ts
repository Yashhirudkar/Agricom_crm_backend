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

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('follow-ups')
export class FollowUpManagementController {
  constructor(private readonly followUpManagementService: FollowUpManagementService) {}

  private getCompanyId(req: any): number {
    const companyId = req.headers['x-company-id'];
    if (!companyId) {
      throw new BadRequestException('x-company-id header is required');
    }
    return parseInt(companyId, 10);
  }

  private getUserId(req: any): number {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) {
      throw new BadRequestException('User session is invalid');
    }
    return parseInt(userId, 10);
  }

  @Get('dashboard/stats')
  @RequirePermission('partner:view')
  async getDashboardStats(@Req() req: any) {
    const companyId = this.getCompanyId(req);
    const userId = this.getUserId(req);
    return this.followUpManagementService.getDashboardStats(companyId, userId);
  }

  @Get('dashboard/list')
  @RequirePermission('partner:view')
  async getDashboardList(@Query() query: QueryFollowUpDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const userId = this.getUserId(req);
    return this.followUpManagementService.getDashboardList(companyId, userId, query);
  }

  @Get('header')
  @RequirePermission('partner:view')
  async getHeaderDrawer(@Req() req: any) {
    const companyId = this.getCompanyId(req);
    const userId = this.getUserId(req);
    return this.followUpManagementService.getHeaderDrawer(companyId, userId);
  }

  @Patch(':id/complete')
  @RequirePermission('partner:followup')
  @HttpCode(HttpStatus.OK)
  async completeFollowUp(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteFollowUpDto,
    @Req() req: any,
  ) {
    const companyId = this.getCompanyId(req);
    const userId = this.getUserId(req);
    return this.followUpManagementService.completeFollowUp(id, companyId, userId, dto);
  }

  @Patch(':id/reschedule')
  @RequirePermission('partner:followup')
  @HttpCode(HttpStatus.OK)
  async rescheduleFollowUp(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RescheduleFollowUpDto,
    @Req() req: any,
  ) {
    const companyId = this.getCompanyId(req);
    const userId = this.getUserId(req);
    return this.followUpManagementService.rescheduleFollowUp(id, companyId, userId, dto);
  }
}
