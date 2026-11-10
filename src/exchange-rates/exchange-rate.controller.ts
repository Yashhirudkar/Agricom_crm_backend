import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRateSyncResponseDto } from './dto/exchange-rate-sync-response.dto';
import { ExchangeRateTickerResponseDto } from './dto/exchange-rate-ticker-response.dto';

@Controller('exchange-rates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExchangeRateController {
  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  @Get('latest')
  @RequirePermission('stock_management:view')
  getLatestRates(): Promise<ExchangeRateTickerResponseDto> {
    return this.exchangeRateService.getTickerRates();
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('exchange_rates:sync')
  syncRates(): Promise<ExchangeRateSyncResponseDto> {
    return this.exchangeRateService.syncRates();
  }
}
