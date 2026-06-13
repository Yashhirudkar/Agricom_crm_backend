import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const permissionModel = app.get('PermissionRepository');
  const rolePermissionModel = app.get('RolePermissionRepository');

  // 1. Get holidays:write
  const writePerm = await permissionModel.findOne({ where: { name: 'holidays:write' } });

  // Ensure new permissions exist (seeder should have created them, but we will findOrCreate)
  const [createPerm] = await permissionModel.findOrCreate({
    where: { name: 'holidays:create' },
    defaults: { resource: 'holidays', action: 'create', description: 'Create holidays', isActive: true }
  });
  const [updatePerm] = await permissionModel.findOrCreate({
    where: { name: 'holidays:update' },
    defaults: { resource: 'holidays', action: 'update', description: 'Update holidays', isActive: true }
  });
  const [deletePerm] = await permissionModel.findOrCreate({
    where: { name: 'holidays:delete' },
    defaults: { resource: 'holidays', action: 'delete', description: 'Delete holidays', isActive: true }
  });

  if (writePerm) {
    // 2. Find all role_permissions that use holidays:write
    const oldRolePerms = await rolePermissionModel.findAll({ where: { permissionId: writePerm.id } });
    
    // 3. For each role, assign the new 3
    for (const rp of oldRolePerms) {
      await rolePermissionModel.findOrCreate({ where: { roleId: rp.roleId, permissionId: createPerm.id } });
      await rolePermissionModel.findOrCreate({ where: { roleId: rp.roleId, permissionId: updatePerm.id } });
      await rolePermissionModel.findOrCreate({ where: { roleId: rp.roleId, permissionId: deletePerm.id } });
      
      // Delete the old mapping
      await rp.destroy();
    }
    
    // 4. Delete holidays:write from permissions
    await writePerm.destroy();
    console.log("Successfully replaced holidays:write with create, update, delete");
  } else {
    console.log("holidays:write not found, already cleaned up.");
  }

  await app.close();
}
bootstrap();
