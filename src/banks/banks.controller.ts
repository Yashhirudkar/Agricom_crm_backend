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
} from '@nestjs/common';
import { BanksService } from './banks.service';
import { CreateDomesticBankDto } from './dto/create-domestic-bank.dto';
import { UpdateDomesticBankDto } from './dto/update-domestic-bank.dto';
import { CreateNostroBankDto } from './dto/create-nostro-bank.dto';
import { UpdateNostroBankDto } from './dto/update-nostro-bank.dto';
import { QueryDomesticBankDto, QueryNostroBankDto } from './dto/query-bank.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('banks')
export class BanksController {
  constructor(private readonly banksService: BanksService) {}

  // ─── Automatic Document Bank Resolution ────────────────────────────────────

  @Get('resolve')
  async resolveBank(
    @Query('currency') currency?: string,
    @Query('companyId') companyId?: string,
  ) {
    const compId = companyId ? parseInt(companyId, 10) : undefined;
    const res = await this.banksService.resolveBankForDocument(currency || 'INR', compId);
    if (!res) {
      return {
        matched: false,
        error: `No bank account has been configured for this company and currency (${currency || 'INR'}).\n\nPlease configure a bank from:\n\nAccounts → Banks`,
      };
    }
    return res;
  }

  @Get('options')
  async getBankOptions(
    @Query('currency') currency?: string,
    @Query('companyId') companyId?: string,
  ) {
    const compId = companyId ? parseInt(companyId, 10) : undefined;
    return this.banksService.getBankOptions(currency, compId);
  }

  // ─── Domestic Banks ────────────────────────────────────────────────────────

  @Post('domestic')
  @HttpCode(HttpStatus.CREATED)
  async createDomestic(@Body() dto: CreateDomesticBankDto) {
    return this.banksService.createDomestic(dto);
  }

  @Get('domestic')
  async findAllDomestic(@Query() query: QueryDomesticBankDto) {
    return this.banksService.findAllDomestic(query);
  }

  @Get('domestic/:id')
  async findOneDomestic(@Param('id', ParseIntPipe) id: number) {
    return this.banksService.findOneDomestic(id);
  }

  @Patch('domestic/:id')
  async updateDomestic(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDomesticBankDto,
  ) {
    return this.banksService.updateDomestic(id, dto);
  }

  @Delete('domestic/:id')
  async removeDomestic(@Param('id', ParseIntPipe) id: number) {
    return this.banksService.removeDomestic(id);
  }

  // ─── Nostro Banks ──────────────────────────────────────────────────────────

  @Post('nostro')
  @HttpCode(HttpStatus.CREATED)
  async createNostro(@Body() dto: CreateNostroBankDto) {
    return this.banksService.createNostro(dto);
  }

  @Get('nostro')
  async findAllNostro(@Query() query: QueryNostroBankDto) {
    return this.banksService.findAllNostro(query);
  }

  @Get('nostro/:id')
  async findOneNostro(@Param('id', ParseIntPipe) id: number) {
    return this.banksService.findOneNostro(id);
  }

  @Patch('nostro/:id')
  async updateNostro(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNostroBankDto,
  ) {
    return this.banksService.updateNostro(id, dto);
  }

  @Delete('nostro/:id')
  async removeNostro(@Param('id', ParseIntPipe) id: number) {
    return this.banksService.removeNostro(id);
  }
}
