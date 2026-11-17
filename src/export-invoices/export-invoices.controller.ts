import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExportInvoicesService } from './services/export-invoices.service';
import { CreateExportInvoiceDto } from './dto/create-export-invoice.dto';
import { UpdateExportInvoiceDto } from './dto/update-export-invoice.dto';
import { QueryExportInvoiceDto } from './dto/query-export-invoice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequireAnyPermission } from '../rbac/decorators/require-any-permission.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('export-invoices')
export class ExportInvoicesController {
  constructor(private readonly service: ExportInvoicesService) {}

  /**
   * Pre-populates ERP data for an export invoice from a shipment:
   * Sales Contract -> Purchase Contract -> Shipment -> Stuffing Execution -> Invoice
   */
  @Get('init/:shipmentId')
  @RequireAnyPermission(
    'export_invoice:create',
    'export_invoice:view',
    'shipments:view',
    'shipment_stuffing_execution:view',
  )
  async initFromShipment(
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Req() req: any,
  ) {
    return this.service.initFromShipment(shipmentId, req.user);
  }

  /**
   * Previews next invoice number and sequence
   */
  @Get('next-number')
  @RequireAnyPermission(
    'export_invoice:view',
    'export_invoice:create',
    'shipments:view',
  )
  async previewNextNumber(
    @Query('contractNumber') contractNumber: string,
    @Query('manualSequence') manualSequence: string,
    @Req() req: any,
  ) {
    const companyId = req.user?.companyId || null;
    return this.service.previewNextNumber(
      companyId,
      contractNumber,
      manualSequence,
    );
  }

  /**
   * Sets initial sequence manually
   */
  @Post('sequence/initial')
  @RequireAnyPermission('export_invoice:create', 'export_invoice:update')
  async setInitialSequence(
    @Body('sequence') sequence: number,
    @Req() req: any,
  ) {
    if (!sequence || sequence < 1) {
      throw new BadRequestException('A valid initial sequence number >= 1 is required');
    }
    const companyId = req.user?.companyId || null;
    return this.service.setInitialSequence(companyId, sequence);
  }

  /**
   * Returns available bank options for currency
   */
  @Get('banks')
  @RequireAnyPermission(
    'export_invoice:view',
    'export_invoice:create',
    'shipments:view',
  )
  async getBankOptions(@Query('currency') currency?: string) {
    return this.service.getBankOptions(currency);
  }

  /**
   * Temporary upload for signature image
   */
  @Post('upload-signature')
  @RequireAnyPermission('export_invoice:create', 'export_invoice:update')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSignature(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No signature file uploaded');
    }
    const url = await this.service.uploadSignatureOrStamp(file, 'signature');
    return { url };
  }

  /**
   * Temporary upload for stamp image
   */
  @Post('upload-stamp')
  @RequireAnyPermission('export_invoice:create', 'export_invoice:update')
  @UseInterceptors(FileInterceptor('file'))
  async uploadStamp(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No stamp file uploaded');
    }
    const url = await this.service.uploadSignatureOrStamp(file, 'stamp');
    return { url };
  }

  /**
   * Creates an Export Invoice
   */
  @Post()
  @RequireAnyPermission('export_invoice:create', 'export_invoice:view')
  async create(@Body() dto: CreateExportInvoiceDto, @Req() req: any) {
    return this.service.create(dto, req.user);
  }

  /**
   * Lists Export Invoices
   */
  @Get()
  @RequireAnyPermission('export_invoice:view', 'shipments:view')
  async findAll(@Query() query: QueryExportInvoiceDto, @Req() req: any) {
    return this.service.findAll(query, req.user);
  }

  /**
   * Gets single Export Invoice by ID
   */
  @Get(':id')
  @RequireAnyPermission('export_invoice:view', 'shipments:view')
  async findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.findOne(id, req.user);
  }

  /**
   * Updates an Export Invoice
   */
  @Put(':id')
  @RequireAnyPermission('export_invoice:update', 'export_invoice:create')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExportInvoiceDto,
    @Req() req: any,
  ) {
    return this.service.update(id, dto, req.user);
  }

  /**
   * Deletes an Export Invoice
   */
  @Delete(':id')
  @RequireAnyPermission('export_invoice:delete', 'export_invoice:update')
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.remove(id, req.user);
  }
}

