import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { PartnerRole } from './partner-role.model';
import { CreatePartnerRoleDto } from './dto/create-partner-role.dto';
import { UpdatePartnerRoleDto } from './dto/update-partner-role.dto';
import { QueryPartnerRoleDto } from './dto/query-partner-role.dto';

@Injectable()
export class PartnerRoleService {
  constructor(
    @InjectModel(PartnerRole)
    private readonly partnerRoleModel: typeof PartnerRole,
  ) {}

  async create(dto: CreatePartnerRoleDto): Promise<PartnerRole> {
    const normalizedName = dto.name.trim().toUpperCase();
    
    const existing = await this.partnerRoleModel.findOne({
      where: { name: normalizedName },
    });
    
    if (existing) {
      throw new BadRequestException(`Partner Role '${normalizedName}' already exists`);
    }

    const payload = {
      ...dto,
      name: normalizedName,
    };

    if (payload.description) {
      payload.description = payload.description.trim();
    }

    return this.partnerRoleModel.create(payload);
  }

  async findAll(query: QueryPartnerRoleDto) {
    const { search, isActive, page = 1, limit = 10 } = query;
    const offset = (page - 1) * limit;

    const whereClause: any = {};
    
    if (search) {
      whereClause.name = { [Op.iLike]: `%${search}%` };
    }
    
    if (isActive !== undefined) {
      whereClause.isActive = isActive;
    }

    const { rows, count } = await this.partnerRoleModel.findAndCountAll({
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

  async findOne(id: number): Promise<PartnerRole> {
    const partnerRole = await this.partnerRoleModel.findOne({ where: { id, isActive: true } });
    if (!partnerRole) {
      throw new NotFoundException('Partner Role not found');
    }
    return partnerRole;
  }

  async update(id: number, dto: UpdatePartnerRoleDto): Promise<PartnerRole> {
    const partnerRole = await this.findOne(id);
    
    if (dto.name) {
      const normalizedName = dto.name.trim().toUpperCase();
      
      const existing = await this.partnerRoleModel.findOne({
        where: { 
          name: normalizedName,
          id: { [Op.ne]: id }
        }
      });
      
      if (existing) {
        throw new BadRequestException(`Partner Role '${normalizedName}' already exists`);
      }
      
      dto.name = normalizedName;
    }

    if (dto.description) {
      dto.description = dto.description.trim();
    }

    await partnerRole.update(dto);
    return partnerRole.reload();
  }

  async remove(id: number): Promise<PartnerRole> {
    const partnerRole = await this.findOne(id);
    await partnerRole.update({ isActive: false });
    return partnerRole.reload();
  }
}
