import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { MonthlyTarget } from './models/monthly-target.model';
import { SalesContract } from '../sales-contracts/models/sales-contract.model';
import { CreateMonthlyTargetDto } from './dto/create-monthly-target.dto';
import { NotificationsGateway } from '../notifications/gateways/notifications.gateway';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

@Injectable()
export class MonthlyTargetsService {
  private readonly logger = new Logger(MonthlyTargetsService.name);

  constructor(
    @InjectModel(MonthlyTarget)
    private readonly monthlyTargetModel: typeof MonthlyTarget,
    @InjectModel(SalesContract)
    private readonly salesContractModel: typeof SalesContract,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  /**
   * Dynamically calculate Completed MT for a user in a specific month and year.
   * Completed MT = SUM of Total Qty (MT) of all Sales Contracts created by that user
   * within that month and year, excluding Cancelled contracts.
   */
  async calculateCompletedMT(
    userId: number,
    month: number,
    year: number,
  ): Promise<number> {
    const result: any[] = await this.salesContractModel.sequelize.query(
      `
      SELECT COALESCE(SUM(total_quantity), 0) AS "completedMT"
      FROM sales_contracts
      WHERE created_by = :userId
        AND status != 'Cancelled'
        AND EXTRACT(MONTH FROM COALESCE(contract_date, created_at::date)) = :month
        AND EXTRACT(YEAR FROM COALESCE(contract_date, created_at::date)) = :year
      `,
      {
        replacements: { userId, month, year },
        type: 'SELECT',
      },
    );

    const val = result?.[0]?.completedMT;
    return val ? parseFloat(val) : 0;
  }

  /**
   * Get current or specific month target and stats for the logged-in sales user.
   */
  async getTargetWithStats(
    userId: number,
    month?: number,
    year?: number,
  ) {
    const now = new Date();
    const resolvedMonth = month || now.getMonth() + 1;
    const resolvedYear = year || now.getFullYear();

    const target = await this.monthlyTargetModel.findOne({
      where: {
        userId,
        month: resolvedMonth,
        year: resolvedYear,
      },
    });

    const completedMT = await this.calculateCompletedMT(
      userId,
      resolvedMonth,
      resolvedYear,
    );

    const targetMT = target ? parseFloat(target.targetMT as any) : 0;
    // Over-achievement rule: Remaining MT must never become negative
    const remainingMT = targetMT > 0 ? Math.max(0, targetMT - completedMT) : 0;
    const progressPercentage =
      targetMT > 0 ? Math.round((completedMT / targetMT) * 100) : 0;

    const monthName = MONTH_NAMES[resolvedMonth - 1] || `Month ${resolvedMonth}`;

    return {
      hasTarget: !!target,
      target: target
        ? {
            id: target.id,
            userId: target.userId,
            month: target.month,
            year: target.year,
            targetMT: targetMT,
            isLocked: target.isLocked,
            createdAt: target.createdAt,
            updatedAt: target.updatedAt,
          }
        : null,
      stats: {
        targetMT: targetMT,
        completedMT: Number(completedMT.toFixed(2)),
        remainingMT: Number(remainingMT.toFixed(2)),
        progressPercentage,
        isOverAchieved: targetMT > 0 && completedMT > targetMT,
        month: resolvedMonth,
        year: resolvedYear,
        monthName,
      },
    };
  }

  /**
   * Set monthly target. Can only be set once per month per sales user.
   * Once confirmed/saved, permanently locked and cannot be edited.
   */
  async createTarget(userId: number, dto: CreateMonthlyTargetDto) {
    const now = new Date();
    const month = dto.month || now.getMonth() + 1;
    const year = dto.year || now.getFullYear();

    // Check if target already exists for this month/year
    const existing = await this.monthlyTargetModel.findOne({
      where: { userId, month, year },
    });

    if (existing) {
      const monthName = MONTH_NAMES[month - 1] || `Month ${month}`;
      throw new BadRequestException(
        `Monthly target for ${monthName} ${year} has already been set and cannot be modified.`,
      );
    }

    const created = await this.monthlyTargetModel.create({
      userId,
      month,
      year,
      targetMT: dto.targetMT,
      isLocked: true,
    });

    this.logger.log(
      `[MonthlyTargetsService] User ${userId} set target ${dto.targetMT} MT for ${month}/${year}`,
    );

    // Notify user's clients in real-time
    try {
      this.notificationsGateway.emitToUser(userId, 'sales-target:updated', {
        month,
        year,
        action: 'target_created',
      });
    } catch (err) {
      this.logger.warn(`Failed to emit sales-target:updated: ${err.message}`);
    }

    return this.getTargetWithStats(userId, month, year);
  }

  /**
   * Get all historical monthly targets for the sales user.
   */
  async getHistory(userId: number) {
    const targets = await this.monthlyTargetModel.findAll({
      where: { userId },
      order: [
        ['year', 'DESC'],
        ['month', 'DESC'],
      ],
    });

    const historyWithStats = await Promise.all(
      targets.map(async (t) => {
        const completedMT = await this.calculateCompletedMT(
          userId,
          t.month,
          t.year,
        );
        const targetMT = parseFloat(t.targetMT as any);
        const remainingMT = Math.max(0, targetMT - completedMT);
        const progressPercentage =
          targetMT > 0 ? Math.round((completedMT / targetMT) * 100) : 0;
        const monthName = MONTH_NAMES[t.month - 1] || `Month ${t.month}`;

        return {
          id: t.id,
          month: t.month,
          year: t.year,
          monthName,
          targetMT,
          completedMT: Number(completedMT.toFixed(2)),
          remainingMT: Number(remainingMT.toFixed(2)),
          progressPercentage,
          isOverAchieved: completedMT > targetMT,
          isLocked: t.isLocked,
          createdAt: t.createdAt,
        };
      }),
    );

    return historyWithStats;
  }
}

