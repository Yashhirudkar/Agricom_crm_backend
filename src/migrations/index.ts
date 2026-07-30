import * as phase01 from './phase-01-core';
import * as phase02 from './phase-02-system';
import * as phase03 from './phase-03-rbac';
import * as phase04 from './phase-04-client-access';
import * as phase05 from './phase-05-hrms';
import * as phase06 from './phase-06-attendance';
import * as phase07 from './phase-07-leaves';
import * as phase08 from './phase-08-masters';
import * as phase09 from './phase-09-partners';
import * as phase10 from './phase-10-sales';
import * as phase11 from './phase-11-tasks';
import * as phase12 from './phase-12-others';
import * as phase13 from './phase-13-partner-followup';
import * as phase14 from './phase-14-notifications';
import * as phase15 from './phase-15-task-performance-indexes';

export interface MigrationPhase {
  phase: string;
  name: string;
  up: (queryInterface: any) => Promise<void>;
  down: (queryInterface: any) => Promise<void>;
}

/**
 * All phases in dependency order.
 * Phase N ke tables sirf Phase N-1 ke tables ke baad run hone chahiye.
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
];



