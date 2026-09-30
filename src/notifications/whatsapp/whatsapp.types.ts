/**
 * WhatsApp-specific internal types.
 * Never exported outside the notifications module.
 */

export interface WhatsAppConfig {
  enabled: boolean;
  /** Path on disk to persist multi-file auth state */
  sessionPath: string;
  /**
   * Group to send notifications to — resolved in this order:
   *  1. DB NotificationConfig key `whatsapp.default.group_jid`
   *  2. WHATSAPP_GROUP_ID env var (explicit JID)
   *  3. WHATSAPP_GROUP_NAME env var (resolved at runtime via groupFetchAllParticipating)
   */
  groupName: string;
  groupId: string;
}

/** Shape expected by the enquiry notification template builder */
export interface EnquiryNotificationData {
  enquiryNo?: string;
  customerName?: string;
  product?: string;
  purity?: string;
  quantity?: number | string;
  quantityUnit?: string;
  packingType?: string;
  origin?: string;
  destination?: string;
  shipmentType?: string;
  shipmentDate?: string | Date;
  bid?: number | string;
  bidCurrency?: string;
  createdByName?: string;
  createdAt?: Date;
}
