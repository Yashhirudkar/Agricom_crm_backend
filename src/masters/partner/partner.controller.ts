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
  @RequirePermission('masters.partner.create')
  @AuditLog({ entityType: 'Partner', action: 'CREATE' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createPartnerDto: CreatePartnerDto) {
    return this.partnerService.create(createPartnerDto);
  }

  @Get()
  @RequirePermission('masters.partner.view')
  findAll(@Query() query: QueryPartnerDto) {
    return this.partnerService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('masters.partner.view')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.partnerService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('masters.partner.update')
  @AuditLog({ entityType: 'Partner', action: 'UPDATE' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePartnerDto: UpdatePartnerDto,
  ) {
    return this.partnerService.update(id, updatePartnerDto);
  }

  @Delete(':id')
  @RequirePermission('masters.partner.delete')
  @AuditLog({ entityType: 'Partner', action: 'DELETE' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.partnerService.remove(id);
  }
}
