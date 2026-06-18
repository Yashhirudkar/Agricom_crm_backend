import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getModelToken } from '@nestjs/sequelize';
import { User } from '../users/models/user.model';

async function test() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const userModel = app.get(getModelToken(User));
  
  const users = await userModel.findAll({ attributes: ['id', 'name', 'email', 'clientId'], limit: 5 });
  console.log(users.map((u: any) => u.toJSON()));
  
  await app.close();
}

test();
