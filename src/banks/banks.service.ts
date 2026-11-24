import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { DomesticBank } from './models/domestic-bank.model';
import { NostroBank } from './models/nostro-bank.model';
import { Company } from '../companies/models/company.model';
import { CreateDomesticBankDto } from './dto/create-domestic-bank.dto';
import { UpdateDomesticBankDto } from './dto/update-domestic-bank.dto';
import { CreateNostroBankDto } from './dto/create-nostro-bank.dto';
import { UpdateNostroBankDto } from './dto/update-nostro-bank.dto';
import { QueryDomesticBankDto, QueryNostroBankDto } from './dto/query-bank.dto';
import { formatBankDetails } from './utils/bank-formatter.util';

export interface BankOptionResponse {
  key: string;
  name: string;
  currency: string;
  details: any;
}

@Injectable()
export class BanksService {
  constructor(
    @InjectModel(DomesticBank)
    private readonly domesticBankModel: typeof DomesticBank,
    @InjectModel(NostroBank)
    private readonly nostroBankModel: typeof NostroBank,
    @InjectModel(Company)
    private readonly companyModel: typeof Company,
  ) {}

  // ─── Domestic Banks ────────────────────────────────────────────────────────

  async createDomestic(dto: CreateDomesticBankDto): Promise<DomesticBank> {
    const company = await this.companyModel.findByPk(dto.companyId);
    if (!company) {
      throw new NotFoundException(`Company with ID ${dto.companyId} not found`);
    }

    return this.domesticBankModel.create({
      companyId: dto.companyId,
      bankName: dto.bankName.trim(),
      currency: (dto.currency || 'INR').toUpperCase().trim(),
      accountNumber: dto.accountNumber.trim(),
      swiftCode: dto.swiftCode.trim().toUpperCase(),
      bankAddress: dto.bankAddress.trim(),
      status: dto.status || 'Active',
    });
  }

  async findAllDomestic(query: QueryDomesticBankDto): Promise<{ rows: DomesticBank[]; count: number }> {
    const where: any = {};

    if (query.companyId) {
      where.companyId = Number(query.companyId);
    }
    if (query.currency) {
      where.currency = query.currency.toUpperCase().trim();
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.search) {
      const s = `%${query.search.trim()}%`;
      where[Op.or] = [
        { bankName: { [Op.iLike]: s } },
        { accountNumber: { [Op.iLike]: s } },
        { swiftCode: { [Op.iLike]: s } },
      ];
    }

    const { rows, count } = await this.domesticBankModel.findAndCountAll({
      where,
      include: [
        {
          model: Company,
          attributes: ['id', 'name', 'legalName'],
        },
        {
          model: NostroBank,
          as: 'nostroAccounts',
          attributes: ['id', 'currency', 'bankName', 'accountName', 'accountNumber', 'swiftCode', 'bankAddress', 'status'],
        },
      ],
      order: [['id', 'DESC']],
    });

    const mappedRows = rows.map((r: any) => {
      const data = r.toJSON ? r.toJSON() : r;
      return {
        ...data,
        linkedNostroAccounts: data.nostroAccounts || [],
      };
    });

    return { rows: mappedRows as any, count };
  }

  async findOneDomestic(id: number): Promise<any> {
    const bank = await this.domesticBankModel.findByPk(id, {
      include: [
        {
          model: Company,
          attributes: ['id', 'name', 'legalName'],
        },
        {
          model: NostroBank,
          as: 'nostroAccounts',
          order: [['currency', 'ASC']],
        },
      ],
    });

    if (!bank) {
      throw new NotFoundException(`Domestic bank with ID ${id} not found`);
    }

    const data = bank.toJSON ? bank.toJSON() : bank;
    return {
      ...data,
      linkedNostroAccounts: data.nostroAccounts || [],
    };
  }

  async updateDomestic(id: number, dto: UpdateDomesticBankDto): Promise<any> {
    const bank = await this.domesticBankModel.findByPk(id);
    if (!bank) {
      throw new NotFoundException(`Domestic bank with ID ${id} not found`);
    }

    if (dto.companyId && dto.companyId !== bank.companyId) {
      const company = await this.companyModel.findByPk(dto.companyId);
      if (!company) {
        throw new NotFoundException(`Company with ID ${dto.companyId} not found`);
      }
    }

    await bank.update({
      ...(dto.companyId ? { companyId: dto.companyId } : {}),
      ...(dto.bankName ? { bankName: dto.bankName.trim() } : {}),
      ...(dto.currency ? { currency: dto.currency.toUpperCase().trim() } : {}),
      ...(dto.accountNumber ? { accountNumber: dto.accountNumber.trim() } : {}),
      ...(dto.swiftCode ? { swiftCode: dto.swiftCode.trim().toUpperCase() } : {}),
      ...(dto.bankAddress ? { bankAddress: dto.bankAddress.trim() } : {}),
      ...(dto.status ? { status: dto.status } : {}),
    });

    return this.findOneDomestic(id);
  }

