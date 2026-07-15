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
import { PaymentTermService } from './payment-term.service';
import { CreatePaymentTermDto } from './dto/create-payment-term.dto';
import { UpdatePaymentTermDto } from './dto/update-payment-term.dto';
import { QueryPaymentTermDto } from './dto/query-payment-term.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { AuditLog } from '../../audit/decorators/audit-log.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('masters/payment-terms')
export class PaymentTermController {
  constructor(private readonly service: PaymentTermService) {}

  @Post()
  @RequirePermission('payment-term:create')
  @AuditLog({ entityType: 'PaymentTerm', action: 'CREATE' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreatePaymentTermDto, @Req() req: any) {
    return this.service.create(dto, req.user);
  }

  @Get()
  @RequirePermission('payment-term:view')
  async findAll(@Query() query: QueryPaymentTermDto) {
    return await this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermission('payment-term:view')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('payment-term:update')
  @AuditLog({ entityType: 'PaymentTerm', action: 'UPDATE' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePaymentTermDto,
    @Req() req: any,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  @RequirePermission('payment-term:delete')
  @AuditLog({ entityType: 'PaymentTerm', action: 'DELETE' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.remove(id, req.user);
  }

  @Delete(':id/permanent')
  @RequirePermission('payment-term:force_delete')
  @AuditLog({ entityType: 'PaymentTerm', action: 'FORCE_DELETE' })
  @HttpCode(HttpStatus.NO_CONTENT)
  removePermanent(@Param('id', ParseIntPipe) id: number) {
    return this.service.removePermanent(id);
  }
}
