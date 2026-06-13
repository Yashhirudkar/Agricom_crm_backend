import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const subModuleModel = app.get('SubModuleRepository');
  
  const oldHolidays = await subModuleModel.findOne({ where: { key: 'holidays_list' } });
  if (oldHolidays) {
    console.log(`Deleting old holidays_list submodule (permissionKey: ${oldHolidays.permissionKey})`);
    await oldHolidays.destroy();
  }

  const allSubModules = await subModuleModel.findAll();
  console.log("Remaining SubModules:");
  allSubModules.forEach(s => console.log(`  - ${s.name} (${s.permissionKey})`));

  await app.close();
}
bootstrap();
