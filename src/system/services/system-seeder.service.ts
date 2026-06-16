import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { SysModule } from '../models/SysModule';
import { SubModule } from '../models/SubModule';

const DEFAULT_MODULES = [
  {
    key: 'system_admin',
    name: 'SYSTEM ADMIN',
    icon: 'Shield',
    sortOrder: 1,
    isSuperAdminOnly: true,
    isClientAdminOnly: false,
    subModules: [
      { key: 'clients', name: 'Clients', route: '/clients', icon: 'Globe', permissionKey: null, sortOrder: 1 },
      { key: 'all_companies', name: 'All Companies', route: '/companies', icon: 'Building2', permissionKey: null, sortOrder: 2 },
      { key: 'all_users', name: 'All Users', route: '/users', icon: 'Users', permissionKey: null, sortOrder: 3 },
      { key: 'roles', name: 'Roles', route: '/roles', icon: 'Shield', permissionKey: null, sortOrder: 4 },
    ],
  },
  {
    key: 'tenant_admin',
    name: 'TENANT ADMIN',
    icon: 'Building2',
    sortOrder: 2,
    isSuperAdminOnly: false,
    isClientAdminOnly: true,
    subModules: [
      { key: 'my_companies', name: 'My Companies', route: '/companies', icon: 'Building2', permissionKey: null, sortOrder: 1 },
      { key: 'my_users', name: 'My Users', route: '/users', icon: 'Users', permissionKey: null, sortOrder: 2 },
      { key: 'custom_roles', name: 'Custom Roles', route: '/roles', icon: 'Shield', permissionKey: null, sortOrder: 3 },
    ],
  },
  {
    key: 'my_workspace',
    name: 'MY WORKSPACE',
    icon: 'Calendar',
    sortOrder: 4,
    isSuperAdminOnly: false,
    isClientAdminOnly: false,
    subModules: [
      { key: 'holidays', name: 'Holiday Calendar', route: '/holidays', icon: 'Calendar', permissionKey: 'holidays:read', sortOrder: 1 },
    ],
  },
  {
    key: 'hr_employee_management',
    name: 'EMPLOYEE MANAGEMENT',
    icon: 'Users',
    sortOrder: 5,
    isSuperAdminOnly: false,
    isClientAdminOnly: false,
    subModules: [
      { key: 'departments', name: 'Departments', route: '/departments', icon: 'Building2', permissionKey: 'departments:read', sortOrder: 1 },
      { key: 'designations', name: 'Designations', route: '/designations', icon: 'Shield', permissionKey: 'designations:read', sortOrder: 2 },
      { key: 'employees', name: 'Employees', route: '/employees', icon: 'Users', permissionKey: 'employees:read', sortOrder: 3 },
    ],
  },
  {
    key: 'hr_attendance',
    name: 'ATTENDANCE MANAGEMENT',
    icon: 'Clock',
    sortOrder: 6,
    isSuperAdminOnly: false,
    isClientAdminOnly: false,
    subModules: [
      { key: 'daily_log', name: 'Daily Log', route: '#', icon: 'Clock', permissionKey: 'attendance:read', sortOrder: 1 },
      { key: 'leave_requests', name: 'Leave Requests', route: '#', icon: 'Calendar', permissionKey: 'leave:read', sortOrder: 2 },
    ],
  },
  {
    key: 'hr_payroll',
    name: 'PAYROLL MANAGEMENT',
    icon: 'DollarSign',
    sortOrder: 7,
    isSuperAdminOnly: false,
    isClientAdminOnly: false,
    subModules: [
      { key: 'salary_details', name: 'Salary Details', route: '#', icon: 'DollarSign', permissionKey: 'payroll:read', sortOrder: 1 },
    ],
  },
];

@Injectable()
export class SystemSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SystemSeederService.name);

  constructor(
    @InjectModel(SysModule)
    private moduleModel: typeof SysModule,
    @InjectModel(SubModule)
    private subModuleModel: typeof SubModule,
  ) { }

  async onApplicationBootstrap() {
    if (process.env.SEED_DB !== 'true') {
      return;
    }

    this.logger.log('Running Sidebar Modules seeder...');

    const defaultSubKeys = DEFAULT_MODULES.flatMap(m => m.subModules.map(sm => sm.key));
    const defaultModKeys = DEFAULT_MODULES.map(m => m.key);

    // Clean up old sub-modules and modules first
    await this.subModuleModel.destroy({
      where: {
        key: {
          [Op.notIn]: defaultSubKeys,
        },
      },
    });

    await this.moduleModel.destroy({
      where: {
        key: {
          [Op.notIn]: defaultModKeys,
        },
      },
    });

    for (const modConfig of DEFAULT_MODULES) {
      let moduleObj = await this.moduleModel.findOne({ where: { key: modConfig.key } });

      if (!moduleObj) {
        moduleObj = await this.moduleModel.create({
          key: modConfig.key,
          name: modConfig.name,
          icon: modConfig.icon,
          sortOrder: modConfig.sortOrder,
          isSuperAdminOnly: modConfig.isSuperAdminOnly,
          isClientAdminOnly: modConfig.isClientAdminOnly,
          isActive: true,
        });
      } else {
        await moduleObj.update({
          name: modConfig.name,
          icon: modConfig.icon,
          sortOrder: modConfig.sortOrder,
          isSuperAdminOnly: modConfig.isSuperAdminOnly,
          isClientAdminOnly: modConfig.isClientAdminOnly,
        });
      }

      for (const subConfig of modConfig.subModules) {
        let subModuleObj = await this.subModuleModel.findOne({ where: { key: subConfig.key } });

        if (!subModuleObj) {
          await this.subModuleModel.create({
            moduleId: moduleObj.id,
            key: subConfig.key,
            name: subConfig.name,
            route: subConfig.route,
            icon: subConfig.icon,
            permissionKey: subConfig.permissionKey,
            sortOrder: subConfig.sortOrder,
            isActive: true,
          });
        } else {
          await subModuleObj.update({
            moduleId: moduleObj.id,
            name: subConfig.name,
            route: subConfig.route,
            icon: subConfig.icon,
            permissionKey: subConfig.permissionKey,
            sortOrder: subConfig.sortOrder,
          });
        }
      }
    }

    this.logger.log('Sidebar Modules seeding completed successfully.');
  }
}
