import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { UserSession } from '../../users/models/user-session.model';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    @InjectModel(UserSession)
    private readonly userSessionModel: typeof UserSession,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET')!,
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: { sub: number; userId: number | null; clientId: number | null; email: string; type: string; sessionId: string }) {
    const session = await this.userSessionModel.findOne({
      where: { sessionId: payload.sessionId, isRevoked: false },
    });

    if (!session) {
      throw new UnauthorizedException('Session has been revoked or expired');
    }

    let employeeId: number | null = null;
    if (payload.userId) {
      const companyId = req.headers['x-company-id'];
      let queryStr = `SELECT id FROM "employees" WHERE "userId" = :userId`;
      const replacements: any = { userId: payload.userId };

      if (companyId) {
        queryStr += ` AND "companyId" = :companyId`;
        replacements.companyId = parseInt(companyId, 10);
      }
      queryStr += ` LIMIT 1;`;

      const employee = await this.userSessionModel.sequelize!.query(
        queryStr,
        {
          replacements,
          type: 'SELECT'
        }
      ) as any[];
      if (employee && employee.length > 0) {
        employeeId = employee[0].id;
      } else {
        // Fallback: If employees.userId is NULL, fix employee-user linking by email
        let fallbackQueryStr = `SELECT id FROM "employees" WHERE "email" = :email AND "userId" IS NULL`;
        const fallbackReplacements: any = { email: payload.email };
        
        if (companyId) {
          fallbackQueryStr += ` AND "companyId" = :companyId`;
          fallbackReplacements.companyId = parseInt(companyId, 10);
        }
        fallbackQueryStr += ` LIMIT 1;`;

        const fallbackEmployee = await this.userSessionModel.sequelize!.query(
          fallbackQueryStr,
          {
            replacements: fallbackReplacements,
            type: 'SELECT'
          }
        ) as any[];

        if (fallbackEmployee && fallbackEmployee.length > 0) {
          employeeId = fallbackEmployee[0].id;
          // Update the DB to permanently link the user and employee
          await this.userSessionModel.sequelize!.query(
            `UPDATE "employees" SET "userId" = :userId WHERE "id" = :empId;`,
            {
              replacements: { userId: payload.userId, empId: employeeId }
            }
          );
        }
      }
    }

    return {
      id: payload.sub,
      sub: payload.sub,
      userId: payload.userId,
      clientId: payload.clientId,
      email: payload.email,
      type: payload.type,
      sessionId: payload.sessionId,
      employeeId,
    };
  }
}
