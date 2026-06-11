import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { CompaniesService } from '../services/companies.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post('CreateCompany')
  @RequirePermission('companies:create')
  @HttpCode(HttpStatus.CREATED)
  createCompany(@Body() dto: { name: string; isActive?: boolean; clientId?: number }, @Request() req) {
    const actor = {
      userId: req.user.userId || req.user.sub || null,
      clientId: req.user.clientId || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
    if (req.user.type === 'super_admin') {
      if (!dto.clientId) {
        throw new ForbiddenException('Super Admin must provide a clientId to create a company.');
      }
      return this.companiesService.createCompany(dto.clientId, dto, actor);
    }
    // Only Client Admin can create a company for themselves
    if (req.user.type !== 'client_admin') {
      throw new ForbiddenException('Only Client Admin can create companies');
    }
    return this.companiesService.createCompany(req.user.clientId, dto, actor);
  }

  @Post('UpdateCompany')
  @RequirePermission('companies:update')
  @HttpCode(HttpStatus.OK)
  updateCompany(@Body() dto: { id: number; name?: string; isActive?: boolean }, @Request() req) {
    const actor = {
      userId: req.user.userId || req.user.sub || null,
      clientId: req.user.clientId || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
    const clientId = req.user.type === 'super_admin' ? null : req.user.clientId;
    return this.companiesService.updateCompany(dto.id, clientId, dto, actor);
  }

  @Post('DeleteCompany')
  @RequirePermission('companies:delete')
  @HttpCode(HttpStatus.OK)
  deleteCompany(@Body() dto: { id: number }, @Request() req) {
    const actor = {
      userId: req.user.userId || req.user.sub || null,
      clientId: req.user.clientId || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
    const clientId = req.user.type === 'super_admin' ? null : req.user.clientId;
    return this.companiesService.deleteCompany(dto.id, clientId, actor);
  }

  @Get('GetCompanies')
  @RequirePermission('companies:read')
  getCompanies(@Request() req) {
    const clientId = req.user.type === 'super_admin' ? null : req.user.clientId;
    return this.companiesService.getCompanies(clientId);
  }

  @Get('GetCompanyById')
  @RequirePermission('companies:read')
  getCompanyById(@Query('id', ParseIntPipe) id: number, @Request() req) {
    const clientId = req.user.type === 'super_admin' ? null : req.user.clientId;
    return this.companiesService.getCompanyById(id, clientId);
  }
}
