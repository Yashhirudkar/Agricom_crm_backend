import * as fs from 'fs';
import * as path from 'path';
import { Sequelize } from 'sequelize';

function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const parts = trimmed.split('=');
      const key = parts[0].trim();
      if (process.env[key] === undefined) {
        process.env[key] = parts.slice(1).join('=').trim();
      }
    });
  }
}

async function run() {
  console.log('----------------------------------------------------');
  console.log('[Migration] Profile Architecture Migration');
  console.log('----------------------------------------------------');

  loadEnv();

  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
  const dbUser = process.env.DB_USERNAME || 'postgres';
  const dbPass = process.env.DB_PASSWORD || 'admin';
  const dbName = process.env.DB_NAME || 'agricom';

  const sequelize = new Sequelize(dbName, dbUser, dbPass, {
    host: dbHost,
    port: dbPort,
    dialect: 'postgres',
    logging: false,
  });

  try {
    await sequelize.authenticate();
    console.log('[Migration] Database connection verified successfully.');

    await sequelize.transaction(async (transaction) => {
      console.log('[Migration] Executing profile architecture migration...');

      // 1. Add avatarUrl to users
      await sequelize.query(`
        ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatarUrl" VARCHAR(1000);
      `, { transaction });

      // 2. Create user_preferences table
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "user_preferences" (
          "id" SERIAL PRIMARY KEY,
          "userId" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE UNIQUE,
          "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
          "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
          "pushNotifications" BOOLEAN NOT NULL DEFAULT true,
          "theme" VARCHAR(50) NOT NULL DEFAULT 'system',
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `, { transaction });

      // 3. Create profile_activity_logs table
      await sequelize.query(`
        DO $$ BEGIN
            CREATE TYPE "enum_profile_activity_logs_actorType" AS ENUM ('EMPLOYEE', 'ADMIN', 'SYSTEM');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "profile_activity_logs" (
          "id" SERIAL PRIMARY KEY,
          "userId" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "fieldName" VARCHAR(100) NOT NULL,
          "oldValue" TEXT,
          "newValue" TEXT,
          "actorType" "enum_profile_activity_logs_actorType" NOT NULL DEFAULT 'EMPLOYEE',
          "ipAddress" VARCHAR(45),
          "userAgent" TEXT,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `, { transaction });

      // 4. Indexes for profile_activity_logs
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS "idx_profile_activity_logs_userId" ON "profile_activity_logs"("userId");
        CREATE INDEX IF NOT EXISTS "idx_profile_activity_logs_createdAt" ON "profile_activity_logs"("createdAt");
      `, { transaction });

      // 5. Create user_password_histories table
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "user_password_histories" (
          "id" SERIAL PRIMARY KEY,
          "userId" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "passwordHash" VARCHAR(255) NOT NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `, { transaction });

      console.log('[Migration] Profile architecture tables and columns created successfully.');
    });

    console.log('[Migration] All migration tasks executed successfully.');
  } catch (error) {
    console.error('[Migration] Critical Failure during migration sequence:');
    console.error(error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
