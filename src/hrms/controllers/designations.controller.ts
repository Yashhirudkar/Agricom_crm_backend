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
import { DesignationsService } from '../services/designations.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('designations')
export class DesignationsController {
  constructor(private readonly designationsService: DesignationsService) {}

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
  @RequirePermission('designations:create')
  @HttpCode(HttpStatus.CREATED)
  createDesignation(@Body() dto: { departmentId: number; name: string; description?: string; status?: string }, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.designationsService.createDesignation(companyId, dto, actor);
  }

  @Get()
  @RequirePermission('designations:read')
  getDesignations(
    @Query('search') search: string,
    @Query('status') status: string,
    @Query('departmentId') departmentId: number,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('sortBy') sortBy: string,
    @Query('sortOrder') sortOrder: 'ASC' | 'DESC',
    @Request() req
  ) {
    const companyId = this.getCompanyId(req);
    return this.designationsService.getDesignations(companyId, { search, status, departmentId, page, limit, sortBy, sortOrder });
  }

  @Get(':id')
  @RequirePermission('designations:read')
  getDesignationById(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    return this.designationsService.getDesignationById(id, companyId);
  }

  @Put(':id')
  @RequirePermission('designations:update')
  updateDesignation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { name?: string; description?: string; status?: string; departmentId?: number },
    @Request() req
  ) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.designationsService.updateDesignation(id, companyId, dto, actor);
  }

  @Delete(':id')
  @RequirePermission('designations:delete')
  deleteDesignation(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const companyId = this.getCompanyId(req);
    const actor = this.getActor(req);
    return this.designationsService.deleteDesignation(id, companyId, actor);
  }
}
