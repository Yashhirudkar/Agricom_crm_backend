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

  private static formatDate(
    value: string | Date | undefined | null,
  ): string | null {
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

  private static formatDateTime(
    value: string | Date | undefined | null,
  ): string | null {
    if (!value) return null;
    try {
      const d = typeof value === 'string' ? new Date(value) : value;
      if (isNaN(d.getTime())) return null;
      const datePart = d
        .toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
        .replace(/ /g, '-');
      const timePart = d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      return `${datePart} ${timePart}`;
    } catch {
      return null;
    }
  }

  /** Appends a bold-label line. If value is falsy, prints 'None' */
  private static line(
    label: string,
    value: string | number | null | undefined,
  ): string {
    const displayValue =
      value === null || value === undefined || value === '' ? 'None' : value;
    return `*${label}:* ${String(displayValue).toUpperCase()}\n`;
  }

  private static formatNumber(
    value: string | number | null | undefined,
  ): string | null {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return !isNaN(num) ? String(num) : String(value);
  }

  private static formatIndianCurrency(
    value: string | number | null | undefined,
  ): string {
    if (
      value === null ||
      value === undefined ||
      value === '' ||
      isNaN(Number(value))
    ) {
      return 'N/A';
    }
    const num = Number(value);
    if (num === 0) return '0';

    const abs = Math.abs(num);
    let amount: number;
    let unit = '';

    if (abs >= 10000000) {
      amount = num / 10000000;
      unit = 'Cr';
    } else if (abs >= 100000) {
      amount = num / 100000;
      unit = 'Lakh';
    } else if (abs >= 1000) {
      amount = num / 1000;
      unit = 'K';
    } else {
      amount = num;
      unit = '';
    }

    // Up to 2 decimal places with unnecessary trailing zeros removed.
    // Whole unit figures (>= 100 Cr) are rounded to the nearest integer (e.g. 145 Cr).
    const rounded =
      Math.abs(amount) >= 100
        ? Math.round(amount)
        : Math.round(amount * 100) / 100;

    return unit ? `${rounded} ${unit}` : `${rounded}`;
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
      ? `*${data.enquiryNo.toUpperCase()}*\n\n`
      : '';
    const lines: string[] = title ? [title] : [];

    lines.push(WhatsAppTemplates.line('Customer', data.customerName));
    if (data.partnerRoleName) {
      lines.push(WhatsAppTemplates.line('Partner Role', data.partnerRoleName));
    }
    if (data.brokerName) {
      lines.push(WhatsAppTemplates.line('Broker', data.brokerName));
    }
    lines.push(
      WhatsAppTemplates.line(
        'Annual Sales (Turnover)',
        WhatsAppTemplates.formatIndianCurrency(data.partnerAnnualTurnover),
      ),
    );
    lines.push(WhatsAppTemplates.line('Product', data.product));
    lines.push(WhatsAppTemplates.line('Purity', data.purity));

    const qtyVal = WhatsAppTemplates.formatNumber(data.quantity);
    const qty =
      qtyVal !== null
        ? data.quantityUnit
          ? `${qtyVal} ${data.quantityUnit}`
          : qtyVal
        : null;
    lines.push(WhatsAppTemplates.line('Quantity', qty));

    lines.push(WhatsAppTemplates.line('Packing Type', data.packingType));
    if (data.transportDetails && data.transportDetails.length > 0) {
      data.transportDetails
        .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
        .forEach((route, index) => {
          const routePrefix =
            data.transportDetails!.length > 1 ? ` ${index + 1}` : '';
          lines.push(
            WhatsAppTemplates.line(
              `Place of Loading${routePrefix}`,
              route.origin || data.placeOfLoading,
            ),
          );
          lines.push(
            WhatsAppTemplates.line(
              `Incoterm${routePrefix}`,
              route.incoterm || data.incoterm,
            ),
          );
          lines.push(
            WhatsAppTemplates.line(
              `Destination${routePrefix}`,
              route.destination || data.destination,
            ),
          );
        });
    } else {
      lines.push(
        WhatsAppTemplates.line(
          'Place of Loading',
          data.placeOfLoading || data.origin,
        ),
      );
      lines.push(WhatsAppTemplates.line('Incoterm', data.incoterm));
      lines.push(WhatsAppTemplates.line('Destination', data.destination));
    }
    lines.push(WhatsAppTemplates.line('Shipment Type', data.shipmentType));
    lines.push(
      WhatsAppTemplates.line(
        'Shipment Date',
        WhatsAppTemplates.formatDate(data.shipmentDate),
      ),
    );

    const amountLabel = data.bidType === 'BID' ? 'Bid Amount' : 'Target';
    const amountValNum = WhatsAppTemplates.formatNumber(data.bid);
    const routeIncoterm =
      data.transportDetails?.[0]?.incoterm || data.incoterm;
    const amountVal =
      amountValNum !== null && Number(amountValNum) !== 0
        ? [
            amountValNum,
            data.bidCurrency,
            routeIncoterm,
          ].filter(Boolean).join(' ')
        : null;
    lines.push(WhatsAppTemplates.line(amountLabel, amountVal));

    const offerValNum = WhatsAppTemplates.formatNumber(
      data.offer !== undefined ? data.offer : data.offerAmount,
    );
    const offerVal =
      offerValNum !== null && Number(offerValNum) !== 0
        ? [
            offerValNum,
            data.bidCurrency,
            routeIncoterm,
          ].filter(Boolean).join(' ')
        : null;
    lines.push(WhatsAppTemplates.line('Offer', offerVal));

    lines.push(WhatsAppTemplates.line('Note', data.note));

    const createdByFirstName = data.createdByName
      ? data.createdByName.split(' ')[0]
      : undefined;
    lines.push(WhatsAppTemplates.line('Created By', createdByFirstName));
    lines.push(
      WhatsAppTemplates.line(
        'Created At',
        WhatsAppTemplates.formatDateTime(data.createdAt),
      ),
    );

    return lines.join('');
  }

  /**
   * Enquiry updated notification.
   */
  static enquiryUpdated(data: {
    oldEnquiry: any;
    newEnquiry: any;
    updatedByName?: string;
  }): string | null {
    const { oldEnquiry: oldData, newEnquiry: newData, updatedByName } = data;

    const changes: string[] = [];

    const diff = (
      label: string,
      oldVal: any,
      newVal: any,
      formatter?: (v: any) => any,
    ) => {
      let o = oldVal;
      let n = newVal;
      if (formatter) {
        o = formatter(o);
        n = formatter(n);
      }
      if (o !== n) {
        const displayO =
          o === null || o === undefined || o === ''
            ? 'NONE'
            : String(o).toUpperCase();
        const displayN =
          n === null || n === undefined || n === ''
            ? 'NONE'
            : String(n).toUpperCase();
        changes.push(`*${label}:*\n${displayO} → ${displayN}\n`);
      }
    };

    // basic comparison
    diff('Customer', oldData.partner?.entityName, newData.partner?.entityName);
    diff('Partner Role', oldData.partnerRole?.name, newData.partnerRole?.name);
    diff('Broker', oldData.broker?.entityName, newData.broker?.entityName);
    diff(
      'Annual Sales (Turnover)',
      oldData.partnerAnnualTurnover,
      newData.partnerAnnualTurnover,
      WhatsAppTemplates.formatIndianCurrency,
    );
    diff('Product', oldData.product?.name, newData.product?.name);
    diff('Packing Type', oldData.packingType?.name, newData.packingType?.name);
    diff('Purity', oldData.purity, newData.purity);

    const qtyFormatter = (v: any) =>
      v !== null && v !== undefined ? `${v} MT` : null;
    diff('Quantity', oldData.quantity, newData.quantity, qtyFormatter);

    const getTransportDetails = (d: any) =>
      Array.isArray(d?.transportDetails)
        ? d.transportDetails
            .slice()
            .sort((a: any, b: any) => (a.sequence || 0) - (b.sequence || 0))
        : [];
    const getOrigin = (d: any) =>
      getTransportDetails(d)[0]?.origin ||
      d?.originPort ||
      [d?.originCity, d?.originState, d?.originCountryId]
        .filter(Boolean)
        .join(', ') ||
      null;
    const getIncoterm = (d: any) =>
      getTransportDetails(d)[0]?.incoterm || d?.incoterm || null;

    const getDest = (d: any) =>
      getTransportDetails(d)[0]?.destination ||
      d?.destinationPort ||
      [d?.destinationCity, d?.destinationState, d?.destinationCountry]
        .filter(Boolean)
        .join(', ') ||
      null;
    diff(
      'Place of Loading',
      getOrigin(oldData),
      getOrigin(newData),
    );
    diff('Incoterm', getIncoterm(oldData), getIncoterm(newData));
    diff('Destination', getDest(oldData), getDest(newData));

    diff('Shipment Type', oldData.shipmentType, newData.shipmentType);
    diff('Shipment Mode', oldData.shipmentMode, newData.shipmentMode);
    diff(
      'Shipment Date',
      oldData.shipmentDate,
      newData.shipmentDate,
      WhatsAppTemplates.formatDate,
    );

    const bidFormatter = (v: any, currency: any, incoterm: any) => {
      if (v === null || v === undefined || v === '' || Number(v) === 0) {
        return null;
      }
      return [String(v), currency, incoterm].filter(Boolean).join(' ');
    };
    diff(
      'Bid / Target',
      bidFormatter(
        oldData.buyingInterest,
        oldData.bidCurrency,
        getIncoterm(oldData),
      ),
      bidFormatter(
        newData.buyingInterest,
        newData.bidCurrency,
        getIncoterm(newData),
      ),
    );
    diff(
      'Offer',
      bidFormatter(
        oldData.offerAmount,
        oldData.bidCurrency,
        getIncoterm(oldData),
      ),
      bidFormatter(
        newData.offerAmount,
        newData.bidCurrency,
        getIncoterm(newData),
      ),
    );
    diff('Note', oldData.note, newData.note);

    if (changes.length === 0) {
      return null; // Don't send if nothing changed
    }

    // Map newData to EnquiryNotificationData format for enquiryCreated
    const mappedNewData: EnquiryNotificationData = {
      enquiryNo: newData.enquiryNo,
      customerName: newData.partner?.entityName,
      partnerAnnualTurnover: newData.partnerAnnualTurnover,
      product: newData.product?.name,
      purity: newData.purity,
      quantity: newData.quantity,
      quantityUnit: 'MT',
      packingType: newData.packingType?.name,
      origin: getOrigin(newData) || undefined,
      placeOfLoading: getOrigin(newData) || undefined,
      incoterm: getIncoterm(newData) || undefined,
      destination: getDest(newData) || undefined,
      transportDetails: getTransportDetails(newData).map((route: any) => ({
        sequence: route.sequence,
        origin: route.origin,
        incoterm: route.incoterm,
        destination: route.destination,
      })),
      shipmentType: newData.shipmentType,
      shipmentDate: newData.shipmentDate,
      bid: newData.buyingInterest,
      bidCurrency: newData.bidCurrency,
      bidType: newData.bidType,
      offer: newData.offerAmount,
      offerAmount: newData.offerAmount,
      note: newData.note,
      partnerRoleName: newData.partnerRole?.name || undefined,
      brokerName: newData.broker?.entityName || undefined,
      // Map Updated By to Created By temporarily to reuse the template
      createdByName: updatedByName || 'System',
      createdAt: new Date(),
    };

    const baseMessage = WhatsAppTemplates.enquiryCreated(mappedNewData);

    return baseMessage;
  }

  /**
   * WhatsApp configuration test message.
   */
  static testMessage(data: { companyName: string }): string {
    const time = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
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
