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
  @RequirePermission('masters.partnerrole.create')
  @AuditLog({ entityType: 'PartnerRole', action: 'CREATE' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createPartnerRoleDto: CreatePartnerRoleDto) {
    return this.partnerRoleService.create(createPartnerRoleDto);
  }

  @Get()
  @RequirePermission('masters.partnerrole.view')
  findAll(@Query() query: QueryPartnerRoleDto) {
    return this.partnerRoleService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('masters.partnerrole.view')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.partnerRoleService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('masters.partnerrole.update')
  @AuditLog({ entityType: 'PartnerRole', action: 'UPDATE' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePartnerRoleDto: UpdatePartnerRoleDto,
  ) {
    return this.partnerRoleService.update(id, updatePartnerRoleDto);
  }

  @Delete(':id')
  @RequirePermission('masters.partnerrole.delete')
  @AuditLog({ entityType: 'PartnerRole', action: 'DELETE' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.partnerRoleService.remove(id);
  }
}
