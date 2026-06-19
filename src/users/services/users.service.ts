import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from '../models/user.model';
import { Role } from '../../rbac/models/role.model';
import { RoleActionPermission } from '../../rbac/models/role-action-permission.model';
import { ResourceAction } from '../../system/models/resource-action.model';
import { ModuleResource } from '../../system/models/module-resource.model';
import { Company } from '../../companies/models/company.model';
import { UserCompany } from '../models/user-company.model';
import { Client } from '../../clients/models/client.model';
import { Op } from 'sequelize';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../../audit/services/audit.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User)
    private userModel: typeof User,
    @InjectModel(Company)
    private companyModel: typeof Company,
    @InjectModel(UserCompany)
    private userCompanyModel: typeof UserCompany,
    @InjectModel(Role)
    private roleModel: typeof Role,
    private readonly auditService: AuditService,
  ) {}

  async create(name: string, email: string, passwordHash: string): Promise<User> {
    const normalizedEmail = email.toLowerCase().trim();
    return this.userModel.create({
      name,
      email: normalizedEmail,
      password: passwordHash,
    } as any);
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.toLowerCase().trim();
    return this.userModel.findOne({
      where: { email: normalizedEmail },
      include: [
        {
          model: Role,
          through: { attributes: [] },
          attributes: ['id', 'name'],
        },
      ],
    });
  }

  async findById(id: number): Promise<User | null> {
    return this.userModel.findByPk(id);
  }

  async findByIdWithRoles(id: number): Promise<User | null> {
    return this.userModel.findByPk(id, {
      include: [
        {
          model: Role,
          through: { attributes: [] },
          attributes: ['id', 'name', 'description'],
        },
        {
          model: UserCompany,
          include: [
            { model: Company, attributes: ['id', 'name', 'clientId'] },
            { 
              model: Role, 
              attributes: ['id', 'name'],
              include: [
                {
                  model: RoleActionPermission,
                  include: [
                    {
                      model: ResourceAction,
                      include: [{ model: ModuleResource }]
                    }
                  ]
                }
              ]
            },
          ],
        },
      ],
    });
  }

  async getUsers(filters?: {
    clientId?: number | null;
    companyId?: number | null;
    roleId?: number | null;
    status?: string | null;
    search?: string | null;
  }): Promise<User[]> {
    const where: any = {};
    const userCompanyWhere: any = {};
    let userCompanyRequired = false;

    if (filters) {
      if (filters.clientId !== undefined && filters.clientId !== null) {
        where.clientId = filters.clientId;
      }
      if (filters.status) {
        where.status = filters.status;
      }
      if (filters.search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${filters.search}%` } },
          { email: { [Op.iLike]: `%${filters.search}%` } },
        ];
      }
      if (filters.companyId) {
        userCompanyWhere.companyId = filters.companyId;
        userCompanyRequired = true;
      }
      if (filters.roleId) {
        userCompanyWhere.roleId = filters.roleId;
        userCompanyRequired = true;
      }
    }

    return this.userModel.findAll({
      where,
      attributes: { exclude: ['password'] },
      include: [
        {
          model: Role,
          through: { attributes: [] },
          attributes: ['id', 'name'],
        },
        {
          model: UserCompany,
          where: Object.keys(userCompanyWhere).length > 0 ? userCompanyWhere : undefined,
          required: userCompanyRequired,
          include: [
            { model: Company, attributes: ['id', 'name'] },
            { model: Role, attributes: ['id', 'name'] },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  async createUser(data: {
    name: string;
    email: string;
    password: string;
    clientId: number | null;
    status?: string;
    isActive?: boolean;
    companies?: { companyId: number; roleId?: number }[];
  }, actor?: any, transaction?: any): Promise<User> {
    const normalizedEmail = data.email.toLowerCase().trim();
    const existing = await this.userModel.findOne({ where: { email: normalizedEmail } });
    if (existing) throw new ConflictException('Email is already registered');

    // Verify companies and roles belong to clientId
    if (data.companies && data.companies.length > 0) {
      for (const item of data.companies) {
        const company = await this.companyModel.findByPk(item.companyId);
        if (!company) throw new NotFoundException('Company not found');
        if (data.clientId !== null && String(company.clientId) !== String(data.clientId)) {
          throw new BadRequestException('Cross-tenant company assignment is not allowed');
        }

        if (item.roleId) {
          const role = await this.roleModel.findByPk(item.roleId);
          if (!role) throw new NotFoundException('Role not found');
          if (role.clientId !== null && data.clientId !== null && role.clientId !== data.clientId) {
            throw new BadRequestException('Cross-tenant role assignment is not allowed');
          }
        }
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(data.password, salt);

    const t = transaction || await this.userModel.sequelize.transaction();
    try {
      const user = await this.userModel.create({
        name: data.name,
        email: normalizedEmail,
        password: hashedPassword,
        clientId: data.clientId,
        status: data.status || 'Active',
        isActive: data.isActive !== undefined ? data.isActive : true,
      } as any, { transaction: t });

      // If companies are specified, add user to those companies
      if (data.companies && data.companies.length > 0) {
        for (const item of data.companies) {
          await this.userCompanyModel.create({
            userId: user.id,
            companyId: item.companyId,
            roleId: item.roleId || null,
            status: 'Active',
          } as any, { transaction: t });
        }
      }
      
      if (!transaction) await t.commit();
      
      let finalUser = user;
      try {
        const withRoles = await this.userModel.findByPk(user.id, {
          transaction: t,
          include: [
            { model: Role, through: { attributes: [] }, attributes: ['id', 'name', 'description'] }
          ]
        });
        if (withRoles) finalUser = withRoles;
      } catch (e) {
        // ignore
      }

      if (actor) {
        await this.auditService.writeDiffLog({
          clientId: user.clientId,
          companyId: user.lastCompanyId || null,
          userId: actor.userId,
          entityType: 'User',
          entityId: user.id,
          action: 'CREATE',
          newRecord: finalUser,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });
      }

      return finalUser as User;
    } catch (err) {
      if (!transaction) await t.rollback();
      throw err;
    }
  }

  async updateUser(
    id: number,
    data: {
      name?: string;
      email?: string;
      password?: string;
      isActive?: boolean;
      status?: string;
      lastCompanyId?: number;
      lastLogin?: Date;
    },
    actor?: any,
    transaction?: any,
  ): Promise<User> {
    const user = await this.userModel.findByPk(id);
    if (!user) throw new NotFoundException(`User #${id} not found`);

    const oldRecord = (await this.findByIdWithRoles(id))?.toJSON();

    if (data.email) {
      const normalizedEmail = data.email.toLowerCase().trim();
      const conflict = await this.userModel.findOne({ where: { email: normalizedEmail } });
      if (conflict && conflict.id !== id) throw new ConflictException('Email already in use');
      user.email = normalizedEmail;
    }

    if (data.password) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(data.password, salt);
    }

    if (data.name !== undefined) user.name = data.name;
    if (data.isActive !== undefined) user.isActive = data.isActive;
    if (data.status !== undefined) user.status = data.status;
    if (data.lastCompanyId !== undefined) {
      if (data.lastCompanyId !== null) {
        const company = await this.companyModel.findByPk(data.lastCompanyId);
        if (!company) throw new NotFoundException('Company not found');
      }
      user.lastCompanyId = data.lastCompanyId;
    }
    if (data.lastLogin !== undefined) user.lastLogin = data.lastLogin;

    await user.save({ transaction });
    const updatedUser = await this.findByIdWithRoles(id);

    if (actor) {
      let validCompanyId = null;
      if (user.lastCompanyId) {
        const companyExists = await this.companyModel.findByPk(user.lastCompanyId);
        if (companyExists) validCompanyId = user.lastCompanyId;
      }

      await this.auditService.writeDiffLog({
        clientId: user.clientId,
        companyId: validCompanyId,
        userId: actor.userId,
        entityType: 'User',
        entityId: id,
        action: 'UPDATE',
        oldRecord,
        newRecord: updatedUser,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }

    return updatedUser as User;
  }

  async deleteUser(id: number, actor?: any): Promise<{ message: string }> {
    const user = await this.userModel.findByPk(id);
    if (!user) throw new NotFoundException(`User #${id} not found`);
    const email = user.email;
    const oldRecord = (await this.findByIdWithRoles(id))?.toJSON();

    if (actor) {
      let validCompanyId = null;
      if (user.lastCompanyId) {
        const companyExists = await this.companyModel.findByPk(user.lastCompanyId);
        if (companyExists) validCompanyId = user.lastCompanyId;
      }

      await this.auditService.writeDiffLog({
        clientId: user.clientId,
        companyId: validCompanyId,
        userId: actor.userId,
        entityType: 'User',
        entityId: id,
        action: 'DELETE',
        oldRecord,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }

    // Clean up associated records that might not have ON DELETE CASCADE at the database level
    if (this.userModel.sequelize) {
      const models = this.userModel.sequelize.models;
      if (models.UserPreference) await models.UserPreference.destroy({ where: { userId: id } });
      if (models.UserPasswordHistory) await models.UserPasswordHistory.destroy({ where: { userId: id } });
      if (models.ProfileActivityLog) await models.ProfileActivityLog.destroy({ where: { userId: id } });
      if (models.UserSession) await models.UserSession.destroy({ where: { userId: id } });
      if (models.UserRole) await models.UserRole.destroy({ where: { userId: id } });
      if (models.UserCompany) await models.UserCompany.destroy({ where: { userId: id } });
    }

    await user.destroy();

    return { message: `User "${email}" deleted successfully` };
  }

  async countByClient(clientId: number): Promise<number> {
    return this.userModel.count({ where: { clientId } });
  }

  // Junction-specific helpers
  async addUserToCompany(userId: number, companyId: number, roleId?: number): Promise<UserCompany> {
    const user = await this.userModel.findByPk(userId);
    if (!user) throw new NotFoundException('User not found');

    const company = await this.companyModel.findByPk(companyId);
    if (!company) throw new NotFoundException('Company not found');
    if (user.clientId !== null && String(company.clientId) !== String(user.clientId)) {
      throw new BadRequestException('Cross-tenant company assignment is not allowed');
    }

    if (roleId) {
      const role = await this.roleModel.findByPk(roleId);
      if (!role) throw new NotFoundException('Role not found');
      if (role.clientId !== null && user.clientId !== null && role.clientId !== user.clientId) {
        throw new BadRequestException('Cross-tenant role assignment is not allowed');
      }
    }

    const existing = await this.userCompanyModel.findOne({ where: { userId, companyId } });
    if (existing) {
      if (roleId !== undefined) {
        existing.roleId = roleId;
        await existing.save();
      }
      return existing;
    }

    return this.userCompanyModel.create({
      userId,
      companyId,
      roleId: roleId || null,
      status: 'Active',
    } as any);
  }

  async removeUserFromCompany(userId: number, companyId: number): Promise<void> {
    const mapping = await this.userCompanyModel.findOne({ where: { userId, companyId } });
    if (mapping) {
      await mapping.destroy();
    }
  }

  async updateUserCompanyRole(userId: number, companyId: number, roleId: number | null, transaction?: any): Promise<UserCompany> {
    const mapping = await this.userCompanyModel.findOne({ where: { userId, companyId } });
    if (!mapping) throw new NotFoundException('User is not a member of this company');

    if (roleId) {
      const user = await this.userModel.findByPk(userId);
      const role = await this.roleModel.findByPk(roleId);
      if (!role) throw new NotFoundException('Role not found');
      if (user && user.clientId !== null && role.clientId !== null && role.clientId !== user.clientId) {
        throw new BadRequestException('Cross-tenant role assignment is not allowed');
      }
    }

    mapping.roleId = roleId;
    await mapping.save({ transaction });
    return mapping;
  }
}
