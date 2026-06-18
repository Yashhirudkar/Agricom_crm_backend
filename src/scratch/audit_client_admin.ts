import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UserRole } from '../rbac/models/user-role.model';
import { RoleActionPermission } from '../rbac/models/role-action-permission.model';
import { Role } from '../rbac/models/role.model';
import { User } from '../users/models/user.model';
import { ResourceAction } from '../system/models/resource-action.model';
import { ModuleResource } from '../system/models/module-resource.model';
import { getModelToken } from '@nestjs/sequelize';
import { Op } from 'sequelize';

async function audit() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const userModel = app.get<typeof User>(getModelToken(User));
  const userRoleModel = app.get<typeof UserRole>(getModelToken(UserRole));
  const roleActionPermModel = app.get<typeof RoleActionPermission>(getModelToken(RoleActionPermission));
  const roleModel = app.get<typeof Role>(getModelToken(Role));

  // ─── 1. Find a client_admin user ─────────────────────────────────────────
  const clientAdminUser = await userModel.findOne({
    where: { clientId: { [Op.ne]: null } },
    include: [{ model: Role, as: 'roles' }],
  });

  if (!clientAdminUser) {
    console.log("NO CLIENT ADMIN USER FOUND IN DB");
    await app.close();
    return;
  }

  console.log(`\n=== CLIENT ADMIN USER ===`);
  console.log(`ID: ${clientAdminUser.id}, Email: ${clientAdminUser.email}, clientId: ${clientAdminUser.clientId}`);
  console.log(`Roles: ${JSON.stringify(clientAdminUser.roles?.map(r => ({ id: r.id, name: r.name, isActive: r.isActive })))}`);

  // ─── 2. Check UserRole entries for this user ──────────────────────────────
  const userRoles = await userRoleModel.findAll({
    where: { userId: clientAdminUser.id },
    include: [{ model: Role, as: 'role', where: { isActive: true }, required: false }],
  });

  console.log(`\n=== USER_ROLES TABLE (userId=${clientAdminUser.id}) ===`);
  if (userRoles.length === 0) {
    console.log("!! NO ROWS in user_roles for this user !!");
  } else {
    userRoles.forEach(ur => {
      console.log(`  roleId=${ur.roleId}, role=${ur.role?.name}, isActive=${ur.role?.isActive}`);
    });
  }

  const roleIds = userRoles.map(ur => ur.roleId);

  // ─── 3. Check role_action_permissions for those roles ────────────────────
  if (roleIds.length === 0) {
    console.log("\n!! STOP: roleIds is empty — user has NO role assignments, guard throws 'no active roles' !!");
    await app.close();
    return;
  }

  const rolePerms = await roleActionPermModel.findAll({
    where: { role_id: roleIds },
    include: [
      {
        model: ResourceAction,
        as: 'resourceAction',
        required: true,
        include: [{ model: ModuleResource, as: 'resource', required: true }],
      },
    ],
  });

  console.log(`\n=== ROLE_ACTION_PERMISSIONS (${rolePerms.length} rows for roleIds=${roleIds.join(',')}) ===`);
  if (rolePerms.length === 0) {
    console.log("!! NO PERMISSIONS in role_action_permissions for these roles !!");
  } else {
    rolePerms.slice(0, 10).forEach(rp => {
      const ra = (rp as any).resourceAction;
      const res = ra?.resource;
      console.log(`  ${res?.name}:${ra?.name?.toLowerCase()}`);
    });
    if (rolePerms.length > 10) console.log(`  ... and ${rolePerms.length - 10} more`);
  }

  // Build the granted set and check for 'users:read'
  const grantedSet = new Set<string>(
    rolePerms.map((rp: any) => `${rp.resourceAction?.resource?.name}:${rp.resourceAction?.name?.toLowerCase()}`)
  );
  console.log(`\n=== users:read check: ${grantedSet.has('users:read') ? '✓ PRESENT' : '✗ MISSING'} ===`);
  console.log(`=== users:READ check: ${grantedSet.has('users:READ') ? '✓ PRESENT' : '✗ MISSING'} ===`);
  
  // Show what format is stored
  const usersPerms = [...grantedSet].filter(p => p.startsWith('users:'));
  console.log(`All users:* permissions found: ${JSON.stringify(usersPerms)}`);

  console.log('\n=== AUDIT COMPLETE ===');
  await app.close();
}

audit().catch(console.error);
