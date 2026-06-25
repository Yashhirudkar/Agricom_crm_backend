import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Role } from '../models/role.model';
import { RoleActionPermission } from '../models/role-action-permission.model';
import { ClientActionAccess } from '../../clients/models/client-action-access.model';
import { UserRole } from '../models/user-role.model';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';

import { AssignRoleToUserDto } from '../dto/assign-role-to-user.dto';
import { RemoveRoleFromUserDto } from '../dto/remove-role-from-user.dto';
import { User } from '../../users/models/user.model';
import { AuditService } from '../../audit/services/audit.service';
import { AuditContext } from '../../audit/audit.context';
import { Op } from 'sequelize';

@Injectable()
export class RbacService {
  constructor(
    @InjectModel(Role)
    private readonly roleModel: typeof Role,

    @InjectModel(RoleActionPermission)
    private readonly roleActionPermissionModel: typeof RoleActionPermission,
    @InjectModel(ClientActionAccess)
    private readonly clientActionAccessModel: typeof ClientActionAccess,
    @InjectModel(UserRole)
    private readonly userRoleModel: typeof UserRole,
    @InjectModel(User)
    private readonly userModel: typeof User,
    @Inject(forwardRef(() => AuditService))
    private readonly auditService: AuditService,
  ) {}

  // ─── Roles ─────────────────────────────────────────────────────────────────

  async createRole(dto: CreateRoleDto): Promise<Role> {
    const clientId = dto.clientId || null;
    const existing = await this.roleModel.findOne({
      where: { name: dto.name, clientId },
    });
    if (existing) {
      throw new ConflictException(
        `Role "${dto.name}" already exists for this client scope.`,
      );
    }
    const role = await this.roleModel.create({
      name: dto.name,
      description: dto.description,
      clientId,
      isSystemRole: dto.isSystemRole !== undefined ? dto.isSystemRole : false,
      isActive: true,
    });

    const store = AuditContext.getStore();
    if (store && store.userId) {
      await this.auditService.writeDiffLog({
        clientId: store.clientId || null,
        companyId: store.companyId || null,
        userId: store.userId,
        entityType: 'Role',
        entityId: role.id,
        action: 'CREATE',
        newRecord: role,
        ipAddress: store.ipAddress,
        userAgent: store.userAgent,
      });
    }

    return role;
  }

  async updateRole(dto: UpdateRoleDto): Promise<Role> {
    const role = await this.roleModel.findByPk(dto.id);
    if (!role) {
      throw new NotFoundException(`Role with id ${dto.id} not found`);
    }
    if (dto.name && dto.name !== role.name) {
      const conflict = await this.roleModel.findOne({
        where: { name: dto.name, clientId: role.clientId || null },
      });
      if (conflict) {
        throw new ConflictException(
          `Role name "${dto.name}" is already taken for this client scope.`,
        );
      }
    }
    const oldRecord = role.toJSON();

    await role.update({
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });

    const updatedRole = await role.reload();

    const store = AuditContext.getStore();
    if (store && store.userId) {
      await this.auditService.writeDiffLog({
        clientId: store.clientId || null,
        companyId: store.companyId || null,
        userId: store.userId,
        entityType: 'Role',
        entityId: updatedRole.id,
        action: 'UPDATE',
        oldRecord,
        newRecord: updatedRole,
        ipAddress: store.ipAddress,
        userAgent: store.userAgent,
      });
    }

    return updatedRole;
  }

  async deleteRole(id: number): Promise<{ message: string }> {
    const role = await this.roleModel.findByPk(id);
    if (!role) {
      throw new NotFoundException(`Role with id ${id} not found`);
    }
    if (role.isSystemRole) {
      throw new BadRequestException(
        `Cannot delete system-wide role "${role.name}"`,
      );
    }
    const oldRecord = role.toJSON();
    await role.destroy();

    const store = AuditContext.getStore();
    if (store && store.userId) {
      await this.auditService.writeDiffLog({
        clientId: store.clientId || null,
        companyId: store.companyId || null,
        userId: store.userId,
        entityType: 'Role',
        entityId: id,
        action: 'DELETE',
        oldRecord,
        ipAddress: store.ipAddress,
        userAgent: store.userAgent,
      });
    }

    return { message: `Role "${role.name}" deleted successfully` };
  }

