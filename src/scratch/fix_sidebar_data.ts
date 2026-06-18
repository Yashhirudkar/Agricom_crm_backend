import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SidebarFolder } from '../system/models/sidebar-folder.model';
import { SidebarItem } from '../system/models/sidebar-item.model';
import { getModelToken } from '@nestjs/sequelize';

async function fix() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const folderModel = app.get<typeof SidebarFolder>(getModelToken(SidebarFolder));
  const itemModel = app.get<typeof SidebarItem>(getModelToken(SidebarItem));

  // ─── 1. Remove old duplicate HR Management folder (id=3) ─────────────────
  const oldFolder = await folderModel.findOne({ where: { id: 3 } });
  if (oldFolder) {
    await itemModel.destroy({ where: { folder_id: 3 } });
    await oldFolder.destroy();
    console.log('Deleted old duplicate HR Management folder (id=3)');
  } else {
    console.log('Old HR Management folder (id=3) not found, skipping');
  }

  // ─── 2. Fix org-chart route mismatch ─────────────────────────────────────
  const orgChartItem = await itemModel.findOne({ where: { route: '/org-chart' } });
  if (orgChartItem) {
    await orgChartItem.update({ route: '/employees/org-chart' });
    console.log('Fixed org-chart route: /org-chart -> /employees/org-chart');
  } else {
    console.log('org-chart item not found');
  }

  // ─── 3. Add missing sidebar items ────────────────────────────────────────
  // Find Administration folder
  const adminFolder = await folderModel.findOne({ where: { name: 'Administration' } });
  if (adminFolder) {
    // Add Clients under Administration (super admin only)
    const clientsExists = await itemModel.findOne({ where: { name: 'Clients' } });
    if (!clientsExists) {
      await itemModel.create({
        name: 'Clients', route: '/clients', icon_name: 'Globe',
        folder_id: adminFolder.id, sort_order: 5, is_active: true, permission_link: 'clients:read'
      } as any);
      console.log('Added Clients item');
    }

    // Add Sidebar Builder under Administration
    const sidebarBuilderExists = await itemModel.findOne({ where: { name: 'Sidebar Builder' } });
    if (!sidebarBuilderExists) {
      await itemModel.create({
        name: 'Sidebar Builder', route: '/sidebar-builder', icon_name: 'Layout',
        folder_id: adminFolder.id, sort_order: 40, is_active: true, permission_link: 'system:manage_sidebar'
      } as any);
      console.log('Added Sidebar Builder item');
    }

    // Add Matrix Builder under Administration
    const matrixBuilderExists = await itemModel.findOne({ where: { name: 'Matrix Builder' } });
    if (!matrixBuilderExists) {
      await itemModel.create({
        name: 'Matrix Builder', route: '/matrix-builder', icon_name: 'Grid',
        folder_id: adminFolder.id, sort_order: 50, is_active: true, permission_link: 'system:manage_matrix'
      } as any);
      console.log('Added Matrix Builder item');
    }
  }

  // HR Management folder
  const hrFolder = await folderModel.findOne({ where: { name: 'HR Management' } });
  if (hrFolder) {
    // Add Branches under HR Management
    const branchesExists = await itemModel.findOne({ where: { name: 'Branches' } });
    if (!branchesExists) {
      await itemModel.create({
        name: 'Branches', route: '/branches', icon_name: 'MapPin',
        folder_id: hrFolder.id, sort_order: 50, is_active: true, permission_link: 'branches:read'
      } as any);
      console.log('Added Branches item');
    }

    // Add Holidays under HR Management
    const holidaysExists = await itemModel.findOne({ where: { name: 'Holidays' } });
    if (!holidaysExists) {
      await itemModel.create({
        name: 'Holidays', route: '/holidays', icon_name: 'CalendarDays',
        folder_id: hrFolder.id, sort_order: 60, is_active: true, permission_link: 'holidays:read'
      } as any);
      console.log('Added Holidays item');
    }

    // Add HR Policies under HR Management
    const hrPoliciesExists = await itemModel.findOne({ where: { name: 'HR Policies' } });
    if (!hrPoliciesExists) {
      await itemModel.create({
        name: 'HR Policies', route: '/hr-policies', icon_name: 'FileText',
        folder_id: hrFolder.id, sort_order: 70, is_active: true, permission_link: 'hrpolicy:read'
      } as any);
      console.log('Added HR Policies item');
    }
  }

  // Workspace folder - add Profile
  const workspaceFolder = await folderModel.findOne({ where: { name: 'Workspace' } });
  if (workspaceFolder) {
    const profileExists = await itemModel.findOne({ where: { name: 'Profile' } });
    if (!profileExists) {
      await itemModel.create({
        name: 'Profile', route: '/profile', icon_name: 'UserCircle',
        folder_id: workspaceFolder.id, sort_order: 20, is_active: true, permission_link: null
      } as any);
      console.log('Added Profile item');
    }
  }

  console.log('\n=== All sidebar fixes applied ===');
  await app.close();
}

fix().catch(console.error);
