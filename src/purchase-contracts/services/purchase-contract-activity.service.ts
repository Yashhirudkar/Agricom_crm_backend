import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { PurchaseContractActivity } from '../models/purchase-contract-activity.model';

export const PC_ACTIONS = {
  PC_CREATED: 'PC_CREATED',
  PC_UPDATED: 'PC_UPDATED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  SHIPMENT_ADDED: 'SHIPMENT_ADDED',
  SHIPMENT_REMOVED: 'SHIPMENT_REMOVED',
  DOCUMENT_ADDED: 'DOCUMENT_ADDED',
  DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
  DOCUMENT_DELETED: 'DOCUMENT_DELETED',
} as const;

export type PcAction = (typeof PC_ACTIONS)[keyof typeof PC_ACTIONS];

@Injectable()
export class PurchaseContractActivityService {
  constructor(
    @InjectModel(PurchaseContractActivity)
    private readonly activityModel: typeof PurchaseContractActivity,
  ) {}

  async log(
    purchaseContractId: number,
    action: PcAction,
    description: string,
    performedBy?: number,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.activityModel.create({
      purchaseContractId,
      action,
      description,
      performedBy: performedBy ?? null,
      metadata: metadata ?? null,
    } as any);
  }

  async getActivities(
    purchaseContractId: number,
    page = 1,
    limit = 20,
  ) {
    const offset = (page - 1) * limit;
    const { rows, count } = await this.activityModel.findAndCountAll({
      where: { purchaseContractId },
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    return {
      data: rows,
      total: count,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(count / limit)),
    };
  }
}
