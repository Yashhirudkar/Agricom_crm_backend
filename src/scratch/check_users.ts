import { Sequelize } from 'sequelize-typescript';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL!, { logging: false });

async function run() {
  try {
    await sequelize.authenticate();
    const users = await sequelize.query(`SELECT id, name, email, "clientId" FROM "users" LIMIT 5;`, { type: 'SELECT' });
    console.log(users);
  } finally {
    await sequelize.close();
  }
}

run();
