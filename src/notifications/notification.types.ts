/**
 * Shared types for the unified notification dispatch system.
 *
 * Feature services ONLY import from this file — never from channel-specific modules.
 */

export enum NotificationChannel {
  WHATSAPP = 'whatsapp',
  // EMAIL = 'email',   // future
  // SMS = 'sms',      // future
}

/**
 * Template identifiers.
 *
 * Adding a new notification:
 *  1. Add value here
 *  2. Add template builder in WhatsAppTemplates (or future EmailTemplates)
 *  3. Add case in NotificationDispatchService.buildMessage()
 *  4. Call send() from the feature service
 */
export enum NotificationTemplate {
  NEW_ENQUIRY          = 'NEW_ENQUIRY',
  NEW_QUOTATION        = 'NEW_QUOTATION',           // future
  NEW_PURCHASE_CONTRACT = 'NEW_PURCHASE_CONTRACT',  // future
  NEW_SALES_CONTRACT   = 'NEW_SALES_CONTRACT',      // future
  NEW_SHIPMENT         = 'NEW_SHIPMENT',            // future
  CARGO_AVAILABLE      = 'CARGO_AVAILABLE',         // future
  PAYMENT_RECEIVED     = 'PAYMENT_RECEIVED',        // future
  ATTENDANCE_ALERT     = 'ATTENDANCE_ALERT',        // future
  FOLLOW_UP_DUE        = 'FOLLOW_UP_DUE',           // future
  TEST_MESSAGE         = 'TEST_MESSAGE',
}

/**
 * Symbolic recipient names.
 *
 * Feature services pass a symbolic name — the dispatch service resolves it
 * to the actual JID/email using env config (or DB config in the future).
 *
 * Benefit: when a group is recreated and gets a new JID, only the env var
 * (or future DB row) changes — feature services need zero changes.
 */
export enum NotificationRecipient {
  /** Default group for sales enquiries / quotations */
  SALES_GROUP      = 'SALES_GROUP',
  /** Future: management / executive group */
  MANAGEMENT_GROUP = 'MANAGEMENT_GROUP',
  // Add more groups here as needed
}

/**
 * Options passed to NotificationDispatchService.send().
 *
 * Example:
 * ```ts
 * this.notificationDispatchService.send({
 *   channel:   NotificationChannel.WHATSAPP,
 *   template:  NotificationTemplate.NEW_ENQUIRY,
 *   recipient: NotificationRecipient.SALES_GROUP,
 *   entityType: 'Enquiry',
 *   entityId:   enquiry.id,
 *   payload:   { enquiryNo, customerName, ... },
 * });
 * ```
 */
export interface NotificationSendOptions {
  channel:   NotificationChannel;
  template:  NotificationTemplate;

  /**
   * Symbolic recipient name (resolved to JID/email by dispatch service).
   * If omitted, falls back to WHATSAPP_GROUP_NAME / WHATSAPP_GROUP_ID env.
   */
  recipient?: NotificationRecipient | string;

  /**
   * Entity type for audit/debug logs, e.g. 'Enquiry', 'Quotation'.
   */
  entityType?: string;

  /**
   * Entity ID for audit/debug logs (UUID or integer as string).
   */
  entityId?: string | number;

  /**
   * The company ID to resolve WhatsApp settings from.
   */
  companyId?: number;

  /** Flat key-value payload passed to the template builder */
  payload: Record<string, any>;
}
