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
  DefaultValuePipe,
} from '@nestjs/common';
import { AttendanceService } from '../services/attendance.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { AuditLog } from '../../audit/decorators/audit-log.decorator';
import {
  CheckInDto,
  CheckOutDto,
  BreakStartDto,
  BreakEndDto,
  RequestCorrectionDto,
  ResolveCorrectionDto,
  AssignShiftDto,
  ManualAttendanceDto,
} from '../dto/attendance.dto';
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
    console.log('GET EMPLOYEE ID CALLED', req.user);
    if (req.user.employeeId) {
      return req.user.employeeId;
    }
    const employeeId = req.user.employeeId;
    if (!employeeId) {
      throw new BadRequestException(
        'Employee profile not linked to your user account.',
      );
    }
    return employeeId;
  }

  @Post('check-in')
  @RequirePermission('attendance_activity:create')
  @HttpCode(HttpStatus.OK)
  @AuditLog({ entityType: 'AttendanceRecord', action: 'CREATE' })
  async checkIn(@Body() dto: CheckInDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const employeeId = await this.getEmployeeId(req);
    return this.attendanceService.checkIn(employeeId, companyId, dto);
  }

  @Post('check-out')
  @RequirePermission('attendance_activity:create')
  @HttpCode(HttpStatus.OK)
  @AuditLog({ entityType: 'AttendanceRecord', action: 'UPDATE' })
  async checkOut(@Body() dto: CheckOutDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const employeeId = await this.getEmployeeId(req);
    return this.attendanceService.checkOut(employeeId, companyId, dto);
  }

  @Post('break-start')
  @RequirePermission('attendance_activity:create')
  @HttpCode(HttpStatus.OK)
  @AuditLog({ entityType: 'AttendanceLog', action: 'CREATE' })
  async startBreak(@Body() dto: BreakStartDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const employeeId = await this.getEmployeeId(req);
    return this.attendanceService.breakStart(employeeId, companyId, dto);
  }

  @Post('break-end')
  @RequirePermission('attendance_activity:create')
  @HttpCode(HttpStatus.OK)
  @AuditLog({ entityType: 'AttendanceLog', action: 'UPDATE' })
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
    return this.attendanceService.getMyAttendance(employeeId, companyId, {
      startDate,
      endDate,
    });
  }

  @Get('company')
  @RequirePermission('attendance_dashboard:read')
  async getCompany(
    @Query('date') date: string,
    @Query('employeeId') employeeId: number,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    return this.attendanceService.getCompanyAttendance(companyId, {
      date,
      employeeId,
    });
  }

  @Get('corrections')
  @RequirePermission('attendance_regularization:read')
  async getPendingCorrections(@Request() req) {
    const companyId = this.getCompanyId(req);
    return this.attendanceService.getPendingCorrections(companyId);
  }

  @Get('admin/regularization-history')
  @RequirePermission('attendance_regularization:read')
  async getRegularizationHistory(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('status') status: string,
    @Query('employeeId') employeeId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    return this.attendanceService.getRegularizationHistory(companyId, {
      page,
      limit,
      status,
      employeeId,
      startDate,
      endDate,
    });
  }

  @Post('request-regularization')
  @RequirePermission('attendance_regularization:create')
  @AuditLog({ entityType: 'AttendanceException', action: 'CREATE' })
  async requestCorrection(@Body() dto: RequestCorrectionDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const employeeId = await this.getEmployeeId(req);
    return this.attendanceService.requestCorrection(employeeId, companyId, dto);
  }

  @Put('admin/approve-regularization/:id')
  @RequirePermission('attendance_regularization:override')
  @AuditLog({ entityType: 'AttendanceException', action: 'UPDATE' })
  async approveCorrection(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveCorrectionDto,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    console.log('APPROVE REQUEST USER', {
      userId: req.user.userId,
      email: req.user.email,
      employeeId: req.user.employeeId,
    });
    const approverEmployeeId = req.user.employeeId;
    return this.attendanceService.approveCorrection(
      id,
      companyId,
      approverEmployeeId,
      req.user.type,
      dto,
    );
  }

  @Put('admin/reject-regularization/:id')
  @RequirePermission('attendance_regularization:override')
  @AuditLog({ entityType: 'AttendanceException', action: 'UPDATE' })
  async rejectCorrection(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveCorrectionDto,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    const approverEmployeeId = await this.getEmployeeId(req);
    return this.attendanceService.rejectCorrection(
      id,
      approverEmployeeId,
      req.user.type,
      dto,
    );
  }

  @Post('admin/manual-attendance')
  @RequirePermission('attendance_regularization:override')
  @AuditLog({ entityType: 'AttendanceRecord', action: 'UPDATE' })
  async manualAttendance(@Body() dto: ManualAttendanceDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const adminEmployeeId = await this.getEmployeeId(req);
    return this.attendanceService.manualAttendance(
      companyId,
      adminEmployeeId,
      dto,
    );
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

    const isSelf =
      req.user.employeeId && req.user.employeeId === targetEmployeeId;

    return this.attendanceService.getMonthlyReport(companyId, {
      month,
      year,
      employeeId: targetEmployeeId,
    });
  }

  @Post('assign-shift/:employeeId')
  @RequirePermission('attendance_shifts:assign_shift')
  @AuditLog({ entityType: 'AttendanceRecord', action: 'UPDATE' })
  async assignShift(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: AssignShiftDto,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    return this.attendanceService.assignShift(
      employeeId,
      companyId,
      dto.shiftId,
    );
  }

  @Put(':id/override')
  @RequirePermission('attendance_regularization:override')
  @AuditLog({ entityType: 'AttendanceRecord', action: 'UPDATE' })
  async overrideAttendance(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    dto: ResolveCorrectionDto & {
      checkInTime?: string;
      checkOutTime?: string;
      attendanceStatus?: AttendanceStatus;
      lateMinutes?: number;
    },
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    const adminEmployeeId = await this.getEmployeeId(req);
    return this.attendanceService.manualOverride(
      id,
      companyId,
      adminEmployeeId,
      dto,
    );
  }
}
