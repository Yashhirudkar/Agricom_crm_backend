import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MatrixBuilderService } from '../system/services/matrix-builder.service';

async function test() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const matrixService = app.get(MatrixBuilderService);
  
  try {
    const registry = await matrixService.getRegistry();
    console.log(JSON.stringify(registry, null, 2));
  } catch (e: any) {
    console.log("Error:", e.message);
  }
  
  await app.close();
}

test();
