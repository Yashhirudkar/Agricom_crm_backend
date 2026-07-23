import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AirportsService } from './airports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('locations/airports')
export class AirportsController {
  constructor(private readonly airportsService: AirportsService) {}

  @Get()
  // Ensure the user has permission to view sales contracts (since they need this data for forms)
  @RequirePermission('sales_contract:view')
  searchAirports(
    @Query('countryCode') countryCode?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 5;
    return this.airportsService.searchAirports(countryCode, search, limitNum);
  }
}
