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
import { UserCompany } from '../../users/models/user-company.model';
import { RolePartnerRoleAccess } from '../../masters/partner-role/role-partner-role-access.model';

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
    @InjectModel(UserCompany)
    private readonly userCompanyModel: typeof UserCompany,
    @InjectModel(RolePartnerRoleAccess)
    private readonly rolePartnerRoleAccessModel: typeof RolePartnerRoleAccess,
    @Inject(forwardRef(() => AuditService))
    private readonly auditService: AuditService,
  ) { }

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
      where[Op.or] = [{ clientId: null }, { clientId }];
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
      where[Op.or] = [{ clientId: null }, { clientId }];
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

  // ─── Partner Role Access ────────────────────────────────────────────────────

  /**
   * Returns the list of partner_role IDs explicitly assigned to this RBAC role.
   * Empty array means: no rows configured → role is UNRESTRICTED (all partner roles allowed).
   */
  async getRolePartnerRoleAccess(
    roleId: number,
  ): Promise<{ roleId: number; partnerRoleIds: number[]; isUnrestricted: boolean }> {
    const role = await this.roleModel.findByPk(roleId);
    if (!role) throw new NotFoundException(`Role with id ${roleId} not found`);

    const rows = await this.rolePartnerRoleAccessModel.findAll({
      where: { roleId },
    });

    const partnerRoleIds = rows.map((r) => r.partnerRoleId);
    return {
      roleId,
      partnerRoleIds,
      isUnrestricted: partnerRoleIds.length === 0,
    };
  }

  /**
   * Replaces the partner role access list for an RBAC role.
   * Passing an empty array marks the role as UNRESTRICTED (no restriction rows).
   */
  async updateRolePartnerRoleAccess(
    roleId: number,
    partnerRoleIds: number[],
  ): Promise<{ message: string }> {
    const role = await this.roleModel.findByPk(roleId);
    if (!role) throw new NotFoundException(`Role with id ${roleId} not found`);

    const t = await this.rolePartnerRoleAccessModel.sequelize.transaction();
    try {
      // Delete all existing access rows for this role
      await this.rolePartnerRoleAccessModel.destroy({
        where: { roleId },
        transaction: t,
      });

      // Insert new rows (de-duplicate IDs)
      if (partnerRoleIds.length > 0) {
        const uniqueIds = [...new Set(partnerRoleIds)];
        await this.rolePartnerRoleAccessModel.bulkCreate(
          uniqueIds.map((prId) => ({ roleId, partnerRoleId: prId })),
          { transaction: t },
        );
      }

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    return { message: 'Partner role access updated successfully' };
  }

  /**
   * Resolves the effective allowed partner_role IDs for a given user.
   *
   * Rules:
   *  - Super Admin / Client Admin → null (= unrestricted, all allowed)
   *  - Standard user with roles where ALL roles are unrestricted → null
   *  - Otherwise → UNION of allowed partner_role IDs across all user roles
   */
  async resolveUserAllowedPartnerRoleIds(
    user: any,
    companyId?: number,
  ): Promise<number[] | null> {
    // Super admin is always unrestricted
    if (user.type === 'super_admin') return null;

    // Collect role IDs for this user
    let roleIds: number[] = [];

    if (user.type === 'client_admin') {
      const globalRoles = await this.userRoleModel.findAll({
        where: { userId: user.userId || user.id },
        include: [{ model: Role, where: { isActive: true }, required: true }],
      });
      roleIds = globalRoles.map((gr) => gr.roleId);
    } else {
      // Standard user: get role from UserCompany membership
      const membershipWhere: any = {
        userId: user.userId || user.id,
        status: 'Active',
      };
      if (companyId) membershipWhere.companyId = companyId;

      const memberships = await this.userCompanyModel.findAll({
        where: membershipWhere,
        include: [{ model: Role, where: { isActive: true }, required: true }],
      });
      roleIds = memberships
        .filter((m) => m.roleId)
        .map((m) => m.roleId);
    }

    if (roleIds.length === 0) return null;

    // Fetch access rows for all these roles
    const accessRows = await this.rolePartnerRoleAccessModel.findAll({
      where: { roleId: roleIds },
    });

    // Group by roleId to check which roles have restrictions
    const byRole = new Map<number, number[]>();
    for (const row of accessRows) {
      const existing = byRole.get(row.roleId) || [];
      existing.push(row.partnerRoleId);
      byRole.set(row.roleId, existing);
    }

    // If ALL roles have no restriction rows → user is unrestricted
    const allUnrestricted = roleIds.every((rid) => !byRole.has(rid));
    if (allUnrestricted) return null;

    // Compute UNION of allowed IDs across all roles
    // Roles with no restriction rows are treated as unrestricted → whole union = all allowed
    for (const rid of roleIds) {
      if (!byRole.has(rid)) {
        // This role has no restrictions → unrestricted → union is all
        return null;
      }
    }

    const unionIds = new Set<number>();
    for (const ids of byRole.values()) {
      ids.forEach((id) => unionIds.add(id));
    }

    return Array.from(unionIds);
  }
}
