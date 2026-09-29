/**
 * @deprecated
 * NotificationConfig table removed — overkill for single-group setup.
 * Group configuration is managed via env vars:
 *   WHATSAPP_GROUP_ID   — explicit JID
 *   WHATSAPP_GROUP_NAME — name-based resolution
 *
 * When multi-group support is needed in the future, restore this model
 * and add a migration (phase-28-notification-config.ts).
 */
export {};
