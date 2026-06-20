import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Op } from 'sequelize';
import { Partner } from './partner.model';
import { PartnerContact } from './partner-contact.model';
import { PartnerProduct } from './partner-product.model';
import { PartnerRole } from '../partner-role/partner-role.model';
import { Country } from '../country/country.model';
import { Product } from '../product/product.model';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { QueryPartnerDto } from './dto/query-partner.dto';
import { buildPagination } from '../common/pagination.helper';
import { buildSearchQuery } from '../common/search.helper';
import { buildPaginatedResponse } from '../common/response.helper';

const INCLUDE_RELATIONS = [
  { model: PartnerRole, attributes: ['id', 'name'], where: { isActive: true }, required: false },
  { model: Country, attributes: ['id', 'name', 'iso2Code'], where: { isActive: true }, required: false },
  { model: PartnerContact, attributes: ['id', 'name', 'designation', 'phone', 'email', 'communicationType', 'isPrimary'] },
  { model: Product, attributes: ['id', 'name'], where: { isActive: true }, required: false }
];

@Injectable()
export class PartnerService {
  constructor(
    @InjectModel(Partner)
    private readonly partnerModel: typeof Partner,
    @InjectModel(PartnerContact)
    private readonly partnerContactModel: typeof PartnerContact,
    @InjectModel(PartnerProduct)
    private readonly partnerProductModel: typeof PartnerProduct,
    @InjectModel(PartnerRole)
    private readonly partnerRoleModel: typeof PartnerRole,
    @InjectModel(Country)
    private readonly countryModel: typeof Country,
    @InjectModel(Product)
    private readonly productModel: typeof Product,
    private sequelize: Sequelize,
  ) {}

  private async validateForeignKeys(partnerRoleId?: number, countryId?: number, productIds?: number[]) {
    if (partnerRoleId) {
      const role = await this.partnerRoleModel.findOne({ where: { id: partnerRoleId, isActive: true } });
      if (!role) throw new BadRequestException('Partner Role not found or inactive');
    }
    if (countryId) {
      const country = await this.countryModel.findOne({ where: { id: countryId, isActive: true } });
      if (!country) throw new BadRequestException('Country not found or inactive');
    }
    if (productIds && productIds.length > 0) {
      const products = await this.productModel.findAll({
        where: { id: { [Op.in]: productIds }, isActive: true }
      });
      if (products.length !== productIds.length) {
        throw new BadRequestException('One or more Products not found or inactive');
      }
    }
  }

  async create(dto: CreatePartnerDto): Promise<Partner> {
    const normalizedName = dto.entityName.trim().toUpperCase();
    
    if (dto.address) dto.address = dto.address.trim();
    if (dto.city) dto.city = dto.city.trim();

    await this.validateForeignKeys(dto.partnerRoleId, dto.countryId, dto.productIds);

    return await this.sequelize.transaction(async (transaction) => {
      const { contacts, productIds, ...partnerData } = dto;
      const partner = await this.partnerModel.create(
        {
          ...partnerData,
          entityName: normalizedName,
        },
        { transaction }
      );

      if (dto.contacts && dto.contacts.length > 0) {
        const contactsPayload = dto.contacts.map((c) => ({
          ...c,
          partnerId: partner.id,
        }));
        await this.partnerContactModel.bulkCreate(contactsPayload, { transaction });
      }

      if (dto.productIds && dto.productIds.length > 0) {
        const uniqueProductIds = [...new Set(dto.productIds)];
        const productsPayload = uniqueProductIds.map((pId) => ({
          partnerId: partner.id,
          productId: pId,
        }));
        await this.partnerProductModel.bulkCreate(productsPayload, { transaction });
      }

      return partner;
    });
  }

  async findAll(query: QueryPartnerDto) {
    const { search, isActive, partnerRoleId, countryId, page, limit } = query;
    const { limit: finalLimit, offset } = buildPagination(page, limit);

    const whereClause: any = {
      ...buildSearchQuery(search, ['entityName']),
    };
    
    if (isActive !== undefined) {
      whereClause.isActive = isActive;
    }
    if (partnerRoleId) {
      whereClause.partnerRoleId = partnerRoleId;
    }
    if (countryId) {
      whereClause.countryId = countryId;
    }

    const { rows, count } = await this.partnerModel.findAndCountAll({
      where: whereClause,
      limit: finalLimit,
      offset,
      order: [['createdAt', 'DESC']],
      include: INCLUDE_RELATIONS,
      distinct: true,
    });

    return buildPaginatedResponse(rows, count, page || 1, finalLimit);
  }

  async findOne(id: number): Promise<Partner> {
    const partner = await this.partnerModel.findOne({
      where: { id, isActive: true },
      include: INCLUDE_RELATIONS,
    });
    if (!partner) {
      throw new NotFoundException('Partner not found');
    }
    return partner;
  }

  async update(id: number, dto: UpdatePartnerDto): Promise<Partner> {
    const partner = await this.findOne(id);
    
    if (dto.entityName) {
      dto.entityName = dto.entityName.trim().toUpperCase();
    }
    if (dto.address) {
      dto.address = dto.address.trim();
    }
    if (dto.city) {
      dto.city = dto.city.trim();
    }

    if (dto.partnerRoleId || dto.countryId || dto.productIds) {
      await this.validateForeignKeys(dto.partnerRoleId, dto.countryId, dto.productIds);
    }

    await this.sequelize.transaction(async (transaction) => {
      const { contacts, productIds, ...updateData } = dto;
      await partner.update(updateData, { transaction });

      if (dto.contacts !== undefined) {
        await this.partnerContactModel.destroy({ where: { partnerId: id }, transaction });
        if (dto.contacts.length > 0) {
          const contactsPayload = dto.contacts.map((c) => ({
            ...c,
            partnerId: id,
          }));
          await this.partnerContactModel.bulkCreate(contactsPayload, { transaction });
        }
      }

      if (dto.productIds !== undefined) {
        await this.partnerProductModel.destroy({ where: { partnerId: id }, transaction });
        if (dto.productIds.length > 0) {
          const uniqueProductIds = [...new Set(dto.productIds)];
          const productsPayload = uniqueProductIds.map((pId) => ({
            partnerId: id,
            productId: pId,
          }));
          await this.partnerProductModel.bulkCreate(productsPayload, { transaction });
        }
      }
    });

    return partner.reload({ include: INCLUDE_RELATIONS });
  }

  async remove(id: number): Promise<Partner> {
    const partner = await this.findOne(id);
    await partner.update({ isActive: false });
    return partner.reload({ include: INCLUDE_RELATIONS });
  }
}
