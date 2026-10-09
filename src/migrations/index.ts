import * as phase01 from './phase-01-core';
import * as phase02 from './phase-02-hrms';
import * as phase03 from './phase-03-attendance-leaves';
import * as phase04 from './phase-04-masters';
import * as phase05 from './phase-05-partners';
import * as phase06 from './phase-06-sales';
import * as phase07 from './phase-07-shipments';
import * as phase08 from './phase-08-tasks';
import * as phase09 from './phase-09-enquiries-followups-others';
import * as phase10 from './phase-10-chat';
import * as phase11 from './phase-11-purchase-contracts';
import * as phase13 from './phase-13-quotations';
import * as phase15 from './phase-15-logistics';
import * as phase19 from './phase-19-monthly-stock-summary';
import * as phase17 from './phase-17-freight-combined';
import * as phase25 from './phase-25-cargo-availability';
import * as phase26 from './phase-26-custom-locations';
import * as phase27 from './phase-27-notification-logs';
import * as phase28 from './phase-28-company-whatsapp';
import * as phase29 from './phase-29-enterprise-multi-tenant';
import * as phase30 from './phase-30-combined-migrations';
import * as phase31 from './phase-31-purchase-contract-currency';
import * as phase32 from './phase-32-purchase-contract-dispatch-to';
import * as phase33 from './phase-33-purchase-contract-unloading-date';
import * as phase34 from './phase-34-sales-contract-number-unique';
import * as phase35 from './phase-35-add-spec-fields-to-purchase-contracts';
import * as phase36 from './phase-36-add-loading-address-to-partners';
import * as phase37 from './phase-37-add-freight-container-rates';
import * as phase38 from './phase-38-add-direct-freight-quotes';
import * as phase39 from './phase-39-add-display-order-to-companies';
import * as phase40 from './phase-40-add-place-of-loading-to-purchase-contracts';
import * as phase41 from './phase-41-add-freight-routes-and-rates';
import * as phase42 from './phase-42-add-shipment-sequence';
import * as phase43 from './phase-43-add-purchase-date-to-purchase-contracts';
import * as phase44 from './phase-44-allow-direct-freight-quotes-without-seller';
import * as phase45 from './phase-45-make-validity-date-nullable';

export interface MigrationPhase {
  phase: string;
  name: string;
  up: (queryInterface: any) => Promise<void>;
  down: (queryInterface: any) => Promise<void>;
}

/**
 * All migration phases in dependency order.
 * Each phase only depends on tables created in previous phases.
 */
export const ALL_PHASES: MigrationPhase[] = [
  phase01,
  phase02,
  phase03,
  phase04,
  phase05,
  phase06,
  phase07,
  phase08,
  phase09,
  phase10,
  phase11,
  phase13,
  phase15,
  phase19,
  phase17,
  phase25,
  phase26,
  phase27,
  phase28,
  phase29,
  phase30,
  phase31,
  phase32,
  phase33,
  phase34,
  phase35,
  phase36,
  phase37,
  phase38,
  phase39,
  phase40,
  phase41,
  phase42,
  phase43,
  phase44,
  phase45,
];
