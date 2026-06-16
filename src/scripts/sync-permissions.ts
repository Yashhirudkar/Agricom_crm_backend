import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Permission } from '../rbac/models/permission.model';
import { Role } from '../rbac/models/role.model';
import { RolePermission } from '../rbac/models/role-permission.model';
import * as fs from 'fs';
import * as path from 'path';
import { Op } from 'sequelize';
import { DEFAULT_PERMISSIONS } from '../rbac/services/rbac-seeder.service';

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

export function standardizePermission(permKey: string): { name: string; resource: string; action: string } {
  let [resource, action] = permKey.split(':');
  
  if (action === 'view') {
    action = 'read';
  }

  if (resource === 'manager' && action === 'approve_leave') {
    resource = 'leave';
    action = 'approve';
  }

  if (resource === 'employees') {
    if (['upload_document', 'upload'].includes(action)) {
      resource = 'employee_documents';
      action = 'upload';
    } else if (['view_document', 'read_document'].includes(action)) {
      resource = 'employee_documents';
      action = 'read';
    } else if (['verify_document', 'verify'].includes(action)) {
      resource = 'employee_documents';
      action = 'verify';
    } else if (['download_document', 'download'].includes(action)) {
      resource = 'employee_documents';
      action = 'download';
    } else if (['delete_document'].includes(action)) {
      resource = 'employee_documents';
      action = 'delete';
    }
    else if (['assign_manager', 'change_manager', 'view_team', 'view_hierarchy'].includes(action)) {
      resource = 'employee_hierarchy';
    }
    else if (['manage_lifecycle', 'manage'].includes(action)) {
      resource = 'employee_lifecycle';
      action = 'manage';
    }
  }

  return { name: `${resource}:${action}`, resource, action };
}

function scanControllers(dir: string, foundPermissions: Set<string>) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== 'scripts') {
        scanControllers(filePath, foundPermissions);
      }
    } else if (stat.isFile() && file.endsWith('.ts')) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const regex = /@RequirePermission\(([^)]+)\)/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        const rawArgs = match[1];
        const perms = rawArgs.split(',').map(p => p.trim().replace(/['"`]/g, ''));
        for (const p of perms) {
          if (p) {
            foundPermissions.add(p);
          }
        }
      }
    }
  }
}

async function bootstrap() {
  console.log('Bootstrapping NestJS application context...');
  const app = await NestFactory.createApplicationContext(AppModule);
  console.log('Context initialized successfully.');

  let permissionModel: typeof Permission;
  try {
    permissionModel = app.get(Permission);
  } catch {
    permissionModel = app.get('PermissionRepository');
  }

  let roleModel: typeof Role;
  try {
    roleModel = app.get(Role);
  } catch {
    roleModel = app.get('RoleRepository');
  }

  let rolePermissionModel: typeof RolePermission;
  try {
    rolePermissionModel = app.get(RolePermission);
  } catch {
    rolePermissionModel = app.get('RolePermissionRepository');
  }

  const foundPermissions = new Set<string>();
  const srcDir = path.join(__dirname, '..');
  console.log(`Scanning controller files under: ${srcDir}`);
  scanControllers(srcDir, foundPermissions);

  console.log(`Found ${foundPermissions.size} unique permissions in codebase:`, Array.from(foundPermissions));

  // Build the list of valid permission names
  const validPermissions = new Set<string>(DEFAULT_PERMISSIONS.map(p => p.name));
  for (const p of foundPermissions) {
    const standardized = standardizePermission(p);
    validPermissions.add(standardized.name);
  }

  // Clean up database: delete permissions not in validPermissions
  console.log('Auditing database: deleting obsolete/un-standardized permissions...');
  const deletedCount = await permissionModel.destroy({
    where: {
      name: {
        [Op.notIn]: Array.from(validPermissions)
      }
    }
  });
  if (deletedCount > 0) {
    console.log(`[CLEANUP] Deleted ${deletedCount} obsolete permissions from database.`);
  }

  let createdCount = 0;
  let updatedCount = 0;

  for (const p of foundPermissions) {
    const standardized = standardizePermission(p);
    const { name: stdName, resource, action } = standardized;

    const { module, label } = getModuleAndLabel(resource);
    const isSystemLevel = module === 'CRM' || resource === 'subscriptions' || resource === 'system';

    let dbPermission = await permissionModel.findOne({ where: { name: stdName } });

    if (!dbPermission) {
      dbPermission = await permissionModel.create({
        name: stdName,
        resource,
        action,
        module,
        label,
        isSystemLevel,
        description: `Auto-created permission for ${resource} ${action}`,
        isActive: true,
      } as any);
      console.log(`[CREATE] Added permission: ${stdName} (Module: ${module}, Label: ${label})`);
      createdCount++;
    } else {
      if (
        dbPermission.module !== module ||
        dbPermission.label !== label ||
        dbPermission.resource !== resource ||
        dbPermission.action !== action
      ) {
        await dbPermission.update({ module, label, resource, action });
        console.log(`[UPDATE] Synced metadata for: ${stdName} (Module: ${module}, Label: ${label})`);
        updatedCount++;
      }
    }

    // Automatically assign synced permissions to standard Admin and Client Admin roles
    // 1. System Admin gets everything
    const adminRole = await roleModel.findOne({ where: { name: 'Admin' } });
    if (adminRole) {
      await rolePermissionModel.findOrCreate({
        where: { roleId: adminRole.id, permissionId: dbPermission.id },
        defaults: { roleId: adminRole.id, permissionId: dbPermission.id } as any,
      });
    }

    // 2. Client Admin gets all except system level permissions
    if (!isSystemLevel) {
      const clientAdminRole = await roleModel.findOne({ where: { name: 'Client Admin' } });
      if (clientAdminRole) {
        await rolePermissionModel.findOrCreate({
          where: { roleId: clientAdminRole.id, permissionId: dbPermission.id },
          defaults: { roleId: clientAdminRole.id, permissionId: dbPermission.id } as any,
        });
      }
    }
  }

  console.log(`Sync complete. Created: ${createdCount}, Updated/Checked: ${updatedCount - createdCount >= 0 ? updatedCount : 0}`);
  await app.close();
  process.exit(0);
}

bootstrap().catch(err => {
  console.error('Permission sync failed:', err);
  process.exit(1);
});
