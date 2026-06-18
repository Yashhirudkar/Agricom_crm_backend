import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ClientFolderAccess } from '../clients/models/client-folder-access.model';
import { ClientItemAccess } from '../clients/models/client-item-access.model';
import { SidebarFolder } from '../system/models/sidebar-folder.model';
import { SidebarItem } from '../system/models/sidebar-item.model';
import { SystemService } from '../system/services/system.service';
import { getModelToken } from '@nestjs/sequelize';

async function audit() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const folderAccessModel = app.get<typeof ClientFolderAccess>(getModelToken(ClientFolderAccess));
  const itemAccessModel = app.get<typeof ClientItemAccess>(getModelToken(ClientItemAccess));
  const systemService = app.get(SystemService);

  // ─── 1. Check client_folder_access table ─────────────────────────────────
  const allFolderAccess = await folderAccessModel.findAll();
  console.log(`\n=== client_folder_access table (total rows: ${allFolderAccess.length}) ===`);
  if (allFolderAccess.length === 0) {
    console.log('!! TABLE IS EMPTY — no rows exist for any client !!');
  } else {
    allFolderAccess.forEach(fa => {
      console.log(`  client_id=${fa.client_id}, folder_id=${fa.folder_id}`);
    });
  }

  // ─── 2. Check client_item_access table ───────────────────────────────────
  const allItemAccess = await itemAccessModel.findAll();
  console.log(`\n=== client_item_access table (total rows: ${allItemAccess.length}) ===`);
  if (allItemAccess.length === 0) {
    console.log('!! TABLE IS EMPTY — no rows exist for any client !!');
  } else {
    allItemAccess.forEach(ia => {
      console.log(`  client_id=${ia.client_id}, item_id=${ia.item_id}`);
    });
  }

  // ─── 3. Simulate getSidebar() for Super Admin ─────────────────────────────
  const superAdminMenu = await systemService.getSidebar({ type: 'super_admin', clientId: null, roles: [] });
  console.log(`\n=== getSidebar(super_admin) result ===`);
  console.log(`  folders: ${superAdminMenu.folders.length}`);
  console.log(`  standaloneItems: ${superAdminMenu.standaloneItems.length}`);
  superAdminMenu.folders.forEach((f: any) => {
    const items = f.items || f.dataValues?.items || [];
    console.log(`  FOLDER: ${f.name} (${items.length} items)`);
  });

  // ─── 4. Simulate getSidebar() for Client Admin (clientId=1) ──────────────
  const clientAdminMenu = await systemService.getSidebar({ type: 'client_admin', clientId: 1, roles: [] });
  console.log(`\n=== getSidebar(client_admin, clientId=1) result ===`);
  console.log(`  folders: ${clientAdminMenu.folders.length}`);
  console.log(`  standaloneItems: ${clientAdminMenu.standaloneItems.length}`);
  if (clientAdminMenu.folders.length === 0) {
    console.log('  !! CLIENT ADMIN GETS ZERO FOLDERS — client_folder_access is empty or no matching rows !!');
  }
  clientAdminMenu.folders.forEach((f: any) => {
    const items = f.items || f.dataValues?.items || [];
    console.log(`  FOLDER: ${f.name} (${items.length} items)`);
  });

  // ─── 5. Simulate auth/my-menu final output for client admin ───────────────
  console.log(`\n=== Simulating /auth/my-menu output for client_admin ===`);
  const menuData = clientAdminMenu;
  const isSuperAdmin = false;
  const isClientAdmin = true;
  const filterItem = (item: any) => {
    if (!item.permission_link) return true;
    if (isClientAdmin) return true;
    return false;
  };

  const folders = menuData.folders.map((f: any) => {
    const items = (f.items || f.dataValues?.items || []).filter(filterItem);
    return {
      id: `folder-${f.id}`,
      title: f.name,
      type: 'parent',
      itemCount: items.length
    };
  }).filter((f: any) => f.itemCount > 0 || isSuperAdmin);

  console.log(`  Final folders returned: ${folders.length}`);
  folders.forEach(f => console.log(`    ${f.title} (${f.itemCount} items)`));

  console.log('\n=== AUDIT COMPLETE ===');
  await app.close();
}

audit().catch(console.error);
