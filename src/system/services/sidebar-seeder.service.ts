import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { SidebarFolder } from '../models/sidebar-folder.model';
import { SidebarItem } from '../models/sidebar-item.model';

@Injectable()
export class SidebarSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SidebarSeederService.name);

  constructor(
    @InjectModel(SidebarFolder)
    private readonly sidebarFolderModel: typeof SidebarFolder,
    @InjectModel(SidebarItem)
    private readonly sidebarItemModel: typeof SidebarItem,
  ) {}

  async onApplicationBootstrap() {
    try {
      const folderCount = await this.sidebarFolderModel.count();
      if (folderCount === 0) {
        this.logger.log(
          'No sidebar configuration found. Seeding default structure...',
        );
        await this.seedDefaultStructure();
      }

      await this.syncHrPoliciesSidebarItem();
      await this.syncShipmentsSidebarItem();
    } catch (error) {
      this.logger.error('Failed to seed or sync sidebar structure', error);
    }
  }

  private async seedDefaultStructure() {
    try {
      // 1. Workspace
      const workspaceFolder = await this.sidebarFolderModel.create({
        name: 'Workspace',
        icon_name: 'LayoutGrid',
        sort_order: 10,
        is_active: true,
      });

      await this.sidebarItemModel.bulkCreate([
        {
          name: 'Dashboard',
          route: '/',
          icon_name: 'LayoutGrid',
          folder_id: workspaceFolder.id,
          sort_order: 10,
          is_active: true,
          permission_link: null,
        },
        {
          name: 'Profile',
          route: '/profile',
          icon_name: 'User',
          folder_id: workspaceFolder.id,
          sort_order: 20,
          is_active: true,
          permission_link: null,
        },
        {
          name: 'Holidays',
          route: '/holidays',
          icon_name: 'Calendar',
          folder_id: workspaceFolder.id,
          sort_order: 30,
          is_active: true,
          permission_link: null,
        },
        {
          name: 'Tasks',
          route: '/tasks',
          icon_name: 'CheckSquare',
          folder_id: workspaceFolder.id,
          sort_order: 40,
          is_active: true,
          permission_link: null,
        },
      ] as any[]);

      // 2. HR Management
      const hrFolder = await this.sidebarFolderModel.create({
        name: 'HR Management',
        icon_name: 'Users',
        sort_order: 20,
        is_active: true,
      });

      await this.sidebarItemModel.bulkCreate([
        {
          name: 'Employees',
          route: '/employees',
          icon_name: 'UsersRound',
          folder_id: hrFolder.id,
          sort_order: 10,
          is_active: true,
          permission_link: 'employees:read',
        },
        {
          name: 'Departments',
          route: '/departments',
          icon_name: 'Building2',
          folder_id: hrFolder.id,
          sort_order: 20,
          is_active: true,
          permission_link: 'departments:read',
        },
        {
          name: 'Designations',
          route: '/designations',
          icon_name: 'Badge',
          folder_id: hrFolder.id,
          sort_order: 30,
          is_active: true,
          permission_link: 'designations:read',
        },
        {
          name: 'Org Chart',
          route: '/org-chart',
          icon_name: 'Network',
          folder_id: hrFolder.id,
          sort_order: 40,
          is_active: true,
          permission_link: null,
        },
        {
          name: 'HR Policies',
          route: '/hr-policies',
          icon_name: 'FileText',
          folder_id: hrFolder.id,
          sort_order: 50,
          is_active: true,
          permission_link: 'hrpolicy:read',
        },
      ] as any[]);

      // 3. Attendance
      const attFolder = await this.sidebarFolderModel.create({
        name: 'Attendance',
        icon_name: 'Clock',
        sort_order: 30,
        is_active: true,
      });

      await this.sidebarItemModel.bulkCreate([
        {
          name: 'Dashboard',
          route: '/attendance',
          icon_name: 'LayoutDashboard',
          folder_id: attFolder.id,
          sort_order: 10,
          is_active: true,
          permission_link: 'attendance_dashboard:read',
        },
        {
          name: 'My Attendance',
          route: '/attendance/my-attendance',
          icon_name: 'Timer',
          folder_id: attFolder.id,
          sort_order: 20,
          is_active: true,
          permission_link: 'attendance_activity:read',
        },
        {
          name: 'Shifts',
          route: '/attendance/shifts',
          icon_name: 'CalendarClock',
          folder_id: attFolder.id,
          sort_order: 30,
          is_active: true,
          permission_link: 'attendance_shifts:assign_shift',
        },
        {
          name: 'Corrections',
          route: '/attendance/corrections',
          icon_name: 'ClipboardEdit',
          folder_id: attFolder.id,
          sort_order: 40,
          is_active: true,
          permission_link: 'attendance_regularization:read',
        },
        {
          name: 'Reports',
          route: '/attendance/reports',
          icon_name: 'BarChart',
          folder_id: attFolder.id,
          sort_order: 50,
          is_active: true,
          permission_link: 'attendance_summary:read',
        },
      ] as any[]);

      // 4. Leave Management
      const leaveFolder = await this.sidebarFolderModel.create({
        name: 'Leave Management',
        icon_name: 'Calendar',
        sort_order: 40,
        is_active: true,
      });

      await this.sidebarItemModel.bulkCreate([
        {
          name: 'Leaves',
          route: '/leaves',
          icon_name: 'FolderCheck',
          folder_id: leaveFolder.id,
          sort_order: 10,
          is_active: true,
          permission_link: 'leave:read',
        },
        {
          name: 'Approvals',
          route: '/leave-approvals',
          icon_name: 'CheckCircle',
          folder_id: leaveFolder.id,
          sort_order: 20,
          is_active: true,
          permission_link: 'leave:approve',
        },
        {
          name: 'Leave Types',
          route: '/leave-types',
          icon_name: 'ClipboardList',
          folder_id: leaveFolder.id,
          sort_order: 30,
          is_active: true,
          permission_link: 'leave_types:read',
        },
        {
          name: 'My Leaves',
          route: '/my-leaves',
          icon_name: 'Plane',
          folder_id: leaveFolder.id,
          sort_order: 40,
          is_active: true,
          permission_link: 'leave:create',
        },
      ] as any[]);

      // 5. Administration
      const adminFolder = await this.sidebarFolderModel.create({
        name: 'Administration',
        icon_name: 'Building',
        sort_order: 50,
        is_active: true,
      });

      await this.sidebarItemModel.bulkCreate([
        {
          name: 'Clients',
          route: '/clients',
          icon_name: 'Globe',
          folder_id: adminFolder.id,
          sort_order: 5,
          is_active: true,
          permission_link: 'clients:read',
        },
        {
          name: 'Companies',
          route: '/companies',
          icon_name: 'Building',
          folder_id: adminFolder.id,
          sort_order: 10,
          is_active: true,
          permission_link: 'companies:read',
        },
        {
          name: 'Users',
          route: '/users',
          icon_name: 'Users',
          folder_id: adminFolder.id,
          sort_order: 20,
          is_active: true,
          permission_link: 'users:read',
        },
        {
          name: 'Roles',
          route: '/roles',
          icon_name: 'Shield',
          folder_id: adminFolder.id,
          sort_order: 30,
          is_active: true,
          permission_link: 'roles:read',
        },
        {
          name: 'Sidebar Builder',
          route: '/sidebar-builder',
          icon_name: 'Layout',
          folder_id: adminFolder.id,
          sort_order: 40,
          is_active: true,
          permission_link: 'sidebar_builder:read',
        },
        {
          name: 'Matrix Builder',
          route: '/matrix-builder',
          icon_name: 'Grid',
          folder_id: adminFolder.id,
          sort_order: 50,
          is_active: true,
          permission_link: 'matrix_builder:read',
        },
      ] as any[]);

      // 6. Masters
      const mastersFolder = await this.sidebarFolderModel.create({
        name: 'Masters',
        icon_name: 'Database',
        sort_order: 60,
        is_active: true,
      });

      await this.sidebarItemModel.bulkCreate([
        {
          name: 'Categories',
          route: '/masters/categories',
          icon_name: 'Tag',
          folder_id: mastersFolder.id,
          sort_order: 20,
          is_active: true,
          permission_link: 'categories:read',
        },
        {
          name: 'Products',
          route: '/masters/products',
          icon_name: 'Package',
          folder_id: mastersFolder.id,
          sort_order: 30,
          is_active: true,
          permission_link: 'products:read',
        },
        {
          name: 'Partner Roles',
          route: '/masters/partner-roles',
          icon_name: 'Users',
          folder_id: mastersFolder.id,
          sort_order: 40,
          is_active: true,
          permission_link: 'partner_roles:read',
        },
        {
          name: 'Bag Specifications',
          route: '/masters/bag-specifications',
          icon_name: 'ShoppingBag',
          folder_id: mastersFolder.id,
          sort_order: 50,
          is_active: true,
          permission_link: 'bag_specifications:read',
        },
        {
          name: 'Bag Master',
          route: '/masters/bag-specifications',
          icon_name: 'ShoppingBag',
          folder_id: mastersFolder.id,
          sort_order: 70,
          is_active: true,
          permission_link: 'bag_specifications:read',
        },
        {
          name: 'Sales Masters',
          route: '/masters/sales',
          icon_name: 'TrendingUp',
          folder_id: mastersFolder.id,
          sort_order: 80,
          is_active: true,
          permission_link: 'sales_masters:read',
        },
        {
          name: 'Partners Master',
          route: '/masters/partners',
          icon_name: 'Contact',
          folder_id: mastersFolder.id,
          sort_order: 90,
          is_active: true,
          permission_link: 'partners:read',
        },
        {
          name: 'Notification Master',
          route: '/masters/notifications',
          icon_name: 'BellRing',
          folder_id: mastersFolder.id,
          sort_order: 100,
          is_active: true,
          permission_link: 'notification:manage',
        },
      ] as any[]);

      // 7. Enquiries
      const enquiriesFolder = await this.sidebarFolderModel.create({
        name: 'Enquiries',
        icon_name: 'HelpCircle',
        sort_order: 70,
        is_active: true,
      });

      await this.sidebarItemModel.bulkCreate([
        {
          name: 'Enquiries',
          route: '/enquiries',
          icon_name: 'MessageSquareCode',
          folder_id: enquiriesFolder.id,
          sort_order: 10,
          is_active: true,
          permission_link: 'enquiries:read',
        },
        {
          name: 'Orders',
          route: '/enquiries/view-orders',
          icon_name: 'FileSpreadsheet',
          folder_id: enquiriesFolder.id,
          sort_order: 20,
          is_active: true,
          permission_link: 'enquiries:read',
        },
        {
          name: 'Follow-ups',
          route: '/follow-ups',
          icon_name: 'CalendarDays',
          folder_id: enquiriesFolder.id,
          sort_order: 30,
          is_active: true,
          permission_link: 'follow_up:read',
        },
      ] as any[]);

      // 8. Sales
      const salesFolder = await this.sidebarFolderModel.create({
        name: 'Sales',
        icon_name: 'LineChart',
        sort_order: 80,
        is_active: true,
      });

      await this.sidebarItemModel.bulkCreate([
        {
          name: 'Sales Contracts',
          route: '/sales-contracts',
          icon_name: 'FileCheck2',
          folder_id: salesFolder.id,
          sort_order: 10,
          is_active: true,
          permission_link: 'sales_contracts:read',
        },
        {
          name: 'Shipments',
          route: '/sales/shipments',
          icon_name: 'Ship',
          folder_id: salesFolder.id,
          sort_order: 20,
          is_active: true,
          permission_link: 'shipments:view',
        },
      ] as any[]);

      this.logger.log('Sidebar default structure seeded successfully.');
    } catch (error) {
      this.logger.error('Failed to seed sidebar structure', error);
    }
  }

  private async syncHrPoliciesSidebarItem() {
    try {
      const items = await this.sidebarItemModel.findAll({
        where: { route: '/hr-policies' },
      });

      let itemId: number | null = null;

      if (items.length > 0) {
        for (const item of items) {
          if (item.permission_link !== 'hrpolicy:read') {
            item.permission_link = 'hrpolicy:read';
            await item.save();
            this.logger.log(
              `Updated sidebar item ${item.id} (${item.route}) permission_link to hrpolicy:read`,
            );
          }
          itemId = item.id;
        }
      } else {
        let hrFolder = await this.sidebarFolderModel.findOne({
          where: { name: 'HR Management' },
        });

        if (!hrFolder) {
          hrFolder = await this.sidebarFolderModel.create({
            name: 'HR Management',
            icon_name: 'Users',
            sort_order: 20,
            is_active: true,
          } as any);
        }

        const newItem = await this.sidebarItemModel.create({
          name: 'HR Policies',
          route: '/hr-policies',
          icon_name: 'FileText',
          folder_id: hrFolder.id,
          sort_order: 50,
          is_active: true,
          permission_link: 'hrpolicy:read',
        } as any);

        itemId = newItem.id;
        this.logger.log(
          'Created /hr-policies sidebar item with hrpolicy:read permission_link',
        );
      }

      const seq = this.sidebarItemModel.sequelize;
      if (itemId && seq) {
        const clients = (await seq.query(`SELECT id FROM clients;`, {
          type: 'SELECT',
        })) as any[];

        for (const client of clients) {
          await seq
            .query(
              `INSERT INTO client_item_access (client_id, item_id, "createdAt", "updatedAt")
             VALUES (:clientId, :itemId, NOW(), NOW())
             ON CONFLICT (client_id, item_id) DO NOTHING;`,
              { replacements: { clientId: client.id, itemId } },
            )
            .catch(() => {});
        }
      }
    } catch (err) {
      this.logger.error('Failed to sync HR Policies sidebar item', err);
    }
  }

  private async syncShipmentsSidebarItem() {
    try {
      let salesFolder = await this.sidebarFolderModel.findOne({
        where: { name: 'Sales' },
      });

      if (!salesFolder) {
        salesFolder = await this.sidebarFolderModel.create({
          name: 'Sales',
          icon_name: 'LineChart',
          sort_order: 80,
          is_active: true,
        } as any);
      }

      const items = await this.sidebarItemModel.findAll({
        where: { route: '/sales/shipments' },
      });

      let itemId: number | null = null;

      if (items.length > 0) {
        for (const item of items) {
          let modified = false;
          if (item.name !== 'Shipments') {
            item.name = 'Shipments';
            modified = true;
          }
          if (item.folder_id !== salesFolder.id) {
            item.folder_id = salesFolder.id;
            modified = true;
          }
          if (item.permission_link !== 'shipments:view') {
            item.permission_link = 'shipments:view';
            modified = true;
          }
          if (item.icon_name !== 'Ship') {
            item.icon_name = 'Ship';
            modified = true;
          }
          if (!item.is_active) {
            item.is_active = true;
            modified = true;
          }
          if (modified) {
            await item.save();
            this.logger.log(`Updated sidebar item ${item.id} (/sales/shipments)`);
          }
          itemId = item.id;
        }
      } else {
        const newItem = await this.sidebarItemModel.create({
          name: 'Shipments',
          route: '/sales/shipments',
          icon_name: 'Ship',
          folder_id: salesFolder.id,
          sort_order: 20,
          is_active: true,
          permission_link: 'shipments:view',
        } as any);

        itemId = newItem.id;
        this.logger.log('Created /sales/shipments sidebar item with shipments:view permission_link');
      }

      const seq = this.sidebarItemModel.sequelize;
      if (itemId && seq) {
        const clients = (await seq.query(`SELECT id FROM clients;`, {
          type: 'SELECT',
        })) as any[];

        for (const client of clients) {
          await seq
            .query(
              `INSERT INTO client_item_access (client_id, item_id, "createdAt", "updatedAt")
             VALUES (:clientId, :itemId, NOW(), NOW())
             ON CONFLICT (client_id, item_id) DO NOTHING;`,
              { replacements: { clientId: client.id, itemId } },
            )
            .catch(() => {});

          await seq
            .query(
              `INSERT INTO client_folder_access (client_id, folder_id, "createdAt", "updatedAt")
             VALUES (:clientId, :folderId, NOW(), NOW())
             ON CONFLICT (client_id, folder_id) DO NOTHING;`,
              { replacements: { clientId: client.id, folderId: salesFolder.id } },
            )
            .catch(() => {});
        }
      }
    } catch (err) {
      this.logger.error('Failed to sync Shipments sidebar item', err);
    }
  }
}
