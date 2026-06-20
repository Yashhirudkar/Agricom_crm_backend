import { AppModule as AppModuleModel } from '../system/models/app-module.model';
import { ModuleResource } from '../system/models/module-resource.model';
import { ResourceAction } from '../system/models/resource-action.model';
import { SidebarFolder } from '../system/models/sidebar-folder.model';
import { SidebarItem } from '../system/models/sidebar-item.model';
import { ClientFolderAccess } from '../clients/models/client-folder-access.model';
import { ClientItemAccess } from '../clients/models/client-item-access.model';
import { ClientModuleAccess } from '../clients/models/client-module-access.model';
import { ClientActionAccess } from '../clients/models/client-action-access.model';

export const syncSystem = async () => {
  console.log('--- Syncing System Models ---');
  await AppModuleModel.sync({ alter: true });
  await ModuleResource.sync({ alter: true });
  await ResourceAction.sync({ alter: true });
  await SidebarFolder.sync({ alter: true });
  await SidebarItem.sync({ alter: true });
  await ClientFolderAccess.sync({ alter: true });
  await ClientItemAccess.sync({ alter: true });
  await ClientModuleAccess.sync({ alter: true });
  await ClientActionAccess.sync({ alter: true });
  console.log('--- System Models Synced successfully ---');
};
