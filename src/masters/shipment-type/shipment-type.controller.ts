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
} from '@nestjs/common';
import { ShipmentTypeService } from './shipment-type.service';
import { CreateShipmentTypeDto } from './dto/create-shipment-type.dto';
import { UpdateShipmentTypeDto } from './dto/update-shipment-type.dto';
import { QueryShipmentTypeDto } from './dto/query-shipment-type.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { AuditLog } from '../../audit/decorators/audit-log.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('masters/shipment-types')
export class ShipmentTypeController {
  constructor(private readonly service: ShipmentTypeService) {}

  @Post()
  @RequirePermission('shipment-type:create')
  @AuditLog({ entityType: 'ShipmentType', action: 'CREATE' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateShipmentTypeDto, @Req() req: any) {
    return this.service.create(dto, req.user);
  }

  // Lightweight options endpoint — accessible to any logged-in user
  @Get('options')
  async findOptions() {
    return this.service.findAll({ status: 'Active', limit: 100, page: 1 } as any);
  }

  @Get()
  @RequirePermission('shipment-type:view')
  async findAll(@Query() query: QueryShipmentTypeDto) {
    return await this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermission('shipment-type:view')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('shipment-type:update')
  @AuditLog({ entityType: 'ShipmentType', action: 'UPDATE' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateShipmentTypeDto,
    @Req() req: any,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  @RequirePermission('shipment-type:delete')
  @AuditLog({ entityType: 'ShipmentType', action: 'DELETE' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.remove(id, req.user);
  }

  @Delete(':id/permanent')
  @RequirePermission('shipment-type:force_delete')
  @AuditLog({ entityType: 'ShipmentType', action: 'FORCE_DELETE' })
  @HttpCode(HttpStatus.NO_CONTENT)
  removePermanent(@Param('id', ParseIntPipe) id: number) {
    return this.service.removePermanent(id);
  }
}
