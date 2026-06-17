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

  private async getEmployeeId(req: any, companyId: number): Promise<number> {
    let employeeId = req.user.employeeId;
    if (!employeeId && (req.user.type === 'client_admin' || req.user.type === 'super_admin')) {
      employeeId = await this.attendanceService.getFallbackEmployeeIdForAdmin(companyId);
    }
    if (!employeeId) {
      throw new BadRequestException('Employee profile not linked to your user account (and no default employee found for testing).');
    }
    return employeeId;
  }

  @Post('check-in')
  @RequirePermission('attendance:create')
  @HttpCode(HttpStatus.OK)
  async checkIn(@Body() dto: CheckInDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const employeeId = await this.getEmployeeId(req, companyId);
    return this.attendanceService.checkIn(employeeId, companyId, dto);
  }

  @Post('check-out')
  @RequirePermission('attendance:create')
  @HttpCode(HttpStatus.OK)
  async checkOut(@Body() dto: CheckOutDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const employeeId = await this.getEmployeeId(req, companyId);
    return this.attendanceService.checkOut(employeeId, companyId, dto);
  }

  @Post('break-start')
  @RequirePermission('attendance:create')
  @HttpCode(HttpStatus.OK)
  async breakStart(@Body() dto: BreakStartDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const employeeId = await this.getEmployeeId(req, companyId);
    return this.attendanceService.breakStart(employeeId, companyId, dto);
  }

  @Post('break-end')
  @RequirePermission('attendance:create')
  @HttpCode(HttpStatus.OK)
  async breakEnd(@Body() dto: BreakEndDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const employeeId = await this.getEmployeeId(req, companyId);
    return this.attendanceService.breakEnd(employeeId, companyId, dto);
  }

  @Get('me')
  @RequirePermission('attendance:read')
  async getMe(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    const employeeId = await this.getEmployeeId(req, companyId);
    return this.attendanceService.getMyAttendance(employeeId, companyId, { startDate, endDate });
  }

  @Get('company')
  @RequirePermission('attendance:read')
  async getCompany(
    @Query('date') date: string,
    @Query('employeeId') employeeId: number,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    return this.attendanceService.getCompanyAttendance(companyId, { date, employeeId });
  }

  @Get('corrections')
  @RequirePermission('attendance:override')
  async getPendingCorrections(@Request() req) {
    const companyId = this.getCompanyId(req);
    return this.attendanceService.getPendingCorrections(companyId);
  }

  @Post('request-regularization')
  @RequirePermission('attendance:create')
  async requestCorrection(@Body() dto: RequestCorrectionDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const employeeId = await this.getEmployeeId(req, companyId);
    return this.attendanceService.requestCorrection(employeeId, companyId, dto);
  }

  @Put('admin/approve-regularization/:id')
  @RequirePermission('attendance:override')
  async approveCorrection(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveCorrectionDto,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    const approverEmployeeId = await this.getEmployeeId(req, companyId);
    return this.attendanceService.approveCorrection(id, companyId, approverEmployeeId, req.user.type, dto);
  }

  @Put('admin/reject-regularization/:id')
  @RequirePermission('attendance:override')
  async rejectCorrection(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveCorrectionDto,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    const approverEmployeeId = await this.getEmployeeId(req, companyId);
    return this.attendanceService.rejectCorrection(id, approverEmployeeId, req.user.type, dto);
  }

  @Post('admin/manual-attendance')
  @RequirePermission('attendance:override')
  async manualAttendance(
    @Body() dto: ManualAttendanceDto,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    const adminEmployeeId = await this.getEmployeeId(req, companyId);
    return this.attendanceService.manualAttendance(companyId, adminEmployeeId, dto);
  }

  @Get('report/monthly')
  @RequirePermission('attendance:read')
  async getMonthlyReport(
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
    @Query('employeeId') employeeId: number,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    return this.attendanceService.getMonthlyReport(companyId, { month, year, employeeId });
  }

  @Post('assign-shift/:employeeId')
  @RequirePermission('attendance:assign_shift')
  async assignShift(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: AssignShiftDto,
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    return this.attendanceService.assignShift(employeeId, companyId, dto.shiftId);
  }

  @Put(':id/override')
  @RequirePermission('attendance:override')
  async overrideAttendance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveCorrectionDto & { checkInTime?: string; checkOutTime?: string; attendanceStatus?: AttendanceStatus; lateMinutes?: number },
    @Request() req,
  ) {
    const companyId = this.getCompanyId(req);
    const adminEmployeeId = await this.getEmployeeId(req, companyId);
    return this.attendanceService.manualOverride(id, companyId, adminEmployeeId, dto);
  }
}
