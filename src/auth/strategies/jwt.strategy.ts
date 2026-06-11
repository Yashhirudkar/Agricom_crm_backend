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
    });
  }

  async validate(payload: { sub: number; userId: number | null; clientId: number | null; email: string; type: string; sessionId: string }) {
    const session = await this.userSessionModel.findOne({
      where: { sessionId: payload.sessionId, isRevoked: false },
    });

    if (!session) {
      throw new UnauthorizedException('Session has been revoked or expired');
    }

    return {
      id: payload.sub,
      sub: payload.sub,
      userId: payload.userId,
      clientId: payload.clientId,
      email: payload.email,
      type: payload.type,
      sessionId: payload.sessionId,
    };
  }
}
