import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SidebarFolder } from '../system/models/sidebar-folder.model';
import { SidebarItem } from '../system/models/sidebar-item.model';
import { ClientFolderAccess } from '../clients/models/client-folder-access.model';
import { ClientItemAccess } from '../clients/models/client-item-access.model';
import { ClientActionAccess } from '../clients/models/client-action-access.model';
import { ClientModuleAccess } from '../clients/models/client-module-access.model';
import { RoleActionPermission } from '../rbac/models/role-action-permission.model';
import { Role } from '../rbac/models/role.model';
import { getModelToken } from '@nestjs/sequelize';

async function fullAudit() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const folderModel = app.get<typeof SidebarFolder>(getModelToken(SidebarFolder));
  const itemModel = app.get<typeof SidebarItem>(getModelToken(SidebarItem));
  const cFolderModel = app.get<typeof ClientFolderAccess>(getModelToken(ClientFolderAccess));
  const cItemModel = app.get<typeof ClientItemAccess>(getModelToken(ClientItemAccess));
  const cActionModel = app.get<typeof ClientActionAccess>(getModelToken(ClientActionAccess));
  const cModuleModel = app.get<typeof ClientModuleAccess>(getModelToken(ClientModuleAccess));
  const rapModel = app.get<typeof RoleActionPermission>(getModelToken(RoleActionPermission));
  const roleModel = app.get<typeof Role>(getModelToken(Role));

  // 1. sidebar_folders
  const folders = await folderModel.findAll({ order: [['sort_order', 'ASC']] });
  console.log(`\n[FOLDERS] count=${folders.length}`);
  folders.forEach(f => console.log(`  id=${f.id} name="${f.name}" sort=${f.sort_order} active=${f.is_active} icon=${f.icon_name}`));

  // 2. sidebar_items with duplicate + orphan check
  const items = await itemModel.findAll({ order: [['folder_id', 'ASC'], ['sort_order', 'ASC']] });
  console.log(`\n[ITEMS] count=${items.length}`);
  items.forEach(i => console.log(`  id=${i.id} name="${i.name}" route="${i.route}" folder_id=${i.folder_id} perm=${i.permission_link} active=${i.is_active}`));

  // duplicates
  const folderNames = folders.map(f => f.name);
  const dupFolders = folderNames.filter((n, idx) => folderNames.indexOf(n) !== idx);
  console.log(`\n[DUPLICATE FOLDERS]: ${dupFolders.length > 0 ? dupFolders.join(', ') : 'none'}`);

  const itemRoutes = items.map(i => i.route).filter(Boolean);
  const dupRoutes = itemRoutes.filter((r, idx) => itemRoutes.indexOf(r) !== idx);
  console.log(`[DUPLICATE ROUTES]: ${dupRoutes.length > 0 ? dupRoutes.join(', ') : 'none'}`);

  const folderIds = folders.map(f => f.id);
  const orphans = items.filter(i => i.folder_id !== null && !folderIds.includes(i.folder_id));
  console.log(`[ORPHAN ITEMS]: ${orphans.length > 0 ? orphans.map(o => `id=${o.id} name="${o.name}"`).join(', ') : 'none'}`);

  // 3. client access tables
  const cfa = await cFolderModel.findAll();
  const cia = await cItemModel.findAll();
  const caa = await cActionModel.findAll();
  const cma = await cModuleModel.findAll();
  console.log(`\n[client_folder_access] rows=${cfa.length}`);
  cfa.forEach(r => console.log(`  client_id=${r.client_id} folder_id=${r.folder_id}`));
  console.log(`[client_item_access] rows=${cia.length}`);
  cia.forEach(r => console.log(`  client_id=${r.client_id} item_id=${r.item_id}`));
  console.log(`[client_action_access] rows=${caa.length}`);
  console.log(`[client_module_access] rows=${cma.length}`);

  // 4. roles + permissions
  const roles = await roleModel.findAll({ order: [['id', 'ASC']] });
  console.log(`\n[ROLES] count=${roles.length}`);
  for (const role of roles) {
    const perms = await rapModel.count({ where: { role_id: role.id } });
    console.log(`  id=${role.id} name="${role.name}" clientId=${role.clientId} isSystem=${role.isSystemRole} isActive=${role.isActive} perms=${perms}`);
  }

  console.log('\n[AUDIT DONE]');
  await app.close();
}

fullAudit().catch(console.error);
