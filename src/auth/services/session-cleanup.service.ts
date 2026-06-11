import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/sequelize';
import { UserSession } from '../../users/models/user-session.model';
import { Op } from 'sequelize';

@Injectable()
export class SessionCleanupService {
  private readonly logger = new Logger(SessionCleanupService.name);

  constructor(
    @InjectModel(UserSession)
    private readonly userSessionModel: typeof UserSession,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCleanup() {
    this.logger.log('Starting daily database user sessions cleanup...');

    try {
      const now = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const deletedCount = await this.userSessionModel.destroy({
        where: {
          [Op.or]: [
            { expiresAt: { [Op.lt]: now } },
            {
              isRevoked: true,
              updatedAt: { [Op.lt]: thirtyDaysAgo },
            },
          ],
        },
      });

      this.logger.log(`Cleanup complete. Purged ${deletedCount} expired or old revoked user sessions.`);
    } catch (error) {
      this.logger.error('Failed to run daily user sessions cleanup', error);
    }
  }
}
