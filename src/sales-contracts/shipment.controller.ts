import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ShipmentService } from './shipment.service';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { QueryShipmentDto } from './dto/query-shipment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sales-contracts/shipments')
export class ShipmentController {
  constructor(private readonly service: ShipmentService) {}

  @Get()
  @RequirePermission('shipments:view')
  async findAll(@Query() query: QueryShipmentDto) {
    return await this.service.findAll(query);
  }

  @Get('stats')
  @RequirePermission('shipments:view')
  async getStats(@Query() query: QueryShipmentDto) {
    return await this.service.getStats(query);
  }

  @Patch(':id')
  @RequirePermission('shipments:update')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateShipmentDto,
  ) {
    return await this.service.update(id, dto);
  }
}
