import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { LeaveTypesService } from '../services/leave-types.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { CreateLeaveTypeDto, UpdateLeaveTypeDto } from '../dto/leave-types.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('leave-types')
export class LeaveTypesController {
  constructor(private readonly leaveTypesService: LeaveTypesService) {}

  private getCompanyId(req: any): number {
    const companyId = req.headers['x-company-id'];
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

  @Post()
  @RequirePermission('leave_types:create')
  @HttpCode(HttpStatus.CREATED)
  createLeaveType(@Body() dto: CreateLeaveTypeDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.leaveTypesService.createLeaveType(companyId, dto, actor);
  }

  @Get()
  @RequirePermission('leave_types:read')
  getLeaveTypes(@Request() req) {
    const companyId = this.getCompanyId(req);
    return this.leaveTypesService.getLeaveTypes(companyId);
  }

  @Get(':id')
  @RequirePermission('leave_types:read')
  getLeaveTypeById(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    return this.leaveTypesService.getLeaveTypeById(id, companyId);
  }

  @Put(':id')
  @RequirePermission('leave_types:update')
  updateLeaveType(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLeaveTypeDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.leaveTypesService.updateLeaveType(id, companyId, dto, actor);
  }

  @Delete(':id')
  @RequirePermission('leave_types:delete')
  deleteLeaveType(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.leaveTypesService.deleteLeaveType(id, companyId, actor);
  }
}
