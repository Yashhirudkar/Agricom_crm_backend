import { QueryInterface } from 'sequelize';

export const phase = '34';
export const name = 'Add Enterprise Visibility & Privacy Policy tables and columns';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // 1. Create retention_policies table
  await queryInterface.sequelize.query(`
    CREATE TABLE IF NOT EXISTS retention_policies (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      days INTEGER,
      "legalHold" BOOLEAN NOT NULL DEFAULT FALSE,
      "autoArchive" BOOLEAN NOT NULL DEFAULT FALSE,
      "autoDelete" BOOLEAN NOT NULL DEFAULT FALSE,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  // 2. Create conversation_permission_overrides table
  await queryInterface.sequelize.query(`
    CREATE TABLE IF NOT EXISTS conversation_permission_overrides (
      id SERIAL PRIMARY KEY,
      "conversationId" INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      permission VARCHAR(100) NOT NULL,
      "principalType" VARCHAR(50) NOT NULL,
      "principalId" VARCHAR(100),
      "createdBy" INTEGER REFERENCES users(id) ON DELETE SET NULL,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  // 3. Add columns to conversations table
  await queryInterface.sequelize.query(`
    ALTER TABLE conversations 
    ADD COLUMN IF NOT EXISTS visibility VARCHAR(50) DEFAULT 'MEMBERS_ONLY',
    ADD COLUMN IF NOT EXISTS classification VARCHAR(50) DEFAULT 'INTERNAL',
    ADD COLUMN IF NOT EXISTS "enterpriseSecurityLevel" VARCHAR(50) DEFAULT 'STANDARD',
    ADD COLUMN IF NOT EXISTS "retentionPolicyId" INTEGER REFERENCES retention_policies(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS "invitePolicy" VARCHAR(50) DEFAULT 'MEMBER',
    ADD COLUMN IF NOT EXISTS "removeMemberPolicy" VARCHAR(50) DEFAULT 'ADMIN',
    ADD COLUMN IF NOT EXISTS "renamePolicy" VARCHAR(50) DEFAULT 'ADMIN',
    ADD COLUMN IF NOT EXISTS "iconPolicy" VARCHAR(50) DEFAULT 'ADMIN',
    ADD COLUMN IF NOT EXISTS "descPolicy" VARCHAR(50) DEFAULT 'ADMIN',
    ADD COLUMN IF NOT EXISTS "archivePolicy" VARCHAR(50) DEFAULT 'ADMIN',
    ADD COLUMN IF NOT EXISTS "deletePolicy" VARCHAR(50) DEFAULT 'OWNER',
    ADD COLUMN IF NOT EXISTS "showInSidebar" BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS "showInSearch" BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS "showInMention" BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS "showInRecentChats" BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS "showInGlobalSearch" BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS "notificationPrivacy" VARCHAR(50) DEFAULT 'MEMBERS_ONLY',
    ADD COLUMN IF NOT EXISTS "typingVisibility" VARCHAR(50) DEFAULT 'MEMBERS_ONLY',
    ADD COLUMN IF NOT EXISTS "presenceVisibility" VARCHAR(50) DEFAULT 'EVERYONE',
    ADD COLUMN IF NOT EXISTS "exportPolicy" VARCHAR(50) DEFAULT 'ADMIN',
    ADD COLUMN IF NOT EXISTS "legalHoldActive" BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "isFrozen" BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "dynamicMembershipRules" JSONB,
    ADD COLUMN IF NOT EXISTS "epHideMetadata" BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "epHideApi" BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "epHideSocket" BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "epHideSearch" BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "epNobodyOverride" BOOLEAN DEFAULT FALSE;
  `);

  // 4. Add columns to conversation_settings table
  await queryInterface.sequelize.query(`
    ALTER TABLE conversation_settings
    ADD COLUMN IF NOT EXISTS "allowSend" BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS "allowPin" BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS "pinPolicy" VARCHAR(50) DEFAULT 'MEMBER',
    ADD COLUMN IF NOT EXISTS "allowDownload" BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS "disableCopy" BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "screenshotProtectionBestEffort" BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "disablePrint" BOOLEAN DEFAULT FALSE;
  `);

  console.log('✅ Phase 34 - visibility and privacy policies tables and columns added successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Drop columns from conversation_settings
  await queryInterface.sequelize.query(`
    ALTER TABLE conversation_settings
    DROP COLUMN IF EXISTS "allowSend",
    DROP COLUMN IF EXISTS "allowPin",
    DROP COLUMN IF EXISTS "pinPolicy",
    DROP COLUMN IF EXISTS "allowDownload",
    DROP COLUMN IF EXISTS "disableCopy",
    DROP COLUMN IF EXISTS "screenshotProtectionBestEffort",
    DROP COLUMN IF EXISTS "disablePrint";
  `);

  // Drop columns from conversations
  await queryInterface.sequelize.query(`
    ALTER TABLE conversations 
    DROP COLUMN IF EXISTS visibility,
    DROP COLUMN IF EXISTS classification,
    DROP COLUMN IF EXISTS "enterpriseSecurityLevel",
    DROP COLUMN IF EXISTS "retentionPolicyId",
    DROP COLUMN IF EXISTS "invitePolicy",
    DROP COLUMN IF EXISTS "removeMemberPolicy",
    DROP COLUMN IF EXISTS "renamePolicy",
    DROP COLUMN IF EXISTS "iconPolicy",
    DROP COLUMN IF EXISTS "descPolicy",
    DROP COLUMN IF EXISTS "archivePolicy",
    DROP COLUMN IF EXISTS "deletePolicy",
    DROP COLUMN IF EXISTS "showInSidebar",
    DROP COLUMN IF EXISTS "showInSearch",
    DROP COLUMN IF EXISTS "showInMention",
    DROP COLUMN IF EXISTS "showInRecentChats",
    DROP COLUMN IF EXISTS "showInGlobalSearch",
    DROP COLUMN IF EXISTS "notificationPrivacy",
    DROP COLUMN IF EXISTS "typingVisibility",
    DROP COLUMN IF EXISTS "presenceVisibility",
    DROP COLUMN IF EXISTS "exportPolicy",
    DROP COLUMN IF EXISTS "legalHoldActive",
    DROP COLUMN IF EXISTS "isFrozen",
    DROP COLUMN IF EXISTS "dynamicMembershipRules",
    DROP COLUMN IF EXISTS "epHideMetadata",
    DROP COLUMN IF EXISTS "epHideApi",
    DROP COLUMN IF EXISTS "epHideSocket",
    DROP COLUMN IF EXISTS "epHideSearch",
    DROP COLUMN IF EXISTS "epNobodyOverride";
  `);

  // Drop overrides and retention tables
  await queryInterface.sequelize.query(`
    DROP TABLE IF EXISTS conversation_permission_overrides;
    DROP TABLE IF EXISTS retention_policies;
  `);

  console.log('✅ Phase 34 - visibility and privacy policies tables and columns reverted');
}
