import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { Permission } from './src/rbac/models/permission.model';
import { Role } from './src/rbac/models/role.model';
import { RolePermission } from './src/rbac/models/role-permission.model';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const permissions = [
      { name: 'view_holidays', description: 'Can view holiday calendar', resource: 'Holidays', action: 'read' },
      { name: 'manage_holidays', description: 'Can create, edit and delete holidays', resource: 'Holidays', action: 'write' },
    ];

    for (const p of permissions) {
      await Permission.findOrCreate({
        where: { name: p.name },
        defaults: p,
      });
    }

    console.log('Seeded Holiday Permissions successfully.');
  } catch (error) {
    console.error('Error seeding permissions:', error);
  }

  await app.close();
}

bootstrap();
