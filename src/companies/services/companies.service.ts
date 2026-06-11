import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Company } from '../models/company.model';
import { Client } from '../../clients/models/client.model';
import { User } from '../../users/models/user.model';
import { AuditService } from '../../audit/services/audit.service';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectModel(Company)
    private readonly companyModel: typeof Company,
    @InjectModel(Client)
    private readonly clientModel: typeof Client,
    private readonly auditService: AuditService,
  ) {}

  async createCompany(clientId: number, data: { name: string; isActive?: boolean; status?: string }, actor?: any): Promise<Company> {
    const client = await this.clientModel.findByPk(clientId);
    if (!client) throw new NotFoundException('Client not found');

    const currentCount = await this.companyModel.count({ where: { clientId } });
    if (currentCount >= client.allowedCompanies) {
      throw new ForbiddenException(`Company limit reached. Allowed: ${client.allowedCompanies}`);
    }

    const company = await this.companyModel.create({
      name: data.name,
      clientId,
      isActive: data.isActive !== undefined ? data.isActive : true,
      status: data.status !== undefined ? data.status : 'Active',
    } as any);

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

  async updateCompany(id: number, clientId: number | null, data: { name?: string; isActive?: boolean; status?: string }, actor?: any): Promise<Company> {
    const company = await this.companyModel.findByPk(id);
    if (!company) throw new NotFoundException('Company not found');

    // If clientId is provided (Client Admin), ensure it belongs to them
    if (clientId !== null && company.clientId !== clientId) {
      throw new ForbiddenException('You can only update your own companies');
    }

    const oldRecord = company.toJSON();

    await company.update({
      ...(data.name !== undefined && { name: data.name }),
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

  async deleteCompany(id: number, clientId: number | null, actor?: any): Promise<{ message: string }> {
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

  async getCompanies(clientId?: number | null): Promise<Company[]> {
    const where: any = {};
    if (clientId !== undefined && clientId !== null) {
      where.clientId = clientId;
    }
    return this.companyModel.findAll({
      where,
      include: [
        { model: Client, attributes: ['id', 'name'] },
        { model: User, attributes: ['id', 'name', 'email'] }
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  async getCompanyById(id: number, clientId: number | null): Promise<Company> {
    const company = await this.companyModel.findByPk(id, {
      include: [
        { model: Client, attributes: ['id', 'name'] },
        { model: User, attributes: ['id', 'name', 'email'] }
      ]
    });
    if (!company) throw new NotFoundException('Company not found');

    if (clientId !== null && company.clientId !== clientId) {
      throw new ForbiddenException('Access denied');
    }
    return company;
  }
}
