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
import { PartnerRoleService } from './partner-role.service';
import { CreatePartnerRoleDto } from './dto/create-partner-role.dto';
import { UpdatePartnerRoleDto } from './dto/update-partner-role.dto';
import { QueryPartnerRoleDto } from './dto/query-partner-role.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { AuditLog } from '../../audit/decorators/audit-log.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('masters/partner-roles')
export class PartnerRoleController {
  constructor(private readonly partnerRoleService: PartnerRoleService) {}

  @Post()
  @RequirePermission('partnerrole:create')
  @AuditLog({ entityType: 'PartnerRole', action: 'CREATE' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createPartnerRoleDto: CreatePartnerRoleDto) {
    return this.partnerRoleService.create(createPartnerRoleDto);
  }

  @Get()
  @RequirePermission('partnerrole:view')
  findAll(@Query() query: QueryPartnerRoleDto) {
    return this.partnerRoleService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('partnerrole:view')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.partnerRoleService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('partnerrole:update')
  @AuditLog({ entityType: 'PartnerRole', action: 'UPDATE' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePartnerRoleDto: UpdatePartnerRoleDto,
  ) {
    return this.partnerRoleService.update(id, updatePartnerRoleDto);
  }

  @Patch(':id/restore')
  @RequirePermission('partnerrole:update')
  @AuditLog({ entityType: 'PartnerRole', action: 'RESTORE' })
  restore(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return this.partnerRoleService.restore(id, req.user);
  }

  @Delete(':id')
  @RequirePermission('partnerrole:delete')
  @AuditLog({ entityType: 'PartnerRole', action: 'DELETE' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('reason') reason?: string,
    @Req() req?: any,
  ) {
    return this.partnerRoleService.remove(id, reason, req?.user);
  }

  @Delete(':id/permanent')
  @RequirePermission('partnerrole:force_delete')
  @AuditLog({ entityType: 'PartnerRole', action: 'FORCE_DELETE' })
  @HttpCode(HttpStatus.NO_CONTENT)
  removePermanent(
    @Param('id', ParseIntPipe) id: number,
    @Query('reason') reason: string,
    @Req() req: any,
  ) {
    if (req.user.type !== 'super_admin') {
      throw new ForbiddenException('Super Admin only');
    }
    return this.partnerRoleService.removePermanent(id, reason, req.user);
  }
}
