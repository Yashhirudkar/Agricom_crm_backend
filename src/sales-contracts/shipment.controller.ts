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
  Req,
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
  async findAll(@Query() query: QueryShipmentDto, @Req() req: any) {
    return await this.service.findAll({ ...query, companyId: req.user?.companyId } as any);
  }

  @Get('stats')
  @RequirePermission('shipments:view')
  async getStats(@Query() query: QueryShipmentDto, @Req() req: any) {
    return await this.service.getStats({ ...query, companyId: req.user?.companyId } as any);
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
}
