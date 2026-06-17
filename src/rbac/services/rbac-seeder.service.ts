import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Role } from '../models/role.model';
import { Permission } from '../models/permission.model';
import { RolePermission } from '../models/role-permission.model';
import { UserRole } from '../models/user-role.model';
import { User } from '../../users/models/user.model';
import { Client } from '../../clients/models/client.model';
import * as bcrypt from 'bcryptjs';
import { Op } from 'sequelize';

export const DEFAULT_PERMISSIONS = [
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

  // Clients (System Level)
  { name: 'clients:read', resource: 'clients', action: 'read', description: 'Read clients', isSystemLevel: true },
  { name: 'clients:create', resource: 'clients', action: 'create', description: 'Create clients', isSystemLevel: true },
  { name: 'clients:update', resource: 'clients', action: 'update', description: 'Update clients', isSystemLevel: true },
  { name: 'clients:delete', resource: 'clients', action: 'delete', description: 'Delete clients', isSystemLevel: true },

  // Subscriptions & System (System Level)
  { name: 'subscriptions:update', resource: 'subscriptions', action: 'update', description: 'Update subscriptions', isSystemLevel: true },
  { name: 'system:manage', resource: 'system', action: 'manage', description: 'Manage core system settings', isSystemLevel: true },

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

  // Employees (Granular split)
  { name: 'employees:read', resource: 'employees', action: 'read', description: 'Read employees basic info' },
  { name: 'employees:create', resource: 'employees', action: 'create', description: 'Create employees' },
  { name: 'employees:update', resource: 'employees', action: 'update', description: 'Update employees' },
  { name: 'employees:delete', resource: 'employees', action: 'delete', description: 'Delete employees' },
  { name: 'employees:export', resource: 'employees', action: 'export', description: 'Export employee data' },

  // Employee Documents
  { name: 'employee_documents:upload', resource: 'employee_documents', action: 'upload', description: 'Upload employee documents' },
  { name: 'employee_documents:read', resource: 'employee_documents', action: 'read', description: 'Read employee documents' },
  { name: 'employee_documents:verify', resource: 'employee_documents', action: 'verify', description: 'Verify employee documents' },
  { name: 'employee_documents:delete', resource: 'employee_documents', action: 'delete', description: 'Delete employee documents' },
  { name: 'employee_documents:download', resource: 'employee_documents', action: 'download', description: 'Download employee documents' },

  // Employee Hierarchy
  { name: 'employee_hierarchy:assign_manager', resource: 'employee_hierarchy', action: 'assign_manager', description: 'Assign manager' },
  { name: 'employee_hierarchy:change_manager', resource: 'employee_hierarchy', action: 'change_manager', description: 'Change employee manager' },
  { name: 'employee_hierarchy:view_team', resource: 'employee_hierarchy', action: 'view_team', description: 'View immediate team' },
  { name: 'employee_hierarchy:view_hierarchy', resource: 'employee_hierarchy', action: 'view_hierarchy', description: 'View organization hierarchy' },

  // Employee Lifecycle
  { name: 'employee_lifecycle:manage', resource: 'employee_lifecycle', action: 'manage', description: 'Manage employee lifecycle status' },

  // Leave Types
  { name: 'leave_types:create', resource: 'leave_types', action: 'create', description: 'Create leave types' },
  { name: 'leave_types:read', resource: 'leave_types', action: 'read', description: 'Read leave types' },
  { name: 'leave_types:update', resource: 'leave_types', action: 'update', description: 'Update leave types' },
  { name: 'leave_types:delete', resource: 'leave_types', action: 'delete', description: 'Delete leave types' },

  // Leave (Granular)
  { name: 'leave:create', resource: 'leave', action: 'create', description: 'Create leave requests' },
  { name: 'leave:approve', resource: 'leave', action: 'approve', description: 'Approve leave requests' },
  { name: 'leave:reject', resource: 'leave', action: 'reject', description: 'Reject leave requests' },
  { name: 'leave:cancel', resource: 'leave', action: 'cancel', description: 'Cancel leave requests' },
  { name: 'leave:read', resource: 'leave', action: 'read', description: 'Read leave requests' },

  // Attendance (Granular)
  { name: 'attendance:create', resource: 'attendance', action: 'create', description: 'Create attendance records' },
  { name: 'attendance:read', resource: 'attendance', action: 'read', description: 'Read attendance records' },
  { name: 'attendance:update', resource: 'attendance', action: 'update', description: 'Update attendance records' },
  { name: 'attendance:override', resource: 'attendance', action: 'override', description: 'Override attendance records' },
  { name: 'attendance:assign_shift', resource: 'attendance', action: 'assign_shift', description: 'Assign shifts to employees' },

  // Payroll (Granular)
  { name: 'payroll:read', resource: 'payroll', action: 'read', description: 'Read payroll records' },
  { name: 'payroll:generate', resource: 'payroll', action: 'generate', description: 'Generate payroll' },
  { name: 'payroll:approve', resource: 'payroll', action: 'approve', description: 'Approve payroll' },
  { name: 'payroll:download', resource: 'payroll', action: 'download', description: 'Download payroll slips' },

  // Documents
  { name: 'documents:read', resource: 'documents', action: 'read', description: 'Read documents' },
  { name: 'documents:create', resource: 'documents', action: 'create', description: 'Create documents' },
  { name: 'documents:update', resource: 'documents', action: 'update', description: 'Update documents' },
  { name: 'documents:delete', resource: 'documents', action: 'delete', description: 'Delete documents' },

  // Holidays
  { name: 'holidays:read', resource: 'holidays', action: 'read', description: 'Read holidays' },
  { name: 'holidays:create', resource: 'holidays', action: 'create', description: 'Create holidays' },
  { name: 'holidays:update', resource: 'holidays', action: 'update', description: 'Update holidays' },
  { name: 'holidays:delete', resource: 'holidays', action: 'delete', description: 'Delete holidays' },

  // Hr Policy
  { name: 'hrpolicy:read', resource: 'hrpolicy', action: 'read', description: 'Read hr policy' },
  { name: 'hrpolicy:create', resource: 'hrpolicy', action: 'create', description: 'Create hr policy' },
  { name: 'hrpolicy:update', resource: 'hrpolicy', action: 'update', description: 'Update hr policy' },
  { name: 'hrpolicy:delete', resource: 'hrpolicy', action: 'delete', description: 'Delete hr policy' },

  // Branches
  { name: 'branches:read', resource: 'branches', action: 'read', description: 'Read branches' },
  { name: 'branches:create', resource: 'branches', action: 'create', description: 'Create branches' },
  { name: 'branches:update', resource: 'branches', action: 'update', description: 'Update branches' },
  { name: 'branches:delete', resource: 'branches', action: 'delete', description: 'Delete branches' },

  // CRM Module
  { name: 'customers:read', resource: 'customers', action: 'read', description: 'Read customers' },
  { name: 'customers:create', resource: 'customers', action: 'create', description: 'Create customers' },
  { name: 'customers:update', resource: 'customers', action: 'update', description: 'Update customers' },
  { name: 'customers:delete', resource: 'customers', action: 'delete', description: 'Delete customers' },

  { name: 'deals:read', resource: 'deals', action: 'read', description: 'Read deals' },
  { name: 'deals:create', resource: 'deals', action: 'create', description: 'Create deals' },
  { name: 'deals:update', resource: 'deals', action: 'update', description: 'Update deals' },
  { name: 'deals:delete', resource: 'deals', action: 'delete', description: 'Delete deals' },

  { name: 'tasks:read', resource: 'tasks', action: 'read', description: 'Read tasks' },
  { name: 'tasks:create', resource: 'tasks', action: 'create', description: 'Create tasks' },
  { name: 'tasks:update', resource: 'tasks', action: 'update', description: 'Update tasks' },
  { name: 'tasks:delete', resource: 'tasks', action: 'delete', description: 'Delete tasks' },

  { name: 'leads:read', resource: 'leads', action: 'read', description: 'Read leads' },
  { name: 'leads:create', resource: 'leads', action: 'create', description: 'Create leads' },
  { name: 'leads:update', resource: 'leads', action: 'update', description: 'Update leads' },
  { name: 'leads:delete', resource: 'leads', action: 'delete', description: 'Delete leads' },

  // Attachments
  { name: 'attachments:upload', resource: 'attachments', action: 'upload', description: 'Upload attachments' },
  { name: 'attachments:download', resource: 'attachments', action: 'download', description: 'Download attachments' },
];

