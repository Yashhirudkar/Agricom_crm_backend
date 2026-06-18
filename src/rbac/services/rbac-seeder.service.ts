import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Role } from '../models/role.model';

import { UserRole } from '../models/user-role.model';
import { User } from '../../users/models/user.model';
import { Client } from '../../clients/models/client.model';
import * as bcrypt from 'bcryptjs';
import { Op } from 'sequelize';

const ADMIN_ROLE_NAME = 'Admin';
const SUPER_ADMIN_EMAIL = 'admin@agricom.com';
const SUPER_ADMIN_PASSWORD = 'Admin@123';

const SEED_CLIENT_NAME = 'TNT Group';
const SEED_CLIENT_EMAIL = 'admin@tntgroup.com';
const SEED_CLIENT_PASSWORD = 'password123';



@Injectable()
export class RbacSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RbacSeederService.name);

  constructor(
    @InjectModel(Role)
    private readonly roleModel: typeof Role,

    @InjectModel(UserRole)
    private readonly userRoleModel: typeof UserRole,
    @InjectModel(User)
    private readonly userModel: typeof User,
    @InjectModel(Client)
    private readonly clientModel: typeof Client,
  ) { }

  async onApplicationBootstrap() {
    if (process.env.SEED_DB !== 'true') {
      return;
    }

    try {
      await this.seed();
    } catch (error) {
      this.logger.error('RBAC seeding failed', error);
    }
  }

  private async seed() {
    this.logger.log('Running RBAC & Multi-Tenant seeder...');

    // 1. Ensure Admin role exists (Global role -> companyId = null)
    const [adminRole] = await this.roleModel.findOrCreate({
      where: { name: ADMIN_ROLE_NAME },
      defaults: {
        name: ADMIN_ROLE_NAME,
        description: 'System administrator with full access',
        isActive: true,
        clientId: null,
        isSystemRole: true,
      } as any,
    });

    // Ensure Client Admin role exists (Global role -> clientId = null, isSystemRole = true)
    const [clientAdminRole] = await this.roleModel.findOrCreate({
      where: { name: 'Client Admin' },
      defaults: {
        name: 'Client Admin',
        description: 'Client level administrator with full access',
        isActive: true,
        clientId: null,
        isSystemRole: true,
      } as any,
    });



    // 4. Ensure Super Admin user exists
    let adminUser = await this.userModel.findOne({
      where: { email: SUPER_ADMIN_EMAIL },
    });

    if (!adminUser) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, salt);
      adminUser = await this.userModel.create({
        name: 'Agricom Super Admin',
        email: SUPER_ADMIN_EMAIL,
        password: hashedPassword,
        isActive: true,
        companyId: null,
      } as any);
      this.logger.log(`Super Admin user created: ${SUPER_ADMIN_EMAIL}`);
    }

    // 5. Ensure Super Admin user has Admin role
    await this.userRoleModel.findOrCreate({
      where: { userId: adminUser.id, roleId: adminRole.id },
      defaults: { userId: adminUser.id, roleId: adminRole.id } as any,
    });

    // 6. Create Seed Client (TNT Group)
    let tntClient = await this.clientModel.findOne({
      where: { email: SEED_CLIENT_EMAIL },
    });

    if (!tntClient) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(SEED_CLIENT_PASSWORD, salt);
      await this.clientModel.create({
        name: SEED_CLIENT_NAME,
        email: SEED_CLIENT_EMAIL,
        password: hashedPassword,
        isActive: true,
        allowedCompanies: 3,
        allowedUsers: 15,
      } as any);
      this.logger.log(`Seed Client created: ${SEED_CLIENT_NAME} (${SEED_CLIENT_EMAIL})`);
    }

    this.logger.log('RBAC & Multi-Tenant seeding completed successfully.');
  }
}
