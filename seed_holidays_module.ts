import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { SysModule } from './src/system/models/SysModule';
import { SubModule } from './src/system/models/SubModule';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const [mod, created] = await SysModule.findOrCreate({
      where: { key: 'holidays_management' },
      defaults: {
        name: 'Holidays',
        key: 'holidays_management',
        icon: 'Calendar',
        sortOrder: 4,
        isActive: true,
        isClientAdminOnly: false,
        isSuperAdminOnly: false,
      },
    });

    await SubModule.findOrCreate({
      where: { key: 'holidays_list' },
      defaults: {
        moduleId: mod.id,
        name: 'Holiday Calendar',
        key: 'holidays_list',
        route: '/holidays',
        icon: 'Calendar',
        permissionKey: 'view_holidays',
        sortOrder: 1,
        isActive: true,
      },
    });

    console.log('Seeded Holiday Module successfully.');
  } catch (error) {
    console.error('Error seeding module:', error);
  }

  await app.close();
}

bootstrap();
