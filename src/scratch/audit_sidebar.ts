import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SystemService } from '../system/services/system.service';

async function test() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const systemService = app.get(SystemService);
  
  try {
    const menu = await systemService.getSidebar({ type: 'super_admin', clientId: null, roles: [] });
    console.log("=== FOLDERS ===");
    menu.folders.forEach((f: any) => {
      console.log(`FOLDER: [${f.id}] ${f.name} (sort: ${f.sort_order}, icon: ${f.icon_name})`);
      (f.items || []).forEach((i: any) => {
        console.log(`  ITEM: [${i.id}] ${i.name} -> ${i.route} (sort: ${i.sort_order}, perm: ${i.permission_link})`);
      });
    });
    console.log("=== STANDALONE ITEMS ===");
    menu.standaloneItems.forEach((i: any) => {
      console.log(`ITEM: [${i.id}] ${i.name} -> ${i.route} (sort: ${i.sort_order})`);
    });
  } catch (e: any) {
    console.log("Error:", e.message);
  }
  
  await app.close();
}

test();
