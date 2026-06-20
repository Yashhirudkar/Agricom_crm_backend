import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Category } from './category.model';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { QueryCategoryDto } from './dto/query-category.dto';

@Injectable()
export class CategoryService {
  constructor(
    @InjectModel(Category)
    private readonly categoryModel: typeof Category,
  ) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
    const normalizedName = dto.name.trim().toUpperCase();
    
    const existing = await this.categoryModel.findOne({
      where: { name: normalizedName },
    });
    
    if (existing) {
      throw new BadRequestException(`Category with name '${normalizedName}' already exists`);
    }

    return this.categoryModel.create({ ...dto, name: normalizedName });
  }

  async findAll(query: QueryCategoryDto) {
    const { search, isActive, page = 1, limit = 10 } = query;
    const offset = (page - 1) * limit;

    const whereClause: any = {};
    if (search) {
      whereClause.name = { [Op.iLike]: `%${search}%` };
    }
    if (isActive !== undefined) {
      whereClause.isActive = isActive;
    }

    const { rows, count } = await this.categoryModel.findAndCountAll({
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

  async findOne(id: number): Promise<Category> {
    const category = await this.categoryModel.findOne({ where: { id, isActive: true } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async update(id: number, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id);
    
    if (dto.name) {
      const normalizedName = dto.name.trim().toUpperCase();
      const existing = await this.categoryModel.findOne({
        where: { 
          name: normalizedName,
          id: { [Op.ne]: id }
        }
      });
      
      if (existing) {
        throw new BadRequestException(`Category with name '${normalizedName}' already exists`);
      }
      dto.name = normalizedName;
    }

    await category.update(dto);
    return category.reload();
  }

  async remove(id: number): Promise<Category> {
    const category = await this.findOne(id);
    await category.update({ isActive: false });
    return category.reload();
  }
}
