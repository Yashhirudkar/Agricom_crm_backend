import * as fs from 'fs';
import * as path from 'path';
import { Sequelize } from 'sequelize';
import * as bcrypt from 'bcryptjs';

// 1. Read environment variables from .env
function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  if (!fs.existsSync(envPath)) {
    console.error(`[Migration] .env file not found at ${envPath}`);
    process.exit(1);
  }
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split('=');
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim();
    process.env[key] = value;
  });
}

loadEnv();

const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
const dbUser = process.env.DB_USERNAME || 'postgres';
const dbPass = process.env.DB_PASSWORD || 'admin';
const dbName = process.env.DB_NAME || 'agricom';

async function run() {
  console.log(`[Migration] Connecting to database ${dbName} on ${dbHost}:${dbPort}...`);
  const sequelize = new Sequelize(dbName, dbUser, dbPass, {
    host: dbHost,
    port: dbPort,
    dialect: 'postgres',
    logging: false,
  });

  try {
    await sequelize.authenticate();
    console.log('[Migration] Database connection successful.');

    // ─── PART 1: DDL ALTERS ───
    console.log('[Migration] Starting Schema Alterations (DDL)...');

    // Add clientId to users
    await sequelize.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "clientId" INTEGER REFERENCES "clients" ("id") ON DELETE SET NULL;
    `);
    console.log('[Migration] Column "clientId" checked/added to "users".');

    // Add status to users
    await sequelize.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" VARCHAR(50) DEFAULT 'Active';
    `);
    console.log('[Migration] Column "status" checked/added to "users".');

    // Add lastLogin to users
    await sequelize.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastLogin" TIMESTAMP WITH TIME ZONE;
    `);
    console.log('[Migration] Column "lastLogin" checked/added to "users".');

    // Add lastCompanyId reference to companies(id)
    await sequelize.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastCompanyId" INTEGER REFERENCES "companies" ("id") ON DELETE SET NULL;
    `);
    console.log('[Migration] Column "lastCompanyId" Checked/added to "users".');

    // Create user_companies junction table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "user_companies" (
        "id" SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "companyId" INTEGER NOT NULL REFERENCES "companies" ("id") ON DELETE CASCADE,
        "roleId" INTEGER REFERENCES "roles" ("id") ON DELETE SET NULL,
        "status" VARCHAR(50) DEFAULT 'Active',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        UNIQUE ("userId", "companyId")
      );
    `);
    console.log('[Migration] Junction table "user_companies" checked/created.');

    // Create indexes for user_companies
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS "user_companies_userId_idx" ON "user_companies" ("userId");
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS "user_companies_companyId_idx" ON "user_companies" ("companyId");
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS "user_companies_roleId_idx" ON "user_companies" ("roleId");
    `);
    console.log('[Migration] Indexes on "user_companies" verified.');

    // ─── PART 2: DATA MIGRATION ───
    console.log('[Migration] Starting Data Migration...');

    // 1. Seed or retrieve "Client Admin" role
    // Let's check if the role exists
    const [roles] = await sequelize.query(`SELECT id FROM "roles" WHERE "name" = 'Client Admin' LIMIT 1;`);
    let clientAdminRoleId: number;
    if (roles.length === 0) {
      console.log('[Migration] "Client Admin" role not found. Creating system-wide "Client Admin" role...');
      const now = new Date().toISOString();
      const [insertRoleRes] = await sequelize.query(`
        INSERT INTO "roles" ("name", "description", "isActive", "companyId", "createdAt", "updatedAt")
        VALUES ('Client Admin', 'Client level administrator with full access', true, null, '${now}', '${now}')
        RETURNING id;
      `);
      clientAdminRoleId = (insertRoleRes as any)[0].id;
    } else {
      clientAdminRoleId = (roles[0] as any).id;
    }
    console.log(`[Migration] "Client Admin" role ID resolved: ${clientAdminRoleId}`);

    // 2. Migrate Clients from "clients" to "users"
    const [clients] = await sequelize.query(`SELECT id, name, email, password FROM "clients";`);
    console.log(`[Migration] Found ${clients.length} clients in "clients" table.`);

    for (const client of clients as any) {
      const emailLower = client.email.toLowerCase().trim();
      const [existingUsers] = await sequelize.query(`SELECT id FROM "users" WHERE LOWER("email") = :email LIMIT 1;`, {
        replacements: { email: emailLower }
      });

      let userId: number;
      if (existingUsers.length === 0) {
        console.log(`[Migration] Copying Client Admin login to "users" for client: ${client.name} (${emailLower})`);
        const now = new Date().toISOString();
        const [insertUserRes] = await sequelize.query(`
          INSERT INTO "users" ("name", "email", "password", "isActive", "clientId", "status", "createdAt", "updatedAt")
          VALUES (:name, :email, :password, true, :clientId, 'Active', :now, :now)
          RETURNING id;
        `, {
          replacements: {
            name: client.name,
            email: emailLower,
            password: client.password, // preserve raw hash
            clientId: client.id,
            now
          }
        });
        userId = (insertUserRes as any)[0].id;

        // Assign to UserRole table
        await sequelize.query(`
          INSERT INTO "user_roles" ("userId", "roleId", "createdAt", "updatedAt")
          VALUES (:userId, :roleId, :now, :now);
        `, {
          replacements: {
            userId,
            roleId: clientAdminRoleId,
            now
          }
        });
      } else {
        userId = (existingUsers[0] as any).id;
        console.log(`[Migration] Client Admin user already exists for client: ${client.name} (User ID: ${userId})`);
      }
    }

    // 3. Migrate companyId from users table to user_companies
    // Retrieve users that have an existing companyId
    const [usersWithCompany] = await sequelize.query(`
      SELECT u.id as "userId", u."companyId", c."clientId"
      FROM "users" u
      JOIN "companies" c ON u."companyId" = c.id
      WHERE u."companyId" IS NOT NULL;
    `);

    console.log(`[Migration] Found ${usersWithCompany.length} user-company relations to migrate.`);

    for (const u of usersWithCompany as any) {
      // Set users.clientId
      await sequelize.query(`
        UPDATE "users"
        SET "clientId" = :clientId, "lastCompanyId" = :companyId
        WHERE id = :userId;
      `, {
        replacements: {
          clientId: u.clientId,
          companyId: u.companyId,
          userId: u.userId
        }
      });

      // Try to find the user's role in the old user_roles table
      const [userRoles] = await sequelize.query(`
        SELECT "roleId" FROM "user_roles" WHERE "userId" = :userId LIMIT 1;
      `, {
        replacements: { userId: u.userId }
      });

      const roleId = userRoles.length > 0 ? (userRoles[0] as any).roleId : null;

      // Insert into user_companies
      const now = new Date().toISOString();
      await sequelize.query(`
        INSERT INTO "user_companies" ("userId", "companyId", "roleId", "status", "createdAt", "updatedAt")
        VALUES (:userId, :companyId, :roleId, 'Active', :now, :now)
        ON CONFLICT ("userId", "companyId") DO UPDATE
        SET "roleId" = COALESCE(user_companies."roleId", EXCLUDED."roleId");
      `, {
        replacements: {
          userId: u.userId,
          companyId: u.companyId,
          roleId,
          now
        }
      });
    }

    console.log('[Migration] Data Migration completed successfully!');
  } catch (err) {
    console.error('[Migration] Migration failed with error:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
    console.log('[Migration] Database connection closed.');
  }
}

run();
