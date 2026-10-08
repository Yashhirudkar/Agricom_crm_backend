import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SalesReportService } from './sales-report.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Reports - Sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports/sales')
export class SalesReportController {
  constructor(private readonly salesReportService: SalesReportService) {}

  @Get('summary')
  async getSummary(@Query() query: any) {
    return this.salesReportService.getSummary(query);
  }

  @Get('executives')
  async getExecutives(@Query() query: any) {
    return this.salesReportService.getExecutives(query);
  }

  @Get('monthly')
  async getMonthly(@Query() query: any) {
    return this.salesReportService.getMonthly(query);
  }

  @Get('products')
  async getProducts(@Query() query: any) {
    return this.salesReportService.getProducts(query);
  }

  @Get('countries')
  async getCountries(@Query() query: any) {
    return this.salesReportService.getCountries(query);
  }

  @Get('customers')
  async getCustomers(@Query() query: any) {
    return this.salesReportService.getCustomers(query);
  }

  @Get('orders')
  async getOrders(@Query() query: any) {
    return this.salesReportService.getOrders(query);
  }
}
