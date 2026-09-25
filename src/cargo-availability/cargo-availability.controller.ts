import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { CargoAvailabilityService } from './cargo-availability.service';

@Controller('cargo-availability')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CargoAvailabilityController {
  constructor(private readonly service: CargoAvailabilityService) {}

  @Get()
  @RequirePermission('cargo_availability:view')
  async findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get('stats')
  @RequirePermission('cargo_availability:view')
  async getStats() {
    return this.service.getStats();
  }

  @Get('shipment-info/:shipmentId')
  @RequirePermission('cargo_availability:view')
  async getShipmentInfo(@Param('shipmentId') shipmentId: number) {
    return this.service.getShipmentInfo(Number(shipmentId));
  }

  @Get('by-shipment/:shipmentId')
  @RequirePermission('cargo_availability:view')
  async getByShipmentId(@Param('shipmentId') shipmentId: number) {
    return this.service.getByShipmentId(Number(shipmentId));
  }

  @Get('loading')
  @RequirePermission('cargo_availability:view')
  async findAllLoading() {
    return this.service.findAllLoading();
  }

  @Get(':id')
  @RequirePermission('cargo_availability:view')
  async findOne(@Param('id') id: number) {
    return this.service.findOne(Number(id));
  }

  @Post('readiness')
  @RequirePermission('cargo_availability:create')
  async createReadiness(@Body() dto: any, @Req() req: any) {
    const userId = req.user?.id;
    return this.service.createReadiness(dto, userId);
  }

  @Patch('readiness/:id/approve')
  @RequirePermission('cargo_availability:approve')
  async approveReadiness(
    @Param('id') id: number,
    @Body('status') status: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id;
    return this.service.approveReadiness(Number(id), status, userId);
  }

  @Post('allocations')
  @RequirePermission('cargo_availability:create')
  async createAllocation(@Body() dto: any, @Req() req: any) {
    const userId = req.user?.id;
    return this.service.createAllocation(dto, userId);
  }

  @Post('loading')
  @RequirePermission('cargo_availability:create')
  async createLoading(@Body() dto: any, @Req() req: any) {
    const userId = req.user?.id;
    return this.service.createLoading(dto, userId);
  }

  @Put('loading/:id')
  @RequirePermission('cargo_availability:update')
  async updateLoadingStatus(
    @Param('id') id: number,
    @Body() dto: any,
    @Req() req: any,
  ) {
    const userId = req.user?.id;
    return this.service.updateLoadingStatus(Number(id), dto, userId);
  }
}
