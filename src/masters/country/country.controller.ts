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
import { CountryService } from './country.service';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { QueryCountryDto } from './dto/query-country.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { AuditLog } from '../../audit/decorators/audit-log.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('masters/countries')
export class CountryController {
  constructor(
    private readonly countryService: CountryService,
  ) {}

  @Post()
  @RequirePermission('country:create')
  @AuditLog({ entityType: 'Country', action: 'CREATE' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createCountryDto: CreateCountryDto) {
    return this.countryService.create(createCountryDto);
  }

  @Get()
  @RequirePermission('country:view')
  async findAll(@Query() query: QueryCountryDto) {
    const result = await this.countryService.findAll(query);
    
    return result;
  }

  @Get(':id')
  @RequirePermission('country:view')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const item = await this.countryService.findOne(id);
    
    return item;
  }

  @Patch(':id')
  @RequirePermission('country:update')
  @AuditLog({ entityType: 'Country', action: 'UPDATE' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCountryDto: UpdateCountryDto,
  ) {
    return this.countryService.update(id, updateCountryDto);
  }

  @Patch(':id/restore')
  @RequirePermission('country:update')
  @AuditLog({ entityType: 'Country', action: 'RESTORE' })
  restore(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return this.countryService.restore(id, req.user);
  }

  @Delete(':id')
  @RequirePermission('country:delete')
  @AuditLog({ entityType: 'Country', action: 'DELETE' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('reason') reason?: string,
    @Req() req?: any,
  ) {
    return this.countryService.remove(id, reason, req?.user);
  }

  @Delete(':id/permanent')
  @RequirePermission('country:force_delete')
  @AuditLog({ entityType: 'Country', action: 'FORCE_DELETE' })
  @HttpCode(HttpStatus.NO_CONTENT)
  removePermanent(
    @Param('id', ParseIntPipe) id: number,
    @Query('reason') reason: string,
    @Req() req: any,
  ) {
    if (req.user.type !== 'super_admin') {
      throw new ForbiddenException('Super Admin only');
    }
    return this.countryService.removePermanent(id, reason, req.user);
  }
}
