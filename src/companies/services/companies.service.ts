import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Company } from '../models/company.model';
import { Client } from '../../clients/models/client.model';
import { User } from '../../users/models/user.model';
import { AuditService } from '../../audit/services/audit.service';
import { CreateCompanyDto, UpdateCompanyDto } from '../dto/companies.dto';
import {
  COMPANY_TYPES,
  INDUSTRY_TYPES,
  COMPANY_SIZES,
} from '../../constants/company-options';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectModel(Company)
    private readonly companyModel: typeof Company,
    @InjectModel(Client)
    private readonly clientModel: typeof Client,
    private readonly auditService: AuditService,
  ) {}

  // ─── Create ──────────────────────────────────────────────────────────────

  async createCompany(
    clientId: number,
    data: CreateCompanyDto,
    actor?: any,
  ): Promise<Company> {
    const client = await this.clientModel.findByPk(clientId);
    if (!client) throw new NotFoundException('Client not found');

    const currentCount = await this.companyModel.count({ where: { clientId } });
    if (currentCount >= client.allowedCompanies) {
      throw new ForbiddenException(
        `Company limit reached. Allowed: ${client.allowedCompanies}`,
      );
    }

    // Unique company_code guard
    if (data.companyCode) {
      const existing = await this.companyModel.findOne({
        where: { companyCode: data.companyCode },
      });
      if (existing) {
        throw new ConflictException(
          `Company code "${data.companyCode}" is already taken.`,
        );
      }
    }

    const company = await this.companyModel.create({
      clientId,
      name: data.name,
      legalName: data.legalName ?? null,
      companyCode: data.companyCode ?? null,
      companyType: data.companyType ?? null,
      industryType: data.industryType ?? null,
      logoUrl: data.logoUrl ?? null,
      faviconUrl: data.faviconUrl ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      // Enterprise fields
      description: data.description ?? null,
      registrationNumber: data.registrationNumber ?? null,
      taxNumber: data.taxNumber ?? null,
      employeeCount: data.employeeCount ?? null,
      companySize: data.companySize ?? null,
      // Phase 2
      website: data.website ?? null,
      country: data.country ?? null,
      state: data.state ?? null,
      city: data.city ?? null,
      address: data.address ?? null,
      pincode: data.pincode ?? null,
      establishedYear: data.establishedYear ?? null,
      isActive: data.isActive !== undefined ? data.isActive : true,
      status: 'Active',
    });

    if (actor) {
      await this.auditService.writeDiffLog({
        clientId,
        companyId: company.id,
        userId: actor.userId,
        entityType: 'Company',
        entityId: company.id,
        action: 'CREATE',
        newRecord: company,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }

    return company;
  }

  // ─── Update ──────────────────────────────────────────────────────────────

  async updateCompany(
    id: number,
    clientId: number | null,
    data: UpdateCompanyDto,
    actor?: any,
  ): Promise<Company> {
    const company = await this.companyModel.findByPk(id);
    if (!company) throw new NotFoundException('Company not found');

    if (clientId !== null && company.clientId !== clientId) {
      throw new ForbiddenException('You can only update your own companies');
    }

    // Unique company_code guard (only if changing)
    if (data.companyCode && data.companyCode !== company.companyCode) {
      const existing = await this.companyModel.findOne({
        where: { companyCode: data.companyCode, id: { [Op.ne]: id } },
      });
      if (existing) {
        throw new ConflictException(
          `Company code "${data.companyCode}" is already taken.`,
        );
      }
    }

    const oldRecord = company.toJSON();

    await company.update({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.legalName !== undefined && { legalName: data.legalName }),
      ...(data.companyCode !== undefined && { companyCode: data.companyCode }),
      ...(data.companyType !== undefined && { companyType: data.companyType }),
      ...(data.industryType !== undefined && {
        industryType: data.industryType,
      }),
      ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
      ...(data.faviconUrl !== undefined && { faviconUrl: data.faviconUrl }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.phone !== undefined && { phone: data.phone }),
      // Enterprise fields
      ...(data.description !== undefined && { description: data.description }),
      ...(data.registrationNumber !== undefined && {
        registrationNumber: data.registrationNumber,
      }),
      ...(data.taxNumber !== undefined && { taxNumber: data.taxNumber }),
      ...(data.employeeCount !== undefined && {
        employeeCount: data.employeeCount,
      }),
      ...(data.companySize !== undefined && { companySize: data.companySize }),
      // Phase 2
      ...(data.website !== undefined && { website: data.website }),
      ...(data.country !== undefined && { country: data.country }),
      ...(data.state !== undefined && { state: data.state }),
      ...(data.city !== undefined && { city: data.city }),
      ...(data.address !== undefined && { address: data.address }),
      ...(data.pincode !== undefined && { pincode: data.pincode }),
      ...(data.establishedYear !== undefined && {
        establishedYear: data.establishedYear,
      }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.status !== undefined && { status: data.status }),
    });

    const updated = await company.reload();

    if (actor) {
      await this.auditService.writeDiffLog({
        clientId: company.clientId,
        companyId: id,
        userId: actor.userId,
        entityType: 'Company',
        entityId: id,
        action: 'UPDATE',
        oldRecord,
        newRecord: updated,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }

    return updated;
  }

  // ─── Delete ──────────────────────────────────────────────────────────────

  async deleteCompany(
    id: number,
    clientId: number | null,
    actor?: any,
  ): Promise<{ message: string }> {
    const company = await this.companyModel.findByPk(id);
    if (!company) throw new NotFoundException('Company not found');

    if (clientId !== null && company.clientId !== clientId) {
      throw new ForbiddenException('You can only delete your own companies');
    }

    const oldRecord = company.toJSON();

    if (actor) {
      await this.auditService.writeDiffLog({
        clientId: company.clientId,
        companyId: id,
        userId: actor.userId,
        entityType: 'Company',
        entityId: id,
        action: 'DELETE',
        oldRecord,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }

    await company.destroy();

    return { message: `Company "${company.name}" deleted successfully` };
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  async getCompanies(clientId?: number | null, query?: any): Promise<any> {
    const where: any = {};
    if (clientId !== undefined && clientId !== null) {
      where.clientId = clientId;
    }

    const {
      page = 1,
      limit,
      search,
      companyType,
      industryType,
      status,
      sortField = 'createdAt',
      sortOrder = 'DESC',
    } = query || {};

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { companyCode: { [Op.iLike]: `%${search}%` } },
        { legalName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (companyType && companyType !== 'ALL') where.companyType = companyType;
    if (industryType && industryType !== 'ALL')
      where.industryType = industryType;
    if (status && status !== 'ALL') where.status = status;

    const findOptions: any = {
      where,
      include: [
        { model: Client, attributes: ['id', 'name'] },
        { model: User, attributes: ['id', 'name', 'email'] },
      ],
      order: [[sortField, sortOrder]],
      distinct: true,
    };

    if (limit) {
      const parsedLimit = parseInt(limit, 10);
      const parsedPage = parseInt(page, 10) || 1;
      findOptions.limit = parsedLimit;
      findOptions.offset = (parsedPage - 1) * parsedLimit;
    }

    if (limit) {
      const { rows, count } =
        await this.companyModel.findAndCountAll(findOptions);
      return {
        data: rows,
        total: count,
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(count / parseInt(limit, 10)),
      };
    } else {
      const data = await this.companyModel.findAll(findOptions);
      return {
        data,
        total: data.length,
        page: 1,
        limit: data.length,
        totalPages: 1,
      };
    }
  }

  async getCompanyById(id: number, clientId: number | null): Promise<Company> {
    const company = await this.companyModel.findByPk(id, {
      include: [
        { model: Client, attributes: ['id', 'name'] },
        { model: User, attributes: ['id', 'name', 'email'] },
      ],
    });
    if (!company) throw new NotFoundException('Company not found');

    if (clientId !== null && company.clientId !== clientId) {
      throw new ForbiddenException('Access denied');
    }
    return company;
  }

  // ─── Options ───────────────────────────────────────────────────────────────

  async getCompaniesForOptions(
    clientId: number | null,
    search?: string,
    page: string = '1',
    limit: string = '10',
  ) {
    const where: any = { isActive: true };
    if (clientId !== null) {
      where.clientId = clientId;
    }

    if (search) {
      where.name = { [Op.iLike]: `%${search}%` };
    }

    const parsedPage = parseInt(page, 10) || 1;
    const parsedLimit = parseInt(limit, 10) || 10;

    const { rows, count } = await this.companyModel.findAndCountAll({
      where,
      attributes: ['id', 'name'],
      limit: parsedLimit,
      offset: (parsedPage - 1) * parsedLimit,
      order: [['name', 'ASC']],
    });

    return {
      data: rows.map((r) => ({ value: r.id, label: r.name })),
      meta: {
        page: parsedPage,
        limit: parsedLimit,
        total: count,
        totalPages: Math.ceil(count / parsedLimit),
      },
    };
  }
}
