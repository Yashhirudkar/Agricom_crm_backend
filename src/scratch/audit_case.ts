import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { RoleActionPermission } from '../rbac/models/role-action-permission.model';
import { ResourceAction } from '../system/models/resource-action.model';
import { ModuleResource } from '../system/models/module-resource.model';
import { getModelToken } from '@nestjs/sequelize';

async function audit() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const roleActionPermModel = app.get<typeof RoleActionPermission>(getModelToken(RoleActionPermission));

  const rolePerms = await roleActionPermModel.findAll({
    where: { role_id: 2 }, // Client Admin
    include: [
      {
        model: ResourceAction,
        as: 'resourceAction',
        required: true,
        include: [{ model: ModuleResource, as: 'resource', required: true }],
      },
    ],
    limit: 5,
  });

  console.log("\n=== RAW permission values from DB (exact case) ===");
  rolePerms.forEach((rp: any) => {
    const ra = rp.resourceAction;
    const res = ra?.resource;
    console.log(`  resource.name='${res?.name}' (type: ${typeof res?.name})`);
    console.log(`  action.name='${ra?.name}' (type: ${typeof ra?.name})`);
    console.log(`  Built key: '${res?.name}:${ra?.name}'`);
    console.log(`  grantedSet would contain: '${res?.name}:${ra?.name}'`);
    console.log(`  users:read match: ${res?.name === 'users' && ra?.name?.toLowerCase() === 'read'}`);
    console.log();
  });

  // Check what permissions.guard.ts builds
  // Line 226: `${rp.resourceAction.resource.name}:${rp.resourceAction.name}`
  // Question: does it call .toLowerCase() on action.name? Let's check:
  console.log("=== Guard formula (from permissions.guard.ts line 226) ===");
  console.log("Formula: `resource.name:action.name` (NO .toLowerCase() on action)");
  console.log("Decorator @RequirePermission passes: 'users:read' (lowercase)");
  console.log("If DB stores action.name='READ', guard builds 'users:READ' != 'users:read'");

  await app.close();
}

audit().catch(console.error);
