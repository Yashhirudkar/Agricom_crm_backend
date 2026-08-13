import { BadRequestException } from '@nestjs/common';

/**
 * Utility to generate a unique shipment reference based on contract and shipment details.
 * Format: [ContractNo]/[ShipmentNo]/C[Containers]/[Month]/[Year]
 */
export function generateShipmentReference(
  contractNo: string,
  shipmentNo: number,
  containers: number | null,
  shipmentDate: Date | string,
  qty: number,
): string {
  const dateObj = new Date(shipmentDate);
  if (Number.isNaN(dateObj.getTime())) {
    throw new BadRequestException('Invalid shipment date');
  }
  
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const monthStr = months[dateObj.getMonth()] || 'JAN';
  
  const containerCount = containers !== null && containers !== undefined ? containers : 0;
  const containerStr = `C${containerCount}`;
  
  const yearStr = String(dateObj.getFullYear()).slice(-2);
  
  return `${contractNo}/${shipmentNo}/${containerStr}/${monthStr}/${yearStr}`;
}
