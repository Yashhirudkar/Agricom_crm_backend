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
import { getAttachmentMulterConfig } from '../attachments/config/multer.config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { AuditLog } from '../audit/decorators/audit-log.decorator';

import { PurchaseContractService } from './services/purchase-contract.service';
import { PurchaseContractQueryService } from './services/purchase-contract-query.service';
import { PurchaseContractShipmentService } from './services/purchase-contract-shipment.service';
import { PurchaseContractDocumentService } from './services/purchase-contract-document.service';
import { PurchaseContractActivityService } from './services/purchase-contract-activity.service';

import { CreatePurchaseContractDto } from './dto/create-purchase-contract.dto';
import { UpdatePurchaseContractDto, UpdatePurchaseContractStatusDto } from './dto/update-purchase-contract.dto';
import { QueryPurchaseContractDto } from './dto/query-purchase-contract.dto';
import { AddShipmentDto } from './dto/add-shipment.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('purchase-contracts')
export class PurchaseContractController {
  constructor(
    private readonly service: PurchaseContractService,
    private readonly queryService: PurchaseContractQueryService,
    private readonly shipmentService: PurchaseContractShipmentService,
    private readonly documentService: PurchaseContractDocumentService,
    private readonly activityService: PurchaseContractActivityService,
  ) {}

  // ─── Dashboard ────────────────────────────────────────────────────────────────
  @Get('dashboard')
  @RequirePermission('purchase-contracts:view')
  async getDashboard() {
    return this.queryService.getDashboard();
  }

  // ─── List ──────────────────────────────────────────────────────────────────────
  @Get()
  @RequirePermission('purchase-contracts:view')
  async findAll(@Query() query: QueryPurchaseContractDto) {
    return this.queryService.findAll(query);
  }

  // ─── Create (Rocket Button / explicit creation) ────────────────────────────────
  @Post()
  @RequirePermission('purchase-contracts:create')
  @AuditLog({ entityType: 'PurchaseContract', action: 'CREATE' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePurchaseContractDto, @Req() req: any) {
    return this.service.create(dto, req.user);
  }

  // ─── Detail ───────────────────────────────────────────────────────────────────
  @Get(':id')
  @RequirePermission('purchase-contracts:view')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.queryService.findOneWithDetail(id);
  }

  // ─── Aggregated Summary ───────────────────────────────────────────────────────
  @Get(':id/summary')
  @RequirePermission('purchase-contracts:view')
  async getSummary(@Param('id', ParseIntPipe) id: number) {
    return this.queryService.getSummary(id);
  }

  // ─── Timeline ────────────────────────────────────────────────────────────────
  @Get(':id/timeline')
  @RequirePermission('purchase-contracts:view')
  async getTimeline(@Param('id', ParseIntPipe) id: number) {
    return this.queryService.getTimeline(id);
  }

  // ─── Update ───────────────────────────────────────────────────────────────────
  @Patch(':id')
  @RequirePermission('purchase-contracts:update')
  @AuditLog({ entityType: 'PurchaseContract', action: 'UPDATE' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseContractDto,
    @Req() req: any,
  ) {
    return this.service.update(id, dto, req.user);
  }

  // ─── Status Update ────────────────────────────────────────────────────────────
  @Patch(':id/status')
  @RequirePermission('purchase-contracts:update')
  @AuditLog({ entityType: 'PurchaseContract', action: 'UPDATE_STATUS' })
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseContractStatusDto,
    @Req() req: any,
  ) {
    return this.service.updateStatus(id, dto, req.user);
  }

  // ─── Cancel / Delete ──────────────────────────────────────────────────────────
  @Delete(':id')
  @RequirePermission('purchase-contracts:delete')
  @AuditLog({ entityType: 'PurchaseContract', action: 'CANCEL' })
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.remove(id, req.user);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SHIPMENTS
  // ─────────────────────────────────────────────────────────────────────────────

  @Get(':id/shipments')
  @RequirePermission('purchase-contracts:view')
  async getShipments(@Param('id', ParseIntPipe) id: number) {
    return this.shipmentService.getShipments(id);
  }

