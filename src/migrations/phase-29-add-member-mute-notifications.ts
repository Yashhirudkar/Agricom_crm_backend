import { QueryInterface, DataTypes } from 'sequelize';

export const phase = '29';
export const name = 'Add isNotificationMuted column to conversation_members';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // 1. Add isNotificationMuted column
  await queryInterface
    .addColumn('conversation_members', 'isNotificationMuted', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    })
    .catch(() => {});

  // 2. Transition existing self-muted members:
  // If isMuted is true and mutedUntil is NULL, it is highly likely it was a self-mute.
  // We copy it to isNotificationMuted = true and reset isMuted = false so they can send messages.
  await queryInterface.sequelize
    .query(
      `UPDATE "conversation_members" 
       SET "isNotificationMuted" = true, "isMuted" = false 
       WHERE "isMuted" = true AND "mutedUntil" IS NULL;`
    )
    .catch((err) => {
      console.error('[Migration Phase 29] Failed to transition old self-mutes:', err.message);
    });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('conversation_members', 'isNotificationMuted').catch(() => {});
}
