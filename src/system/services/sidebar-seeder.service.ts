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
      if (folderCount > 0) {
        this.logger.log('Sidebar folders already exist. Skipping seeding.');
        return;
      }

      this.logger.log(
        'No sidebar configuration found. Seeding default structure...',
      );

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
          permission_link: 'attendance:read',
        },
        {
          name: 'My Attendance',
          route: '/attendance/my-attendance',
          icon_name: 'Timer',
          folder_id: attFolder.id,
          sort_order: 20,
          is_active: true,
          permission_link: 'attendance:read',
        },
        {
          name: 'Shifts',
          route: '/attendance/shifts',
          icon_name: 'CalendarClock',
          folder_id: attFolder.id,
          sort_order: 30,
          is_active: true,
          permission_link: 'shifts:read',
        },
        {
          name: 'Corrections',
          route: '/attendance/corrections',
          icon_name: 'ClipboardEdit',
          folder_id: attFolder.id,
          sort_order: 40,
          is_active: true,
          permission_link: 'attendance:approve_correction',
        },
        {
          name: 'Reports',
          route: '/attendance/reports',
          icon_name: 'BarChart',
          folder_id: attFolder.id,
          sort_order: 50,
          is_active: true,
          permission_link: 'attendance_reports:read',
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
          permission_link: 'leave:read',
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
      ] as any[]);

      this.logger.log('Sidebar default structure seeded successfully.');
    } catch (error) {
      this.logger.error('Failed to seed sidebar structure', error);
    }
  }
}