  @Post(':id/shipments')
  @RequirePermission('purchase-contracts:update')
  @AuditLog({ entityType: 'PurchaseContractShipment', action: 'ADD' })
  @HttpCode(HttpStatus.CREATED)
  async addShipment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddShipmentDto,
    @Req() req: any,
  ) {
    return this.shipmentService.addShipment(id, dto, req.user);
  }

  @Delete(':id/shipments/:shipmentId')
  @RequirePermission('purchase-contracts:update')
  @AuditLog({ entityType: 'PurchaseContractShipment', action: 'REMOVE' })
  async removeShipment(
    @Param('id', ParseIntPipe) id: number,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Req() req: any,
  ) {
    return this.shipmentService.removeShipment(id, shipmentId, req.user);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DOCUMENTS
  // ─────────────────────────────────────────────────────────────────────────────

  @Get(':id/documents')
  @RequirePermission('purchase-contracts:view')
  async getDocuments(@Param('id', ParseIntPipe) id: number) {
    return this.documentService.getDocuments(id);
  }

  @Post(':id/documents')
  @RequirePermission('purchase-contracts:manage_documents')
  async addRequiredDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body('tradeDocumentId', ParseIntPipe) tradeDocumentId: number,
    @Req() req: any,
  ) {
    return this.documentService.addRequiredDocument(id, tradeDocumentId, req.user);
  }

  @Post(':id/documents/:tradeDocumentId/upload')
  @RequirePermission('purchase-contracts:manage_documents')
  @AuditLog({ entityType: 'PurchaseContractDocument', action: 'UPLOAD' })
  @UseInterceptors(FileInterceptor('file', getAttachmentMulterConfig()))
  async uploadDocument(
    @Param('id', ParseIntPipe) id: number,
    @Param('tradeDocumentId', ParseIntPipe) tradeDocumentId: number,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : null;
    if (!companyId) throw new BadRequestException('x-company-id header is required');
    return this.documentService.uploadDocument(id, tradeDocumentId, file, req.user, companyId);
  }

  @Delete(':id/documents/:tradeDocumentId')
  @RequirePermission('purchase-contracts:manage_documents')
  @AuditLog({ entityType: 'PurchaseContractDocument', action: 'DELETE' })
  async deleteDocument(
    @Param('id', ParseIntPipe) id: number,
    @Param('tradeDocumentId', ParseIntPipe) tradeDocumentId: number,
    @Req() req: any,
  ) {
    return this.documentService.deleteDocument(id, tradeDocumentId, req.user);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ATTACHMENTS
  // ─────────────────────────────────────────────────────────────────────────────

  @Get(':id/attachments')
  @RequirePermission('purchase-contracts:view')
  async getContractAttachments(@Param('id', ParseIntPipe) id: number) {
    return this.documentService.getContractAttachments(id);
  }

  @Post(':id/attachments')
  @RequirePermission('purchase-contracts:update')
  @AuditLog({ entityType: 'PurchaseContractAttachment', action: 'UPLOAD' })
  @UseInterceptors(FileInterceptor('file', getAttachmentMulterConfig()))
  async uploadContractAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Body('category') category: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    const headerOrActive = req.headers['x-company-id'] || req.activeCompanyId;
    const companyId = headerOrActive ? parseInt(headerOrActive as string, 10) : 1;
    return this.documentService.uploadContractAttachment(id, category, file, req.user, companyId);
  }

  @Delete(':id/attachments/:attachmentId')
  @RequirePermission('purchase-contracts:update')
  @AuditLog({ entityType: 'PurchaseContractAttachment', action: 'DELETE' })
  async deleteContractAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @Req() req: any,
  ) {
    return this.documentService.deleteContractAttachment(id, attachmentId, req.user);
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // ACTIVITY
  // ─────────────────────────────────────────────────────────────────────────────

  @Get(':id/activity')
  @RequirePermission('purchase-contracts:view')
  async getActivity(
    @Param('id', ParseIntPipe) id: number,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
  ) {
    return this.activityService.getActivities(id, page, limit);
  }
}
