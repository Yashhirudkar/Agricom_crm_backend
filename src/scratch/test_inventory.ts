import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MatrixBuilderService } from '../system/services/matrix-builder.service';

async function test() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const matrixService = app.get(MatrixBuilderService);
  
  try {
    const registry = await matrixService.getRegistry();
    const inventory = registry.find(m => m.module_name.toLowerCase().includes('inventory') || m.resources.some(r => r.resource_name === 'inventory'));
    if (inventory) {
      console.log("SUCCESS! Found inventory module/resource:");
      console.log(JSON.stringify(inventory, null, 2));
    } else {
      console.log("FAIL: Inventory not found in registry.");
    }
  } catch (e: any) {
    console.log("Error:", e.message);
  }
  
  await app.close();
}

test();
