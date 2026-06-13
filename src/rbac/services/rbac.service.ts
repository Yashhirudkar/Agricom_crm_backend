import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Role } from '../models/role.model';
import { Permission } from '../models/permission.model';
import { RolePermission } from '../models/role-permission.model';
import { UserRole } from '../models/user-role.model';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { CreatePermissionDto } from '../dto/create-permission.dto';
import { UpdatePermissionDto } from '../dto/update-permission.dto';
import { AssignPermissionToRoleDto } from '../dto/assign-permission-to-role.dto';
import { RemovePermissionFromRoleDto } from '../dto/remove-permission-from-role.dto';
import { AssignRoleToUserDto } from '../dto/assign-role-to-user.dto';
import { RemoveRoleFromUserDto } from '../dto/remove-role-from-user.dto';
import { User } from '../../users/models/user.model';
import { Op } from 'sequelize';

@Injectable()
export class RbacService {
  constructor(
    @InjectModel(Role)
    private readonly roleModel: typeof Role,
    @InjectModel(Permission)
    private readonly permissionModel: typeof Permission,
    @InjectModel(RolePermission)
    private readonly rolePermissionModel: typeof RolePermission,
    @InjectModel(UserRole)
    private readonly userRoleModel: typeof UserRole,
    @InjectModel(User)
    private readonly userModel: typeof User,
  ) {}

  // ─── Roles ─────────────────────────────────────────────────────────────────

