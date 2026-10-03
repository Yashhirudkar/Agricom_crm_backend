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
];
