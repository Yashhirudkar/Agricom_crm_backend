import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ShipmentService } from './shipment.service';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { UpdateManualReadinessDto } from './dto/update-manual-readiness.dto';
import { QueryShipmentDto } from './dto/query-shipment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller(['shipments', 'sales-contracts/shipments'])
export class ShipmentController {
  constructor(private readonly shipmentService: ShipmentService) {}

  @Get()
  @RequirePermission('shipments:view')
  async findAll(@Query() query: QueryShipmentDto, @Req() req: any) {
    return this.shipmentService.findAll(query);
  }

  @Get('stats')
  @RequirePermission('shipments:view')
  async getStats(@Query() query: QueryShipmentDto, @Req() req: any) {
    return this.shipmentService.getStats(query);
  }

  @Get('export')
  @RequirePermission('shipments:view')
  async exportExcel(@Query() query: QueryShipmentDto, @Res() res: Response) {
    const buffer = await this.shipmentService.exportExcel(query);
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
    return this.shipmentService.findOne(id, req.user);
  }

  @Patch(':id')
  @RequirePermission('shipments:update')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateShipmentDto,
    @Req() req: any,
  ) {
    return this.shipmentService.update(id, dto, req.user);
  }

  @Patch(':id/manual-readiness')
  @RequirePermission('shipments:update')
  @HttpCode(HttpStatus.OK)
  async updateManualReadiness(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateManualReadinessDto,
    @Req() req: any,
  ) {
    return this.shipmentService.updateManualReadiness(id, dto, req.user);
  }

  @Patch(':id/cargo-readiness')
  @RequirePermission('shipments:update')
  @HttpCode(HttpStatus.OK)
  async updateCargoReadiness(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.shipmentService.updateCargoReadiness(id, body, req.user);
  }

  @Get(':id/stuffing-execution')
  @RequirePermission('shipments:view')
  async getStuffingExecutionData(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return this.shipmentService.getStuffingExecutionData(id, req.user);
  }

  @Patch(':id/stuffing-execution')
  @RequirePermission('shipments:update')
  @HttpCode(HttpStatus.OK)
  async saveStuffingExecution(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.shipmentService.saveStuffingExecution(id, body, req.user);
  }
}
