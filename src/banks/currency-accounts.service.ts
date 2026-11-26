import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  Op,
  UniqueConstraintError,
  fn,
  col,
  where as sqlWhere,
  Transaction,
  WhereOptions,
  FindAndCountOptions,
  Includeable,
  CreationAttributes,
} from 'sequelize';
import { CurrencyAccount } from './models/currency-account.model';
import { DomesticBank } from './models/domestic-bank.model';
import { NostroBank } from './models/nostro-bank.model';
import { Company } from '../companies/models/company.model';
import { CreateCurrencyAccountDto } from './dto/create-currency-account.dto';
import { UpdateCurrencyAccountDto } from './dto/update-currency-account.dto';
import { QueryCurrencyAccountDto } from './dto/query-currency-account.dto';
import { AuditService } from '../audit/services/audit.service';
import { AuditContext } from '../audit/audit.context';

export interface BankActor {
  userId?: number;
  id?: number;
  clientId?: number | null;
  type?: string;
}

export interface LinkedNostrosResponse {
  currencyAccount: {
    id: number;
    companyId: number;
    domesticBankId: number;
    currency: string;
    accountName: string | null;
    accountNumber: string;
    status: 'Active' | 'Inactive';
    domesticBank?: DomesticBank;
  };
  domesticBankId: number;
  currency: string;
  count: number;
  rows: NostroBank[];
}

@Injectable()
export class CurrencyAccountsService {
  constructor(
    @InjectModel(CurrencyAccount)
    private readonly currencyAccountModel: typeof CurrencyAccount,
    @InjectModel(DomesticBank)
    private readonly domesticBankModel: typeof DomesticBank,
    @InjectModel(NostroBank)
    private readonly nostroBankModel: typeof NostroBank,
    @InjectModel(Company)
    private readonly companyModel: typeof Company,
    @Optional()
    private readonly auditService?: AuditService,
  ) {}

  private normalizeRequiredCode(value: string, fieldLabel: string): string {
    const normalized = String(value ?? '')
      .trim()
      .toUpperCase();
    if (!normalized) {
      throw new BadRequestException(`${fieldLabel} is required`);
    }
    return normalized;
  }

