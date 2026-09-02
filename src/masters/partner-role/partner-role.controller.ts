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
import { RequireAnyPermission } from '../../rbac/decorators/require-any-permission.decorator';
import { AuditLog } from '../../audit/decorators/audit-log.decorator';
import { RbacService } from '../../rbac/services/rbac.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('masters/partner-roles')
export class PartnerRoleController {
  constructor(
    private readonly partnerRoleService: PartnerRoleService,
    private readonly rbacService: RbacService,
  ) {}

  @Post()
  @RequirePermission('partnerrole:create')
  @AuditLog({ entityType: 'PartnerRole', action: 'CREATE' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createPartnerRoleDto: CreatePartnerRoleDto) {
    return this.partnerRoleService.create(createPartnerRoleDto);
  }

  // Lightweight options endpoint — returns partner roles filtered by user's RBAC role access.
  // Used for dropdowns in partner forms and filter selectors.
  @Get('options')
  async findOptions(@Query('limit') limit?: string, @Req() req?: any) {
    // Super admin: return all
    if (req?.user?.type === 'super_admin') {
      const result = await this.partnerRoleService.findAll({ limit: limit ? parseInt(limit) : 100, isActive: true } as any);
      return result;
    }

    // Resolve allowed partner role IDs for this user
    const allowedIds = await this.rbacService.resolveUserAllowedPartnerRoleIds(
      req.user,
      req.activeCompanyId,
    );

    const result = await this.partnerRoleService.findAll({
      limit: limit ? parseInt(limit) : 100,
      isActive: true,
      allowedIds, // null = unrestricted
    } as any);
    return result;
  }

  @Get()
  @RequireAnyPermission(
    'partnerrole:view',
    'partnerrole:read',
    'partner:view',
    'partner:read',
    'logistics:view',
    'logistics:read',
    'enquiry:view',
    'enquiry:read',
    'sales-contract:view',
    'sales-contract:read',
    'purchase-contract:view',
    'purchase-contract:read',
  )
  async findAll(@Query() query: QueryPartnerRoleDto) {
    const result = await this.partnerRoleService.findAll(query);

    return result;
  }

  @Get(':id')
  @RequireAnyPermission(
    'partnerrole:view',
    'partnerrole:read',
    'partner:view',
    'partner:read',
    'logistics:view',
    'logistics:read',
    'enquiry:view',
    'enquiry:read',
    'sales-contract:view',
    'sales-contract:read',
    'purchase-contract:view',
    'purchase-contract:read',
  )
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const item = await this.partnerRoleService.findOne(id);

    return item;
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
  restore(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
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