  async createRole(dto: CreateRoleDto): Promise<Role> {
    const clientId = dto.clientId || null;
    const existing = await this.roleModel.findOne({
      where: { name: dto.name, clientId },
    });
    if (existing) {
      throw new ConflictException(`Role "${dto.name}" already exists for this client scope.`);
    }
    return this.roleModel.create({
      name: dto.name,
      description: dto.description,
      clientId,
      isSystemRole: dto.isSystemRole !== undefined ? dto.isSystemRole : false,
      isActive: true,
    } as any);
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
        throw new ConflictException(`Role name "${dto.name}" is already taken for this client scope.`);
      }
    }
    await role.update({
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
    return role.reload();
  }

  async deleteRole(id: number): Promise<{ message: string }> {
    const role = await this.roleModel.findByPk(id);
    if (!role) {
      throw new NotFoundException(`Role with id ${id} not found`);
    }
    if (role.isSystemRole) {
      throw new BadRequestException(`Cannot delete system-wide role "${role.name}"`);
    }
    await role.destroy();
    return { message: `Role "${role.name}" deleted successfully` };
  }

  async getRoles(clientId?: number | null): Promise<Role[]> {
    const where: any = {};
    if (clientId !== undefined && clientId !== null) {
      where[Op.or] = [
        { clientId: null, isSystemRole: true },
        { clientId }
      ];
    }
    return this.roleModel.findAll({
      where,
      include: [{ model: Permission, through: { attributes: [] } }],
      order: [['createdAt', 'DESC']],
    });
  }

  async getRoleById(id: number): Promise<Role> {
    const role = await this.roleModel.findByPk(id, {
      include: [{ model: Permission, through: { attributes: [] } }],
    });
    if (!role) {
      throw new NotFoundException(`Role with id ${id} not found`);
    }
    return role;
  }

  // ─── Permissions ───────────────────────────────────────────────────────────

  async createPermission(dto: CreatePermissionDto): Promise<Permission> {
    const existing = await this.permissionModel.findOne({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Permission "${dto.name}" already exists`);
    }
    return this.permissionModel.create({
      name: dto.name,
      description: dto.description,
      resource: dto.resource,
      action: dto.action,
    } as any);
  }

  async updatePermission(dto: UpdatePermissionDto): Promise<Permission> {
    const permission = await this.permissionModel.findByPk(dto.id);
    if (!permission) {
      throw new NotFoundException(`Permission with id ${dto.id} not found`);
    }
    if (dto.name && dto.name !== permission.name) {
      const conflict = await this.permissionModel.findOne({ where: { name: dto.name } });
      if (conflict) {
        throw new ConflictException(`Permission name "${dto.name}" is already taken`);
      }
    }
    await permission.update({
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.resource !== undefined && { resource: dto.resource }),
      ...(dto.action !== undefined && { action: dto.action }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
    return permission.reload();
  }

  async deletePermission(id: number): Promise<{ message: string }> {
    const permission = await this.permissionModel.findByPk(id);
    if (!permission) {
      throw new NotFoundException(`Permission with id ${id} not found`);
    }
    await permission.destroy();
    return { message: `Permission "${permission.name}" deleted successfully` };
  }

  async getPermissions(): Promise<Permission[]> {
    return this.permissionModel.findAll({
      order: [['resource', 'ASC'], ['action', 'ASC']],
    });
  }

  async getPermissionById(id: number): Promise<Permission> {
    const permission = await this.permissionModel.findByPk(id);
    if (!permission) {
      throw new NotFoundException(`Permission with id ${id} not found`);
    }
    return permission;
  }

  // ─── Role ↔ Permission ─────────────────────────────────────────────────────

  async assignPermissionToRole(dto: AssignPermissionToRoleDto): Promise<{ message: string }> {
    const role = await this.roleModel.findByPk(dto.roleId);
    if (!role) throw new NotFoundException(`Role with id ${dto.roleId} not found`);

    const permission = await this.permissionModel.findByPk(dto.permissionId);
    if (!permission) throw new NotFoundException(`Permission with id ${dto.permissionId} not found`);

    const existing = await this.rolePermissionModel.findOne({
      where: { roleId: dto.roleId, permissionId: dto.permissionId },
    });
    if (existing) {
      throw new ConflictException(`Permission "${permission.name}" is already assigned to role "${role.name}"`);
    }

    await this.rolePermissionModel.create({
      roleId: dto.roleId,
      permissionId: dto.permissionId,
    } as any);

    return {
      message: `Permission "${permission.name}" assigned to role "${role.name}" successfully`,
    };
  }

  async removePermissionFromRole(dto: RemovePermissionFromRoleDto): Promise<{ message: string }> {
    const role = await this.roleModel.findByPk(dto.roleId);
    if (!role) throw new NotFoundException(`Role with id ${dto.roleId} not found`);

    const permission = await this.permissionModel.findByPk(dto.permissionId);
    if (!permission) throw new NotFoundException(`Permission with id ${dto.permissionId} not found`);

    const record = await this.rolePermissionModel.findOne({
      where: { roleId: dto.roleId, permissionId: dto.permissionId },
    });
    if (!record) {
      throw new NotFoundException(
        `Permission "${permission.name}" is not assigned to role "${role.name}"`,
      );
    }

    await record.destroy();
    return {
      message: `Permission "${permission.name}" removed from role "${role.name}" successfully`,
    };
  }

  async getRolePermissions(roleId: number): Promise<Role> {
    const role = await this.roleModel.findByPk(roleId, {
      include: [{ model: Permission, through: { attributes: [] } }],
    });
    if (!role) throw new NotFoundException(`Role with id ${roleId} not found`);
    return role;
  }

  // ─── User ↔ Role ───────────────────────────────────────────────────────────

  async assignRoleToUser(dto: AssignRoleToUserDto): Promise<{ message: string }> {
    const user = await this.userModel.findByPk(dto.userId);
    if (!user) throw new NotFoundException(`User with id ${dto.userId} not found`);

    const role = await this.roleModel.findByPk(dto.roleId);
    if (!role) throw new NotFoundException(`Role with id ${dto.roleId} not found`);

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
    } as any);

    return {
      message: `Role "${role.name}" assigned to user "${user.email}" successfully`,
    };
  }

  async removeRoleFromUser(dto: RemoveRoleFromUserDto): Promise<{ message: string }> {
    const user = await this.userModel.findByPk(dto.userId);
    if (!user) throw new NotFoundException(`User with id ${dto.userId} not found`);

    const role = await this.roleModel.findByPk(dto.roleId);
    if (!role) throw new NotFoundException(`Role with id ${dto.roleId} not found`);

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

  async getUserRoles(userId: number): Promise<{ userId: number; roles: Role[] }> {
    const user = await this.userModel.findByPk(userId);
    if (!user) throw new NotFoundException(`User with id ${userId} not found`);

    const userRoles = await this.userRoleModel.findAll({
      where: { userId },
      include: [
        {
          model: Role,
          include: [{ model: Permission, through: { attributes: [] } }],
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

  async updateRolePermissions(roleId: number, permissionIds: number[]): Promise<{ message: string }> {
    const role = await this.roleModel.findByPk(roleId);
    if (!role) throw new NotFoundException(`Role with id ${roleId} not found`);

    const t = await this.rolePermissionModel.sequelize.transaction();
    try {
      // Lock the parent role to serialize concurrent requests for the same role
      await this.roleModel.findOne({
        where: { id: roleId },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      // Remove existing associations
      await this.rolePermissionModel.destroy({ where: { roleId }, transaction: t });

      // Bulk insert new associations
      if (permissionIds.length > 0) {
        const uniquePermissionIds = [...new Set(permissionIds)];
        const records = uniquePermissionIds.map((permId) => ({
          roleId,
          permissionId: permId,
        }));
        await this.rolePermissionModel.bulkCreate(records as any[], { transaction: t });
      }
      
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    return { message: 'Permissions updated successfully' };
  }
}
