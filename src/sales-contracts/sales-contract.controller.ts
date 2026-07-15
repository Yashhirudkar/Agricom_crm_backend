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
import { SalesContractService } from './sales-contract.service';
import { CreateSalesContractDto } from './dto/create-sales-contract.dto';
import { UpdateSalesContractDto, UpdateSalesContractStatusDto } from './dto/update-sales-contract.dto';
import { QuerySalesContractDto } from './dto/query-sales-contract.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { AuditLog } from '../audit/decorators/audit-log.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sales-contracts')
export class SalesContractController {
  constructor(private readonly service: SalesContractService) {}

  @Post()
  @RequirePermission('sales-contract:create')
  @AuditLog({ entityType: 'SalesContract', action: 'CREATE' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSalesContractDto, @Req() req: any) {
    return this.service.create(dto, req.user);
  }

  @Get()
  @RequirePermission('sales-contract:view')
  async findAll(@Query() query: QuerySalesContractDto) {
    return await this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermission('sales-contract:view')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('sales-contract:update')
  @AuditLog({ entityType: 'SalesContract', action: 'UPDATE' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalesContractDto,
    @Req() req: any,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Patch(':id/status')
  @RequirePermission('sales-contract:update')
  @AuditLog({ entityType: 'SalesContract', action: 'UPDATE_STATUS' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalesContractStatusDto,
    @Req() req: any,
  ) {
    return this.service.updateStatus(id, dto, req.user);
  }

  @Delete(':id')
  @RequirePermission('sales-contract:delete')
  @AuditLog({ entityType: 'SalesContract', action: 'DELETE' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.remove(id, req.user);
  }
}
