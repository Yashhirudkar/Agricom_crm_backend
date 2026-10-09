import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { getAttachmentMulterConfig } from '../attachments/config/multer.config';
import { SalesContractService } from './sales-contract.service';
import { CreateSalesContractDto } from './dto/create-sales-contract.dto';
import {
  UpdateSalesContractDto,
  UpdateSalesContractStatusDto,
} from './dto/update-sales-contract.dto';
import { QuerySalesContractDto } from './dto/query-sales-contract.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { AuditLog } from '../audit/decorators/audit-log.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sales-contracts')
export class SalesContractController {
  constructor(private readonly service: SalesContractService) {}

  @Post()
  @RequirePermission('sales-contract:create')
  @AuditLog({ entityType: 'SalesContract', action: 'CREATE' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSalesContractDto, @Req() req: any) {
    return this.service.create(dto, req.user);
  }

  @Get()
  @RequirePermission('sales-contract:view')
  async findAll(@Query() query: QuerySalesContractDto, @Req() req: any) {
    return await this.service.findAll({
      ...query,
      companyId: req.user?.companyId,
    });
  }

  @Get('financial-years')
  async getDistinctFinancialYears(@Req() req: any) {
    return await this.service.getDistinctFinancialYears(req.user?.companyId);
  }

  /**
   * Preview the next auto-generated contract number.
   * Only applicable to Agricom Impex / Agricom Impex Pvt Ltd sellers.
   * Returns null for all other sellers.
   *
   * The prefix includes the buyer's first initial: <BuyerInitial><SellerCode>
   *
   * NOTE: This is for UI display only. The final contract number is always
   * regenerated atomically on the backend during contract creation.
   */
  @Get('next-number')
  @RequirePermission('sales-contract:view')
  async getNextContractNumber(
    @Query('sellerId') sellerIdStr: string,
    @Query('buyerId') buyerIdStr: string,
    @Query('financialYear') financialYear: string,
    @Req() req: any,
  ) {
    if (!sellerIdStr || !buyerIdStr || !financialYear) {
      throw new BadRequestException(
        'sellerId, buyerId and financialYear are required.',
      );
    }
    const sellerId = parseInt(sellerIdStr, 10);
    const buyerId = parseInt(buyerIdStr, 10);
    if (isNaN(sellerId) || isNaN(buyerId)) {
      throw new BadRequestException(
        'sellerId and buyerId must be valid integers.',
      );
    }
    const result = await this.service.getNextContractNumber(
      sellerId,
      buyerId,
      financialYear,
    );
    if (result === null) {
      // Not an Agricom seller — return null so frontend knows no auto-number applies
      return { contractNo: null };
    }
    return result;
  }

  @Get(':id')
  @RequirePermission('sales-contract:view')
  async findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return await this.service.findOne(id, req.user?.companyId);
  }

  @Patch(':id')
  @RequirePermission('sales-contract:update')
  @AuditLog({ entityType: 'SalesContract', action: 'UPDATE' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalesContractDto,
    @Req() req: any,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Patch(':id/status')
  @RequirePermission('sales-contract:update')
  @AuditLog({ entityType: 'SalesContract', action: 'UPDATE_STATUS' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalesContractStatusDto,
    @Req() req: any,
  ) {
    return this.service.updateStatus(id, dto, req.user);
  }

  @Delete(':id')
  @RequirePermission('sales-contract:delete')
  @AuditLog({ entityType: 'SalesContract', action: 'DELETE' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.remove(id, req.user);
  }

  @Get(':id/documents')
  @RequirePermission('sales-contract:view')
  async getDocuments(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return await this.service.getDocuments(id, req.user?.companyId);
  }

  @Post(':id/documents/:tradeDocumentId/upload')
  @UseInterceptors(FileInterceptor('file', getAttachmentMulterConfig()))
  @RequirePermission('sales-contract:update')
  @AuditLog({ entityType: 'SalesContractDocumentFile', action: 'UPLOAD' })
  async uploadDocument(
    @Param('id', ParseIntPipe) id: number,
    @Param('tradeDocumentId', ParseIntPipe) tradeDocumentId: number,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    const companyId: number = req.user?.companyId;
    if (!companyId) {
      throw new BadRequestException(
        'Company context is required for document upload',
      );
    }
    return await this.service.uploadDocument(
      id,
      tradeDocumentId,
      file,
      req.user,
      companyId,
    );
  }

  @Delete(':id/documents/:tradeDocumentId')
  @RequirePermission('sales-contract:update')
  @AuditLog({ entityType: 'SalesContractDocumentFile', action: 'DELETE' })
  async deleteDocument(
    @Param('id', ParseIntPipe) id: number,
    @Param('tradeDocumentId', ParseIntPipe) tradeDocumentId: number,
  ) {
    return await this.service.deleteDocument(id, tradeDocumentId);
  }
}
