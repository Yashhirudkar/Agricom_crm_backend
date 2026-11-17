import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SalesReportService } from './sales-report.service';
import type { ConfirmedOrdersQuery } from './sales-report.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Reports - Sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('reports/sales')
export class SalesReportController {
  constructor(private readonly salesReportService: SalesReportService) {}

  @Get('summary')
  @RequirePermission('sales_report:view')
  async getSummary(@Query() query: any) {
    return this.salesReportService.getSummary(query);
  }

  @Get('executives')
  @RequirePermission('sales_report:view')
  async getExecutives(@Query() query: any) {
    return this.salesReportService.getExecutives(query);
  }

  @Get('monthly')
  @RequirePermission('sales_report:view')
  async getMonthly(@Query() query: any) {
    return this.salesReportService.getMonthly(query);
  }

  @Get('products')
  @RequirePermission('sales_report:view')
  async getProducts(@Query() query: any) {
    return this.salesReportService.getProducts(query);
  }

  @Get('countries')
  @RequirePermission('sales_report:view')
  async getCountries(@Query() query: any) {
    return this.salesReportService.getCountries(query);
  }

  @Get('customers')
  @RequirePermission('sales_report:view')
  async getCustomers(@Query() query: any) {
    return this.salesReportService.getCustomers(query);
  }

  @Get('orders')
  @RequirePermission('sales_report:view')
  async getOrders(@Query() query: any) {
    return this.salesReportService.getOrders(query);
  }

  @Get('confirmed-orders')
  @RequirePermission('sales_report:view')
  async getConfirmedOrders(@Query() query: ConfirmedOrdersQuery) {
    return this.salesReportService.getConfirmedOrders(query);
  }
}
