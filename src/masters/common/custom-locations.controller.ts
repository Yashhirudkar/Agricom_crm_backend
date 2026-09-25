import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CustomLocationsService } from './custom-locations.service';

@UseGuards(JwtAuthGuard)
@Controller('masters/custom-locations')
export class CustomLocationsController {
  constructor(private readonly service: CustomLocationsService) {}

  // ─── States ────────────────────────────────────────────────────────────────

  @Get('states')
  async getStates(@Query('countryCode') countryCode: string) {
    if (!countryCode?.trim()) {
      return { data: [] };
    }
    const states = await this.service.getCustomStates(countryCode.trim());
    return { data: states };
  }

  @Post('states')
  @HttpCode(HttpStatus.CREATED)
  async createState(
    @Body() dto: { countryCode: string; countryName: string; stateName: string },
  ) {
    if (!dto.countryCode?.trim()) throw new BadRequestException('countryCode is required');
    if (!dto.stateName?.trim()) throw new BadRequestException('stateName is required');
    const created = await this.service.createState(dto);
    return { data: created, message: 'State created successfully' };
  }

  // ─── Cities ────────────────────────────────────────────────────────────────

  @Get('cities')
  async getCities(
    @Query('countryCode') countryCode: string,
    @Query('stateName') stateName: string,
  ) {
    if (!countryCode?.trim() || !stateName?.trim()) {
      return { data: [] };
    }
    const cities = await this.service.getCustomCities(countryCode.trim(), stateName.trim());
    return { data: cities };
  }

  @Post('cities')
  @HttpCode(HttpStatus.CREATED)
  async createCity(
    @Body() dto: {
      countryCode: string;
      countryName: string;
      stateName: string;
      cityName: string;
    },
  ) {
    if (!dto.countryCode?.trim()) throw new BadRequestException('countryCode is required');
    if (!dto.stateName?.trim()) throw new BadRequestException('stateName is required');
    if (!dto.cityName?.trim()) throw new BadRequestException('cityName is required');
    const created = await this.service.createCity(dto);
    return { data: created, message: 'City created successfully' };
  }
}
