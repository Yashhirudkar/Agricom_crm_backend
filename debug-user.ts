import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const userModel = app.get('UserRepository');
  const roleModel = app.get('RoleRepository');
  const userCompanyModel = app.get('UserCompanyRepository');

  const user = await userModel.findOne({ where: { email: 'yashhirudkar100@gmail.com' } });
  
  console.log(`User ID: ${user.id}`);
  
  const userCompanies = await userCompanyModel.findAll({ where: { userId: user.id }, include: [roleModel] });
  for (const uc of userCompanies) {
    console.log(`Company ID: ${uc.companyId} | Role ID: ${uc.roleId} | Role Name: ${uc.role?.name}`);
    
    // Get permissions for this role
    const role = await roleModel.findByPk(uc.roleId, { include: ['rolePermissions'] });
    console.log(`Role ${uc.role?.name} Permissions count: ${role.rolePermissions.length}`);
    for (const rp of role.rolePermissions) {
      console.log(`  - Permission ID: ${rp.permissionId}`);
    }
  }

  await app.close();
}
bootstrap();
