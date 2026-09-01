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
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { getAttachmentMulterConfig } from '../../attachments/config/multer.config';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { AuditLog } from '../../audit/decorators/audit-log.decorator';

import { LogisticsService } from '../services/logistics.service';
import { QueryLogisticsDto } from '../dto/query-logistics.dto';
import { CreateFreightQuoteDto, UpdateFreightQuoteDto } from '../dto/create-freight-quote.dto';
import { UpdateLogisticsStatusDto } from '../dto/update-logistics-status.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('logistics')
export class LogisticsController {
  constructor(private readonly service: LogisticsService) {}

  // ─── Queue List ──────────────────────────────────────────────────────────────
  @Get()
  @RequirePermission('logistics:view')
  async findQueue(@Query() query: QueryLogisticsDto) {
    return this.service.findQueue(query);
  }

  // ─── Details Lookup & Auto-Initialization ────────────────────────────────────
  @Get('enquiry/:enquiryId')
  @RequirePermission('logistics:view')
  async getDetails(@Param('enquiryId') enquiryId: string, @Req() req: any) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.getDetails(enquiryId, companyId);
  }

  // ─── Add Freight Quote ───────────────────────────────────────────────────────
  @Post(':id/quotes')
  @RequirePermission('logistics:update')
  @HttpCode(HttpStatus.CREATED)
  async createFreightQuote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateFreightQuoteDto,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.createFreightQuote(id, dto, req.user, companyId);
  }

  // ─── Edit Freight Quote ──────────────────────────────────────────────────────
  @Patch(':id/quotes/:quoteId')
  @RequirePermission('logistics:update')
  async updateFreightQuote(
    @Param('id', ParseIntPipe) id: number,
    @Param('quoteId', ParseIntPipe) quoteId: number,
    @Body() dto: UpdateFreightQuoteDto,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.updateFreightQuote(id, quoteId, dto, req.user, companyId);
  }

  // ─── Delete Freight Quote ────────────────────────────────────────────────────
  @Delete(':id/quotes/:quoteId')
  @RequirePermission('logistics:update')
  async deleteFreightQuote(
    @Param('id', ParseIntPipe) id: number,
    @Param('quoteId', ParseIntPipe) quoteId: number,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.deleteFreightQuote(id, quoteId, req.user, companyId);
  }

  // ─── Toggle Preferred Quote ──────────────────────────────────────────────────
  @Patch(':id/quotes/:quoteId/preferred')
  @RequirePermission('logistics:update')
  async setPreferredQuote(
    @Param('id', ParseIntPipe) id: number,
    @Param('quoteId', ParseIntPipe) quoteId: number,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.setPreferredQuote(id, quoteId, req.user, companyId);
  }

  // ─── Update Logistics Status & Header Details ────────────────────────────────
  @Patch(':id/status')
  @RequirePermission('logistics:update')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLogisticsStatusDto,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.updateStatus(id, dto, req.user, companyId);
  }

  // ─── Generate Shipment ───────────────────────────────────────────────────────
  @Post(':id/generate-shipment')
  @RequirePermission('logistics:update')
  @HttpCode(HttpStatus.CREATED)
  async generateShipment(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.generateShipment(id, req.user, companyId);
  }

  // ─── Get Attachments List ────────────────────────────────────────────────────
  @Get(':id/attachments')
  @RequirePermission('logistics:view')
  async getAttachments(@Param('id', ParseIntPipe) id: number) {
    return this.service.getAttachments(id);
  }

  // ─── Upload Attachment ───────────────────────────────────────────────────────
  @Post(':id/attachments')
  @RequirePermission('logistics:update')
  @UseInterceptors(FileInterceptor('file', getAttachmentMulterConfig()))
  async uploadAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Body('category') category: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.uploadAttachment(id, category, file, req.user, companyId);
  }

  // ─── Delete Attachment ───────────────────────────────────────────────────────
  @Delete(':id/attachments/:attachmentId')
  @RequirePermission('logistics:update')
  async deleteAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.service.deleteAttachment(id, attachmentId, req.user, companyId);
  }

  // ─── Timeline Operational Log Trail ─────────────────────────────────────────
  @Get(':id/activity')
  @RequirePermission('logistics:view')
  async getActivities(@Param('id', ParseIntPipe) id: number) {
    return this.service.getActivities(id);
  }
}
