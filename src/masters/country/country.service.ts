import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, fn, col } from 'sequelize';
import { Country } from './country.model';
import { Port } from '../port/port.model';

@Injectable()
export class CountryService {
  constructor(
    @InjectModel(Country)
    private readonly countryModel: typeof Country,
    @InjectModel(Port)
    private readonly portModel: typeof Port,
  ) {}

  async findAll(query: { search?: string; isActive?: string | boolean; limit?: number }) {
    const where: any = {};

    if (query.isActive !== undefined) {
      where.isActive = String(query.isActive) === 'true';
    }

    if (query.search) {
      const q = `%${query.search.trim().toLowerCase()}%`;
      where[Op.or] = [
        { name: { [Op.iLike]: q } },
        { iso2Code: { [Op.iLike]: q } },
        { iso3Code: { [Op.iLike]: q } },
      ];
    }

    const limit = query.limit ? Number(query.limit) : 300;

    const countries = await this.countryModel.findAll({
      where,
      order: [['name', 'ASC']],
      limit,
    });

    // Safely get port counts per country
    const portCounts = (await this.portModel.findAll({
      attributes: ['countryId', [fn('COUNT', col('id')), 'count']],
      group: ['countryId'],
      raw: true,
    })) as any[];

    const countsMap = new Map<number, number>();
    for (const pc of portCounts) {
      if (pc.countryId) {
        countsMap.set(Number(pc.countryId), Number(pc.count || 0));
      }
    }

    return countries.map((c: any) => {
      const json = c.toJSON();
      return {
        ...json,
        country_name: json.name,
        country_code: json.iso2Code,
        portsCount: countsMap.get(c.id) || 0,
      };
    });
  }

  async findOne(id: number) {
    const country = await this.countryModel.findByPk(id, {
      include: [
        {
          model: Port,
          as: 'ports',
        },
      ],
    });

    if (!country) {
      throw new NotFoundException(`Country with ID ${id} not found`);
    }

    const json = country.toJSON();
    return {
      ...json,
      country_name: json.name,
      country_code: json.iso2Code,
    };
  }

  async create(data: { name: string; iso2Code?: string; iso3Code?: string; phoneCode?: string }) {
    const existing = await this.countryModel.findOne({
      where: {
        [Op.or]: [
          { name: { [Op.iLike]: data.name.trim() } },
          ...(data.iso2Code ? [{ iso2Code: { [Op.iLike]: data.iso2Code.trim() } }] : []),
        ],
      },
    });

    if (existing) {
      return existing;
    }

    const iso2 = (data.iso2Code || data.name.slice(0, 2)).toUpperCase();
    const iso3 = (data.iso3Code || data.name.slice(0, 3)).toUpperCase();

    return await this.countryModel.create({
      name: data.name.trim(),
      iso2Code: iso2,
      iso3Code: iso3,
      phoneCode: data.phoneCode || null,
      isActive: true,
    } as any);
  }

  async remove(id: number) {
    const country = await this.countryModel.findByPk(id);
    if (!country) {
      throw new NotFoundException(`Country with ID ${id} not found`);
    }

    // Validation: Cannot delete Country having Ports
    const portsCount = await this.portModel.count({ where: { countryId: id } });
    if (portsCount > 0) {
      throw new BadRequestException(
        `Cannot delete Country "${country.name}" because it has ${portsCount} associated port(s). Remove the ports first.`,
      );
    }

    await country.destroy();
    return { success: true, message: `Country "${country.name}" deleted successfully` };
  }
}
