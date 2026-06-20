import { Role } from '../rbac/models/role.model';
import { UserRole } from '../rbac/models/user-role.model';
import { RoleActionPermission } from '../rbac/models/role-action-permission.model';

export const syncRbac = async () => {
  console.log('--- Syncing RBAC Models ---');
  await Role.sync({ alter: true });
  await UserRole.sync({ alter: true });
  await RoleActionPermission.sync({ alter: true });
  console.log('--- RBAC Models Synced successfully ---');
};