  async getRoles(query?: {
    clientId?: number | null;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: Role[]; meta: any }> {
    const where: any = {};
    const clientId = query?.clientId;
    if (clientId !== undefined && clientId !== null) {
      where[Op.or] = [{ clientId: null, isSystemRole: true }, { clientId }];
    }
    if (query?.search) {
      where.name = { [Op.iLike]: `%${query.search}%` };
    }

    const page = query?.page || 1;
    const limit = query?.limit || 20;
    const offset = (page - 1) * limit;

    const { rows, count } = await this.roleModel.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
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

  async getRolesForOptions(
    clientId: number | null,
    search?: string,
    page: string = '1',
    limit: string = '10',
  ) {
    const where: any = { isActive: true };
    if (clientId !== null) {
      where[Op.or] = [{ clientId: null, isSystemRole: true }, { clientId }];
    }

    if (search) {
      where.name = { [Op.iLike]: `%${search}%` };
    }

    const parsedPage = parseInt(page, 10) || 1;
    const parsedLimit = parseInt(limit, 10) || 10;

    const { rows, count } = await this.roleModel.findAndCountAll({
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

  async getRoleById(id: number): Promise<Role> {
    const role = await this.roleModel.findByPk(id);
    if (!role) {
      throw new NotFoundException(`Role with id ${id} not found`);
    }
    return role;
  }

  async getRolePermissions(roleId: number): Promise<Role> {
    const role = await this.roleModel.findByPk(roleId, {
      include: [
        {
          model: RoleActionPermission,
          include: ['resourceAction'],
        },
      ],
    });
    if (!role) throw new NotFoundException(`Role with id ${roleId} not found`);
    return role;
  }

  // ─── User ↔ Role ───────────────────────────────────────────────────────────

  async assignRoleToUser(
    dto: AssignRoleToUserDto,
  ): Promise<{ message: string }> {
    const user = await this.userModel.findByPk(dto.userId);
    if (!user)
      throw new NotFoundException(`User with id ${dto.userId} not found`);

    const role = await this.roleModel.findByPk(dto.roleId);
    if (!role)
      throw new NotFoundException(`Role with id ${dto.roleId} not found`);

    const existing = await this.userRoleModel.findOne({
      where: { userId: dto.userId, roleId: dto.roleId },
    });
    if (existing) {
      throw new ConflictException(
        `Role "${role.name}" is already assigned to user "${user.email}"`,
      );
    }

    await this.userRoleModel.create({
      userId: dto.userId,
      roleId: dto.roleId,
    });

    return {
      message: `Role "${role.name}" assigned to user "${user.email}" successfully`,
    };
  }

  async removeRoleFromUser(
    dto: RemoveRoleFromUserDto,
  ): Promise<{ message: string }> {
    const user = await this.userModel.findByPk(dto.userId);
    if (!user)
      throw new NotFoundException(`User with id ${dto.userId} not found`);

    const role = await this.roleModel.findByPk(dto.roleId);
    if (!role)
      throw new NotFoundException(`Role with id ${dto.roleId} not found`);

    const record = await this.userRoleModel.findOne({
      where: { userId: dto.userId, roleId: dto.roleId },
    });
    if (!record) {
      throw new NotFoundException(
        `Role "${role.name}" is not assigned to user "${user.email}"`,
      );
    }

    await record.destroy();
    return {
      message: `Role "${role.name}" removed from user "${user.email}" successfully`,
    };
  }

  async getUserRoles(
    userId: number,
  ): Promise<{ userId: number; roles: Role[] }> {
    const user = await this.userModel.findByPk(userId);
    if (!user) throw new NotFoundException(`User with id ${userId} not found`);

    const userRoles = await this.userRoleModel.findAll({
      where: { userId },
      include: [
        {
          model: Role,
          include: [
            {
              model: RoleActionPermission,
              include: ['resourceAction'],
            },
          ],
        },
      ],
    });

    return {
      userId,
      roles: userRoles.map((ur) => ur.role),
    };
  }

  async getUserById(id: number): Promise<User> {
    const user = await this.userModel.findByPk(id);
    if (!user) throw new NotFoundException(`User with id ${id} not found`);
    return user;
  }

  async updateRolePermissions(
    roleId: number,
    permissionIds: number[],
  ): Promise<{ message: string }> {
    const role = await this.roleModel.findByPk(roleId);
    if (!role) throw new NotFoundException(`Role with id ${roleId} not found`);

    const t = await this.roleActionPermissionModel.sequelize.transaction();
    try {
      // Lock the parent role to serialize concurrent requests for the same role
      await this.roleModel.findOne({
        where: { id: roleId },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      // Strict inheritance check for Client roles
      if (role.clientId) {
        const allowedActions = await this.clientActionAccessModel.findAll({
          where: { client_id: role.clientId },
          transaction: t,
        });
        const allowedIds = allowedActions.map((a) => a.resource_action_id);

        for (const reqId of permissionIds) {
          if (!allowedIds.includes(reqId)) {
            throw new ForbiddenException(
              `Client does not have access to resource action ID ${reqId}`,
            );
          }
        }
      }

      // Remove existing associations
      await this.roleActionPermissionModel.destroy({
        where: { role_id: roleId },
        transaction: t,
      });

      // Bulk insert new associations
      if (permissionIds.length > 0) {
        const uniquePermissionIds = [...new Set(permissionIds)];
        const records = uniquePermissionIds.map((permId) => ({
          role_id: roleId,
          resource_action_id: permId,
        }));
        await this.roleActionPermissionModel.bulkCreate(records, {
          transaction: t,
        });
      }

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    const store = AuditContext.getStore();
    if (store && store.userId) {
      await this.auditService.writeLog({
        clientId: store.clientId || null,
        companyId: store.companyId || null,
        userId: store.userId,
        entityType: 'RoleActionPermission',
        entityId: roleId,
        action: 'UPDATE',
        newValue: { permissionIds },
        ipAddress: store.ipAddress,
        userAgent: store.userAgent,
      });
    }

    return { message: 'Permissions updated successfully' };
  }
}
