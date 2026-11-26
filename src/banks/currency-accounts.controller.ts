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
import {
  BankActor,
  CurrencyAccountsService,
} from './currency-accounts.service';
import { CreateCurrencyAccountDto } from './dto/create-currency-account.dto';
import { UpdateCurrencyAccountDto } from './dto/update-currency-account.dto';
import { QueryCurrencyAccountDto } from './dto/query-currency-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';

interface AuthenticatedRequest {
  user?: BankActor;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('banks/currency-accounts')
export class CurrencyAccountsController {
  constructor(
    private readonly currencyAccountsService: CurrencyAccountsService,
  ) {}

  @Post()
  @RequirePermission('currency_accounts:create')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateCurrencyAccountDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.currencyAccountsService.create(dto, req.user);
  }

  @Get()
  @RequirePermission('currency_accounts:view')
  async findAll(
    @Query() query: QueryCurrencyAccountDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.currencyAccountsService.findAll(query, req.user);
  }

  @Get(':id/linked-nostros')
  @RequirePermission('currency_accounts:view')
  async findLinkedNostros(
    @Param('id', ParseIntPipe) id: number,
    @Query('status') status?: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    return this.currencyAccountsService.findLinkedNostros(
      id,
      status,
      req?.user,
    );
  }

  @Get(':id')
  @RequirePermission('currency_accounts:view')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.currencyAccountsService.findOne(id, req.user);
  }

  @Patch(':id')
  @RequirePermission('currency_accounts:update')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCurrencyAccountDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.currencyAccountsService.update(id, dto, req.user);
  }

  @Delete(':id')
  @RequirePermission('currency_accounts:delete')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.currencyAccountsService.remove(id, req.user);
  }
}
