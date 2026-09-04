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
import * as phase12 from './phase-12-leave-revalidation';
import * as phase13 from './phase-13-quotations';
import * as phase14 from './phase-14-partner-dynamic-fields-update';
import * as phase15 from './phase-15-logistics';
import * as phase16 from './phase-16-enquiries-logistics-fields';
import * as phase17 from './phase-17-freight-quotes-equipment-fields';
import * as phase18 from './phase-18-equipment-options';
import * as phase19 from './phase-19-monthly-stock-summary';
import * as phase20 from './phase-20-monthly-stock-sections';

export interface MigrationPhase {
  phase: string;
  name: string;
  up: (queryInterface: any) => Promise<void>;
  down: (queryInterface: any) => Promise<void>;
}

/**
 * All migration phases in dependency order.
 * Each phase only depends on tables created in previous phases.
 *
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
  phase12,
  phase13,
  phase14,
  phase15,
  phase16,
  phase17,
  phase18,
  phase19,
  phase20,
];


