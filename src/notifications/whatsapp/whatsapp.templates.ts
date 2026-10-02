import { EnquiryNotificationData } from './whatsapp.types';

/**
 * WhatsApp message template builders.
 *
 * Rules:
 *  - Only non-null, non-empty fields are included in the output.
 *  - Formatting uses WhatsApp markdown (* for bold).
 *  - Static methods only — no state, no dependencies.
 *
 * To add a new notification type (e.g. Quotation):
 *  1. Add `static quotationCreated(data: QuotationNotificationData): string`
 *  2. Add a case in NotificationDispatchService.buildMessage()
 *  Done — no other file changes needed.
 */
export class WhatsAppTemplates {
  // ─── Private helpers ────────────────────────────────────────────────────────

  private static formatDate(value: string | Date | undefined | null): string | null {
    if (!value) return null;
    try {
      const d = typeof value === 'string' ? new Date(value) : value;
      if (isNaN(d.getTime())) return null;
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return null;
    }
  }

  /** Appends a bold-label line. If value is falsy, prints 'None' */
  private static line(label: string, value: string | number | null | undefined): string {
    const displayValue = (value === null || value === undefined || value === '') ? 'None' : value;
    return `*${label}:* ${displayValue}\n`;
  }

  // ─── Templates ──────────────────────────────────────────────────────────────

  /**
   * New enquiry created notification.
   *
   * Sample output:
   * ```
   * *ENQ-000001*
   *
   * *Customer:* ABC Traders
   * *Product:* Wheat
   * *Purity:* 99.99%
   * *Quantity:* 500 MT
   * *Packing Type:* 50KG PP Bags
   * *Origin:* Mumbai Port
   * *Destination:* Rotterdam Port
   * *Shipment Type:* FOB
   * *Shipment Date:* 15 Oct 2026
   * *Bid:* 320 USD
   * *Created By:* Rahul
   * *Created At:* 26 Sep 2026
   * ```
   */
  static enquiryCreated(data: EnquiryNotificationData): string {
    const title = data.enquiryNo 
      ? `*${data.enquiryNo}*\n\n`
      : '';
    const lines: string[] = title ? [title] : [];

    lines.push(WhatsAppTemplates.line('Customer', data.customerName));
    lines.push(WhatsAppTemplates.line('Product', data.product));
    lines.push(WhatsAppTemplates.line('Purity', data.purity));

    const qty = (data.quantity !== null && data.quantity !== undefined && data.quantity !== '')
      ? (data.quantityUnit ? `${data.quantity} ${data.quantityUnit}` : String(data.quantity))
      : null;
    lines.push(WhatsAppTemplates.line('Quantity', qty));

    lines.push(WhatsAppTemplates.line('Packing Type', data.packingType));
    lines.push(WhatsAppTemplates.line('Origin', data.origin));
    lines.push(WhatsAppTemplates.line('Destination', data.destination));
    lines.push(WhatsAppTemplates.line('Shipment Type', data.shipmentType));
    lines.push(
      WhatsAppTemplates.line('Shipment Date', WhatsAppTemplates.formatDate(data.shipmentDate)),
    );

    const amountLabel = data.bidType === 'BID' ? 'Bid Amount' : 'Target';
    const amountVal = (data.bid !== null && data.bid !== undefined && data.bid !== '')
      ? (data.bidCurrency ? `${data.bid} ${data.bidCurrency}` : String(data.bid))
      : null;
    lines.push(WhatsAppTemplates.line(amountLabel, amountVal));

    lines.push(WhatsAppTemplates.line('Note', data.note));

    const createdByFirstName = data.createdByName ? data.createdByName.split(' ')[0] : undefined;
    lines.push(WhatsAppTemplates.line('Created By', createdByFirstName));
    lines.push(WhatsAppTemplates.line('Created At', WhatsAppTemplates.formatDate(data.createdAt)));

    return lines.join('');
  }

  /**
   * WhatsApp configuration test message.
   */
  static testMessage(data: { companyName: string }): string {
    const time = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    
    return `✅ WhatsApp configuration verified successfully.

Company:
${data.companyName}

Time:
${time}

Agricom ERP`;
  }

  // ─── Future templates (examples) ────────────────────────────────────────────
  // static quotationCreated(data: QuotationNotificationData): string { ... }
  // static shipmentBooked(data: ShipmentNotificationData): string { ... }
  // static paymentReceived(data: PaymentNotificationData): string { ... }
}
