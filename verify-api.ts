import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { UsersService } from './src/users/services/users.service';
import { AuthController } from './src/auth/controllers/auth.controller';
import { SystemController } from './src/system/controllers/system.controller';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const usersService = app.get(UsersService);
  const authController = app.get(AuthController);
  const systemController = app.get(SystemController);
  const userModel = app.get('UserRepository');

  console.log("=== 1. SIDEBAR CONFIG ===");
  const sidebar = await systemController.getSidebar();
  const flatModules = sidebar.flatMap(m => m.subModules || []);
  console.log("Sidebar SubModules:");
  flatModules.forEach(s => console.log(`  Name: ${s.name} | permissionKey: ${s.permissionKey}`));

  console.log("\n=== 2. AUTH/ME FOR yashhirudkar100@gmail.com ===");
  
  // Find the standard user
  const dbUser = await userModel.findOne({ where: { email: 'yashhirudkar100@gmail.com' } });
  
  if (!dbUser) {
    console.log("User not found!");
  } else {
    // Call findByIdWithRoles (simulating AuthService payload)
    const fullUser = await usersService.findByIdWithRoles(dbUser.id);
    
    // Simulate Request object with x-company-id
    const activeCompanyId = fullUser.lastCompanyId || (fullUser.userCompanies.length > 0 ? fullUser.userCompanies[0].companyId : null);
    
    const req = {
      user: { userId: dbUser.id, type: 'user' },
      headers: {
        'x-company-id': activeCompanyId?.toString()
      }
    };
    
    // Call auth controller logic
    const profile = await authController.getProfile(req);
    
    console.log(`\nActive Company ID: ${activeCompanyId}`);
    console.log(`Returned Permissions Array:`);
    console.log(profile.permissions);
    
    console.log("\nSidebar items this user can see:");
    const userPerms = profile.permissions || [];
    const visibleItems = flatModules.filter(m => !m.permissionKey || userPerms.includes(m.permissionKey));
    visibleItems.forEach(s => console.log(`  - ${s.name} (Requires: ${s.permissionKey || 'None'})`));
  }

  await app.close();
}
bootstrap();
