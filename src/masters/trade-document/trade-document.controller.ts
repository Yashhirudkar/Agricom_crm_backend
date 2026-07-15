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
import { TradeDocumentService } from './trade-document.service';
import { CreateTradeDocumentDto } from './dto/create-trade-document.dto';
import { UpdateTradeDocumentDto } from './dto/update-trade-document.dto';
import { QueryTradeDocumentDto } from './dto/query-trade-document.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { AuditLog } from '../../audit/decorators/audit-log.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('masters/trade-documents')
export class TradeDocumentController {
  constructor(private readonly service: TradeDocumentService) {}

  @Post()
  @RequirePermission('trade-document:create')
  @AuditLog({ entityType: 'TradeDocument', action: 'CREATE' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTradeDocumentDto, @Req() req: any) {
    return this.service.create(dto, req.user);
  }

  @Get()
  @RequirePermission('trade-document:view')
  async findAll(@Query() query: QueryTradeDocumentDto) {
    return await this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermission('trade-document:view')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('trade-document:update')
  @AuditLog({ entityType: 'TradeDocument', action: 'UPDATE' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTradeDocumentDto,
    @Req() req: any,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  @RequirePermission('trade-document:delete')
  @AuditLog({ entityType: 'TradeDocument', action: 'DELETE' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.remove(id, req.user);
  }

  @Delete(':id/permanent')
  @RequirePermission('trade-document:force_delete')
  @AuditLog({ entityType: 'TradeDocument', action: 'FORCE_DELETE' })
  @HttpCode(HttpStatus.NO_CONTENT)
  removePermanent(@Param('id', ParseIntPipe) id: number) {
    return this.service.removePermanent(id);
  }
}
