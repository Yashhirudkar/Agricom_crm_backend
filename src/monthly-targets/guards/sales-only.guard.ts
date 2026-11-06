import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { UserCompany } from '../../users/models/user-company.model';
import { UserRole } from '../../rbac/models/user-role.model';
import { Role } from '../../rbac/models/role.model';

@Injectable()
export class SalesOnlyGuard implements CanActivate {
  constructor(
    @InjectModel(UserCompany)
    private readonly userCompanyModel: typeof UserCompany,
    @InjectModel(UserRole)
    private readonly userRoleModel: typeof UserRole,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // 1. Super Admin and Client Admin are strictly forbidden from Sales Monthly Target
    if (user.type === 'super_admin' || user.type === 'client_admin') {
      throw new ForbiddenException(
        'Monthly Target tracking is strictly available for Sales role users only.',
      );
    }

    const userId = user.userId || user.id;
    const requestedCompanyId =
      request.headers['x-company-id'] || user.companyId;

    let roleName = '';

    // Check workspace-level role if companyId is present
    if (requestedCompanyId) {
      const parsedCompanyId = parseInt(requestedCompanyId, 10);
      if (!isNaN(parsedCompanyId)) {
        const uc: any = await this.userCompanyModel.findOne({
          where: { userId, companyId: parsedCompanyId, status: 'Active' },
          include: [{ model: Role, attributes: ['id', 'name'] }],
        });
        if (uc?.role?.name) {
          roleName = uc.role.name;
        }
      }
    }

    // Fallback to active membership
    if (!roleName) {
      const uc: any = await this.userCompanyModel.findOne({
        where: { userId, status: 'Active' },
        include: [{ model: Role, attributes: ['id', 'name'] }],
      });
      if (uc?.role?.name) {
        roleName = uc.role.name;
      }
    }

    // Fallback to global user role
    if (!roleName) {
      const ur: any = await this.userRoleModel.findOne({
        where: { userId },
        include: [{ model: Role, attributes: ['id', 'name'] }],
      });
      if (ur?.role?.name) {
        roleName = ur.role.name;
      }
    }

    const normalized = (roleName || '').trim().toLowerCase();
    if (normalized !== 'sales') {
      throw new ForbiddenException(
        'Monthly Target tracking is strictly available for Sales role users only.',
      );
    }

    return true;
  }
}

