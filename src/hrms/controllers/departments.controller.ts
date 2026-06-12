import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
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
import { DepartmentsService } from '../services/departments.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { CreateDepartmentDto, UpdateDepartmentDto, GetDepartmentsFilterDto } from '../dto/departments.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

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
    };
  }

  @Post()
  @RequirePermission('departments:create')
  @HttpCode(HttpStatus.CREATED)
  createDepartment(@Body() dto: CreateDepartmentDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.departmentsService.createDepartment(companyId, dto, actor);
  }

  @Get()
  @RequirePermission('departments:read')
  getDepartments(
    @Query() filterDto: GetDepartmentsFilterDto,
    @Request() req
  ) {
    const companyId = this.getCompanyId(req);
    return this.departmentsService.getDepartments(companyId, filterDto);
  }

  @Get(':id')
  @RequirePermission('departments:read')
  getDepartmentById(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    return this.departmentsService.getDepartmentById(id, companyId);
  }

  @Put(':id')
  @RequirePermission('departments:update')
  updateDepartment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDepartmentDto,
    @Request() req
  ) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.departmentsService.updateDepartment(id, companyId, dto, actor);
  }

  @Delete(':id')
  @RequirePermission('departments:delete')
  deleteDepartment(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.departmentsService.deleteDepartment(id, companyId, actor);
  }
}
