import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { Permission } from './src/rbac/models/permission.model';
import { SubModule } from './src/system/models/SubModule';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const permissionModel = app.get('PermissionRepository');
  const subModuleModel = app.get('SubModuleRepository');

  console.log("=== 1. PERMISSIONS TABLE ===");
  const permissions = await permissionModel.findAll({ attributes: ['id', 'name', 'resource', 'action'] });
  permissions.forEach(p => console.log(`ID: ${p.id} | Name: ${p.name}`));

  console.log("\n=== 2. SUB_MODULES TABLE ===");
  const subModules = await subModuleModel.findAll({ attributes: ['key', 'name', 'permissionKey'] });
  subModules.forEach(s => console.log(`Key: ${s.key} | permissionKey: ${s.permissionKey}`));

  await app.close();
}
bootstrap();
