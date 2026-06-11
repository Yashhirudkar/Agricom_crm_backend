import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from '../services/users.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { InjectModel } from '@nestjs/sequelize';
import { Client } from '../../clients/models/client.model';
import { Company } from '../../companies/models/company.model';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    @InjectModel(Client)
    private readonly clientModel: typeof Client,
    @InjectModel(Company)
    private readonly companyModel: typeof Company,
  ) {}

  @Get('GetUsers')
  @RequirePermission('users:read')
  async getUsers(
    @Request() req,
    @Query('companyId') companyId?: string,
    @Query('roleId') roleId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('clientId') filterClientId?: string,
  ) {
    if (req.user.type === 'user') throw new ForbiddenException('Access denied');

    const isSuper = req.user.type === 'super_admin';
    const clientId = isSuper
      ? (filterClientId ? parseInt(filterClientId, 10) : null)
      : req.user.clientId;

    const filters: any = {
      clientId,
      status,
      search,
    };
    if (companyId) filters.companyId = parseInt(companyId, 10);
    if (roleId) filters.roleId = parseInt(roleId, 10);

    const users = await this.usersService.getUsers(filters);

    if (!isSuper && clientId) {
      const client = await this.clientModel.findByPk(clientId);
      const currentCount = await this.usersService.countByClient(clientId);
      return {
        users,
        meta: {
          clientId,
          clientName: client?.name,
          maxUsers: client?.allowedUsers ?? 15,
          currentUsers: currentCount,
          canAddMore: currentCount < (client?.allowedUsers ?? 15),
        },
      };
    }

    return { users, meta: null };
  }

  @Post('CreateUser')
  @RequirePermission('users:create')
  @HttpCode(HttpStatus.CREATED)
  async createUser(@Body() dto: any, @Request() req) {
    if (req.user.type === 'user') throw new ForbiddenException('Access denied');

    const isSuper = req.user.type === 'super_admin';
    let targetClientId = req.user.clientId;

    if (isSuper) {
      if (!dto.clientId) {
        throw new ForbiddenException('Super Admin must specify a clientId to create a user');
      }
      targetClientId = dto.clientId;
    }

    const client = await this.clientModel.findByPk(targetClientId);
    if (!client) throw new ForbiddenException('Client not found');

    const currentCount = await this.usersService.countByClient(targetClientId);
    if (currentCount >= client.allowedUsers) {
      throw new ForbiddenException(`User limit reached. Maximum allowed: ${client.allowedUsers}`);
    }

    const actor = {
      userId: req.user.userId || req.user.sub || null,
      clientId: req.user.clientId || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };

    return this.usersService.createUser({
      ...dto,
      clientId: targetClientId,
    }, actor);
  }

  @Post('UpdateUser')
  @RequirePermission('users:update')
  @HttpCode(HttpStatus.OK)
  async updateUser(@Body() dto: any, @Request() req) {
    if (req.user.type === 'user') throw new ForbiddenException('Access denied');

    const isSuper = req.user.type === 'super_admin';

    if (!isSuper) {
      const targetUser = await this.usersService.findById(dto.id);
      if (!targetUser) throw new ForbiddenException('User not found');

      if (targetUser.clientId !== req.user.clientId) {
        throw new ForbiddenException('You can only update users in your own client organization');
      }
    }

    const actor = {
      userId: req.user.userId || req.user.sub || null,
      clientId: req.user.clientId || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };

    // Adapt user update
    const updatedUser = await this.usersService.updateUser(dto.id, dto, actor);

    // If company memberships / roles are specified inside dto.companies, update them contextually
    if (dto.companies) {
      for (const item of dto.companies) {
        if (item.remove) {
          await this.usersService.removeUserFromCompany(dto.id, item.companyId);
        } else {
          await this.usersService.addUserToCompany(dto.id, item.companyId, item.roleId);
        }
      }
    }

    return this.usersService.findByIdWithRoles(dto.id);
  }

  @Post('DeleteUser')
  @RequirePermission('users:delete')
  @HttpCode(HttpStatus.OK)
  async deleteUser(@Body() dto: { id: number }, @Request() req) {
    if (req.user.type === 'user') throw new ForbiddenException('Access denied');

    const isSuper = req.user.type === 'super_admin';

    if (!isSuper) {
      const targetUser = await this.usersService.findById(dto.id);
      if (!targetUser) throw new ForbiddenException('User not found');

      if (targetUser.clientId !== req.user.clientId) {
        throw new ForbiddenException('You can only delete users in your own client organization');
      }
    }

    if (dto.id === req.user.id) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    const actor = {
      userId: req.user.userId || req.user.sub || null,
      clientId: req.user.clientId || null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };

    return this.usersService.deleteUser(dto.id, actor);
  }

  @Get('GetUserById')
  @RequirePermission('users:read')
  async getUserById(@Query('id', ParseIntPipe) id: number, @Request() req) {
    if (req.user.type === 'user') throw new ForbiddenException('Access denied');

    const isSuper = req.user.type === 'super_admin';
    const user = await this.usersService.findByIdWithRoles(id);
    if (!user) throw new ForbiddenException('User not found');

    if (!isSuper) {
      if (user.clientId !== req.user.clientId) {
        throw new ForbiddenException('Access denied');
      }
    }

    const { password, ...safeUser } = (user as any).toJSON();
    return safeUser;
  }

  @Post('AssignUserToCompany')
  @RequirePermission('users:update')
  @HttpCode(HttpStatus.OK)
  async assignUserToCompany(@Body() dto: { userId: number; companyId: number; roleId?: number }, @Request() req) {
    if (req.user.type === 'user') throw new ForbiddenException('Access denied');

    const isSuper = req.user.type === 'super_admin';
    const targetUser = await this.usersService.findById(dto.userId);
    if (!targetUser) throw new NotFoundException('User not found');

    const company = await this.companyModel.findByPk(dto.companyId);
    if (!company) throw new NotFoundException('Company not found');

    if (!isSuper) {
      if (targetUser.clientId !== req.user.clientId) {
        throw new ForbiddenException('User does not belong to your client organization');
      }
      if (company.clientId !== req.user.clientId) {
        throw new ForbiddenException('Company does not belong to your client organization');
      }
    }

    return this.usersService.addUserToCompany(dto.userId, dto.companyId, dto.roleId);
  }

  @Post('RemoveUserFromCompany')
  @RequirePermission('users:update')
  @HttpCode(HttpStatus.OK)
  async removeUserFromCompany(@Body() dto: { userId: number; companyId: number }, @Request() req) {
    if (req.user.type === 'user') throw new ForbiddenException('Access denied');

    const isSuper = req.user.type === 'super_admin';
    const targetUser = await this.usersService.findById(dto.userId);
    if (!targetUser) throw new NotFoundException('User not found');

    if (!isSuper) {
      if (targetUser.clientId !== req.user.clientId) {
        throw new ForbiddenException('User does not belong to your client organization');
      }
    }

    await this.usersService.removeUserFromCompany(dto.userId, dto.companyId);
    return { success: true, message: 'User removed from company workspace' };
  }

  @Post('UpdateUserCompanyRole')
  @RequirePermission('users:update')
  @HttpCode(HttpStatus.OK)
  async updateUserCompanyRole(@Body() dto: { userId: number; companyId: number; roleId: number | null }, @Request() req) {
    if (req.user.type === 'user') throw new ForbiddenException('Access denied');

    const isSuper = req.user.type === 'super_admin';
    const targetUser = await this.usersService.findById(dto.userId);
    if (!targetUser) throw new NotFoundException('User not found');

    if (!isSuper) {
      if (targetUser.clientId !== req.user.clientId) {
        throw new ForbiddenException('User does not belong to your client organization');
      }
    }

    return this.usersService.updateUserCompanyRole(dto.userId, dto.companyId, dto.roleId);
  }
}