  async removeDomestic(id: number): Promise<{ success: boolean; message: string }> {
    const bank = await this.domesticBankModel.findByPk(id);
    if (!bank) {
      throw new NotFoundException(`Domestic bank with ID ${id} not found`);
    }

    // Cascade delete linked Nostro accounts explicitly
    await this.nostroBankModel.destroy({
      where: { domesticBankId: id },
    });

    await bank.destroy();
    return { success: true, message: 'Domestic bank and linked Nostro accounts deleted successfully' };
  }

  // ─── Nostro Banks ──────────────────────────────────────────────────────────

  async createNostro(dto: CreateNostroBankDto): Promise<NostroBank> {
    const company = await this.companyModel.findByPk(dto.companyId);
    if (!company) {
      throw new NotFoundException(`Company with ID ${dto.companyId} not found`);
    }

    const domesticBank = await this.domesticBankModel.findByPk(dto.domesticBankId);
    if (!domesticBank) {
      throw new BadRequestException(`Parent Domestic Bank with ID ${dto.domesticBankId} does not exist`);
    }

    return this.nostroBankModel.create({
      companyId: dto.companyId,
      domesticBankId: dto.domesticBankId,
      currency: dto.currency.toUpperCase().trim(),
      bankName: dto.bankName.trim(),
      accountName: dto.accountName.trim(),
      accountNumber: dto.accountNumber.trim(),
      swiftCode: dto.swiftCode.trim().toUpperCase(),
      bankAddress: dto.bankAddress.trim(),
      status: dto.status || 'Active',
    });
  }

  async findAllNostro(query: QueryNostroBankDto): Promise<{ rows: NostroBank[]; count: number }> {
    const where: any = {};

    if (query.companyId) {
      where.companyId = Number(query.companyId);
    }
    if (query.domesticBankId) {
      where.domesticBankId = Number(query.domesticBankId);
    }
    if (query.currency) {
      where.currency = query.currency.toUpperCase().trim();
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.search) {
      const s = `%${query.search.trim()}%`;
      where[Op.or] = [
        { bankName: { [Op.iLike]: s } },
        { accountName: { [Op.iLike]: s } },
        { accountNumber: { [Op.iLike]: s } },
        { swiftCode: { [Op.iLike]: s } },
      ];
    }

    const { rows, count } = await this.nostroBankModel.findAndCountAll({
      where,
      include: [
        {
          model: Company,
          attributes: ['id', 'name', 'legalName'],
        },
        {
          model: DomesticBank,
          as: 'domesticBank',
          attributes: ['id', 'bankName', 'currency', 'accountNumber', 'swiftCode', 'bankAddress', 'status'],
        },
      ],
      order: [['id', 'DESC']],
    });

    return { rows, count };
  }

  async findOneNostro(id: number): Promise<NostroBank> {
    const bank = await this.nostroBankModel.findByPk(id, {
      include: [
        {
          model: Company,
          attributes: ['id', 'name', 'legalName'],
        },
        {
          model: DomesticBank,
          as: 'domesticBank',
        },
      ],
    });

    if (!bank) {
      throw new NotFoundException(`Nostro bank with ID ${id} not found`);
    }

    return bank;
  }

  async updateNostro(id: number, dto: UpdateNostroBankDto): Promise<NostroBank> {
    const bank = await this.findOneNostro(id);

    if (dto.domesticBankId && dto.domesticBankId !== bank.domesticBankId) {
      const domesticBank = await this.domesticBankModel.findByPk(dto.domesticBankId);
      if (!domesticBank) {
        throw new BadRequestException(`Parent Domestic Bank with ID ${dto.domesticBankId} does not exist`);
      }
    }

    if (dto.companyId && dto.companyId !== bank.companyId) {
      const company = await this.companyModel.findByPk(dto.companyId);
      if (!company) {
        throw new NotFoundException(`Company with ID ${dto.companyId} not found`);
      }
    }

    await bank.update({
      ...(dto.companyId ? { companyId: dto.companyId } : {}),
      ...(dto.domesticBankId ? { domesticBankId: dto.domesticBankId } : {}),
      ...(dto.currency ? { currency: dto.currency.toUpperCase().trim() } : {}),
      ...(dto.bankName ? { bankName: dto.bankName.trim() } : {}),
      ...(dto.accountName ? { accountName: dto.accountName.trim() } : {}),
      ...(dto.accountNumber ? { accountNumber: dto.accountNumber.trim() } : {}),
      ...(dto.swiftCode ? { swiftCode: dto.swiftCode.trim().toUpperCase() } : {}),
      ...(dto.bankAddress ? { bankAddress: dto.bankAddress.trim() } : {}),
      ...(dto.status ? { status: dto.status } : {}),
    });

    return this.findOneNostro(id);
  }

