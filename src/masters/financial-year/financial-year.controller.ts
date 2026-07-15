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
import { FinancialYearService } from './financial-year.service';
import { CreateFinancialYearDto } from './dto/create-financial-year.dto';
import { UpdateFinancialYearDto } from './dto/update-financial-year.dto';
import { QueryFinancialYearDto } from './dto/query-financial-year.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { AuditLog } from '../../audit/decorators/audit-log.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('masters/financial-years')
export class FinancialYearController {
  constructor(private readonly service: FinancialYearService) {}

  @Post()
  @RequirePermission('financial-year:create')
  @AuditLog({ entityType: 'FinancialYear', action: 'CREATE' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateFinancialYearDto, @Req() req: any) {
    return this.service.create(dto, req.user);
  }

  @Get()
  @RequirePermission('financial-year:view')
  async findAll(@Query() query: QueryFinancialYearDto) {
    return await this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermission('financial-year:view')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('financial-year:update')
  @AuditLog({ entityType: 'FinancialYear', action: 'UPDATE' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFinancialYearDto,
    @Req() req: any,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  @RequirePermission('financial-year:delete')
  @AuditLog({ entityType: 'FinancialYear', action: 'DELETE' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.remove(id, req.user);
  }

  @Delete(':id/permanent')
  @RequirePermission('financial-year:force_delete')
  @AuditLog({ entityType: 'FinancialYear', action: 'FORCE_DELETE' })
  @HttpCode(HttpStatus.NO_CONTENT)
  removePermanent(@Param('id', ParseIntPipe) id: number) {
    return this.service.removePermanent(id);
  }
}
