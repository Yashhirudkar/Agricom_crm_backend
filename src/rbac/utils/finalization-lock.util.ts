import { ForbiddenException } from '@nestjs/common';

export interface FinalizationCheckOptions {
  isCompleted: boolean;
  oneTimeEditUsed?: boolean;
  user: any;
  userPermissions?: Set<string>;
  resource: string; // e.g. 'cargo_allocation', 'freight_allocation', 'shipment_stuffing_execution'
  recordType?: string; // Human-friendly name e.g. 'Cargo Allocation'
  customMessage?: string;
}

export interface FinalizationCheckResult {
  allowed: boolean;
  isCompleted: boolean;
  isOverride: boolean; // Has EDIT_COMPLETED or super_admin
  isOneTimeEdit: boolean; // Allowed via one-time edit (will consume one-time edit)
}

/**
 * Check if the user has override permission to modify completed records for a given resource.
 * Super Admins always have override permission.
 */
export function hasEditCompletedOverride(
  user: any,
  userPermissions?: Set<string>,
  resource?: string,
): boolean {
  if (!user) return false;
  const userType = String(user.type || '').toLowerCase();
  if (userType === 'super_admin') return true;

  if (!userPermissions || !resource) return false;

  const target = `${resource.toLowerCase()}:edit_completed`;
  if (userPermissions.has(target)) return true;

  // Handle freight allocation and logistics aliases.
  if (
    resource === 'freight_allocation' &&
    userPermissions.has('logistics:edit_completed')
  ) {
    return true;
  }
  if (
    resource === 'logistics' &&
    userPermissions.has('freight_allocation:edit_completed')
  ) {
    return true;
  }

  return false;
}

/**
 * Evaluates finalization access according to the Enterprise Decision Table:
 * - Pending/Draft -> Allowed
 * - Completed with EDIT_COMPLETED override -> Unlimited Edit Allowed (does not consume one-time edit)
 * - Completed without EDIT_COMPLETED & oneTimeEditUsed == false -> 1 Edit Allowed (consumes one-time edit)
 * - Completed without EDIT_COMPLETED & oneTimeEditUsed == true -> Locked Forever (Forbidden)
 */
export function evaluateFinalizationAccess(
  options: FinalizationCheckOptions,
): FinalizationCheckResult {
  const {
    isCompleted,
    oneTimeEditUsed = false,
    user,
    userPermissions,
    resource,
  } = options;

  if (!isCompleted) {
    return {
      allowed: true,
      isCompleted: false,
      isOverride: false,
      isOneTimeEdit: false,
    };
  }

  // 1. Check override permission (or super_admin)
  const isOverride = hasEditCompletedOverride(user, userPermissions, resource);
  if (isOverride) {
    return {
      allowed: true,
      isCompleted: true,
      isOverride: true,
      isOneTimeEdit: false,
    };
  }

  // 2. User lacks override permission: check one-time correction right
  if (!oneTimeEditUsed) {
    return {
      allowed: true,
      isCompleted: true,
      isOverride: false,
      isOneTimeEdit: true,
    };
  }

  // 3. One-time correction already used: permanently locked
  return {
    allowed: false,
    isCompleted: true,
    isOverride: false,
    isOneTimeEdit: false,
  };
}

/**
 * Enforces finalization locking rules. Throws ForbiddenException (HTTP 403) if locked.
 */
export function assertCanModifyRecord(
  options: FinalizationCheckOptions,
): FinalizationCheckResult {
  const result = evaluateFinalizationAccess(options);
  if (!result.allowed) {
    const name = options.recordType || options.resource.replace(/_/g, ' ');
    throw new ForbiddenException(
      options.customMessage ||
        `${name} is completed and the 1-time correction has already been used. You require the "${options.resource}:edit_completed" permission to modify finalized records.`,
    );
  }
  return result;
}
