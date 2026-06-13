import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const permissionModel = app.get('PermissionRepository');
  const rolePermissionModel = app.get('RolePermissionRepository');
  
  console.log("=== STARTING CLEANUP ===");

  // 1. Get all current permissions
  const allPerms = await permissionModel.findAll();
  
  for (const perm of allPerms) {
    const originalName = perm.name;
    const lowerName = originalName.toLowerCase();
    
    // Convert 'module.view' to 'module:read' style if found in permissions table
    // (though they were probably not there, just in sub_modules)
    
    // If it's old 'Holidays:read' style
    if (originalName !== lowerName) {
      console.log(`Found mixed case: ${originalName} (ID: ${perm.id})`);
      
      // Does the lowercase version already exist? (Because our seeder just created it!)
      const existingLower = await permissionModel.findOne({ where: { name: lowerName } });
      
      if (existingLower && existingLower.id !== perm.id) {
        console.log(`  -> Lowercase version already exists (ID: ${existingLower.id}). Deleting old role_permissions and old permission...`);
        // We can just delete the old role_permissions because the seeder likely already assigned the new lowercase permission to the relevant roles
        await rolePermissionModel.destroy(
          { where: { permissionId: perm.id } }
        );
        // Delete the old mixed case permission
        console.log(`  -> Deleting old mixed case permission (ID: ${perm.id})`);
        await perm.destroy();
      } else {
        console.log(`  -> Updating to lowercase...`);
        await perm.update({
          name: lowerName,
          resource: perm.resource.toLowerCase(),
          action: perm.action.toLowerCase()
        });
      }
    }
  }

  // Also delete old 'view_holidays' / 'manage_holidays' if they exist and are unused
  const oldBadPerms = await permissionModel.findAll({
    where: {
      name: ['view_holidays', 'manage_holidays']
    }
  });
  
  for (const bad of oldBadPerms) {
    console.log(`Deleting old unused permission: ${bad.name}`);
    await rolePermissionModel.destroy({ where: { permissionId: bad.id } });
    await bad.destroy();
  }

  console.log("\n=== FINAL PERMISSIONS TABLE ===");
  const finalPerms = await permissionModel.findAll({ attributes: ['id', 'name'] });
  finalPerms.forEach(p => console.log(`ID: ${p.id} | Name: ${p.name}`));

  await app.close();
}
bootstrap();
