import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpStatus,
  HttpCode,
  Req,
  Res,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ShipmentService } from './shipment.service';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { UpdateManualReadinessDto } from './dto/update-manual-readiness.dto';
import { QueryShipmentDto } from './dto/query-shipment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { AttachmentsService } from '../attachments/services/attachments.service';
import { getAttachmentMulterConfig } from '../attachments/config/multer.config';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sales-contracts/shipments')
export class ShipmentController {
  constructor(
    private readonly service: ShipmentService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  @Get()
  @RequirePermission('shipments:view')
  async findAll(@Query() query: QueryShipmentDto, @Req() req: any) {
    return await this.service.findAll({
      ...query,
      companyId: req.user?.companyId,
    } as any);
  }

  @Get('stats')
  @RequirePermission('shipments:view')
  async getStats(@Query() query: QueryShipmentDto, @Req() req: any) {
    return await this.service.getStats({
      ...query,
      companyId: req.user?.companyId,
    } as any);
  }

  @Get('export/excel')
  @RequirePermission('shipments:view')
  async exportExcel(
    @Query() query: QueryShipmentDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const buffer = await this.service.exportExcel({
      ...query,
      companyId: req.user?.companyId,
    });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="shipments.xlsx"',
    );
    res.send(buffer);
  }

  @Get(':id')
  @RequirePermission('shipments:view')
  async findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return await this.service.findOne(id, req.user);
  }

  @Patch(':id')
  @RequirePermission('shipments:update')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateShipmentDto,
    @Req() req: any,
  ) {
    return await this.service.update(id, dto, req.user);
  }

  @Patch(':id/manual-readiness')
  @RequirePermission('shipments:update')
  @HttpCode(HttpStatus.OK)
  async updateManualReadiness(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateManualReadinessDto,
    @Req() req: any,
  ) {
    return await this.service.updateManualReadiness(id, dto, req.user);
  }

  @Get(':id/stuffing-execution')
  @RequirePermission('shipments:view')
  async getStuffingExecution(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return await this.service.getStuffingExecutionData(id, req.user);
  }

  @Post(':id/stuffing-execution')
  @RequirePermission('shipments:update')
  @HttpCode(HttpStatus.OK)
  async saveStuffingExecution(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @Req() req: any,
  ) {
    return await this.service.saveStuffingExecution(id, dto, req.user);
  }

  @Post(':id/stuffing-execution/attachments')
  @RequirePermission('shipments:update')
  @UseInterceptors(FileInterceptor('file', getAttachmentMulterConfig()))
  async uploadStuffingAttachment(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    const attachment = await this.attachmentsService.createAttachment(
      file,
      req.user?.id || req.user?.userId,
      req.user?.companyId,
    );
    return {
      id: attachment.id,
      originalName: attachment.originalName,
      fileName: attachment.storedName,
      fileSize: attachment.fileSize,
      mimeType: attachment.mimeType,
      storagePath: attachment.storagePath,
    };
  }
}
