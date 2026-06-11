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

    // 1. Create client row
    const client = await this.clientModel.create({
      ...data,
      password: hashedPassword,
    } as any);

    try {
      // 2. Create matching User in users table
      const user = await this.userModel.create({
        name: `${client.name} Admin`,
        email: emailLower,
        password: hashedPassword,
        isActive: true,
        clientId: client.id,
        status: 'Active',
      } as any);

      // 3. Resolve and Assign "Client Admin" role
      let role = await this.roleModel.findOne({ where: { name: 'Client Admin' } });
      if (!role) {
        role = await this.roleModel.create({
          name: 'Client Admin',
          description: 'Client level administrator with full access',
          isActive: true,
          companyId: null,
        } as any);
      }

      await this.userRoleModel.create({
        userId: user.id,
        roleId: role.id,
      } as any);

    } catch (err) {
      // Rollback client creation if user setup fails
      await client.destroy();
      throw err;
    }

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
  }

  async findAll(): Promise<Client[]> {
    return this.clientModel.findAll({
      attributes: { exclude: ['password'] },
      order: [['createdAt', 'DESC']],
    });
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

    await client.save();

    // Sync changes to the User table for the initial client admin user
    const userAdmin = await this.userModel.findOne({ where: { clientId: id, email: oldEmail } });
    if (userAdmin) {
      if (emailLower) userAdmin.email = emailLower;
      if (data.password) userAdmin.password = hashedPassword;
      if (data.name !== undefined) userAdmin.name = `${data.name} Admin`;
      if (data.isActive !== undefined) userAdmin.isActive = data.isActive;
      await userAdmin.save();
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
      // 1. Delete user_companies memberships for users of this client
      await sequelize.query('DELETE FROM "user_companies" WHERE "userId" IN (SELECT id FROM "users" WHERE "clientId" = :clientId)', { replacements: { clientId: id } });
      // 2. Delete user_roles for users of this client
      await sequelize.query('DELETE FROM "user_roles" WHERE "userId" IN (SELECT id FROM "users" WHERE "clientId" = :clientId)', { replacements: { clientId: id } });
      // 3. Delete user_sessions for users of this client
      await sequelize.query('DELETE FROM "user_sessions" WHERE "userId" IN (SELECT id FROM "users" WHERE "clientId" = :clientId)', { replacements: { clientId: id } });
      // 4. Delete role_permissions for roles of this client
      await sequelize.query('DELETE FROM "role_permissions" WHERE "roleId" IN (SELECT id FROM "roles" WHERE "clientId" = :clientId)', { replacements: { clientId: id } });
      // 5. Delete roles of this client
      await sequelize.query('DELETE FROM "roles" WHERE "clientId" = :clientId', { replacements: { clientId: id } });
      // 6. Delete companies belonging to this client
      await sequelize.query('DELETE FROM "companies" WHERE "clientId" = :clientId', { replacements: { clientId: id } });
      // 7. Delete users belonging to this client
      await sequelize.query('DELETE FROM "users" WHERE "clientId" = :clientId', { replacements: { clientId: id } });
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

    await client.destroy();
  }
}
