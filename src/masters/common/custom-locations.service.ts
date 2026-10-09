import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { CustomState } from './custom-state.model';
import { CustomCity } from './custom-city.model';

@Injectable()
export class CustomLocationsService {
  constructor(
    @InjectModel(CustomState)
    private readonly customStateModel: typeof CustomState,
    @InjectModel(CustomCity)
    private readonly customCityModel: typeof CustomCity,
  ) {}

  // ─── States ────────────────────────────────────────────────────────────────

  async getCustomStates(countryCode: string): Promise<CustomState[]> {
    if (!countryCode?.trim()) return [];
    return this.customStateModel.findAll({
      where: { countryCode: countryCode.trim().toUpperCase() },
      order: [['state_name', 'ASC']],
    });
  }

  async createState(dto: {
    countryCode: string;
    countryName: string;
    stateName: string;
  }): Promise<CustomState> {
    const countryCode = (dto.countryCode || '').trim().toUpperCase();
    const countryName = (dto.countryName || '').trim();
    const stateName = (dto.stateName || '').trim();

    if (!countryCode) throw new BadRequestException('countryCode is required');
    if (!stateName) throw new BadRequestException('stateName is required');
    if (stateName.length > 150)
      throw new BadRequestException('State name too long (max 150 chars)');

    // Case-insensitive duplicate check
    const existing = await this.customStateModel.findOne({
      where: {
        countryCode,
        stateName: { [Op.iLike]: stateName },
      },
    });
    if (existing) {
      throw new BadRequestException(
        `State "${stateName}" already exists for this country`,
      );
    }

    return this.customStateModel.create({
      countryCode,
      countryName,
      stateName,
    });
  }

  // ─── Cities ────────────────────────────────────────────────────────────────

  async getCustomCities(
    countryCode: string,
    stateName: string,
  ): Promise<CustomCity[]> {
    if (!countryCode?.trim() || !stateName?.trim()) return [];
    return this.customCityModel.findAll({
      where: {
        countryCode: countryCode.trim().toUpperCase(),
        stateName: { [Op.iLike]: stateName.trim() },
      },
      order: [['city_name', 'ASC']],
    });
  }

  async createCity(dto: {
    countryCode: string;
    countryName: string;
    stateName: string;
    cityName: string;
  }): Promise<CustomCity> {
    const countryCode = (dto.countryCode || '').trim().toUpperCase();
    const countryName = (dto.countryName || '').trim();
    const stateName = (dto.stateName || '').trim();
    const cityName = (dto.cityName || '').trim();

    if (!countryCode) throw new BadRequestException('countryCode is required');
    if (!stateName) throw new BadRequestException('stateName is required');
    if (!cityName) throw new BadRequestException('cityName is required');
    if (cityName.length > 150)
      throw new BadRequestException('City name too long (max 150 chars)');

    // Case-insensitive duplicate check
    const existing = await this.customCityModel.findOne({
      where: {
        countryCode,
        stateName: { [Op.iLike]: stateName },
        cityName: { [Op.iLike]: cityName },
      },
    });
    if (existing) {
      throw new BadRequestException(
        `City "${cityName}" already exists in ${stateName}`,
      );
    }

    return this.customCityModel.create({
      countryCode,
      countryName,
      stateName,
      cityName,
    });
  }
}
