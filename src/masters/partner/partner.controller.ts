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
  ForbiddenException,
} from '@nestjs/common';
import { PartnerService } from './partner.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { QueryPartnerDto } from './dto/query-partner.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { AuditLog } from '../../audit/decorators/audit-log.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('masters/partners')
export class PartnerController {
  constructor(private readonly partnerService: PartnerService) {}

  @Post()
  @RequirePermission('partner:create')
  @AuditLog({ entityType: 'Partner', action: 'CREATE' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createPartnerDto: CreatePartnerDto) {
    return this.partnerService.create(createPartnerDto);
  }

  @Get()
  @RequirePermission('partner:view')
  findAll(@Query() query: QueryPartnerDto) {
    return this.partnerService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('partner:view')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.partnerService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('partner:update')
  @AuditLog({ entityType: 'Partner', action: 'UPDATE' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePartnerDto: UpdatePartnerDto,
  ) {
    return this.partnerService.update(id, updatePartnerDto);
  }

  @Patch(':id/restore')
  @RequirePermission('partner:update')
  @AuditLog({ entityType: 'Partner', action: 'RESTORE' })
  restore(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return this.partnerService.restore(id, req.user);
  }

  @Delete(':id')
  @RequirePermission('partner:delete')
  @AuditLog({ entityType: 'Partner', action: 'DELETE' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('reason') reason?: string,
    @Req() req?: any,
  ) {
    return this.partnerService.remove(id, reason, req?.user);
  }

  @Delete(':id/permanent')
  @RequirePermission('partner:force_delete')
  @AuditLog({ entityType: 'Partner', action: 'FORCE_DELETE' })
  @HttpCode(HttpStatus.NO_CONTENT)
  removePermanent(
    @Param('id', ParseIntPipe) id: number,
    @Query('reason') reason: string,
    @Req() req: any,
  ) {
    if (req.user.type !== 'super_admin') {
      throw new ForbiddenException('Super Admin only');
    }
    return this.partnerService.removePermanent(id, reason, req.user);
  }
}
