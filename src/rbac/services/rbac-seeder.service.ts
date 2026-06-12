import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Role } from '../models/role.model';
import { Permission } from '../models/permission.model';
import { RolePermission } from '../models/role-permission.model';
import { UserRole } from '../models/user-role.model';
import { User } from '../../users/models/user.model';
import { Client } from '../../clients/models/client.model';
import * as bcrypt from 'bcryptjs';

const DEFAULT_PERMISSIONS = [
  // Roles
  { name: 'roles:create', resource: 'roles', action: 'create', description: 'Create roles' },
  { name: 'roles:read', resource: 'roles', action: 'read', description: 'Read roles' },
  { name: 'roles:update', resource: 'roles', action: 'update', description: 'Update roles' },
  { name: 'roles:delete', resource: 'roles', action: 'delete', description: 'Delete roles' },
  { name: 'roles:assign-permission', resource: 'roles', action: 'assign-permission', description: 'Assign / remove permissions on roles' },
  // Permissions
  { name: 'permissions:create', resource: 'permissions', action: 'create', description: 'Create permissions' },
  { name: 'permissions:read', resource: 'permissions', action: 'read', description: 'Read permissions' },
  { name: 'permissions:update', resource: 'permissions', action: 'update', description: 'Update permissions' },
  { name: 'permissions:delete', resource: 'permissions', action: 'delete', description: 'Delete permissions' },
  // Users
  { name: 'users:read', resource: 'users', action: 'read', description: 'Read users' },
  { name: 'users:create', resource: 'users', action: 'create', description: 'Create users' },
  { name: 'users:update', resource: 'users', action: 'update', description: 'Update users' },
  { name: 'users:delete', resource: 'users', action: 'delete', description: 'Delete users' },
  { name: 'users:assign-role', resource: 'users', action: 'assign-role', description: 'Assign / remove roles on users' },
  // Companies
  { name: 'companies:create', resource: 'companies', action: 'create', description: 'Create new companies' },
  { name: 'companies:read', resource: 'companies', action: 'read', description: 'Read companies list' },
  { name: 'companies:update', resource: 'companies', action: 'update', description: 'Update company details' },
  { name: 'companies:delete', resource: 'companies', action: 'delete', description: 'Delete companies' },
  // Clients
  { name: 'clients:read', resource: 'clients', action: 'read', description: 'Read clients' },
  { name: 'clients:create', resource: 'clients', action: 'create', description: 'Create clients' },
  { name: 'clients:update', resource: 'clients', action: 'update', description: 'Update clients' },
  { name: 'clients:delete', resource: 'clients', action: 'delete', description: 'Delete clients' },
  // Departments
  { name: 'departments:read', resource: 'departments', action: 'read', description: 'Read departments' },
  { name: 'departments:create', resource: 'departments', action: 'create', description: 'Create departments' },
  { name: 'departments:update', resource: 'departments', action: 'update', description: 'Update departments' },
  { name: 'departments:delete', resource: 'departments', action: 'delete', description: 'Delete departments' },
  // Designations
  { name: 'designations:read', resource: 'designations', action: 'read', description: 'Read designations' },
  { name: 'designations:create', resource: 'designations', action: 'create', description: 'Create designations' },
  { name: 'designations:update', resource: 'designations', action: 'update', description: 'Update designations' },
  { name: 'designations:delete', resource: 'designations', action: 'delete', description: 'Delete designations' },
  // Employees
  { name: 'employees:read', resource: 'employees', action: 'read', description: 'Read employees' },
  { name: 'employees:create', resource: 'employees', action: 'create', description: 'Create employees' },
  { name: 'employees:update', resource: 'employees', action: 'update', description: 'Update employees' },
  { name: 'employees:delete', resource: 'employees', action: 'delete', description: 'Delete employees' },
  // Documents
  { name: 'documents:read', resource: 'documents', action: 'read', description: 'Read documents' },
  { name: 'documents:create', resource: 'documents', action: 'create', description: 'Create documents' },
  { name: 'documents:update', resource: 'documents', action: 'update', description: 'Update documents' },
  { name: 'documents:delete', resource: 'documents', action: 'delete', description: 'Delete documents' },
  // Holidays
  { name: 'Holidays:read', resource: 'Holidays', action: 'read', description: 'Read holidays' },
  { name: 'Holidays:write', resource: 'Holidays', action: 'write', description: 'Create, update, delete holidays' },
];

