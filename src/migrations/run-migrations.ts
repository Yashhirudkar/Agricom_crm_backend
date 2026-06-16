import * as fs from 'fs';
import * as path from 'path';
import { Sequelize } from 'sequelize';

/**
 * Enterprise Safe Migration Runner
 * 
 * Future-Proof & Scalable Approach:
 * 1. This script safely loads the database configuration from the environment.
 * 2. It connects to the database and verifies the connection.
 * 3. It establishes a transactional scope for safe DDL and Data operations.
 * 
 * Note: Since NestJS is currently configured with `sync: { alter: true }` in 
 * app.module.ts, structural schema updates happen automatically during development.
 * This script is reserved for complex data migrations or production-level manual 
 * schema alterations that `alter: true` cannot handle natively.
 */

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
  console.log('[Migration] Starting Future-Proof Migration Runner');
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
    logging: false, // Set to true to see SQL queries during migration
  });

  try {
    await sequelize.authenticate();
    console.log('[Migration] Database connection verified successfully.');

    // Start a managed transaction for safe migrations
    await sequelize.transaction(async (transaction) => {
      
      console.log('[Migration] Executing migration tasks within transaction...');

      // Check if table 'employees' exists first
      const [tableCheck] = await sequelize.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'employees'
        );
      `, { transaction });

      const tableExists = (tableCheck[0] as any)[0]?.exists;

      if (!tableExists) {
        console.log('[Migration] Table "employees" does not exist in the database. Skipping manual employee migration steps.');
      } else {

      // ----------------------------------------------------------------------
      // [ENTERPRISE MIGRATION TASKS HERE]
      console.log('[Migration] Safely casting enum types for Employee Profile Expansion...');

      // 1. Employee Status
      await sequelize.query(`
        DO $$ BEGIN
            CREATE TYPE "enum_employees_status" AS ENUM ('DRAFT', 'ONBOARDING', 'PROBATION', 'ACTIVE', 'CONFIRMED', 'NOTICE_PERIOD', 'RESIGNED', 'TERMINATED');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      // Map old strings to new enums
      await sequelize.query(`
        UPDATE employees SET status = 'ACTIVE' WHERE status::text = 'Active';
        UPDATE employees SET status = 'TERMINATED' WHERE status::text = 'Inactive';
        UPDATE employees SET status = 'DRAFT' WHERE status::text NOT IN ('DRAFT', 'ONBOARDING', 'PROBATION', 'ACTIVE', 'CONFIRMED', 'NOTICE_PERIOD', 'RESIGNED', 'TERMINATED');
      `, { transaction });

      await sequelize.query(`
        ALTER TABLE employees 
        ALTER COLUMN status TYPE "enum_employees_status" 
        USING status::text::"enum_employees_status";
      `, { transaction });

      // 2. Employment Type
      await sequelize.query(`
        DO $$ BEGIN
            CREATE TYPE "enum_employees_employmentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'INTERN', 'CONTRACT', 'CONSULTANT');
          EXCEPTION
              WHEN duplicate_object THEN null;
          END $$;
      `, { transaction });

      await sequelize.query(`
        UPDATE employees SET "employmentType" = 'FULL_TIME' WHERE "employmentType"::text IS NULL OR "employmentType"::text NOT IN ('FULL_TIME', 'PART_TIME', 'INTERN', 'CONTRACT', 'CONSULTANT');
      `, { transaction });

      await sequelize.query(`
        ALTER TABLE employees 
        ALTER COLUMN "employmentType" TYPE "enum_employees_employmentType" 
        USING "employmentType"::text::"enum_employees_employmentType";
      `, { transaction });

      // 3. Work Mode
      await sequelize.query(`
        DO $$ BEGIN
            CREATE TYPE "enum_employees_workMode" AS ENUM ('REMOTE', 'HYBRID', 'OFFICE');
          EXCEPTION
              WHEN duplicate_object THEN null;
          END $$;
      `, { transaction });

      // Assume existing is missing or random, default to OFFICE
      // Check if column exists first before updating
      await sequelize.query(`
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS "workMode" VARCHAR(50);
        UPDATE employees SET "workMode" = 'OFFICE' WHERE "workMode"::text IS NULL OR "workMode"::text NOT IN ('REMOTE', 'HYBRID', 'OFFICE');
      `, { transaction });

      await sequelize.query(`
        ALTER TABLE employees 
        ALTER COLUMN "workMode" TYPE "enum_employees_workMode" 
        USING "workMode"::text::"enum_employees_workMode";
      `, { transaction });

      console.log('[Migration] Employee enums cast successfully.');
      } // End if (tableExists)
      // ----------------------------------------------------------------------

      // ----------------------------------------------------------------------
      // [DOCUMENT MANAGEMENT MIGRATIONS]
      console.log('[Migration] Safely expanding employee_documents table...');
      
      const [docTableCheck] = await sequelize.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'employee_documents'
        );
      `, { transaction });

      const docTableExists = (docTableCheck[0] as any)?.exists;

      if (docTableExists) {
        // Create custom enums
        await sequelize.query(`
          DO $$ BEGIN
              CREATE TYPE "enum_employee_documents_documentCategory" AS ENUM ('IDENTITY', 'EMPLOYMENT', 'EDUCATION', 'FINANCIAL', 'OTHER');
          EXCEPTION
              WHEN duplicate_object THEN null;
          END $$;

          DO $$ BEGIN
              CREATE TYPE "enum_employee_documents_verificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
          EXCEPTION
              WHEN duplicate_object THEN null;
          END $$;
        `, { transaction });

        // Add new columns if they do not exist
        await sequelize.query(`
          ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
          ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "documentCategory" "enum_employee_documents_documentCategory" DEFAULT 'OTHER';
          ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "documentName" VARCHAR(255);
          ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "filePath" VARCHAR(1000);
          ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "fileSize" INTEGER;
          ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "mimeType" VARCHAR(100);
          ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "documentNumber" VARCHAR(100);
          ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "issueDate" DATE;
          ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "expiryDate" DATE;
          ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "notifyBeforeExpiryDays" INTEGER;
          ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "verificationStatus" "enum_employee_documents_verificationStatus" DEFAULT 'PENDING';
          ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "verificationRemarks" TEXT;
          ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "verifiedBy" INTEGER;
          ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP WITH TIME ZONE;
          ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "isMandatory" BOOLEAN DEFAULT false;
          ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "version" INTEGER DEFAULT 1;
          ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT true;
        `, { transaction });

        // Backfill companyId from employees table for existing rows
        await sequelize.query(`
          UPDATE "employee_documents" ed
          SET "companyId" = e."companyId"
          FROM "employees" e
          WHERE ed."employeeId" = e.id AND ed."companyId" IS NULL;
        `, { transaction });

        console.log('[Migration] employee_documents table expanded successfully.');
      } else {
        console.log('[Migration] Table "employee_documents" does not exist. Skipping manual document alterations.');
      }
      // ----------------------------------------------------------------------
      // [BRANCH MODULE MIGRATION]
      console.log('[Migration] Safely setting up branches table...');

      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "branches" (
          "id" SERIAL PRIMARY KEY,
          "companyId" INTEGER NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
          "branchName" VARCHAR(255) NOT NULL,
          "branchCode" VARCHAR(100) NOT NULL,
          "address" TEXT,
          "city" VARCHAR(100),
          "state" VARCHAR(100),
          "country" VARCHAR(100),
          "pincode" VARCHAR(20),
          "timezone" VARCHAR(100) NOT NULL DEFAULT 'UTC',
          "contactNumber" VARCHAR(50),
          "email" VARCHAR(255),
          "managerId" INTEGER,
          "isHeadOffice" BOOLEAN NOT NULL DEFAULT false,
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "latitude" DOUBLE PRECISION,
          "longitude" DOUBLE PRECISION,
          "geoFenceRadius" DOUBLE PRECISION,
          "workingDays" JSONB,
          "holidayCalendarCode" VARCHAR(100),
          "createdBy" INTEGER,
          "updatedBy" INTEGER,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `, { transaction });

      await sequelize.query(`
        ALTER TABLE "branches" DROP CONSTRAINT IF EXISTS "branches_companyId_branchCode_key";
        ALTER TABLE "branches" ADD CONSTRAINT "branches_companyId_branchCode_key" UNIQUE ("companyId", "branchCode");

        ALTER TABLE "branches" DROP CONSTRAINT IF EXISTS "branches_companyId_branchName_key";
        ALTER TABLE "branches" ADD CONSTRAINT "branches_companyId_branchName_key" UNIQUE ("companyId", "branchName");
      `, { transaction });

      await sequelize.query(`
        ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
        
        ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_branchId_fkey";
        ALTER TABLE "employees" ADD CONSTRAINT "employees_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT;

        ALTER TABLE "branches" DROP CONSTRAINT IF EXISTS "branches_managerId_fkey";
        ALTER TABLE "branches" ADD CONSTRAINT "branches_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "employees"("id") ON DELETE SET NULL;
      `, { transaction });

      console.log('[Migration] branches table and employee relation established successfully.');
      // ----------------------------------------------------------------------
      // [LEAVE MANAGEMENT MIGRATIONS]
      console.log('[Migration] Safely setting up Leave Management Enums...');

      await sequelize.query(`
        DO $$ BEGIN
            CREATE TYPE "enum_leave_requests_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await sequelize.query(`
        DO $$ BEGIN
            CREATE TYPE "enum_leave_requests_halfDayType" AS ENUM ('FIRST_HALF', 'SECOND_HALF');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await sequelize.query(`
        DO $$ BEGIN
            CREATE TYPE "enum_leave_approval_steps_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'BYPASSED');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await sequelize.query(`
        DO $$ BEGIN
            CREATE TYPE "enum_leave_approval_logs_action" AS ENUM ('CREATED', 'APPROVED', 'REJECTED', 'CANCELLED', 'ESCALATED');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await sequelize.query(`
        DO $$ BEGIN
            CREATE TYPE "enum_leave_types_genderRestriction" AS ENUM ('MALE', 'FEMALE');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      await sequelize.query(`
        DO $$ BEGIN
            CREATE TYPE "enum_leave_types_maritalRestriction" AS ENUM ('MARRIED', 'UNMARRIED');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });

      console.log('[Migration] Leave Management Enums setup successfully.');
      // ----------------------------------------------------------------------

      // ----------------------------------------------------------------------
      // [COMPANY HR POLICY MIGRATIONS]
      console.log('[Migration] Safely updating company_hr_policies table...');

      await sequelize.query(`
        ALTER TABLE "company_hr_policies" ADD COLUMN IF NOT EXISTS "allowBackdatedLeave" BOOLEAN DEFAULT false;
        ALTER TABLE "company_hr_policies" ADD COLUMN IF NOT EXISTS "maxBackdatedDays" INTEGER DEFAULT 0;
      `, { transaction });

      console.log('[Migration] No pending manual migrations detected.');

      // ----------------------------------------------------------------------
      // [LEAVE MANAGEMENT TABLES]
      console.log('[Migration] Safely setting up Leave Management Tables...');

      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "leave_types" (
          "id" SERIAL PRIMARY KEY,
          "companyId" INTEGER NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
          "name" VARCHAR(100) NOT NULL,
          "code" VARCHAR(50) NOT NULL,
          "description" TEXT,
          "daysPerYear" DECIMAL(5,2) NOT NULL,
          "minimumServiceDays" INTEGER NOT NULL DEFAULT 0,
          "applicableAfterProbation" BOOLEAN NOT NULL DEFAULT false,
          "encashable" BOOLEAN NOT NULL DEFAULT false,
          "carryForwardAllowed" BOOLEAN NOT NULL DEFAULT false,
          "maxCarryForwardDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
          "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
          "isPaid" BOOLEAN NOT NULL DEFAULT false,
          "allowHalfDay" BOOLEAN NOT NULL DEFAULT false,
          "genderRestriction" "enum_leave_types_genderRestriction",
          "maritalRestriction" "enum_leave_types_maritalRestriction",
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "createdBy" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
          "updatedBy" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          UNIQUE ("companyId", "code")
        );
      `, { transaction });

      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "employee_leave_balances" (
          "id" SERIAL PRIMARY KEY,
          "companyId" INTEGER NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
          "employeeId" INTEGER NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
          "leaveTypeId" INTEGER NOT NULL REFERENCES "leave_types"("id") ON DELETE RESTRICT,
          "year" INTEGER NOT NULL,
          "totalAllocated" DECIMAL(5,2) NOT NULL DEFAULT 0,
          "usedDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
          "pendingDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
          "remainingDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
          "carryForwardDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          UNIQUE ("employeeId", "leaveTypeId", "year")
        );
      `, { transaction });

      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "leave_requests" (
          "id" SERIAL PRIMARY KEY,
          "companyId" INTEGER NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
          "employeeId" INTEGER NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
          "leaveTypeId" INTEGER NOT NULL REFERENCES "leave_types"("id") ON DELETE RESTRICT,
          "fromDate" DATE NOT NULL,
          "toDate" DATE NOT NULL,
          "totalDays" DECIMAL(5,2) NOT NULL,
          "isHalfDay" BOOLEAN NOT NULL DEFAULT false,
          "halfDayType" "enum_leave_requests_halfDayType",
          "reason" TEXT,
          "status" "enum_leave_requests_status" NOT NULL DEFAULT 'PENDING',
          "attachmentPath" VARCHAR(1000),
          "mimeType" VARCHAR(100),
          "fileSize" INTEGER,
          "currentApprovalLevel" INTEGER NOT NULL DEFAULT 1,
          "finalApprovalLevel" INTEGER NOT NULL DEFAULT 1,
          "rejectedReason" TEXT,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `, { transaction });

      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "leave_approval_steps" (
          "id" SERIAL PRIMARY KEY,
          "leaveRequestId" INTEGER NOT NULL REFERENCES "leave_requests"("id") ON DELETE CASCADE,
          "approverId" INTEGER NOT NULL REFERENCES "employees"("id") ON DELETE RESTRICT,
          "level" INTEGER NOT NULL,
          "status" "enum_leave_approval_steps_status" NOT NULL,
          "remarks" TEXT,
          "approvedAt" TIMESTAMP WITH TIME ZONE,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `, { transaction });

      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "leave_approval_logs" (
          "id" SERIAL PRIMARY KEY,
          "leaveRequestId" INTEGER NOT NULL REFERENCES "leave_requests"("id") ON DELETE CASCADE,
          "action" "enum_leave_approval_logs_action" NOT NULL,
          "performedBy" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
          "remarks" TEXT,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `, { transaction });

      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS "leave_balance_history" (
          "id" SERIAL PRIMARY KEY,
          "companyId" INTEGER NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
          "employeeId" INTEGER NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
          "leaveTypeId" INTEGER NOT NULL REFERENCES "leave_types"("id") ON DELETE RESTRICT,
          "year" INTEGER NOT NULL,
          "openingBalance" DECIMAL(5,2) NOT NULL DEFAULT 0,
          "usedBalance" DECIMAL(5,2) NOT NULL DEFAULT 0,
          "carryForward" DECIMAL(5,2) NOT NULL DEFAULT 0,
          "closingBalance" DECIMAL(5,2) NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `, { transaction });

      console.log('[Migration] Leave Management Tables created successfully.');
      // ----------------------------------------------------------------------
    });

    console.log('[Migration] All migration tasks executed successfully.');
    console.log('----------------------------------------------------');

  } catch (error) {
    console.error('[Migration] Critical Failure during migration sequence:');
    console.error(error);
    console.log('[Migration] Transaction rolled back. Database state preserved.');
    process.exit(1);
  } finally {
    await sequelize.close();
    console.log('[Migration] Database connection closed safely.');
  }
}

run();
