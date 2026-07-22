import {
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Currency } from './currency.model';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { QueryCurrencyDto } from './dto/query-currency.dto';

const ALL_WORLD_CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$', isActive: true },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', isActive: true },
  { code: 'EUR', name: 'Euro', symbol: '€', isActive: true },
  { code: 'GBP', name: 'British Pound', symbol: '£', isActive: true },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', isActive: true },
  { code: 'SGD', name: 'Singapore Dollar', symbol: '$', isActive: true },
  { code: 'CAD', name: 'Canadian Dollar', symbol: '$', isActive: true },
  { code: 'AUD', name: 'Australian Dollar', symbol: '$', isActive: true },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', isActive: true },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', isActive: true },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'ر.س', isActive: true },
  { code: 'QAR', name: 'Qatari Rial', symbol: 'ر.ق', isActive: true },
  { code: 'AFN', name: 'Afghan Afghani', symbol: '؋', isActive: false },
  { code: 'ALL', name: 'Albanian Lek', symbol: 'L', isActive: false },
  { code: 'AMD', name: 'Armenian Dram', symbol: '֏', isActive: false },
  { code: 'ANG', name: 'Netherlands Antillean Guilder', symbol: 'ƒ', isActive: false },
  { code: 'AOA', name: 'Angolan Kwanza', symbol: 'Kz', isActive: false },
  { code: 'ARS', name: 'Argentine Peso', symbol: '$', isActive: false },
  { code: 'AWG', name: 'Aruban Florin', symbol: 'ƒ', isActive: false },
  { code: 'AZN', name: 'Azerbaijani Manat', symbol: '₼', isActive: false },
  { code: 'BAM', name: 'Bosnia-Herzegovina Convertible Mark', symbol: 'KM', isActive: false },
  { code: 'BBD', name: 'Barbadian Dollar', symbol: '$', isActive: false },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', isActive: false },
  { code: 'BGN', name: 'Bulgarian Lev', symbol: 'лв', isActive: false },
  { code: 'BHD', name: 'Bahraini Dinar', symbol: '.د.ب', isActive: false },
  { code: 'BIF', name: 'Burundian Franc', symbol: 'FBu', isActive: false },
  { code: 'BMD', name: 'Bermudan Dollar', symbol: '$', isActive: false },
  { code: 'BND', name: 'Brunei Dollar', symbol: '$', isActive: false },
  { code: 'BOB', name: 'Bolivian Boliviano', symbol: 'Bs.', isActive: false },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', isActive: false },
  { code: 'BSD', name: 'Bahamian Dollar', symbol: '$', isActive: false },
  { code: 'BTN', name: 'Bhutanese Ngultrum', symbol: 'Nu.', isActive: false },
  { code: 'BWP', name: 'Botswanan Pula', symbol: 'P', isActive: false },
  { code: 'BYN', name: 'Belarusian Ruble', symbol: 'Br', isActive: false },
  { code: 'BZD', name: 'Belize Dollar', symbol: 'BZ$', isActive: false },
  { code: 'CDF', name: 'Congolese Franc', symbol: 'FC', isActive: false },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', isActive: false },
  { code: 'CLP', name: 'Chilean Peso', symbol: '$', isActive: false },
  { code: 'COP', name: 'Colombian Peso', symbol: '$', isActive: false },
  { code: 'CRC', name: 'Costa Rican Colón', symbol: '₡', isActive: false },
  { code: 'CUP', name: 'Cuban Peso', symbol: '$', isActive: false },
  { code: 'CVE', name: 'Cape Verdean Escudo', symbol: '$', isActive: false },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč', isActive: false },
  { code: 'DJF', name: 'Djiboutian Franc', symbol: 'Fdj', isActive: false },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr', isActive: false },
  { code: 'DOP', name: 'Dominican Peso', symbol: 'RD$', isActive: false },
  { code: 'DZD', name: 'Algerian Dinar', symbol: 'دج', isActive: false },
  { code: 'EGP', name: 'Egyptian Pound', symbol: '£', isActive: false },
  { code: 'ERN', name: 'Eritrean Nakfa', symbol: 'Nfk', isActive: false },
  { code: 'ETB', name: 'Ethiopian Birr', symbol: 'Br', isActive: false },
  { code: 'FJD', name: 'Fijian Dollar', symbol: '$', isActive: false },
  { code: 'FKP', name: 'Falkland Islands Pound', symbol: '£', isActive: false },
  { code: 'GEL', name: 'Georgian Lari', symbol: '₾', isActive: false },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵', isActive: false },
  { code: 'GIP', name: 'Gibraltar Pound', symbol: '£', isActive: false },
  { code: 'GMD', name: 'Gambian Dalasi', symbol: 'D', isActive: false },
  { code: 'GNF', name: 'Guinean Franc', symbol: 'FG', isActive: false },
  { code: 'GTQ', name: 'Guatemalan Quetzal', symbol: 'Q', isActive: false },
  { code: 'GYD', name: 'Guyanaese Dollar', symbol: '$', isActive: false },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: '$', isActive: false },
  { code: 'HNL', name: 'Honduran Lempira', symbol: 'L', isActive: false },
  { code: 'HRK', name: 'Croatian Kuna', symbol: 'kn', isActive: false },
  { code: 'HTG', name: 'Haitian Gourde', symbol: 'G', isActive: false },
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft', isActive: false },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', isActive: false },
  { code: 'ILS', name: 'Israeli New Shekel', symbol: '₪', isActive: false },
  { code: 'IQD', name: 'Iraqi Dinar', symbol: 'ع.د', isActive: false },
  { code: 'IRR', name: 'Iranian Rial', symbol: '﷼', isActive: false },
  { code: 'ISK', name: 'Icelandic Króna', symbol: 'kr', isActive: false },
  { code: 'JMD', name: 'Jamaican Dollar', symbol: '$', isActive: false },
  { code: 'JOD', name: 'Jordanian Dinar', symbol: 'د.ا', isActive: false },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', isActive: false },
  { code: 'KGS', name: 'Kyrgystani Som', symbol: 'с', isActive: false },
  { code: 'KHR', name: 'Cambodian Riel', symbol: '៛', isActive: false },
  { code: 'KMF', name: 'Comorian Franc', symbol: 'CF', isActive: false },
  { code: 'KPW', name: 'North Korean Won', symbol: '₩', isActive: false },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩', isActive: false },
  { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'د.ك', isActive: false },
  { code: 'KYD', name: 'Cayman Islands Dollar', symbol: '$', isActive: false },
  { code: 'KZT', name: 'Kazakhstani Tenge', symbol: '₸', isActive: false },
  { code: 'LAK', name: 'Laotian Kip', symbol: '₭', isActive: false },
  { code: 'LBP', name: 'Lebanese Pound', symbol: '£', isActive: false },
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: '₨', isActive: false },
  { code: 'LRD', name: 'Liberian Dollar', symbol: '$', isActive: false },
  { code: 'LSL', name: 'Lesotho Loti', symbol: 'L', isActive: false },
  { code: 'LYD', name: 'Libyan Dinar', symbol: 'ل.د', isActive: false },
  { code: 'MAD', name: 'Moroccan Dirham', symbol: 'د.م.', isActive: false },
  { code: 'MDL', name: 'Moldovan Leu', symbol: 'L', isActive: false },
  { code: 'MGA', name: 'Malagasy Ariary', symbol: 'Ar', isActive: false },
  { code: 'MKD', name: 'Macedonian Denar', symbol: 'ден', isActive: false },
  { code: 'MMK', name: 'Myanmar Kyat', symbol: 'K', isActive: false },
  { code: 'MNT', name: 'Mongolian Tugrik', symbol: '₮', isActive: false },
  { code: 'MOP', name: 'Macanese Pataca', symbol: 'MOP$', isActive: false },
  { code: 'MRU', name: 'Mauritanian Ouguiya', symbol: 'UM', isActive: false },
  { code: 'MUR', name: 'Mauritian Rupee', symbol: '₨', isActive: false },
  { code: 'MVR', name: 'Maldivian Rufiyaa', symbol: 'Rf', isActive: false },
  { code: 'MWK', name: 'Malawian Kwacha', symbol: 'MK', isActive: false },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$', isActive: false },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', isActive: false },
  { code: 'MZN', name: 'Mozambican Metical', symbol: 'MT', isActive: false },
  { code: 'NAD', name: 'Namibian Dollar', symbol: '$', isActive: false },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', isActive: false },
  { code: 'NIO', name: 'Nicaraguan Córdoba', symbol: 'C$', isActive: false },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', isActive: false },
  { code: 'NPR', name: 'Nepalese Rupee', symbol: '₨', isActive: false },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: '$', isActive: false },
  { code: 'OMR', name: 'Omani Rial', symbol: 'ر.ع.', isActive: false },
  { code: 'PAB', name: 'Panamanian Balboa', symbol: 'B/.', isActive: false },
  { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/.', isActive: false },
  { code: 'PGK', name: 'Papua New Guinean Kina', symbol: 'K', isActive: false },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', isActive: false },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨', isActive: false },
  { code: 'PLN', name: 'Polish Złoty', symbol: 'zł', isActive: false },
  { code: 'PYG', name: 'Paraguayan Guarani', symbol: '₲', isActive: false },
  { code: 'RON', name: 'Romanian Leu', symbol: 'lei', isActive: false },
  { code: 'RSD', name: 'Serbian Dinar', symbol: 'дин.', isActive: false },
  { code: 'RUB', name: 'Russian Ruble', symbol: '₽', isActive: false },
  { code: 'RWF', name: 'Rwandan Franc', symbol: 'FRw', isActive: false },
  { code: 'SBD', name: 'Solomon Islands Dollar', symbol: '$', isActive: false },
  { code: 'SCR', name: 'Seychellois Rupee', symbol: '₨', isActive: false },
  { code: 'SDG', name: 'Sudanese Pound', symbol: 'ج.س.', isActive: false },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', isActive: false },
  { code: 'SHP', name: 'Saint Helena Pound', symbol: '£', isActive: false },
  { code: 'SLL', name: 'Sierra Leonean Leone', symbol: 'Le', isActive: false },
  { code: 'SOS', name: 'Somali Shilling', symbol: 'S', isActive: false },
  { code: 'SRD', name: 'Surinamese Dollar', symbol: '$', isActive: false },
  { code: 'SSP', name: 'South Sudanese Pound', symbol: '£', isActive: false },
  { code: 'STN', name: 'São Tomé & Príncipe Dobra', symbol: 'Db', isActive: false },
  { code: 'SYP', name: 'Syrian Pound', symbol: '£', isActive: false },
  { code: 'SZL', name: 'Swazi Lilangeni', symbol: 'L', isActive: false },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', isActive: false },
  { code: 'TJS', name: 'Tajikistani Somoni', symbol: 'ЅМ', isActive: false },
  { code: 'TMT', name: 'Turkmenistani Manat', symbol: 'm', isActive: false },
  { code: 'TND', name: 'Tunisian Dinar', symbol: 'د.ت', isActive: false },
  { code: 'TOP', name: 'Tongan Paʻanga', symbol: 'T$', isActive: false },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', isActive: false },
  { code: 'TTD', name: 'Trinidad & Tobago Dollar', symbol: '$', isActive: false },
  { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', isActive: false },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh', isActive: false },
  { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴', isActive: false },
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh', isActive: false },
  { code: 'UYU', name: 'Uruguayan Peso', symbol: '$', isActive: false },
  { code: 'UZS', name: 'Uzbekistani Som', symbol: 'лв', isActive: false },
  { code: 'VES', name: 'Venezuelan Bolívar', symbol: 'Bs.', isActive: false },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', isActive: false },
  { code: 'VUV', name: 'Vanuatu Vatu', symbol: 'VT', isActive: false },
  { code: 'WST', name: 'Samoan Tala', symbol: 'WS$', isActive: false },
  { code: 'XAF', name: 'Central African CFA Franc', symbol: 'FCFA', isActive: false },
  { code: 'XCD', name: 'East Caribbean Dollar', symbol: '$', isActive: false },
  { code: 'XOF', name: 'West African CFA Franc', symbol: 'CFA', isActive: false },
  { code: 'XPF', name: 'CFP Franc', symbol: '₣', isActive: false },
  { code: 'YER', name: 'Yemeni Rial', symbol: '﷼', isActive: false },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', isActive: false },
  { code: 'ZMW', name: 'Zambian Kwacha', symbol: 'ZK', isActive: false },
  { code: 'ZWL', name: 'Zimbabwean Dollar', symbol: '$', isActive: false },
];

