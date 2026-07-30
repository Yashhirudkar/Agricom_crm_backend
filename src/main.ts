import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PartnerFollowUp } from './masters/partner/partner-followup.model';
import { Notification } from './notifications/models/notification.model';
import { SidebarFolder } from './system/models/sidebar-folder.model';
import { SidebarItem } from './system/models/sidebar-item.model';
import { UserPreference } from './users/models/user-preference.model';
import { ModuleResource } from './system/models/module-resource.model';
import { ResourceAction } from './system/models/resource-action.model';
import { Role } from './rbac/models/role.model';
import { RoleActionPermission } from './rbac/models/role-action-permission.model';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn'],
  });

  // Serve static assets (like uploaded profile images)
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/api/uploads/',
  });
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  // Set global API prefix
  app.setGlobalPrefix('api');

  // Enable validation globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Set up Swagger API Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Agricom CRM API')
    .setDescription('The API documentation for Agricom SaaS CRM')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  // const document = SwaggerModule.createDocument(app, swaggerConfig);
  // SwaggerModule.setup('api/docs', app, document);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 5000;

  // Enable CORS for frontend
  // NOTE: origin: true reflects the request origin dynamically (valid with credentials: true)
  // origin: '*' is INVALID with credentials: true — browsers will reject it
  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-company-id',
      'Idempotency-Key',
      'idempotency-key',
    ],
    credentials: true,
  });

  console.log('Force syncing notifications and preferences tables...');
  await UserPreference.sync({ alter: true });
  await Notification.sync({ alter: true });
  console.log('Notifications and preferences tables synced!');

  try {
    // 1. Seed "notification" resource action permissions
    let resource = await ModuleResource.findOne({ where: { name: 'notification' } });
    if (!resource) {
      console.log('Seeding "notification" ModuleResource in DB...');
      resource = await ModuleResource.create({
        name: 'notification',
        display_name: 'Notification Settings',
        sort_order: 120,
      });
      console.log('Resource "notification" seeded!');
    }

    let action = await ResourceAction.findOne({
      where: {
        resource_id: resource.id,
        name: 'MANAGE',
      },
    });

    if (!action) {
      console.log('Seeding "MANAGE" ResourceAction for "notification" in DB...');
      action = await ResourceAction.create({
        name: 'MANAGE',
        display_name: 'Manage Notifications',
        sort_order: 10,
        resource_id: resource.id,
      });
      console.log('ResourceAction "MANAGE" seeded!');
    }

    // 2. Auto-grant "notification:manage" to roles named 'Admin' or 'Client Admin'
    const adminRoles = await Role.findAll({
      where: {
        name: ['Admin', 'Client Admin'],
      },
    });

    if (adminRoles.length > 0) {
      for (const role of adminRoles) {
        const existingPermission = await RoleActionPermission.findOne({
          where: {
            role_id: role.id,
            resource_action_id: action.id,
          },
        });

        if (!existingPermission) {
          console.log(`Auto-granting "notification:manage" to role ${role.name}...`);
          await RoleActionPermission.create({
            role_id: role.id,
            resource_action_id: action.id,
          });
          console.log(`Granted!`);
        }
      }
    }

    // 3. Seed "Notification Master" item under the "Masters" folder
    const mastersFolder = await SidebarFolder.findOne({ where: { name: 'Masters' } });
    if (mastersFolder) {
      const existingItem = await SidebarItem.findOne({
        where: {
          route: '/masters/notifications',
          folder_id: mastersFolder.id,
        },
      });

      if (!existingItem) {
        console.log('Seeding Notification Master sidebar item in DB...');
        await SidebarItem.create({
          name: 'Notification Master',
          route: '/masters/notifications',
          icon_name: 'BellRing',
          iconColor: '#FF9500',
          useFolderColor: false,
          permission_link: 'notification:manage',
          folder_id: mastersFolder.id,
          sort_order: 100,
          is_active: true,
        });
        console.log('Notification Master sidebar item seeded!');
      } else if (existingItem.permission_link !== 'notification:manage') {
        console.log('Updating Notification Master sidebar item permission_link...');
        existingItem.permission_link = 'notification:manage';
        await existingItem.save();
        console.log('Notification Master sidebar item permission_link updated!');
      }
    }
  } catch (error) {
    console.error('Failed to sync Notification Master permissions & sidebar item:', error);
  }

  // Bind to localhost
  // await app.listen(port, '0.0.0.0');
  await app.listen(port, 'localhost');

  console.log(`Application is running on: http://localhost:${port}/api`);
  //console.log(`LAN access: http://192.168.1.222:${port}/api`);

}
bootstrap();
// Trigger DB sync for Sales Contracts
// Trigger restart for SEED_DB
// Trigger restart for admin fallback fix
// Trigger DB sync for Enquiries
// Revert DB sync to false
