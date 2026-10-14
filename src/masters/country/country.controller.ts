import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { CountryService } from './country.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller(['masters/countries', 'countries'])
export class CountryController {
  constructor(private readonly service: CountryService) {}

  @Get()
  async findAll(@Query() query: { search?: string; isActive?: string; limit?: number }) {
    return await this.service.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.service.findOne(id);
  }

  @Post()
  async create(
    @Body()
    body: {
      country_name?: string;
      name?: string;
      country_code?: string;
      iso2Code?: string;
      iso3Code?: string;
      phoneCode?: string;
    },
  ) {
    const name = body.name || body.country_name || '';
    const iso2Code = body.iso2Code || body.country_code || '';
    return await this.service.create({
      name,
      iso2Code,
      iso3Code: body.iso3Code,
      phoneCode: body.phoneCode,
    });
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.service.remove(id);
  }
}