const ADMIN_ROLE_NAME = 'Admin';
const SUPER_ADMIN_EMAIL = 'admin@agricom.com';
const SUPER_ADMIN_PASSWORD = 'Admin@123';

const SEED_CLIENT_NAME = 'TNT Group';
const SEED_CLIENT_EMAIL = 'admin@tntgroup.com';
const SEED_CLIENT_PASSWORD = 'password123';

function getModuleAndLabel(resource: string): { module: string, label: string } {
  const hrResources = [
    'employees', 'employee_documents', 'employee_hierarchy', 'employee_lifecycle',
    'departments', 'designations', 'branches', 'hrpolicy', 'leave_types', 'leave',
    'attendance', 'payroll', 'documents', 'holidays', 'attachments'
  ];
  const adminResources = ['users', 'roles', 'permissions', 'companies', 'subscriptions', 'system', 'notifications'];
  const crmResources = ['clients', 'customers', 'deals', 'tasks', 'leads'];

  let module = 'Other';
  if (hrResources.includes(resource)) module = 'HR';
  else if (adminResources.includes(resource)) module = 'Administration';
  else if (crmResources.includes(resource)) module = 'CRM';

  let label = resource;
  if (resource === 'hrpolicy') {
    label = 'HR Policy';
  } else {
    label = resource
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  return { module, label };
}

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
  ) { }

  async onApplicationBootstrap() {
    if (process.env.SEED_DB !== 'true') {
      return;
    }

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
    const validPermNames = DEFAULT_PERMISSIONS.map(p => p.name);

    await this.permissionModel.destroy({
      where: {
        name: {
          [Op.notIn]: validPermNames,
        },
      },
    });

    for (const perm of DEFAULT_PERMISSIONS) {
      const { module, label } = getModuleAndLabel(perm.resource);
      let instance = await this.permissionModel.findOne({
        where: { resource: perm.resource, action: perm.action }
      });

      if (instance) {
        if (
          instance.name !== perm.name ||
          instance.isSystemLevel !== (perm.isSystemLevel || false) ||
          instance.module !== module ||
          instance.label !== label
        ) {
          await instance.update({
            name: perm.name,
            isSystemLevel: perm.isSystemLevel || false,
            module,
            label,
          });
        }
      } else {
        instance = await this.permissionModel.create({
          ...perm,
          module,
          label,
          isSystemLevel: perm.isSystemLevel || false,
          isActive: true,
        } as any);
      }
      permissionInstances.push(instance);
    }

    // 3. Assign all permissions to Admin role
    for (const perm of permissionInstances) {
      await this.rolePermissionModel.findOrCreate({
        where: { roleId: adminRole.id, permissionId: perm.id },
        defaults: { roleId: adminRole.id, permissionId: perm.id } as any,
      });
    }

    // 3b. Assign all non-system permissions to Client Admin role
    for (const perm of permissionInstances) {
      if (!perm.isSystemLevel) {
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
