import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Country } from './country.model';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { QueryCountryDto } from './dto/query-country.dto';

@Injectable()
export class CountryService {
  constructor(
    @InjectModel(Country)
    private readonly countryModel: typeof Country,
  ) {}

  async create(dto: CreateCountryDto): Promise<Country> {
    const normalizedName = dto.name.trim().toUpperCase();
    const normalizedIso2 = dto.iso2Code.trim().toUpperCase();
    const normalizedIso3 = dto.iso3Code.trim().toUpperCase();
    
    const existing = await this.countryModel.findOne({
      where: {
        [Op.or]: [
          { name: normalizedName },
          { iso2Code: normalizedIso2 },
          { iso3Code: normalizedIso3 },
        ],
      },
    });
    
    if (existing) {
      throw new BadRequestException('Country with given name, iso2_code, or iso3_code already exists');
    }

    return this.countryModel.create({
      ...dto,
      name: normalizedName,
      iso2Code: normalizedIso2,
      iso3Code: normalizedIso3,
    });
  }

  async findAll(query: QueryCountryDto) {
    const { search, isActive, page = 1, limit = 10 } = query;
    const offset = (page - 1) * limit;

    const whereClause: any = {};
    if (search) {
      whereClause.name = { [Op.iLike]: `%${search}%` };
    }
    if (isActive !== undefined) {
      whereClause.isActive = isActive;
    }

    const { rows, count } = await this.countryModel.findAndCountAll({
      where: whereClause,
      limit: Number(limit),
      offset: Number(offset),
      order: [['createdAt', 'DESC']],
    });

    return {
      data: rows,
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / limit),
    };
  }

  async findOne(id: number): Promise<Country> {
    const country = await this.countryModel.findOne({ where: { id, isActive: true } });
    if (!country) {
      throw new NotFoundException('Country not found');
    }
    return country;
  }

  async update(id: number, dto: UpdateCountryDto): Promise<Country> {
    const country = await this.findOne(id);
    
    let normalizedName = dto.name;
    let normalizedIso2 = dto.iso2Code;
    let normalizedIso3 = dto.iso3Code;

    if (normalizedName) normalizedName = normalizedName.trim().toUpperCase();
    if (normalizedIso2) normalizedIso2 = normalizedIso2.trim().toUpperCase();
    if (normalizedIso3) normalizedIso3 = normalizedIso3.trim().toUpperCase();

    if (normalizedName || normalizedIso2 || normalizedIso3) {
      const orConditions: any[] = [];
      if (normalizedName) orConditions.push({ name: normalizedName });
      if (normalizedIso2) orConditions.push({ iso2Code: normalizedIso2 });
      if (normalizedIso3) orConditions.push({ iso3Code: normalizedIso3 });

      const existing = await this.countryModel.findOne({
        where: { 
          [Op.or]: orConditions,
          id: { [Op.ne]: id }
        }
      });
      
      if (existing) {
        throw new BadRequestException('Country with given name, iso2_code, or iso3_code already exists');
      }
      
      if (normalizedName) dto.name = normalizedName;
      if (normalizedIso2) dto.iso2Code = normalizedIso2;
      if (normalizedIso3) dto.iso3Code = normalizedIso3;
    }

    await country.update(dto);
    return country.reload();
  }

  async remove(id: number): Promise<Country> {
    const country = await this.findOne(id);
    await country.update({ isActive: false });
    return country.reload();
  }
}
