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
  constructor(private readonly countryService: CountryService) {}

  @Post()
  @RequirePermission('masters.country.create')
  @AuditLog({ entityType: 'Country', action: 'CREATE' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createCountryDto: CreateCountryDto) {
    return this.countryService.create(createCountryDto);
  }

  @Get()
  @RequirePermission('masters.country.view')
  findAll(@Query() query: QueryCountryDto) {
    return this.countryService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('masters.country.view')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.countryService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('masters.country.update')
  @AuditLog({ entityType: 'Country', action: 'UPDATE' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCountryDto: UpdateCountryDto,
  ) {
    return this.countryService.update(id, updateCountryDto);
  }

  @Delete(':id')
  @RequirePermission('masters.country.delete')
  @AuditLog({ entityType: 'Country', action: 'DELETE' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.countryService.remove(id);
  }
}
