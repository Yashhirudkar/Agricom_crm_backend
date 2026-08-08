import { QueryInterface } from 'sequelize';

export const phase = '35';
export const name = 'Add fileVisibility column to conversations';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    ALTER TABLE conversations 
    ADD COLUMN IF NOT EXISTS "fileVisibility" VARCHAR(50) DEFAULT 'EVERYONE';
  `);
  console.log('✅ Phase 35 - fileVisibility column added successfully');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    ALTER TABLE conversations 
    DROP COLUMN IF EXISTS "fileVisibility";
  `);
  console.log('✅ Phase 35 - fileVisibility column reverted');
}
