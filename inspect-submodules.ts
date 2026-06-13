import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const subModuleModel = app.get('SubModuleRepository');
  const sysModuleModel = app.get('SysModuleRepository');
  
  const subModules = await subModuleModel.findAll({ raw: true });
  const sysModules = await sysModuleModel.findAll({ raw: true });
  
  console.log("=== SYS MODULES ===");
  console.log(sysModules);
  
  console.log("=== SUB MODULES ===");
  console.log(subModules);

  await app.close();
}
bootstrap();