@Injectable()
export class CurrencyService implements OnModuleInit {
  private readonly logger = new Logger(CurrencyService.name);

  constructor(
    @InjectModel(Currency)
    private readonly model: typeof Currency,
  ) {}

  async onModuleInit() {
    try {
      await this.model.sync({ alter: true });
      this.logger.log('Syncing all world currencies into database...');
      
      for (const curr of ALL_WORLD_CURRENCIES) {
        const existing = await this.model.findOne({ where: { code: curr.code } });
        if (!existing) {
          await this.model.create({
            code: curr.code,
            name: curr.name,
            symbol: curr.symbol,
            isActive: curr.isActive,
            status: curr.isActive ? 'Active' : 'Inactive',
          } as any);
        }
      }
      this.logger.log('All world currencies seeded/verified.');
    } catch (err) {
      this.logger.error('Failed to sync/seed currencies table', err);
    }
  }

  async create(dto: CreateCurrencyDto, user?: any): Promise<Currency> {
    const codeUpper = dto.code.toUpperCase().trim();
    const existing = await this.model.findOne({ where: { code: codeUpper } });
    if (existing) {
      throw new BadRequestException(`Currency code "${codeUpper}" already exists.`);
    }

    const isActive = dto.isActive !== undefined ? dto.isActive : dto.status !== 'Inactive';
    const status = isActive ? 'Active' : 'Inactive';

    return await this.model.create({
      ...dto,
      code: codeUpper,
      name: dto.name.trim(),
      symbol: dto.symbol || codeUpper,
      isActive,
      status,
    } as any);
  }

