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
  async findAll(@Query() query: any, @Req() req: any) {
    return this.service.findAll({ ...query, companyId: req.user?.companyId });
  }

  @Get('stats')
  @RequirePermission('cargo_availability:view')
  async getStats(@Req() req: any) {
    return this.service.getStats(req.user?.companyId);
  }

  @Get('shipment-info/:shipmentId')
  @RequirePermission('cargo_availability:view')
  async getShipmentInfo(
    @Param('shipmentId') shipmentId: number,
    @Req() req: any,
  ) {
    return this.service.getShipmentInfo(
      Number(shipmentId),
      req.user?.companyId,
    );
  }

  @Get('by-shipment/:shipmentId')
  @RequirePermission('cargo_availability:view')
  async getByShipmentId(
    @Param('shipmentId') shipmentId: number,
    @Req() req: any,
  ) {
    return this.service.getByShipmentId(
      Number(shipmentId),
      req.user?.companyId,
    );
  }

  @Get('loading')
  @RequirePermission('cargo_availability:view')
  async findAllLoading(@Req() req: any) {
    return this.service.findAllLoading(req.user?.companyId);
  }

  @Get(':id')
  @RequirePermission('cargo_availability:view')
  async findOne(@Param('id') id: number, @Req() req: any) {
    return this.service.findOne(Number(id), req.user?.companyId);
  }

  @Post('readiness')
  @RequirePermission('cargo_availability:create')
  async createReadiness(@Body() dto: any, @Req() req: any) {
    const user = req.user;
    return this.service.createReadiness(dto, user?.id, user?.companyId);
  }

  @Patch('readiness/:id/approve')
  @RequirePermission('cargo_availability:approve')
  async approveReadiness(
    @Param('id') id: number,
    @Body('status') status: string,
    @Req() req: any,
  ) {
    const user = req.user;
    return this.service.approveReadiness(
      Number(id),
      status,
      user?.id,
      user?.companyId,
    );
  }

  @Post('allocations')
  @RequirePermission('cargo_availability:create')
  async createAllocation(@Body() dto: any, @Req() req: any) {
    const user = req.user;
    return this.service.createAllocation(dto, user?.id, user?.companyId);
  }

  @Post('loading')
  @RequirePermission('cargo_availability:create')
  async createLoading(@Body() dto: any, @Req() req: any) {
    const user = req.user;
    return this.service.createLoading(dto, user?.id, user?.companyId);
  }

  @Put('loading/:id')
  @RequirePermission('cargo_availability:update')
  async updateLoadingStatus(
    @Param('id') id: number,
    @Body() dto: any,
    @Req() req: any,
  ) {
    const user = req.user;
    return this.service.updateLoadingStatus(
      Number(id),
      dto,
      user?.id,
      user?.companyId,
    );
  }
}
