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
import { EmployeesService } from '../services/employees.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

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
  @RequirePermission('employees:create')
  @HttpCode(HttpStatus.CREATED)
  createEmployee(@Body() dto: any, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.employeesService.createEmployee(companyId, dto, actor);
  }

  @Get()
  @RequirePermission('employees:read')
  getEmployees(@Query() query: any, @Request() req) {
    const companyId = this.getCompanyId(req);
    return this.employeesService.getEmployees(companyId, query);
  }

  @Get(':id')
  @RequirePermission('employees:read')
  getEmployeeById(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    return this.employeesService.getEmployeeById(id, companyId);
  }

  @Put(':id')
  @RequirePermission('employees:update')
  updateEmployee(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.employeesService.updateEmployee(id, companyId, dto, actor);
  }

  @Delete(':id')
  @RequirePermission('employees:delete')
  deleteEmployee(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.employeesService.deleteEmployee(id, companyId, actor);
  }

  // --- Documents ---

  @Post(':employeeId/documents')
  @RequirePermission('documents:create')
  @HttpCode(HttpStatus.CREATED)
  addDocument(@Param('employeeId', ParseIntPipe) employeeId: number, @Body() dto: any, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.employeesService.addDocument(employeeId, companyId, dto, actor);
  }

  @Get(':employeeId/documents')
  @RequirePermission('documents:read')
  getDocuments(@Param('employeeId', ParseIntPipe) employeeId: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    return this.employeesService.getDocuments(employeeId, companyId);
  }

  @Delete(':employeeId/documents/:documentId')
  @RequirePermission('documents:delete')
  deleteDocument(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Request() req
  ) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.employeesService.deleteDocument(employeeId, documentId, companyId, actor);
  }
}
