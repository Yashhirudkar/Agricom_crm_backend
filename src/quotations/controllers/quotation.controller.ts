import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { QuotationService } from '../services/quotation.service';
import { CreateQuotationDto } from '../dto/create-quotation.dto';
import { UpdateQuotationDto } from '../dto/update-quotation.dto';
import { QueryQuotationDto } from '../dto/query-quotation.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';

interface CustomRequest {
  headers: Record<string, string | undefined>;
  user?: {
    userId?: number | string;
    id?: number | string;
    sub?: number | string;
    type?: string;
  };
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('quotations')
export class QuotationController {
  constructor(private readonly quotationService: QuotationService) {}

  private getUserId(req: CustomRequest): number {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (!userId) {
      throw new BadRequestException('User session is invalid');
    }
    return parseInt(String(userId), 10);
  }

  // ─── CREATE ───────────────────────────────────────────────────────────────

  @Post()
  @RequirePermission('quotation:create')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateQuotationDto, @Req() req: CustomRequest) {
    const userId = this.getUserId(req);
    return this.quotationService.create(dto, userId);
  }

  // ─── LIST ─────────────────────────────────────────────────────────────────

  @Get()
  @RequirePermission('quotation:view')
  async findAll(@Query() query: QueryQuotationDto) {
    return this.quotationService.findAll(query);
  }

  // ─── GET ONE ──────────────────────────────────────────────────────────────

  @Get(':id')
  @RequirePermission('quotation:view')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.quotationService.findOne(id);
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────

  @Patch(':id')
  @RequirePermission('quotation:update')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuotationDto,
    @Req() req: CustomRequest,
  ) {
    const userId = this.getUserId(req);
    return this.quotationService.update(id, dto, userId);
  }

  // ─── SOFT DELETE ──────────────────────────────────────────────────────────

  @Delete(':id')
  @RequirePermission('quotation:delete')
  @HttpCode(HttpStatus.OK)
  async softDelete(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: CustomRequest,
  ) {
    const userId = this.getUserId(req);
    return this.quotationService.softDelete(id, userId);
  }
}
