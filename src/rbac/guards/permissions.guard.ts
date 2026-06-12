import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/sequelize';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { UserRole } from '../models/user-role.model';
import { RolePermission } from '../models/role-permission.model';
import { Permission } from '../models/permission.model';
import { Role } from '../models/role.model';
import { UserCompany } from '../../users/models/user-company.model';
import { Company } from '../../companies/models/company.model';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(UserRole)
    private readonly userRoleModel: typeof UserRole,
    @InjectModel(RolePermission)
    private readonly rolePermissionModel: typeof RolePermission,
    @InjectModel(UserCompany)
    private readonly userCompanyModel: typeof UserCompany,
    @InjectModel(Company)
    private readonly companyModel: typeof Company,
  ) {}

  private parseCompanyId(value: unknown): number | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const rawValue = Array.isArray(value) ? value[0] : value;
    const companyId = Number(rawValue);

    if (!Number.isInteger(companyId) || companyId <= 0) {
      throw new ForbiddenException('Invalid company workspace.');
    }

    return companyId;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Gather required permissions from route metadata
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No permissions required — allow through
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user; // Decoded JWT payload

    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    const userId = user.userId || user.id;
    const requestedCompanyId = this.parseCompanyId(request.headers['x-company-id']);

    // 1. Super Admins bypass all permissions/company checks
    if (user.type === 'super_admin') {
      if (requestedCompanyId) {
        request.activeCompanyId = requestedCompanyId;
      }
      return true;
    }

    // Determine the active role for the user
    let roleIds: number[] = [];

    // 2. Client Admins have global tenant access
    if (user.type === 'client_admin') {
      if (requestedCompanyId) {
        const company = await this.companyModel.findOne({
          where: {
            id: requestedCompanyId,
            clientId: user.clientId,
            isActive: true,
          },
        });

        if (!company) {
          throw new ForbiddenException('Company does not belong to your client organization.');
        }

        request.activeCompanyId = requestedCompanyId;
      }

      const globalRoles = await this.userRoleModel.findAll({
        where: { userId },
        include: [
          {
            model: Role,
            where: { isActive: true },
            required: true,
          },
        ],
      });
      roleIds = globalRoles.map((gr) => gr.roleId);
    } else {
      // 3. Standard Users: Fetch role scoped to the active company workspace
      let companyId: number | null = requestedCompanyId;

      if (!companyId) {
        // Fallback to user's lastCompanyId from DB
        const fullUser = await this.userCompanyModel.sequelize!.query(
          `SELECT "lastCompanyId" FROM "users" WHERE id = :userId LIMIT 1;`,
          {
            replacements: { userId },
            type: 'SELECT'
          }
        ) as any[];
        companyId = fullUser.length > 0 ? fullUser[0].lastCompanyId : null;
      }

      if (!companyId) {
        // If no lastCompanyId is saved, fallback to their first active company membership
        const memberships = await this.userCompanyModel.findAll({
          where: { userId, status: 'Active' }
        });
        if (memberships.length > 0) {
          companyId = memberships[0].companyId;
        }
      }

      if (!companyId) {
        throw new ForbiddenException('No active company workspace selected.');
      }

      // Check membership and active role in this company workspace
      const membership = await this.userCompanyModel.findOne({
        where: { userId, companyId, status: 'Active' },
        include: [
          {
            model: Role,
            where: { isActive: true },
            required: true,
          }
        ]
      });

      if (!membership) {
        throw new ForbiddenException('You do not have active access to this company workspace.');
      }

      if (membership.roleId) {
        roleIds = [membership.roleId];
      }

      request.activeCompanyId = companyId;
    }

    if (!roleIds.length) {
      throw new ForbiddenException('You have no active roles assigned.');
    }

    // Load all permissions attached to those roles
    const rolePermissions = await this.rolePermissionModel.findAll({
      where: { roleId: roleIds },
      include: [
        {
          model: Permission,
          where: { isActive: true },
          required: true,
        },
      ],
    });

    // Build a Set of "resource:action" strings the user holds
    const grantedSet = new Set<string>(
      rolePermissions.map((rp) => `${rp.permission.resource}:${rp.permission.action}`),
    );

    // Check every required permission
    const hasAll = requiredPermissions.every((perm) => grantedSet.has(perm));

    if (!hasAll) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