const ADMIN_ROLE_NAME = 'Admin';
const SUPER_ADMIN_EMAIL = 'admin@agricom.com';
const SUPER_ADMIN_PASSWORD = 'Admin@123';

const SEED_CLIENT_NAME = 'TNT Group';
const SEED_CLIENT_EMAIL = 'admin@tntgroup.com';
const SEED_CLIENT_PASSWORD = 'password123';

@Injectable()
export class RbacSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RbacSeederService.name);

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
    @InjectModel(Client)
    private readonly clientModel: typeof Client,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.seed();
    } catch (error) {
      this.logger.error('RBAC seeding failed', error);
    }
  }

  private async seed() {
    this.logger.log('Running RBAC & Multi-Tenant seeder...');

    // 1. Ensure Admin role exists (Global role -> companyId = null)
    const [adminRole] = await this.roleModel.findOrCreate({
      where: { name: ADMIN_ROLE_NAME },
      defaults: {
        name: ADMIN_ROLE_NAME,
        description: 'System administrator with full access',
        isActive: true,
        clientId: null,
        isSystemRole: true,
      } as any,
    });

    // Ensure Client Admin role exists (Global role -> clientId = null, isSystemRole = true)
    const [clientAdminRole] = await this.roleModel.findOrCreate({
      where: { name: 'Client Admin' },
      defaults: {
        name: 'Client Admin',
        description: 'Client level administrator with full access',
        isActive: true,
        clientId: null,
        isSystemRole: true,
      } as any,
    });

    // 2. Ensure all default permissions exist
    const permissionInstances: Permission[] = [];
    for (const perm of DEFAULT_PERMISSIONS) {
      const [instance] = await this.permissionModel.findOrCreate({
        where: { name: perm.name },
        defaults: { ...perm, isActive: true } as any,
      });
      permissionInstances.push(instance);
    }

    // 3. Assign all permissions to Admin role
    for (const perm of permissionInstances) {
      await this.rolePermissionModel.findOrCreate({
        where: { roleId: adminRole.id, permissionId: perm.id },
        defaults: { roleId: adminRole.id, permissionId: perm.id } as any,
      });
    }

    // 3b. Assign all non-client permissions to Client Admin role
    for (const perm of permissionInstances) {
      if (!perm.name.startsWith('clients:')) {
        await this.rolePermissionModel.findOrCreate({
          where: { roleId: clientAdminRole.id, permissionId: perm.id },
          defaults: { roleId: clientAdminRole.id, permissionId: perm.id } as any,
        });
      }
    }

    // 4. Ensure Super Admin user exists
    let adminUser = await this.userModel.findOne({
      where: { email: SUPER_ADMIN_EMAIL },
    });

    if (!adminUser) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, salt);
      adminUser = await this.userModel.create({
        name: 'Agricom Super Admin',
        email: SUPER_ADMIN_EMAIL,
        password: hashedPassword,
        isActive: true,
        companyId: null,
      } as any);
      this.logger.log(`Super Admin user created: ${SUPER_ADMIN_EMAIL}`);
    }

    // 5. Ensure Super Admin user has Admin role
    await this.userRoleModel.findOrCreate({
      where: { userId: adminUser.id, roleId: adminRole.id },
      defaults: { userId: adminUser.id, roleId: adminRole.id } as any,
    });

    // 6. Create Seed Client (TNT Group)
    let tntClient = await this.clientModel.findOne({
      where: { email: SEED_CLIENT_EMAIL },
    });

    if (!tntClient) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(SEED_CLIENT_PASSWORD, salt);
      await this.clientModel.create({
        name: SEED_CLIENT_NAME,
        email: SEED_CLIENT_EMAIL,
        password: hashedPassword,
        isActive: true,
        allowedCompanies: 3,
        allowedUsers: 15,
      } as any);
      this.logger.log(`Seed Client created: ${SEED_CLIENT_NAME} (${SEED_CLIENT_EMAIL})`);
    }

    this.logger.log('RBAC & Multi-Tenant seeding completed successfully.');
  }
}
