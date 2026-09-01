import { SetMetadata } from '@nestjs/common';

export const ANY_PERMISSIONS_KEY = 'any_permissions';

/**
 * Allow access if the user holds ANY ONE of the listed permissions (OR logic).
 * Useful for read endpoints that should be accessible to multiple roles.
 *
 * Usage: @RequireAnyPermission('logistics:view', 'enquiry:read')
 */
export const RequireAnyPermission = (...permissions: string[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);
