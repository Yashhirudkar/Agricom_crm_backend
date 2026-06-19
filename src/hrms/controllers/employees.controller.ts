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
  ForbiddenException,
  Res,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { EmployeesService } from '../services/employees.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { CreateEmployeeDto, UpdateEmployeeDto, GetEmployeesFilterDto, AddDocumentDto, VerifyDocumentDto, ChangeManagerDto, TransitionLifecycleDto } from '../dto/employees.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { extname } from 'path';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) { }

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



  @Post()
  @RequirePermission('employees:create')
  @HttpCode(HttpStatus.CREATED)
  createEmployee(@Body() dto: CreateEmployeeDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.employeesService.createEmployee(companyId, dto, actor);
  }

  @Get()
  @RequirePermission('employees:read')
  getEmployees(@Query() query: GetEmployeesFilterDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    return this.employeesService.getEmployees(companyId, query);
  }

  @Get('org-chart/full')
  @RequirePermission('employee_hierarchy:view_hierarchy')
  getOrgChart(@Request() req) {
    const companyId = this.getCompanyId(req);
    return this.employeesService.getOrgChart(companyId);
  }

  @Get(':id')
  @RequirePermission('employees:read')
  async getEmployeeById(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);

    return this.employeesService.getEmployeeById(id, companyId);
  }

  @Put(':id')
  @RequirePermission('employees:update')
  updateEmployee(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEmployeeDto, @Request() req) {
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

  // --- Lifecycle Workflow ---

  @Post(':id/start-onboarding')
  @RequirePermission('employee_lifecycle:manage')
  startOnboarding(@Param('id', ParseIntPipe) id: number, @Body() dto: TransitionLifecycleDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.employeesService.transitionLifecycle(id, companyId, 'ONBOARDING', dto, actor);
  }

  @Put(':id/start-probation')
  @RequirePermission('employee_lifecycle:manage')
  startProbation(@Param('id', ParseIntPipe) id: number, @Body() dto: TransitionLifecycleDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.employeesService.transitionLifecycle(id, companyId, 'PROBATION', dto, actor);
  }

  @Put(':id/confirm')
  @RequirePermission('employee_lifecycle:manage')
  confirmEmployee(@Param('id', ParseIntPipe) id: number, @Body() dto: TransitionLifecycleDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.employeesService.transitionLifecycle(id, companyId, 'CONFIRMED', dto, actor);
  }

  @Put(':id/resign')
  @RequirePermission('employee_lifecycle:manage')
  resignEmployee(@Param('id', ParseIntPipe) id: number, @Body() dto: TransitionLifecycleDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.employeesService.transitionLifecycle(id, companyId, 'RESIGNED', dto, actor);
  }

  @Put(':id/start-notice-period')
  @RequirePermission('employee_lifecycle:manage')
  startNoticePeriod(@Param('id', ParseIntPipe) id: number, @Body() dto: TransitionLifecycleDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.employeesService.transitionLifecycle(id, companyId, 'NOTICE_PERIOD', dto, actor);
  }

  @Put(':id/terminate')
  @RequirePermission('employee_lifecycle:manage')
  terminateEmployee(@Param('id', ParseIntPipe) id: number, @Body() dto: TransitionLifecycleDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.employeesService.transitionLifecycle(id, companyId, 'TERMINATED', dto, actor);
  }


  // --- Organization Hierarchy ---

  @Get(':id/team')
  @RequirePermission('employee_hierarchy:view_team')
  getTeam(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    return this.employeesService.getTeam(id, companyId);
  }

  @Get(':id/all-subordinates')
  @RequirePermission('employee_hierarchy:view_hierarchy')
  getAllSubordinates(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    return this.employeesService.getAllSubordinates(id, companyId);
  }

  @Get(':id/reporting-chain')
  @RequirePermission('employee_hierarchy:view_hierarchy')
  getReportingChain(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    return this.employeesService.getReportingChain(id, companyId);
  }

  @Put(':id/change-manager')
  @RequirePermission('employee_hierarchy:change_manager')
  changeManager(@Param('id', ParseIntPipe) id: number, @Body() dto: ChangeManagerDto, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.employeesService.changeManager(id, companyId, dto, actor);
  }

  // --- Documents ---

  @Post(':employeeId/documents')
  @RequirePermission('employee_documents:upload')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  async addDocument(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: AddDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @Request() req
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(`File type ${file.mimetype} is not allowed. Allowed types: pdf, jpg, jpeg, png, docx.`);
    }

    const ext = extname(file.originalname).toLowerCase();
    const blockedExtensions = ['.exe', '.bat', '.js', '.sh'];
    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.docx'];

    if (blockedExtensions.includes(ext) || !allowedExtensions.includes(ext)) {
      throw new BadRequestException(`File extension ${ext} is not allowed.`);
    }

    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('File size exceeds the 10 MB limit');
    }

    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.employeesService.addDocument(employeeId, companyId, dto, file, actor);
  }

  @Get(':employeeId/documents')
  @RequirePermission('employee_documents:read')
  async getDocuments(@Param('employeeId', ParseIntPipe) employeeId: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);



    return this.employeesService.getDocuments(employeeId, companyId, actor);
  }

  @Get(':employeeId/documents/:documentId/download')
  @RequirePermission('employee_documents:download')
  async downloadDocument(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Request() req,
    @Res() res: Response
  ) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);



    const absolutePath = await this.employeesService.downloadDocument(employeeId, documentId, companyId, actor);
    return res.sendFile(absolutePath);
  }

  @Put(':employeeId/documents/:documentId/verify')
  @RequirePermission('employee_documents:verify')
  verifyDocument(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Body() dto: VerifyDocumentDto,
    @Request() req
  ) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.employeesService.verifyDocument(employeeId, documentId, companyId, dto, actor);
  }

  @Delete(':employeeId/documents/:documentId')
  @RequirePermission('employee_documents:delete')
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
