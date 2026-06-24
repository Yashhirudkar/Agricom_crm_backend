import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Client } from '../models/client.model';
import { User } from '../../users/models/user.model';
import { Role } from '../../rbac/models/role.model';
import { UserRole } from '../../rbac/models/user-role.model';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../../audit/services/audit.service';

@Injectable()
export class ClientsService {
  constructor(
    @InjectModel(Client)
    private readonly clientModel: typeof Client,
    @InjectModel(User)
    private readonly userModel: typeof User,
    @InjectModel(Role)
    private readonly roleModel: typeof Role,
    @InjectModel(UserRole)
    private readonly userRoleModel: typeof UserRole,
    private readonly auditService: AuditService,
  ) {}

  async create(data: any, actor?: any): Promise<Client> {
    const emailLower = data.email.toLowerCase().trim();

    // Check user table too to prevent duplicate registration
    const existingUser = await this.userModel.findOne({ where: { email: emailLower } });
    if (existingUser) throw new ConflictException('Email already in use by another user');

    const existingClient = await this.clientModel.findOne({ where: { email: emailLower } });
    if (existingClient) throw new ConflictException('Email already in use by another client');

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(data.password, salt);

    const t = await this.clientModel.sequelize.transaction();
    try {
      // 1. Create client row
      const client = await this.clientModel.create({
        ...data,
        password: hashedPassword,
      } as any, { transaction: t });

      // 2. Create matching User in users table
      const user = await this.userModel.create({
        name: `${client.name} Admin`,
        email: emailLower,
        password: hashedPassword,
        isActive: true,
        clientId: client.id,
        status: 'Active',
      } as any, { transaction: t });

      // 3. Resolve and Assign "Client Admin" role
      let role = await this.roleModel.findOne({ where: { name: 'Client Admin' }, transaction: t });
      if (!role) {
        role = await this.roleModel.create({
          name: 'Client Admin',
          description: 'Client level administrator with full access',
          isActive: true,
          companyId: null,
        } as any, { transaction: t });
      }

      await this.userRoleModel.create({
        userId: user.id,
        roleId: role.id,
      } as any, { transaction: t });
      
      await t.commit();
      
      // Wait to fetch or assign to variable if needed, but client is already defined
      // We will re-fetch it or just return it.
      Object.assign(client, { id: client.id }); // just to ensure we have the id
      
      if (actor) {
        await this.auditService.writeDiffLog({
          clientId: client.id,
          companyId: null,
          userId: actor.userId,
          entityType: 'Client',
          entityId: client.id,
          action: 'CREATE',
          newRecord: client,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });
      }

      return client;
    } catch (err) {
      await t.rollback();
      throw err;
    }


  }

  async findAll(query?: { search?: string; page?: number; limit?: number }): Promise<{ data: Client[]; meta: any }> {
    const { Op } = require('sequelize');
    const where: any = {};
    const search = query?.search;
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }
    
    const page = query?.page || 1;
    const limit = query?.limit || 20;
    const offset = (page - 1) * limit;

    const { rows, count } = await this.clientModel.findAndCountAll({
      where,
      limit,
      offset,
      attributes: { exclude: ['password'] },
      include: ['folderAccess', 'itemAccess', 'moduleAccess', 'actionAccess'],
      order: [['createdAt', 'DESC']],
      distinct: true,
    });