  private normalizeRequiredString(value: string, fieldLabel: string): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      throw new BadRequestException(`${fieldLabel} is required`);
    }
    return normalized;
  }

  private normalizeOptionalString(
    value: string | null | undefined,
    uppercase = false,
  ): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    return uppercase ? trimmed.toUpperCase() : trimmed;
  }

  private assertTenantAccess(
    company: Company | null | undefined,
    actor?: BankActor,
  ): void {
    if (
      actor &&
      actor.type &&
      actor.type !== 'super_admin' &&
      actor.clientId &&
      company?.clientId &&
      Number(company.clientId) !== Number(actor.clientId)
    ) {
      throw new ForbiddenException(
        'You do not have access to this company bank account',
      );
    }
  }

  private async ensureDomesticBank(
    domesticBankId: number,
    actor?: BankActor,
    transaction?: Transaction,
  ): Promise<DomesticBank> {
    const domesticBank = await this.domesticBankModel.findByPk(domesticBankId, {
      include: [
        {
          model: Company,
          attributes: ['id', 'clientId', 'name', 'legalName'],
        },
      ],
      transaction,
    });

    if (!domesticBank) {
      throw new BadRequestException(
        `Parent Domestic Bank with ID ${domesticBankId} does not exist`,
      );
    }

    this.assertTenantAccess(domesticBank.company, actor);
    return domesticBank;
  }

  private async assertUniqueAccountNumber(
    domesticBankId: number,
    accountNumber: string,
    excludeId?: number,
    transaction?: Transaction,
  ): Promise<void> {
    const whereClause: WhereOptions<CurrencyAccount> = {
      domesticBankId,
      [Op.and]: [
        sqlWhere(
          fn('LOWER', fn('TRIM', col('account_number'))),
          accountNumber.toLowerCase(),
        ),
      ],
      ...(excludeId !== undefined ? { id: { [Op.ne]: excludeId } } : {}),
    };

    const existing = await this.currencyAccountModel.findOne({
      where: whereClause,
      attributes: ['id', 'accountNumber'],
      transaction,
    });

    if (existing) {
      throw new BadRequestException(
        `Account Number "${accountNumber}" already exists for this Domestic Bank`,
      );
    }
  }

  private async writeAuditLog(params: {
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    entityId: number;
    companyId?: number | null;
    oldRecord?: unknown;
    newRecord?: unknown;
    actor?: BankActor;
  }): Promise<void> {
    if (!this.auditService) return;
    const store = AuditContext.getStore();
    const userId = store?.userId ?? params.actor?.userId ?? params.actor?.id;
    if (!userId) return;

    try {
      await this.auditService.writeDiffLog({
        clientId: store?.clientId ?? params.actor?.clientId ?? null,
        companyId: params.companyId ?? store?.companyId ?? null,
        userId,
        entityType: 'CurrencyAccount',
        entityId: params.entityId,
        action: params.action,
        oldRecord: params.oldRecord,
        newRecord: params.newRecord,
        ipAddress: store?.ipAddress,
        userAgent: store?.userAgent,
      });
    } catch {
      // Never block primary bank operations on audit log failure
    }
  }

  private async runInTransaction<T>(
    work: (transaction?: Transaction) => Promise<T>,
  ): Promise<T> {
    const sequelize = this.currencyAccountModel.sequelize;
    if (!sequelize || typeof sequelize.transaction !== 'function') {
      return work(undefined);
    }
    return sequelize.transaction(async (transaction) => work(transaction));
  }

  private handleWriteError(err: unknown, accountNumber: string): never {
    const rawName =
      err && typeof err === 'object' && 'name' in err
        ? (err as { name?: unknown }).name
        : undefined;
    const errName = typeof rawName === 'string' ? rawName : '';
    if (
      err instanceof UniqueConstraintError ||
      errName === 'SequelizeUniqueConstraintError'
    ) {
      throw new BadRequestException(
        `Account Number "${accountNumber}" already exists for this Domestic Bank`,
      );
    }
    throw err;
  }

  async create(
    dto: CreateCurrencyAccountDto,
    actor?: BankActor,
  ): Promise<CurrencyAccount> {
    const currency = this.normalizeRequiredCode(dto.currency, 'Currency');
    const accountNumber = this.normalizeRequiredString(
      dto.accountNumber,
      'Account Number',
    );

    const domesticBank = await this.ensureDomesticBank(
      dto.domesticBankId,
      actor,
    );

    if (dto.companyId !== undefined && dto.companyId !== null) {
      const company = await this.companyModel.findByPk(dto.companyId);
      if (!company) {
        throw new NotFoundException(
          `Company with ID ${dto.companyId} not found`,
        );
      }
      if (Number(dto.companyId) !== Number(domesticBank.companyId)) {
        throw new BadRequestException(
          'Selected Company does not match the parent Domestic Bank company',
        );
      }
    }

    let createdId: number;
    try {
      const createPayload = {
        companyId: domesticBank.companyId,
        domesticBankId: domesticBank.id,
        currency,
        accountName: this.normalizeOptionalString(dto.accountName) ?? null,
        accountNumber,
        swiftCode: this.normalizeOptionalString(dto.swiftCode, true) ?? null,
        iban: this.normalizeOptionalString(dto.iban, true) ?? null,
        branchName: this.normalizeOptionalString(dto.branchName) ?? null,
        address: this.normalizeOptionalString(dto.address) ?? null,
        status: dto.status || 'Active',
        remarks: this.normalizeOptionalString(dto.remarks) ?? null,
      } as CreationAttributes<CurrencyAccount>;

      const created = await this.runInTransaction(async (transaction) => {
        await this.assertUniqueAccountNumber(
          domesticBank.id,
          accountNumber,
          undefined,
          transaction,
        );

        return this.currencyAccountModel.create(createPayload, { transaction });
      });
      createdId = created.id;
    } catch (err) {
      this.handleWriteError(err, accountNumber);
    }

    const fullRecord = await this.findOne(createdId, actor);

    await this.writeAuditLog({
      action: 'CREATE',
      entityId: fullRecord.id,
      companyId: fullRecord.companyId,
      newRecord: fullRecord,
      actor,
    });

    return fullRecord;
  }

  async findAll(
    query: QueryCurrencyAccountDto,
    actor?: BankActor,
  ): Promise<{
    rows: CurrencyAccount[];
    count: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  }> {
    const searchOr: WhereOptions<CurrencyAccount>[] | undefined =
      query.search?.trim()
        ? [
            { currency: { [Op.iLike]: `%${query.search.trim()}%` } },
            { accountName: { [Op.iLike]: `%${query.search.trim()}%` } },
            { accountNumber: { [Op.iLike]: `%${query.search.trim()}%` } },
            { swiftCode: { [Op.iLike]: `%${query.search.trim()}%` } },
            { iban: { [Op.iLike]: `%${query.search.trim()}%` } },
            { branchName: { [Op.iLike]: `%${query.search.trim()}%` } },
          ]
        : undefined;

    const where: WhereOptions<CurrencyAccount> = {
      ...(query.companyId ? { companyId: Number(query.companyId) } : {}),
      ...(query.domesticBankId
        ? { domesticBankId: Number(query.domesticBankId) }
        : {}),
      ...(query.currency
        ? { currency: query.currency.trim().toUpperCase() }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(searchOr ? { [Op.or]: searchOr } : {}),
    };

    const scopeToClient = Boolean(
      actor?.type && actor.type !== 'super_admin' && actor.clientId,
    );

    const companyInclude: Includeable = {
      model: Company,
      attributes: ['id', 'clientId', 'name', 'legalName'],
      ...(scopeToClient && actor?.clientId
        ? { where: { clientId: actor.clientId }, required: true }
        : {}),
    };

    const baseOptions: FindAndCountOptions<CurrencyAccount> = {
      where,
      include: [
        companyInclude,
        {
          model: DomesticBank,
          as: 'domesticBank',
          attributes: [
            'id',
            'companyId',
            'bankName',
            'currency',
            'accountNumber',
            'swiftCode',
            'bankAddress',
            'status',
          ],
        },
      ],
      order: [['id', 'DESC']],
    };

    const hasPagination = query.page !== undefined || query.limit !== undefined;

    if (hasPagination) {
      const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
      const limit = Math.min(
        200,
        Math.max(1, parseInt(query.limit || '20', 10) || 20),
      );

      const { rows, count } = await this.currencyAccountModel.findAndCountAll({
        ...baseOptions,
        limit,
        offset: (page - 1) * limit,
      });

      return {
        rows,
        count,
        page,
        limit,
        totalPages: Math.ceil(count / limit) || 1,
      };
    }

    const { rows, count } =
      await this.currencyAccountModel.findAndCountAll(baseOptions);
    return { rows, count };
  }

  async findOne(id: number, actor?: BankActor): Promise<CurrencyAccount> {
    const account = await this.currencyAccountModel.findByPk(id, {
      include: [
        {
          model: Company,
          attributes: ['id', 'clientId', 'name', 'legalName'],
        },
        {
          model: DomesticBank,
          as: 'domesticBank',
          attributes: [
            'id',
            'companyId',
            'bankName',
            'currency',
            'accountNumber',
            'swiftCode',
            'bankAddress',
            'status',
          ],
        },
      ],
    });

    if (!account) {
      throw new NotFoundException(`Currency account with ID ${id} not found`);
    }

    this.assertTenantAccess(account.company, actor);
    return account;
  }

  async update(
    id: number,
    dto: UpdateCurrencyAccountDto,
    actor?: BankActor,
  ): Promise<CurrencyAccount> {
    const existing = await this.findOne(id, actor);
    const oldRecord: unknown = existing.toJSON
      ? existing.toJSON()
      : { ...existing };

    let targetDomesticBankId = existing.domesticBankId;
    let targetCompanyId = existing.companyId;

    if (
      dto.domesticBankId !== undefined &&
      Number(dto.domesticBankId) !== Number(existing.domesticBankId)
    ) {
      const newDomesticBank = await this.ensureDomesticBank(
        dto.domesticBankId,
        actor,
      );
      targetDomesticBankId = newDomesticBank.id;
      targetCompanyId = newDomesticBank.companyId;
    }

    if (dto.companyId !== undefined && dto.companyId !== null) {
      const company = await this.companyModel.findByPk(dto.companyId);
      if (!company) {
        throw new NotFoundException(
          `Company with ID ${dto.companyId} not found`,
        );
      }
      if (Number(dto.companyId) !== Number(targetCompanyId)) {
        throw new BadRequestException(
          'Selected Company does not match the parent Domestic Bank company',
        );
      }
    }

    const targetCurrency =
      dto.currency !== undefined
        ? this.normalizeRequiredCode(dto.currency, 'Currency')
        : existing.currency;

    const targetAccountNumber =
      dto.accountNumber !== undefined
        ? this.normalizeRequiredString(dto.accountNumber, 'Account Number')
        : existing.accountNumber;

    const updatePayload: Partial<CurrencyAccount> = {
      companyId: targetCompanyId,
      domesticBankId: targetDomesticBankId,
      currency: targetCurrency,
      accountNumber: targetAccountNumber,
    };

    if (dto.accountName !== undefined) {
      updatePayload.accountName = this.normalizeOptionalString(dto.accountName);
    }
    if (dto.swiftCode !== undefined) {
      updatePayload.swiftCode = this.normalizeOptionalString(
        dto.swiftCode,
        true,
      );
    }
    if (dto.iban !== undefined) {
      updatePayload.iban = this.normalizeOptionalString(dto.iban, true);
    }
    if (dto.branchName !== undefined) {
      updatePayload.branchName = this.normalizeOptionalString(dto.branchName);
    }
    if (dto.address !== undefined) {
      updatePayload.address = this.normalizeOptionalString(dto.address);
    }
    if (dto.status !== undefined) {
      updatePayload.status = dto.status;
    }
    if (dto.remarks !== undefined) {
      updatePayload.remarks = this.normalizeOptionalString(dto.remarks);
    }

    try {
      await this.runInTransaction(async (transaction) => {
        await this.assertUniqueAccountNumber(
          targetDomesticBankId,
          targetAccountNumber,
          id,
          transaction,
        );

        await existing.update(updatePayload, { transaction });
      });
    } catch (err) {
      this.handleWriteError(err, targetAccountNumber);
    }

    const updated = await this.findOne(id, actor);

    await this.writeAuditLog({
      action: 'UPDATE',
      entityId: id,
      companyId: updated.companyId,
      oldRecord,
      newRecord: updated,
      actor,
    });

    return updated;
  }

  async remove(
    id: number,
    actor?: BankActor,
  ): Promise<{ success: boolean; message: string }> {
    const existing = await this.findOne(id, actor);
    const oldRecord: unknown = existing.toJSON
      ? existing.toJSON()
      : { ...existing };

    await this.runInTransaction(async (transaction) => {
      await existing.destroy({ transaction });
    });

    await this.writeAuditLog({
      action: 'DELETE',
      entityId: id,
      companyId: existing.companyId,
      oldRecord,
      actor,
    });

    return {
      success: true,
      message: 'Currency account deleted successfully',
    };
  }

  /**
   * Dynamically resolves read-only linked Nostro records matching BOTH:
   * - DomesticBankId = Selected Currency Account's Domestic Bank
   * - Currency = Selected Currency Account's Currency
   */
  async findLinkedNostros(
    id: number,
    status?: string,
    actor?: BankActor,
  ): Promise<LinkedNostrosResponse> {
    const account = await this.findOne(id, actor);
    const normalizedCurrency = account.currency.toUpperCase().trim();

    const where: WhereOptions<NostroBank> = {
      domesticBankId: account.domesticBankId,
      currency: { [Op.iLike]: normalizedCurrency },
      ...(status ? { status: status as 'Active' | 'Inactive' } : {}),
    };

    const nostros = await this.nostroBankModel.findAll({
      where,
      include: [
        {
          model: Company,
          attributes: ['id', 'name', 'legalName'],
        },
        {
          model: DomesticBank,
          as: 'domesticBank',
          attributes: [
            'id',
            'bankName',
            'currency',
            'accountNumber',
            'swiftCode',
            'bankAddress',
            'status',
          ],
        },
      ],
      order: [['id', 'ASC']],
    });

    return {
      currencyAccount: {
        id: account.id,
        companyId: account.companyId,
        domesticBankId: account.domesticBankId,
        currency: normalizedCurrency,
        accountName: account.accountName,
        accountNumber: account.accountNumber,
        status: account.status,
        domesticBank: account.domesticBank,
      },
      domesticBankId: account.domesticBankId,
      currency: normalizedCurrency,
      count: nostros.length,
      rows: nostros,
    };
  }
}
