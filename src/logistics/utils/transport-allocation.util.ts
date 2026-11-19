const COMPLETED_TRANSPORT_STATUSES = new Set([
  'Transport Assigned',
  'Ready For Shipment',
  'Shipment Created',
  'In Transit',
  'Delivered',
  'Closed',
]);

export const isTransportAllocationComplete = (status?: string | null) =>
  COMPLETED_TRANSPORT_STATUSES.has(String(status || ''));