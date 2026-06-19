import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel, InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { UsersService } from '../../users/services/users.service';
import { ClientsService } from '../../clients/services/clients.service';
import { UserSession } from '../../users/models/user-session.model';
import { LoginDto } from '../dto/login.dto';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly clientsService: ClientsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectModel(UserSession)
    private readonly userSessionModel: typeof UserSession,
    @InjectConnection()
    private readonly sequelize: Sequelize,
  ) {}

  async generateSessionTokens(
    userId: number | null,
    clientId: number | null,
    email: string,
    type: 'super_admin' | 'client_admin' | 'user',
    ipAddress?: string,
    userAgent?: string,
    transaction?: any,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const sessionId = crypto.randomUUID();

    // Sign Access Token - Include type and client/user IDs
    const payload = { 
      sub: userId || clientId, // generic subject
      userId, 
      clientId, 
      email, 
      type, 
      sessionId 
    };
    
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: (this.configService.get<string>('JWT_ACCESS_EXPIRES') || '15m') as any,
    });

    // Generate Refresh Token
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const expiryDays = parseInt(this.configService.get<string>('REFRESH_TOKEN_EXPIRES_DAYS') || '30', 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    await this.userSessionModel.create(
      {
        sessionId,
        userId,
        clientId,
        refreshTokenHash,
        ipAddress,
        userAgent,
        expiresAt,
        lastUsedAt: new Date(),
        isRevoked: false,
      } as any,
      { transaction },
    );

    return { accessToken, refreshToken };
  }

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string) {
    const { email, password } = loginDto;
    const emailLower = email.toLowerCase().trim();

    // 1. Check users table first (Super Admin, Client Admin, standard Users all reside here now)
    const user = await this.usersService.findByEmail(emailLower);
    if (user) {
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid email or password');
      }
      
      if (user.status === 'Suspended' || user.status === 'Inactive' || !user.isActive) {
        throw new UnauthorizedException('User account is suspended or inactive');
      }

      // Determine type
      let type: 'super_admin' | 'client_admin' | 'user' = 'user';
      const hasSuperAdminRole = user.roles?.some((r) => r.name === 'Admin');
      const hasClientAdminRole = user.roles?.some((r) => r.name === 'Client Admin');

      if (hasSuperAdminRole || (user.clientId === null && user.email === 'admin@agricom.com')) {
        type = 'super_admin';
      } else if (hasClientAdminRole) {
        type = 'client_admin';
      }

      const tokens = await this.generateSessionTokens(user.id, user.clientId, user.email, type, ipAddress, userAgent);

      // Load user workspaces
      const fullUser = await this.usersService.findByIdWithRoles(user.id);
      let workspaces = [];

      if (type === 'client_admin') {
        const allCompanies = await this.userSessionModel.sequelize!.query(
          `SELECT id, name, status FROM "companies" WHERE "clientId" = :clientId AND "isActive" = true;`,
          {
            replacements: { clientId: user.clientId },
            type: 'SELECT'
          }
        ) as any[];

        workspaces = allCompanies.map(c => ({
          id: c.id,
          name: c.name,
          role: { id: 0, name: 'Client Admin' },
          status: c.status || 'Active',
        }));
      } else {
        workspaces = fullUser?.userCompanies?.map((uc) => ({
          id: uc.company?.id,
          name: uc.company?.name,
          role: uc.role ? { id: uc.role.id, name: uc.role.name } : null,
          status: uc.status,
        })) || [];
      }

      // Update last login
      await this.usersService.updateUser(user.id, { lastLogin: new Date() });

      let employeeId: number | null = null;
      const companyIdToQuery = user.lastCompanyId;
      let queryStr = `SELECT id FROM "employees" WHERE "userId" = :userId`;
      const replacements: any = { userId: user.id };
      if (companyIdToQuery) {
        queryStr += ` AND "companyId" = :companyId`;
        replacements.companyId = companyIdToQuery;
      }
      queryStr += ` LIMIT 1;`;

      const employee = await this.userSessionModel.sequelize!.query(
        queryStr,
        {
          replacements,
          type: 'SELECT'
        }
      ) as any[];
      if (employee && employee.length > 0) {
        employeeId = employee[0].id;
      } else {
        // Fallback: If employees.userId is NULL, fix employee-user linking by email
        let fallbackQueryStr = `SELECT id FROM "employees" WHERE "email" = :email AND "userId" IS NULL`;
        const fallbackReplacements: any = { email: user.email };
        if (companyIdToQuery) {
          fallbackQueryStr += ` AND "companyId" = :companyId`;
          fallbackReplacements.companyId = companyIdToQuery;
        }
        fallbackQueryStr += ` LIMIT 1;`;

        const fallbackEmployee = await this.userSessionModel.sequelize!.query(
          fallbackQueryStr,
          {
            replacements: fallbackReplacements,
            type: 'SELECT'
          }
        ) as any[];

        if (fallbackEmployee && fallbackEmployee.length > 0) {
          employeeId = fallbackEmployee[0].id;
          // Update the DB to permanently link the user and employee
          await this.userSessionModel.sequelize!.query(
            `UPDATE "employees" SET "userId" = :userId WHERE "id" = :empId;`,
            {
              replacements: { userId: user.id, empId: employeeId }
            }
          );
        }
      }

      return {
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          type,
          status: user.status,
          clientId: user.clientId,
          lastCompanyId: user.lastCompanyId,
          isActive: user.isActive,
          employeeId,
        },
        workspaces,
      };
    }

    // 2. Legacy fallback check on clients table (only for backward compatibility)
    const client = await this.clientsService.findByEmail(emailLower);
    if (client) {
      const isPasswordValid = await bcrypt.compare(password, client.password);
      if (!isPasswordValid) throw new UnauthorizedException('Invalid email or password');
      if (!client.isActive) throw new UnauthorizedException('Client is inactive');

      // Auto-create/sync User in users table if not exists
      const UserModel = this.sequelize.models.User;
      const RoleModel = this.sequelize.models.Role;
      const UserRoleModel = this.sequelize.models.UserRole;

      let user = await UserModel.findOne({ where: { email: emailLower } }) as any;
      if (!user) {
        user = await UserModel.create({
          name: client.name,
          email: client.email,
          password: client.password, // already hashed
          clientId: client.id,
          status: 'Active',
          isActive: true,
        } as any);

        const clientAdminRole = await RoleModel.findOne({ where: { name: 'Client Admin' } }) as any;
        if (clientAdminRole) {
          await UserRoleModel.create({
            userId: user.id,
            roleId: clientAdminRole.id
          } as any);
        }
      }

      const tokens = await this.generateSessionTokens(user.id, user.clientId, user.email, 'client_admin', ipAddress, userAgent);

      const allCompanies = await this.userSessionModel.sequelize!.query(
        `SELECT id, name, status FROM "companies" WHERE "clientId" = :clientId AND "isActive" = true;`,
        {
          replacements: { clientId: client.id },
          type: 'SELECT'
        }
      ) as any[];

      const workspaces = allCompanies.map(c => ({
        id: c.id,
        name: c.name,
        role: { id: 0, name: 'Client Admin' },
        status: c.status || 'Active',
      }));

      // Update last login
      await this.usersService.updateUser(user.id, { lastLogin: new Date() });

      let employeeId: number | null = null;
      const companyIdToQuery = user.lastCompanyId;
      let queryStr = `SELECT id FROM "employees" WHERE "userId" = :userId`;
      const replacements: any = { userId: user.id };
      if (companyIdToQuery) {
        queryStr += ` AND "companyId" = :companyId`;
        replacements.companyId = companyIdToQuery;
      }
      queryStr += ` LIMIT 1;`;

      const employee = await this.userSessionModel.sequelize!.query(
        queryStr,
        {
          replacements,
          type: 'SELECT'
        }
      ) as any[];
      if (employee && employee.length > 0) {
        employeeId = employee[0].id;
      }

      return {
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          type: 'client_admin',
          status: user.status,
          clientId: user.clientId,
          lastCompanyId: user.lastCompanyId,
          isActive: user.isActive,
          employeeId,
        },
        workspaces,
      };
    }

    throw new UnauthorizedException('Invalid email or password');
  }

  async refresh(refreshToken: string, ipAddress?: string, userAgent?: string) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const transaction = await this.sequelize.transaction();

    try {
      const session = await this.userSessionModel.findOne({
        where: { refreshTokenHash: tokenHash },
        lock: transaction.LOCK.UPDATE,
        transaction,
      });

      if (!session) throw new UnauthorizedException('Invalid refresh token');
      if (session.isRevoked) throw new UnauthorizedException('Session has been revoked');
      if (session.expiresAt < new Date()) throw new UnauthorizedException('Session has expired');

      session.isRevoked = true;
      await session.save({ transaction });

      let email = '';
      let type: 'super_admin' | 'client_admin' | 'user' = 'user';

      if (session.userId) {
        const user = await this.usersService.findByIdWithRoles(session.userId);
        if (!user || user.status === 'Suspended' || !user.isActive) {
          throw new UnauthorizedException('User not found or inactive');
        }
        email = user.email;
        if (user.clientId === null) {
          type = 'super_admin';
        } else {
          const hasClientAdminRole = user.roles?.some((r) => r.name === 'Client Admin');
          if (hasClientAdminRole) {
            type = 'client_admin';
          }
        }
      } else if (session.clientId) {
        // Fallback for legacy client admin sessions
        const client = await this.clientsService.findById(session.clientId);
        if (!client || !client.isActive) throw new UnauthorizedException('Client not found or inactive');
        email = client.email;
        type = 'client_admin';
      } else {
        throw new UnauthorizedException('Invalid session owner');
      }

      const tokens = await this.generateSessionTokens(session.userId, session.clientId, email, type, ipAddress, userAgent, transaction);
      await transaction.commit();

      return tokens;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async logout(sessionId: string) {
    if (!sessionId) throw new UnauthorizedException('Invalid session');
    const session = await this.userSessionModel.findOne({ where: { sessionId, isRevoked: false } });
    if (session) {
      session.isRevoked = true;
      await session.save();
    }
    return { message: 'Logged out successfully from this device.' };
  }

  async logoutAll(userId: number | null, clientId: number | null) {
    const where: any = { isRevoked: false };
    if (userId) where.userId = userId;
    if (clientId) where.clientId = clientId;

    await this.userSessionModel.update({ isRevoked: true }, { where });
    return { message: 'Logged out successfully from all devices.' };
  }
}
