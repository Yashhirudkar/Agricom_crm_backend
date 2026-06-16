import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { RbacService } from '../rbac/services/rbac.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const rbacService = app.get(RbacService);

  try {
    const registry = await rbacService.getPermissionRegistry();
    console.log('--- GET /GetPermissionRegistry response ---');
    console.log(JSON.stringify(registry, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }

  await app.close();
}

run();
