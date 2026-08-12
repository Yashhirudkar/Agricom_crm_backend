export const FOLLOW_UP_REMINDER_PRIORITY = {
  OVERDUE: 'overdue',
  TOMORROW: 'tomorrow',
};

export const COMPLETED_STATUSES = [
  'Confirmed',
  'Deal Finalized',
  'Closed',
  'Completed',
];

import { PartnerFollowUp } from '../../masters/partner/partner-followup.model';

export function transformFollowUpCreator(
  followUp: PartnerFollowUp,
): Record<string, any> {
  const plain = followUp.get({ plain: true }) as Record<string, any>;
  const creator = plain.creator;

  let createdByObj = {
    id: plain.createdBy || null,
    name: 'Unknown User',
    avatar: null,
    role: null,
  };

  if (creator) {
    const roleName =
      creator.roles && creator.roles.length > 0 ? creator.roles[0].name : null;
    createdByObj = {
      id: creator.id,
      name: creator.name,
      avatar: creator.avatarUrl || null,
      role: roleName,
    };
  }

  // Delete the raw creator key to keep the payload clean
  delete plain.creator;

  return {
    ...plain,
    createdBy: createdByObj,
  };
}
