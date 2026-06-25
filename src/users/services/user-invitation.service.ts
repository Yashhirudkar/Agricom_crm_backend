import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { UserInvitation } from '../models/user-invitation.model';
import { User } from '../models/user.model';
import { UserCompany } from '../models/user-company.model';
import { Role } from '../../rbac/models/role.model';
import { Company } from '../../companies/models/company.model';
import { Client } from '../../clients/models/client.model';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UserInvitationService {
  constructor(
    @InjectModel(UserInvitation)
    private readonly invitationModel: typeof UserInvitation,
    @InjectModel(User)
    private readonly userModel: typeof User,
    @InjectModel(UserCompany)
    private readonly userCompanyModel: typeof UserCompany,
    @InjectModel(Role)
    private readonly roleModel: typeof Role,
    @InjectModel(Company)
    private readonly companyModel: typeof Company,
    @InjectModel(Client)
    private readonly clientModel: typeof Client,
  ) {}

  async createInvitation(params: {
    email: string;
    roleId: number;
    companyIds: number[];
    clientId: number | null;
    createdBy: number;
  }): Promise<UserInvitation> {
    const emailLower = params.email.toLowerCase().trim();

    // 1. Check if user already exists
    const existingUser = await this.userModel.findOne({
      where: { email: emailLower },
    });
    if (existingUser)
      throw new ConflictException('User is already registered in the system');

    // Verify role belongs to clientId
    if (params.roleId) {
      const role = await this.roleModel.findByPk(params.roleId);
      if (!role) throw new NotFoundException('Role not found');
      if (
        role.clientId !== null &&
        String(role.clientId) !== String(params.clientId)
      ) {
        throw new BadRequestException(
          'Cross-tenant role assignment is not allowed',
        );
      }
    }

    // Verify companies belong to clientId
    if (params.companyIds && params.companyIds.length > 0) {
      const companies = await this.companyModel.findAll({
        where: { id: params.companyIds },
      });
      if (companies.length !== params.companyIds.length) {
        throw new NotFoundException('One or more companies not found');
      }
      for (const company of companies) {
        if (company.clientId !== params.clientId) {
          throw new BadRequestException(
            'Cross-tenant company assignment is not allowed',
          );
        }
      }
    }

    // 2. Clean up any existing invitations for this email to avoid duplicates
    await this.invitationModel.destroy({ where: { email: emailLower } });

    // 3. Generate token and set expiry (7 days)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    return this.invitationModel.create({
      email: emailLower,
      token,
      clientId: params.clientId,
      roleId: params.roleId,
      companyIds: params.companyIds,
      createdBy: params.createdBy,
      expiresAt,
      status: 'Pending',
    });
  }

  async verifyInvitation(token: string): Promise<UserInvitation> {
    const invitation = await this.invitationModel.findOne({
      where: { token },
      include: [
        { model: Client, attributes: ['id', 'name'] },
        { model: Role, attributes: ['id', 'name'] },
      ],
    });

    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status === 'Accepted')
      throw new BadRequestException('Invitation has already been accepted');
    if (invitation.status === 'Expired' || invitation.expiresAt < new Date()) {
      invitation.status = 'Expired';
      await invitation.save();
      throw new BadRequestException('Invitation has expired');
    }

    return invitation;
  }

  async getInvitationDetails(token: string): Promise<any> {
    const invitation = await this.verifyInvitation(token);
    let companies: any[] = [];
    if (invitation.companyIds && invitation.companyIds.length > 0) {
      companies = await this.companyModel.findAll({
        where: { id: invitation.companyIds },
        attributes: ['id', 'name'],
      });
    }
    const data = invitation.toJSON();
    data.companyIds = companies;
    return data;
  }

  async acceptInvitation(params: {
    token: string;
    name: string;
    password: string;
  }): Promise<User> {
    const invitation = await this.verifyInvitation(params.token);

    // Verify role belongs to clientId
    if (invitation.roleId) {
      const role = await this.roleModel.findByPk(invitation.roleId);
      if (!role) throw new NotFoundException('Role not found');
      if (role.clientId !== null && role.clientId !== invitation.clientId) {
        throw new BadRequestException(
          'Cross-tenant role assignment is not allowed',
        );
      }
    }

    // Verify companies belong to clientId
    if (invitation.companyIds && invitation.companyIds.length > 0) {
      const companies = await this.companyModel.findAll({
        where: { id: invitation.companyIds },
      });
      if (companies.length !== invitation.companyIds.length) {
        throw new NotFoundException('One or more companies not found');
      }
      for (const company of companies) {
        if (company.clientId !== invitation.clientId) {
          throw new BadRequestException(
            'Cross-tenant company assignment is not allowed',
          );
        }
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(params.password, salt);

    // Create the user
    const user = await this.userModel.create({
      name: params.name,
      email: invitation.email,
      password: hashedPassword,
      clientId: invitation.clientId,
      status: 'Active',
      isActive: true,
    });

    // Add user to the specified companies
    if (invitation.companyIds && invitation.companyIds.length > 0) {
      for (const companyId of invitation.companyIds) {
        await this.userCompanyModel.create({
          userId: user.id,
          companyId,
          roleId: invitation.roleId,
          status: 'Active',
        });
      }
    }

    // Set invitation status to Accepted
    invitation.status = 'Accepted';
    await invitation.save();

    return user;
  }

  async getInvitations(clientId?: number | null): Promise<UserInvitation[]> {
    const where: any = {};
    if (clientId !== undefined && clientId !== null) {
      where.clientId = clientId;
    }
    return this.invitationModel.findAll({
      where,
      include: [
        { model: Client, attributes: ['id', 'name'] },
        { model: Role, attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
    });
  }
}
