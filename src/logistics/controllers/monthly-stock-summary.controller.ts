import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { RequireAnyPermission } from '../../rbac/decorators/require-any-permission.decorator';
import { MonthlyStockSummaryService } from '../services/monthly-stock-summary.service';
import { QueryMonthlyStockSummaryDto } from '../dto/query-monthly-stock-summary.dto';
import { CreateMonthlyStockSummaryDto, UpdateMonthlyStockSummaryDto } from '../dto/create-monthly-stock-summary.dto';
import {
  CreateSectionDto,
  UpdateSectionDto,
  CreateColumnDto,
  UpdateColumnDto,
  CreateRowDto,
  BulkSaveSectionDto,
  BulkSaveReportDto,
  ReorderDto,
} from '../dto/create-monthly-stock-section.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('logistics/monthly-stock-summary')
export class MonthlyStockSummaryController {
  constructor(private readonly service: MonthlyStockSummaryService) {}

  @Get()
  @RequireAnyPermission('logistics:view', 'logistics:read')
  async findAll(@Query() query: QueryMonthlyStockSummaryDto, @Req() req: any) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.findAll(query, companyId);
  }

  @Get(':id')
  @RequireAnyPermission('logistics:view', 'logistics:read')
  async findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.findOne(id, companyId);
  }

  @Post()
  @RequirePermission('logistics:update')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateMonthlyStockSummaryDto & { sourceSummaryId?: number }, @Req() req: any) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.create(dto, req.user, companyId);
  }

  @Patch(':id')
  @RequirePermission('logistics:update')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMonthlyStockSummaryDto,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.update(id, dto, req.user, companyId);
  }

  @Patch(':id/publish')
  @RequirePermission('logistics:update')
  async publish(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.publish(id, req.user, companyId);
  }

  @Delete(':id')
  @RequirePermission('logistics:update')
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.remove(id, companyId);
  }

  // ─── SECTION ENDPOINTS ────────────────────────────────────────────────────

  @Post(':id/sections')
  @RequirePermission('logistics:update')
  @HttpCode(HttpStatus.CREATED)
  async addSection(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateSectionDto,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.addSection(id, dto, companyId);
  }

  @Patch(':id/sections/reorder')
  @RequirePermission('logistics:update')
  async reorderSections(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReorderDto,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.reorderSections(id, dto, companyId);
  }

  @Patch(':id/sections/:sectionId')
  @RequirePermission('logistics:update')
  async updateSection(
    @Param('id', ParseIntPipe) id: number,
    @Param('sectionId', ParseIntPipe) sectionId: number,
    @Body() dto: UpdateSectionDto,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.updateSection(id, sectionId, dto, companyId);
  }

  @Delete(':id/sections/:sectionId')
  @RequirePermission('logistics:update')
  async deleteSection(
    @Param('id', ParseIntPipe) id: number,
    @Param('sectionId', ParseIntPipe) sectionId: number,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.deleteSection(id, sectionId, companyId);
  }

  @Post(':id/sections/:sectionId/duplicate')
  @RequirePermission('logistics:update')
  @HttpCode(HttpStatus.CREATED)
  async duplicateSection(
    @Param('id', ParseIntPipe) id: number,
    @Param('sectionId', ParseIntPipe) sectionId: number,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.duplicateSection(id, sectionId, companyId);
  }

  // ─── COLUMN ENDPOINTS ─────────────────────────────────────────────────────

  @Post(':id/sections/:sectionId/columns')
  @RequirePermission('logistics:update')
  @HttpCode(HttpStatus.CREATED)
  async addColumn(
    @Param('id', ParseIntPipe) id: number,
    @Param('sectionId', ParseIntPipe) sectionId: number,
    @Body() dto: CreateColumnDto,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.addColumn(id, sectionId, dto, companyId);
  }

  @Patch(':id/sections/:sectionId/columns/reorder')
  @RequirePermission('logistics:update')
  async reorderColumns(
    @Param('id', ParseIntPipe) id: number,
    @Param('sectionId', ParseIntPipe) sectionId: number,
    @Body() dto: ReorderDto,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.reorderColumns(id, sectionId, dto, companyId);
  }

  @Post(':id/sections/:sectionId/columns/:columnId/duplicate')
  @RequirePermission('logistics:update')
  @HttpCode(HttpStatus.CREATED)
  async duplicateColumn(
    @Param('id', ParseIntPipe) id: number,
    @Param('sectionId', ParseIntPipe) sectionId: number,
    @Param('columnId', ParseIntPipe) columnId: number,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.duplicateColumn(id, sectionId, columnId, companyId);
  }

  @Patch(':id/sections/:sectionId/columns/:columnId')
  @RequirePermission('logistics:update')
  async updateColumn(
    @Param('id', ParseIntPipe) id: number,
    @Param('sectionId', ParseIntPipe) sectionId: number,
    @Param('columnId', ParseIntPipe) columnId: number,
    @Body() dto: UpdateColumnDto,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.updateColumn(id, sectionId, columnId, dto, companyId);
  }

  @Delete(':id/sections/:sectionId/columns/:columnId')
  @RequirePermission('logistics:update')
  async deleteColumn(
    @Param('id', ParseIntPipe) id: number,
    @Param('sectionId', ParseIntPipe) sectionId: number,
    @Param('columnId', ParseIntPipe) columnId: number,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.deleteColumn(id, sectionId, columnId, companyId);
  }

  // ─── ROW ENDPOINTS ────────────────────────────────────────────────────────

  @Post(':id/sections/:sectionId/rows')
  @RequirePermission('logistics:update')
  @HttpCode(HttpStatus.CREATED)
  async addRow(
    @Param('id', ParseIntPipe) id: number,
    @Param('sectionId', ParseIntPipe) sectionId: number,
    @Body() dto: CreateRowDto,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.addRow(id, sectionId, dto, companyId);
  }

  @Delete(':id/sections/:sectionId/rows/:rowId')
  @RequirePermission('logistics:update')
  async deleteRow(
    @Param('id', ParseIntPipe) id: number,
    @Param('sectionId', ParseIntPipe) sectionId: number,
    @Param('rowId', ParseIntPipe) rowId: number,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.deleteRow(id, sectionId, rowId, companyId);
  }

  @Patch(':id/sections/:sectionId/rows/reorder')
  @RequirePermission('logistics:update')
  async reorderRows(
    @Param('id', ParseIntPipe) id: number,
    @Param('sectionId', ParseIntPipe) sectionId: number,
    @Body() dto: ReorderDto,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.reorderRows(id, sectionId, dto, companyId);
  }

  // ─── BULK SAVE ENDPOINTS ──────────────────────────────────────────────────

  @Post(':id/sections/:sectionId/save')
  @RequirePermission('logistics:update')
  @HttpCode(HttpStatus.OK)
  async bulkSaveSection(
    @Param('id', ParseIntPipe) id: number,
    @Param('sectionId', ParseIntPipe) sectionId: number,
    @Body() dto: BulkSaveSectionDto,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.bulkSaveSection(id, sectionId, dto, companyId);
  }

  @Post(':id/save-all')
  @RequirePermission('logistics:update')
  @HttpCode(HttpStatus.OK)
  async saveReportData(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BulkSaveReportDto,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.saveReportData(id, dto, companyId);
  }
}

