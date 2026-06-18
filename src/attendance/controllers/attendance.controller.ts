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
  ForbiddenException,
} from '@nestjs/common';
import { AttendanceService } from '../services/attendance.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { CheckInDto, CheckOutDto, BreakStartDto, BreakEndDto, RequestCorrectionDto, ResolveCorrectionDto, AssignShiftDto, ManualAttendanceDto } from '../dto/attendance.dto';
import { AttendanceStatus } from '../models/attendance-record.model';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  private getCompanyId(req: any): number {
    const companyId = req.headers['x-company-id'] || req.activeCompanyId;
    if (!companyId) {
      throw new BadRequestException('x-company-id header is required');
    }
    return parseInt(companyId, 10);
  }

  private async getEmployeeId(req: any): Promise<number> {
    const employeeId = req.user.employeeId;
    if (!employeeId) {
      throw new BadRequestException('Employee profile not linked to your user account.');
    }
    return employeeId;
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
    const sequelize = (this.attendanceService as any).attendanceRecordModel?.sequelize || (this.attendanceService as any).employeeModel?.sequelize;
    if (!sequelize) return false;
    
    const dbResult = await sequelize.query(query, {
      replacements: { userId, companyId, resource, action: action.toUpperCase() },
      type: 'SELECT'
    }) as any[];
    return dbResult.length > 0 && parseInt(dbResult[0].count || dbResult[0].COUNT || '0', 10) > 0;
  }

  @Post('check-in')
  @RequirePermission('attendance_activity:create')
  @HttpCode(HttpStatus.OK)
  async checkIn(@Body() dto: CheckInDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const employeeId = await this.getEmployeeId(req);
    return this.attendanceService.checkIn(employeeId, companyId, dto);
  }

  @Post('check-out')
  @RequirePermission('attendance_activity:create')
  @HttpCode(HttpStatus.OK)
  async checkOut(@Body() dto: CheckOutDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const employeeId = await this.getEmployeeId(req);
    return this.attendanceService.checkOut(employeeId, companyId, dto);
  }

  @Post('break-start')
  @RequirePermission('attendance_activity:create')
  @HttpCode(HttpStatus.OK)
  async startBreak(@Body() dto: BreakStartDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const employeeId = await this.getEmployeeId(req);
    return this.attendanceService.breakStart(employeeId, companyId, dto);
  }

  @Post('break-end')
  @RequirePermission('attendance_activity:create')
  @HttpCode(HttpStatus.OK)
  async endBreak(@Body() dto: BreakEndDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const employeeId = await this.getEmployeeId(req);
    return this.attendanceService.breakEnd(employeeId, companyId, dto);
  }

  @Get('me')
  @RequirePermission('attendance_activity:read')
  async getMe(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    const employeeId = req.user.employeeId;
    if (!employeeId) {
      return []; // Return empty array if admin has no profile
    }
    return this.attendanceService.getMyAttendance(employeeId, companyId, { startDate, endDate });
  }

  @Get('company')
  @RequirePermission('attendance_dashboard:read')
  async getCompany(
    @Query('date') date: string,
    @Query('employeeId') employeeId: number,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    return this.attendanceService.getCompanyAttendance(companyId, { date, employeeId });
  }

  @Get('corrections')
  @RequirePermission('attendance_regularization:read')
  async getPendingCorrections(@Request() req) {
    const companyId = this.getCompanyId(req);
    return this.attendanceService.getPendingCorrections(companyId);
  }

  @Post('request-regularization')
  @RequirePermission('attendance_regularization:create')
  async requestCorrection(@Body() dto: RequestCorrectionDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const employeeId = await this.getEmployeeId(req);
    return this.attendanceService.requestCorrection(employeeId, companyId, dto);
  }

  @Put('admin/approve-regularization/:id')
  @RequirePermission('attendance_regularization:override')
  async approveCorrection(@Param('id', ParseIntPipe) id: number, @Body() dto: ResolveCorrectionDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const approverEmployeeId = await this.getEmployeeId(req);
    return this.attendanceService.approveCorrection(id, companyId, approverEmployeeId, req.user.type, dto);
  }

  @Put('admin/reject-regularization/:id')
  @RequirePermission('attendance_regularization:override')
  async rejectCorrection(@Param('id', ParseIntPipe) id: number, @Body() dto: ResolveCorrectionDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const approverEmployeeId = await this.getEmployeeId(req);
    return this.attendanceService.rejectCorrection(id, approverEmployeeId, req.user.type, dto);
  }

  @Post('admin/manual-attendance')
  @RequirePermission('attendance_regularization:override')
  async manualAttendance(
    @Body() dto: ManualAttendanceDto,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    const adminEmployeeId = await this.getEmployeeId(req);
    return this.attendanceService.manualAttendance(companyId, adminEmployeeId, dto);
  }

  @Get('report/monthly')
  @RequirePermission('attendance_summary:read')
  async getMonthlyReport(
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
    @Query('employeeId') employeeId: string,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    let targetEmployeeId = employeeId ? parseInt(employeeId, 10) : undefined;
    if (!targetEmployeeId || isNaN(targetEmployeeId)) {
      targetEmployeeId = req.user.employeeId;
      if (!targetEmployeeId) {
        return []; // Admin with no profile viewing their own report gets empty array
      }
    }

    const isSelf = req.user.employeeId && req.user.employeeId === targetEmployeeId;
    const isSystemAdmin = req.user.type === 'super_admin' || req.user.type === 'client_admin';

    if (!isSelf && !isSystemAdmin) {
      const hasPermission = await this.checkUserHasPermission(req.user.userId || req.user.sub, companyId, 'attendance_reports', 'read');
      if (!hasPermission) {
        throw new ForbiddenException('Insufficient permissions. Required: attendance_reports:read to view others attendance');
      }
    }

    return this.attendanceService.getMonthlyReport(companyId, { month, year, employeeId: targetEmployeeId });
  }

  @Post('assign-shift/:employeeId')
  @RequirePermission('attendance_shifts:assign_shift')
  async assignShift(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: AssignShiftDto,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    return this.attendanceService.assignShift(employeeId, companyId, dto.shiftId);
  }

  @Put(':id/override')
  @RequirePermission('attendance_regularization:override')
  async overrideAttendance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveCorrectionDto & { checkInTime?: string; checkOutTime?: string; attendanceStatus?: AttendanceStatus; lateMinutes?: number },
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    const adminEmployeeId = await this.getEmployeeId(req);
    return this.attendanceService.manualOverride(id, companyId, adminEmployeeId, dto);
  }
}
