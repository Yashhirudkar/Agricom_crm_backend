import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/sequelize';
import { User } from '../users/models/user.model';

async function test() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const userModel = app.get(getModelToken(User));
  
  try {
    const oldMenuItems = await userModel.sequelize!.query('SELECT * FROM "menu_items"', { type: 'SELECT' });
    console.log("Old menu_items count:", oldMenuItems.length);
  } catch (e: any) {
    console.log("Error querying menu_items:", e.message);
  }
  
  await app.close();
}

test();