  async findAll(query: QueryCurrencyDto) {
    const { search, status, page = 1, limit = 200 } = query;
    const offset = (page - 1) * limit;

    const whereClause: any = {};
    if (search) {
      whereClause[Op.or] = [
        { code: { [Op.iLike]: `%${search}%` } },
        { name: { [Op.iLike]: `%${search}%` } },
      ];
    }
    if (status) {
      if (status === 'Active' || status === 'Inactive') {
        whereClause.status = status;
      }
    }

    const { rows, count } = await this.model.findAndCountAll({
      where: whereClause,
      limit: Number(limit),
      offset: Number(offset),
      order: [
        ['status', 'ASC'],
        ['code', 'ASC'],
      ],
    });

    return {
      data: rows,
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / limit),
    };
  }

  async findOne(id: number): Promise<Currency> {
    const currency = await this.model.findByPk(id);
    if (!currency) {
      throw new NotFoundException(`Currency #${id} not found.`);
    }
    return currency;
  }

  async update(id: number, dto: UpdateCurrencyDto, user?: any): Promise<Currency> {
    const currency = await this.findOne(id);

    const updateData: any = { ...dto };
    if (dto.code) updateData.code = dto.code.toUpperCase().trim();
    if (dto.name) updateData.name = dto.name.trim();

    if (dto.isActive !== undefined) {
      updateData.isActive = dto.isActive;
      updateData.status = dto.isActive ? 'Active' : 'Inactive';
    } else if (dto.status !== undefined) {
      updateData.status = dto.status;
      updateData.isActive = dto.status === 'Active';
    }

    await currency.update(updateData);
    return currency.reload();
  }

  async toggleStatus(id: number): Promise<Currency> {
    const currency = await this.findOne(id);
    const newActive = !currency.isActive;
    await currency.update({
      isActive: newActive,
      status: newActive ? 'Active' : 'Inactive',
    });
    return currency.reload();
  }

  async remove(id: number): Promise<Currency> {
    const currency = await this.findOne(id);
    await currency.destroy();
    return currency;
  }
}
