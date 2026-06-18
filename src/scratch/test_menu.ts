import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AuthController } from '../auth/controllers/auth.controller';
import { SystemService } from '../system/services/system.service';

async function test() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const authCtrl = app.get(AuthController);
  
  // Mock req for Super Admin
  const req = {
    user: {
      type: 'super_admin',
      userId: 1, // Super admin ID
      clientId: null,
    },
    headers: {}
  };

  try {
    const menu = await authCtrl.getMyMenu(req);
    console.log(JSON.stringify(menu, null, 2));
  } catch (err) {
    console.error("Error:", err);
  }
  
  await app.close();
}

test();