    return {
      data: rows,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  async findById(id: number): Promise<Client | null> {
    return this.clientModel.findByPk(id);
  }

  async findByEmail(email: string): Promise<Client | null> {
    const normalizedEmail = email.toLowerCase().trim();
    return this.clientModel.findOne({
      where: { email: normalizedEmail },
    });
  }

  async update(id: number, data: any, actor?: any): Promise<Client> {
    const client = await this.clientModel.findByPk(id);
    if (!client) throw new NotFoundException('Client not found');

    const oldRecord = client.toJSON();
    const oldEmail = client.email;
    const emailLower = data.email ? data.email.toLowerCase().trim() : null;

    if (emailLower && emailLower !== oldEmail) {
      const conflictUser = await this.userModel.findOne({ where: { email: emailLower } });
      if (conflictUser) throw new ConflictException('Email already in use');

      const conflictClient = await this.clientModel.findOne({ where: { email: emailLower } });
      if (conflictClient && conflictClient.id !== id) throw new ConflictException('Email already in use');

      client.email = emailLower;
    }

    let hashedPassword = '';
    if (data.password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(data.password, salt);
      client.password = hashedPassword;
    }

    if (data.name !== undefined) client.name = data.name;
    if (data.allowedCompanies !== undefined) client.allowedCompanies = data.allowedCompanies;
    if (data.allowedUsers !== undefined) client.allowedUsers = data.allowedUsers;
    if (data.isActive !== undefined) client.isActive = data.isActive;

    const t = await this.clientModel.sequelize.transaction();
    try {
      await client.save({ transaction: t });

      // Sync changes to the User table for the initial client admin user
      const userAdmin = await this.userModel.findOne({ where: { clientId: id, email: oldEmail }, transaction: t });
      if (userAdmin) {
        if (emailLower) userAdmin.email = emailLower;
        if (data.password) userAdmin.password = hashedPassword;
        if (data.name !== undefined) userAdmin.name = `${data.name} Admin`;
        if (data.isActive !== undefined) userAdmin.isActive = data.isActive;
        await userAdmin.save({ transaction: t });
      }
      
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    if (actor) {
      await this.auditService.writeDiffLog({
        clientId: id,
        companyId: null,
        userId: actor.userId,
        entityType: 'Client',
        entityId: id,
        action: 'UPDATE',
        oldRecord,
        newRecord: client,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }

    return client;
  }

  async delete(id: number, actor?: any): Promise<void> {
    const client = await this.clientModel.findByPk(id);
    if (!client) throw new NotFoundException('Client not found');

    const oldRecord = client.toJSON();

    const sequelize = this.clientModel.sequelize;
    if (sequelize) {
      const t = await sequelize.transaction();
      try {
        // 1. Delete user_companies memberships for users of this client
        await sequelize.query('DELETE FROM "user_companies" WHERE "userId" IN (SELECT id FROM "users" WHERE "clientId" = :clientId)', { replacements: { clientId: id }, transaction: t });
        // 2. Delete user_roles for users of this client
        await sequelize.query('DELETE FROM "user_roles" WHERE "userId" IN (SELECT id FROM "users" WHERE "clientId" = :clientId)', { replacements: { clientId: id }, transaction: t });
        // 3. Delete user_sessions for users of this client
        await sequelize.query('DELETE FROM "user_sessions" WHERE "userId" IN (SELECT id FROM "users" WHERE "clientId" = :clientId)', { replacements: { clientId: id }, transaction: t });
        // 4. Delete role_action_permissions for roles of this client (updated from legacy role_permissions)
        await sequelize.query('DELETE FROM "role_action_permissions" WHERE "role_id" IN (SELECT id FROM "roles" WHERE "clientId" = :clientId)', { replacements: { clientId: id }, transaction: t });
        // Clean up client access boundaries
        await sequelize.query('DELETE FROM "client_folder_access" WHERE "client_id" = :clientId', { replacements: { clientId: id }, transaction: t });
        await sequelize.query('DELETE FROM "client_item_access" WHERE "client_id" = :clientId', { replacements: { clientId: id }, transaction: t });
        await sequelize.query('DELETE FROM "client_module_access" WHERE "client_id" = :clientId', { replacements: { clientId: id }, transaction: t });
        await sequelize.query('DELETE FROM "client_action_access" WHERE "client_id" = :clientId', { replacements: { clientId: id }, transaction: t });
        // 5. Delete roles of this client
        await sequelize.query('DELETE FROM "roles" WHERE "clientId" = :clientId', { replacements: { clientId: id }, transaction: t });
        // 6. Delete companies belonging to this client
        await sequelize.query('DELETE FROM "companies" WHERE "clientId" = :clientId', { replacements: { clientId: id }, transaction: t });
        // 7. Delete users belonging to this client
        await sequelize.query('DELETE FROM "users" WHERE "clientId" = :clientId', { replacements: { clientId: id }, transaction: t });
        
        await client.destroy({ transaction: t });
        await t.commit();
      } catch (err) {
        await t.rollback();
        throw err;
      }
    } else {
      await client.destroy();
    }

    if (actor) {
      await this.auditService.writeDiffLog({
        clientId: id,
        companyId: null,
        userId: actor.userId,
        entityType: 'Client',
        entityId: id,
        action: 'DELETE',
        oldRecord,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }
  }

  async getClientsForOptions(search?: string, page: string = '1', limit: string = '10') {
    const { Op } = require('sequelize');
    const where: any = { isActive: true };
    
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const parsedPage = parseInt(page, 10) || 1;
    const parsedLimit = parseInt(limit, 10) || 10;
    
    const { rows, count } = await this.clientModel.findAndCountAll({
      where,
      attributes: ['id', 'name'],
      limit: parsedLimit,
      offset: (parsedPage - 1) * parsedLimit,
      order: [['name', 'ASC']],
    });

    return {
      data: rows.map(r => ({ value: r.id, label: r.name })),
      meta: {
        page: parsedPage,
        limit: parsedLimit,
        total: count,
        totalPages: Math.ceil(count / parsedLimit),
      }
    };
  }
}
