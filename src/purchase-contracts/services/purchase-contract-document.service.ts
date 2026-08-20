import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { PurchaseContractRequiredDocument } from '../models/purchase-contract-required-document.model';
import { PurchaseContract } from '../models/purchase-contract.model';
import { TradeDocument } from '../../masters/trade-document/trade-document.model';
import { Attachment } from '../../attachments/models/attachment.model';
import { AttachmentsService } from '../../attachments/services/attachments.service';
import { PurchaseContractActivityService, PC_ACTIONS } from './purchase-contract-activity.service';

@Injectable()
export class PurchaseContractDocumentService {
  constructor(
    @InjectModel(PurchaseContractRequiredDocument)
    private readonly docModel: typeof PurchaseContractRequiredDocument,
    @InjectModel(PurchaseContract)
    private readonly contractModel: typeof PurchaseContract,
    private readonly attachmentsService: AttachmentsService,
    private readonly activityService: PurchaseContractActivityService,
  ) {}

  /**
   * Get all required documents with upload status for this contract.
   */
  async getDocuments(purchaseContractId: number) {
    const contract = await this.contractModel.findByPk(purchaseContractId);
    if (!contract) throw new NotFoundException('Purchase Contract not found');

    const docs = await this.docModel.findAll({
      where: { purchaseContractId },
      include: [
        { model: TradeDocument, as: 'tradeDocument', attributes: ['id', 'name', 'mandatoryByDefault'] },
        {
          model: Attachment,
          as: 'attachment',
          attributes: ['id', 'originalName', 'mimeType', 'fileSize'],
          required: false,
        },
      ],
      order: [['createdAt', 'ASC']],
    });

    return docs.map((d) => ({
      id: d.id,
      tradeDocument: d.tradeDocument,
      uploaded: !!d.attachmentId,
      uploadedAt: d.uploadedAt,
      uploadedBy: d.uploadedBy,
      attachment: d.attachment
        ? {
            id: d.attachment.id,
            originalName: d.attachment.originalName,
            mimeType: d.attachment.mimeType,
            fileSize: d.attachment.fileSize,
            downloadUrl: `/attachments/${d.attachment.id}/download`,
          }
        : null,
    }));
  }

  /**
   * Add a trade document type as "required" for this contract.
   */
  async addRequiredDocument(purchaseContractId: number, tradeDocumentId: number, user: any) {
    const contract = await this.contractModel.findByPk(purchaseContractId);
    if (!contract) throw new NotFoundException('Purchase Contract not found');

    const [doc, created] = await this.docModel.findOrCreate({
      where: { purchaseContractId, tradeDocumentId },
      defaults: { purchaseContractId, tradeDocumentId } as any,
    });

    if (created) {
      const td = await TradeDocument.findByPk(tradeDocumentId, { attributes: ['name'] });
      await this.activityService.log(
        purchaseContractId,
        PC_ACTIONS.DOCUMENT_ADDED,
        `Document "${td?.name || tradeDocumentId}" added as required`,
        user?.userId,
        { tradeDocumentId },
      );
    }

    return doc;
  }

  /**
   * Upload a file for a specific required document.
   * Reuses the central AttachmentsService — no custom storage logic.
   */
  async uploadDocument(
    purchaseContractId: number,
    tradeDocumentId: number,
    file: Express.Multer.File,
    user: any,
    companyId: number,
  ) {
    const doc = await this.docModel.findOne({ where: { purchaseContractId, tradeDocumentId } });
    if (!doc) throw new NotFoundException('Required document not found. Add it first.');

    // Delete old attachment if re-uploading
    if (doc.attachmentId) {
      await this.attachmentsService.deleteAttachment(doc.attachmentId).catch(() => { });
    }

    const attachment = await this.attachmentsService.createAttachment(file, user?.userId, companyId);

    await doc.update({
      attachmentId: attachment.id,
      uploadedBy: user?.userId,
      uploadedAt: new Date(),
    });

    const td = await TradeDocument.findByPk(tradeDocumentId, { attributes: ['name'] });
    await this.activityService.log(
      purchaseContractId,
      PC_ACTIONS.DOCUMENT_UPLOADED,
      `Document "${td?.name || tradeDocumentId}" uploaded`,
      user?.userId,
      { tradeDocumentId, attachmentId: attachment.id },
    );

    return doc.reload({ include: [{ model: Attachment, as: 'attachment' }] });
  }

  /**
   * Remove an uploaded file from a required document slot.
   */
  async deleteDocument(purchaseContractId: number, tradeDocumentId: number, user: any) {
    const doc = await this.docModel.findOne({ where: { purchaseContractId, tradeDocumentId } });
    if (!doc) throw new NotFoundException('Required document not found');

    if (doc.attachmentId) {
      await this.attachmentsService.deleteAttachment(doc.attachmentId).catch(() => { });
      await doc.update({ attachmentId: null, uploadedBy: null, uploadedAt: null });
    }

    const td = await TradeDocument.findByPk(tradeDocumentId, { attributes: ['name'] });
    await this.activityService.log(
      purchaseContractId,
      PC_ACTIONS.DOCUMENT_DELETED,
      `Document "${td?.name || tradeDocumentId}" upload removed`,
      user?.userId,
      { tradeDocumentId },
    );

    return { success: true };
  }

  /**
   * Compute a document summary for health score calculation.
   */
  async getDocumentSummary(purchaseContractId: number) {
    const docs = await this.docModel.findAll({ where: { purchaseContractId } });
    const total = docs.length;
    const uploaded = docs.filter((d) => !!d.attachmentId).length;
    const pending = total - uploaded;
    const completionPct = total > 0 ? Math.round((uploaded / total) * 100) : 100;

    return { total, uploaded, pending, completionPct };
  }
}
