import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Request,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { LeaveRequestsService } from '../services/leave-requests.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { ApplyLeaveDto, ApproveLeaveDto, RejectLeaveDto, CancelLeaveDto, GetLeaveRequestsFilterDto } from '../dto/leave-requests.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname } from 'path';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('leave-requests')
export class LeaveRequestsController {
  constructor(private readonly leaveRequestsService: LeaveRequestsService) {}

  private getCompanyId(req: any): number {
    const companyId = req.headers['x-company-id'] || req.activeCompanyId;
    if (!companyId) {
      throw new BadRequestException('x-company-id header is required');
    }
    return parseInt(companyId, 10);
  }

  private getActor(req: any) {
    return {
      userId: req.user.userId || req.user.sub || null,
      clientId: req.user.clientId || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      type: req.user.type || null,
    };
  }

  @Post('apply')
  @RequirePermission('leave:create')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  async applyLeave(
    @Body() dto: ApplyLeaveDto,
    @UploadedFile() file: Express.Multer.File,
    @Request() req
  ) {
    if (file) {
      const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedMimeTypes.includes(file.mimetype)) {
        throw new BadRequestException(`File type ${file.mimetype} is not allowed.`);
      }
      if (file.size > 10 * 1024 * 1024) {
        throw new BadRequestException('File size exceeds the 10 MB limit');
      }
    }

    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      throw new BadRequestException('Employee profile not linked to your user account. Admins must link a profile to apply for leave.');
    }

    return this.leaveRequestsService.applyLeave(employeeId, companyId, dto, file, actor);
  }

  @Get()
  @RequirePermission('leave:approve')
  getLeaveRequests(@Query() query: GetLeaveRequestsFilterDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    return this.leaveRequestsService.getLeaveRequests(companyId, query);
  }

  @Get('my-leaves')
  @RequirePermission('leave:create')
  async getMyLeaves(@Query() query: GetLeaveRequestsFilterDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      return [];
    }
    return this.leaveRequestsService.getLeaveRequests(companyId, { ...query, employeeId });
  }

  @Get('dashboard/summary')
  @RequirePermission('leave:read')
  async getDashboardSummary(@Request() req) {
    const companyId = this.getCompanyId(req);
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      return {
        pendingApprovals: 0,
        balances: [],
        approvedThisMonth: 0,
        rejectedCount: 0
      };
    }

    return this.leaveRequestsService.getDashboardSummary(companyId, employeeId);
  }

  @Get(':id')
  @RequirePermission('leave:read')
  getLeaveRequestById(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    return this.leaveRequestsService.getLeaveRequestById(id, companyId);
  }

  @Put(':id/approve')
  @RequirePermission('leave:approve')
  async approveLeave(@Param('id', ParseIntPipe) id: number, @Body() dto: ApproveLeaveDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    let approverId = req.user.employeeId;

    if (!approverId && actor.type === 'super_admin') {
      approverId = await this.leaveRequestsService.getFallbackEmployeeIdForAdmin(companyId);
    }

    if (!approverId) throw new BadRequestException('Approver profile not linked');
    return this.leaveRequestsService.approveLeave(id, companyId, approverId, dto, actor);
  }

  @Put(':id/reject')
  @RequirePermission('leave:approve')
  async rejectLeave(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectLeaveDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    let approverId = req.user.employeeId;

    if (!approverId && actor.type === 'super_admin') {
      approverId = await this.leaveRequestsService.getFallbackEmployeeIdForAdmin(companyId);
    }

    if (!approverId) throw new BadRequestException('Approver profile not linked');
    return this.leaveRequestsService.rejectLeave(id, companyId, approverId, dto, actor);
  }

  @Put(':id/cancel')
  @RequirePermission('leave:create')
  async cancelLeave(@Param('id', ParseIntPipe) id: number, @Body() dto: CancelLeaveDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    let employeeId = req.user.employeeId;

    if (!employeeId && actor.type === 'super_admin') {
      employeeId = await this.leaveRequestsService.getFallbackEmployeeIdForAdmin(companyId);
    }

    if (!employeeId) throw new BadRequestException('Employee profile not linked');
    return this.leaveRequestsService.cancelLeave(id, companyId, employeeId, dto, actor);
  }
}
