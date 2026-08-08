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
import * as phase16 from './phase-16-attendance-leave-conflict';
import * as phase17 from './phase-17-attendance-reminder-preferences';
import * as phase18 from './phase-18-company-hr-policy-break-minutes';
import * as phase19 from './phase-19-company-hr-policy-break-start-end';
import * as phase20 from './phase-20-followup-permissions-sync';
import * as phase21 from './phase-21-chat-foundation';
import * as phase22 from './phase-22-chat-advanced';
import * as phase23 from './phase-23-message-read-state-deleted-at';
import * as phase24 from './phase-24-add-conversation-description';
import * as phase25 from './phase-25-company-hr-policy-weekly-off-days';
import * as phase26 from './phase-26-add-birthday-metadata-to-user-preferences';
import * as phase27 from './phase-27-add-conversation-avatar';
import * as phase28 from './phase-28-add-channel-posting-policy';
import * as phase29 from './phase-29-add-member-mute-notifications';
import * as phase30 from './phase-30-enterprise-attendance-policy';
import * as phase31 from './phase-31-mandatory-break-deduction';
import * as phase32 from './phase-32-role-partner-role-access';
import * as phase33 from './phase-33-add-enquiry-logistics-fields';

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
  phase16,
  phase17,
  phase18,
  phase19,
  phase20,
  phase21,
  phase22,
  phase23,
  phase24,
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