  async removeNostro(id: number): Promise<{ success: boolean; message: string }> {
    const bank = await this.nostroBankModel.findByPk(id);
    if (!bank) {
      throw new NotFoundException(`Nostro bank with ID ${id} not found`);
    }
    await bank.destroy();
    return { success: true, message: 'Nostro bank deleted successfully' };
  }

  // ─── Automatic Mapping & Resolution for Documents ──────────────────────────

  /**
   * Resolves the appropriate bank details for a document:
   * - If Document Currency = INR: Returns Domestic Bank Details only.
   * - If Document Currency = USD / EUR / GBP / AED etc.: Finds linked Nostro account for that currency,
   *   returns Nostro Bank Details first, then linked Domestic (Beneficiary) Bank Details.
   */
  async resolveBankForDocument(
    currency: string = 'INR',
    companyId?: number,
  ): Promise<{
    matched: boolean;
    currency: string;
    accountType: 'domestic' | 'nostro';
    formattedText: string;
    domesticBank: any;
    nostroBank?: any;
    snapshot: any;
  } | null> {
    const curr = (currency || 'INR').toUpperCase().trim();
    const isDomestic = curr === 'INR';

    // 1. If INR document: Find active domestic bank
    if (isDomestic) {
      const where: any = { status: 'Active' };
      if (companyId) where.companyId = companyId;

      const domestic = await this.domesticBankModel.findOne({
        where,
        include: [{ model: Company, attributes: ['id', 'name', 'legalName'] }],
        order: [['id', 'ASC']],
      });

      if (!domestic) return null;

      const beneficiaryName = domestic.company?.legalName || domestic.company?.name || 'AGRICOM IMPEX';
      const formattedText = formatBankDetails({
        currency: 'INR',
        beneficiaryName,
        domesticBank: {
          bankName: domestic.bankName,
          accountNumber: domestic.accountNumber,
          swiftCode: domestic.swiftCode,
          bankAddress: domestic.bankAddress,
        },
      });

      const snapshot = {
        bankName: domestic.bankName,
        accountName: beneficiaryName,
        accountNumber: domestic.accountNumber,
        swiftCode: domestic.swiftCode,
        currency: 'INR',
        address: domestic.bankAddress,
        beneficiaryName,
        domesticBankName: domestic.bankName,
        domesticAccountNumber: domestic.accountNumber,
        domesticSwiftCode: domestic.swiftCode,
        domesticBankAddress: domestic.bankAddress,
        formattedText,
        additionalDetails: formattedText,
      };

      return {
        matched: true,
        currency: 'INR',
        accountType: 'domestic',
        formattedText,
        domesticBank: domestic.toJSON(),
        snapshot,
      };
    }

    // 2. Foreign currency document: Find linked Nostro account
    const nostroWhere: any = { currency: curr, status: 'Active' };
    if (companyId) nostroWhere.companyId = companyId;

    const nostro = await this.nostroBankModel.findOne({
      where: nostroWhere,
      include: [
        { model: Company, attributes: ['id', 'name', 'legalName'] },
        { model: DomesticBank, as: 'domesticBank', where: { status: 'Active' } },
      ],
      order: [['id', 'ASC']],
    });

    if (nostro && nostro.domesticBank) {
      const domestic = nostro.domesticBank;
      const beneficiaryName = domestic.company?.legalName || domestic.company?.name || nostro.company?.legalName || nostro.company?.name || 'AGRICOM IMPEX';

      const formattedText = formatBankDetails({
        currency: curr,
        beneficiaryName,
        domesticBank: {
          bankName: domestic.bankName,
          accountNumber: domestic.accountNumber,
          swiftCode: domestic.swiftCode,
          bankAddress: domestic.bankAddress,
        },
        nostroBank: {
          bankName: nostro.bankName,
          accountName: nostro.accountName,
          accountNumber: nostro.accountNumber,
          swiftCode: nostro.swiftCode,
          bankAddress: nostro.bankAddress,
        },
      });

      const snapshot = {
        bankName: domestic.bankName,
        accountName: beneficiaryName,
        accountNumber: domestic.accountNumber,
        swiftCode: domestic.swiftCode,
        currency: curr,
        address: domestic.bankAddress,
        beneficiaryName,
        // Nostro fields
        nostroBankName: nostro.bankName,
        nostroAccountName: nostro.accountName,
        nostroAccountNumber: nostro.accountNumber,
        nostroSwiftCode: nostro.swiftCode,
        nostroBankAddress: nostro.bankAddress,
        // Domestic fields
        domesticBankName: domestic.bankName,
        domesticAccountNumber: domestic.accountNumber,
        domesticSwiftCode: domestic.swiftCode,
        domesticBankAddress: domestic.bankAddress,
        formattedText,
        additionalDetails: formattedText,
      };

      return {
        matched: true,
        currency: curr,
        accountType: 'nostro',
        formattedText,
        domesticBank: domestic.toJSON(),
        nostroBank: nostro.toJSON(),
        snapshot,
      };
    }

    // If NO active Nostro account found for that foreign currency:
    // Do NOT substitute domestic bank or any other bank! Return null to indicate no bank configured.
    return null;
  }

