import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequireAnyPermission } from '../rbac/decorators/require-any-permission.decorator';
import { StockService } from './stock.service';
import { QueryStockDto } from './dto/query-stock.dto';
import {
  StockCountryGroup,
  StockDashboardSummary,
} from './dto/stock-response.dto';

@Controller('stock')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  /**
   * GET /api/stock/dashboard
   * Returns summary metrics across countries, products, contracts, and tonnages.
   */
  @Get('dashboard')
  @RequireAnyPermission('stock:view', 'stock:read', 'purchase-contracts:view')
  async getDashboard(@Req() req: any): Promise<StockDashboardSummary> {
    const companyId = this.extractCompanyId(req);
    return this.stockService.getDashboardSummary(companyId);
  }

  /**
   * GET /api/stock
   * Returns hierarchical Country -> Product -> Purchase Contracts tree.
   * Fully aggregated backend response ready for direct frontend rendering.
   */
  @Get()
  @RequireAnyPermission('stock:view', 'stock:read', 'purchase-contracts:view')
  async getStockList(
    @Query() query: QueryStockDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StockCountryGroup[]> {
    const companyId = this.extractCompanyId(req);
    const { data, totalCount } = await this.stockService.getStockList(
      query,
      companyId,
    );

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 50);

    // Set standard pagination headers for table components
    res.setHeader('x-total-count', totalCount.toString());
    res.setHeader('x-page', page.toString());
    res.setHeader('x-limit', limit.toString());
    res.setHeader('x-total-pages', Math.ceil(totalCount / limit).toString());

    // Returns array directly to match exact UI specification
    return data;
  }

  private extractCompanyId(req: any): number | undefined {
    const headerOrActive = req.headers?.['x-company-id'] || req.activeCompanyId;
    if (headerOrActive) {
      const parsed = parseInt(headerOrActive as string, 10);
      if (!isNaN(parsed)) return parsed;
    }
    return req.user?.companyId;
  }
}
