import {
  Controller,
  Get,
  Post,
  Put,
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
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { PartnerService } from './partner.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { QueryPartnerDto } from './dto/query-partner.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { RequireAnyPermission } from '../../rbac/decorators/require-any-permission.decorator';
import { AuditLog } from '../../audit/decorators/audit-log.decorator';
import { RbacService } from '../../rbac/services/rbac.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('masters/partners')
export class PartnerController {
  constructor(
    private readonly partnerService: PartnerService,
    private readonly rbacService: RbacService,
  ) { }

  /**
   * Validates that a given partnerRoleId is within the user's allowed partner roles.
   * Throws ForbiddenException if not.
   */
  private async assertPartnerRoleAllowed(
    partnerRoleId: number | undefined,
    user: any,
    activeCompanyId: number,
  ): Promise<void> {
    if (!partnerRoleId) return;
    if (user.type === 'super_admin') return;

    const allowedIds = await this.rbacService.resolveUserAllowedPartnerRoleIds(
      user,
      activeCompanyId,
    );

    // null = unrestricted
    if (allowedIds === null) return;

    if (!allowedIds.includes(partnerRoleId)) {
      throw new ForbiddenException(
        'You are not allowed to use this Partner Role.',
      );
    }
  }

  @Post()
  @RequireAnyPermission(
    'partner:create',
    'logistics:create',
    'logistics:update',
    'enquiry:create',
    'enquiry:update',
    'sales-contract:create',
    'sales-contract:update',
    'purchase-contract:create',
    'purchase-contract:update',
  )
  @AuditLog({ entityType: 'Partner', action: 'CREATE' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createPartnerDto: CreatePartnerDto, @Req() req: any) {
    await this.assertPartnerRoleAllowed(
      createPartnerDto.partnerRoleId,
      req.user,
      req.activeCompanyId,
    );
    return this.partnerService.create(createPartnerDto);
  }

  @Get()
  @RequirePermission('partner:view')
  async findAll(@Query() query: QueryPartnerDto, @Req() req: any) {
    // If user is restricted, inject allowed partner role IDs into the query filter
    if (req?.user?.type !== 'super_admin') {
      const allowedIds = await this.rbacService.resolveUserAllowedPartnerRoleIds(
        req.user,
        req.activeCompanyId,
      );
      if (allowedIds !== null) {
        // If user filtered by a specific role, ensure it's also in allowedIds
        if (query.partnerRoleId && !allowedIds.includes(Number(query.partnerRoleId))) {
          return { data: [], total: 0, page: query.page || 1, limit: query.limit || 8, totalPages: 0 };
        }
        // Apply restriction: scope to allowed partner role IDs
        (query as any).allowedPartnerRoleIds = allowedIds;
      }
    }

    const result = await this.partnerService.findAll(query);
    return result;
  }

  // Lightweight dropdown endpoint — returns only id + entityName.
  // Must be declared before @Get(':id') to avoid route shadowing.
  @Get('options')
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  async findOptions(
    @Query('partnerRoleId') partnerRoleId?: string,
    @Query('roleName') roleName?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('includeContacts') includeContacts?: string,
  ) {
    return this.partnerService.findOptions({
      partnerRoleId: partnerRoleId ? parseInt(partnerRoleId, 10) : undefined,
      roleName,
      search,
      isActive: true,
      limit: limit ? parseInt(limit, 10) : 10,
      page: page ? parseInt(page, 10) : 1,
      includeContacts: includeContacts === 'true',
    });
  }

  @Get('countries')
  @RequireAnyPermission(
    'partner:view',
    'partner:read',
    'logistics:view',
    'logistics:read',
    'enquiry:read',
    'enquiry:view',
    'sales-contract:read',
    'sales-contract:view',
    'quotation:read',
    'quotation:view',
    'purchase-contract:read',
    'purchase-contract:view',
  )
  async getCountries() {
    const countries = await this.partnerService.getDistinctCountries();
    return { success: true, data: countries };
  }

  @Get(':id')
  @RequireAnyPermission(
    'partner:view',
    'partner:read',
    'logistics:view',
    'logistics:read',
    'logistics:create',
    'logistics:update',
    'enquiry:view',
    'enquiry:read',
    'enquiry:create',
    'enquiry:update',
    'quotation:view',
    'quotation:read',
    'quotation:create',
    'quotation:update',
    'sales-contract:view',
    'sales-contract:read',
    'sales-contract:create',
    'sales-contract:update',
    'purchase-contract:view',
    'purchase-contract:read',
    'purchase-contract:create',
    'purchase-contract:update',
    'shipment:view',
    'shipment:read',
    'follow_up:view',
    'follow_up:read',
  )
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const item = await this.partnerService.findOne(id);

    return item;
  }

  @Patch(':id')
  @RequireAnyPermission(
    'partner:update',
    'logistics:update',
    'enquiry:update',
    'sales-contract:update',
    'purchase-contract:update',
  )
  @AuditLog({ entityType: 'Partner', action: 'UPDATE' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePartnerDto: UpdatePartnerDto,
    @Req() req: any,
  ) {
    await this.assertPartnerRoleAllowed(
      updatePartnerDto.partnerRoleId,
      req.user,
      req.activeCompanyId,
    );
    return this.partnerService.update(id, updatePartnerDto);
  }

  @Put(':id')
  @RequireAnyPermission(
    'partner:update',
    'logistics:update',
    'enquiry:update',
    'sales-contract:update',
    'purchase-contract:update',
  )
  @AuditLog({ entityType: 'Partner', action: 'UPDATE' })
  async updatePut(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePartnerDto: UpdatePartnerDto,
    @Req() req: any,
  ) {
    return this.update(id, updatePartnerDto, req);
  }

  @Patch(':id/restore')
  @RequirePermission('partner:update')
  @AuditLog({ entityType: 'Partner', action: 'RESTORE' })
  restore(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
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