  /**
   * Returns list of BankOption matching IBankDetailsProvider contract
   */
  async getBankOptions(currency?: string, companyId?: number): Promise<BankOptionResponse[]> {
    const curr = currency ? currency.toUpperCase().trim() : undefined;
    const options: BankOptionResponse[] = [];

    // Query active Nostro accounts
    const nostroWhere: any = { status: 'Active' };
    if (curr && curr !== 'INR') {
      nostroWhere.currency = curr;
    }
    if (companyId) {
      nostroWhere.companyId = companyId;
    }

    const nostros = await this.nostroBankModel.findAll({
      where: nostroWhere,
      include: [
        { model: Company, attributes: ['id', 'name', 'legalName'] },
        { model: DomesticBank, as: 'domesticBank', where: { status: 'Active' } },
      ],
      order: [['currency', 'ASC'], ['id', 'ASC']],
    });

    for (const n of nostros) {
      const domestic = n.domesticBank;
      const beneficiaryName = domestic?.company?.legalName || domestic?.company?.name || n.company?.legalName || n.company?.name || 'AGRICOM IMPEX';

      const formattedText = formatBankDetails({
        currency: n.currency,
        beneficiaryName,
        domesticBank: {
          bankName: domestic.bankName,
          accountNumber: domestic.accountNumber,
          swiftCode: domestic.swiftCode,
          bankAddress: domestic.bankAddress,
        },
        nostroBank: {
          bankName: n.bankName,
          accountName: n.accountName,
          accountNumber: n.accountNumber,
          swiftCode: n.swiftCode,
          bankAddress: n.bankAddress,
        },
      });

      options.push({
        key: `NOSTRO_${n.currency}_${n.id}`,
        name: `${n.bankName} (${n.currency} Nostro) via ${domestic.bankName}`,
        currency: n.currency,
        details: {
          bankName: domestic.bankName,
          accountName: beneficiaryName,
          accountNumber: domestic.accountNumber,
          swiftCode: domestic.swiftCode,
          branch: domestic.bankAddress,
          currency: n.currency,
          additionalDetails: formattedText,
          formattedText,
          nostroBankName: n.bankName,
          nostroAccountName: n.accountName,
          nostroAccountNumber: n.accountNumber,
          nostroSwiftCode: n.swiftCode,
          nostroBankAddress: n.bankAddress,
          domesticBankName: domestic.bankName,
          domesticAccountNumber: domestic.accountNumber,
          domesticSwiftCode: domestic.swiftCode,
          domesticBankAddress: domestic.bankAddress,
          beneficiaryName,
        },
      });
    }

    // Query active Domestic banks strictly for INR or when currency is not specified
    if (!curr || curr === 'INR') {
      const domWhere: any = { status: 'Active' };
      if (companyId) domWhere.companyId = companyId;

      const domesticBanks = await this.domesticBankModel.findAll({
        where: domWhere,
        include: [{ model: Company, attributes: ['id', 'name', 'legalName'] }],
        order: [['id', 'ASC']],
      });

      for (const d of domesticBanks) {
        const beneficiaryName = d.company?.legalName || d.company?.name || 'AGRICOM IMPEX';
        const formattedText = formatBankDetails({
          currency: d.currency || 'INR',
          beneficiaryName,
          domesticBank: {
            bankName: d.bankName,
            accountNumber: d.accountNumber,
            swiftCode: d.swiftCode,
            bankAddress: d.bankAddress,
          },
        });

        options.push({
          key: `DOMESTIC_${d.currency || 'INR'}_${d.id}`,
          name: `${d.bankName} (${d.currency || 'INR'} Domestic Account)`,
          currency: d.currency || 'INR',
          details: {
            bankName: d.bankName,
            accountName: beneficiaryName,
            accountNumber: d.accountNumber,
            swiftCode: d.swiftCode,
            branch: d.bankAddress,
            currency: d.currency || 'INR',
            additionalDetails: formattedText,
            formattedText,
            domesticBankName: d.bankName,
            domesticAccountNumber: d.accountNumber,
            domesticSwiftCode: d.swiftCode,
            domesticBankAddress: d.bankAddress,
            beneficiaryName,
          },
        });
      }
    }

    return options;
  }
}
