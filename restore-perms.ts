import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const rolePermissionModel = app.get('RolePermissionRepository');
  const permissionModel = app.get('PermissionRepository');

  // Find holidays permissions
  const readPerm = await permissionModel.findOne({ where: { name: 'holidays:read' } });
  const writePerm = await permissionModel.findOne({ where: { name: 'holidays:write' } });

  const roleIdsToUpdate = [11, 18]; // manager, sales

  for (const roleId of roleIdsToUpdate) {
    // assign read
    await rolePermissionModel.findOrCreate({
      where: { roleId, permissionId: readPerm.id }
    });
    // assign write
    await rolePermissionModel.findOrCreate({
      where: { roleId, permissionId: writePerm.id }
    });
    console.log(`Restored holidays permissions for Role ID: ${roleId}`);
  }

  await app.close();
}
bootstrap();
