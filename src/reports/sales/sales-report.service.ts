import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, literal } from 'sequelize';
import { SalesContract } from '../../sales-contracts/models/sales-contract.model';
import { SalesContractItem } from '../../sales-contracts/models/sales-contract-item.model';
import { User } from '../../users/models/user.model';
import { Partner } from '../../masters/partner/partner.model';
import { Product } from '../../masters/product/product.model';
import { Enquiry } from '../../enquiries/models/enquiry.model';

export interface ConfirmedOrdersQuery {
  companyId?: string;
  salesExecutiveId?: string;
  productId?: string;
  customerId?: string;
  countryId?: string;
  dateRange?: string;
  year?: string;
  month?: string;
  limit?: string;
}

@Injectable()
export class SalesReportService {
  constructor(
    @InjectModel(SalesContract)
    private readonly salesContractModel: typeof SalesContract,
    @InjectModel(SalesContractItem)
    private readonly salesContractItemModel: typeof SalesContractItem,
    @InjectModel(User)
    private readonly userModel: typeof User,
    @InjectModel(Partner)
    private readonly partnerModel: typeof Partner,
    @InjectModel(Product)
    private readonly productModel: typeof Product,
    @InjectModel(Enquiry)
    private readonly enquiryModel: typeof Enquiry,
  ) {}

  private buildWhereClause(query: any): any {
    const where: any = {
      status: {
        [Op.notIn]: ['Draft', 'Cancelled'],
      },
    };

    if (query.companyId) {
      where.companyId = query.companyId;
    }

    if (query.year) {
      // Assuming contractDate is used for year/month filtering
      if (query.month) {
        // Both year and month
        const startOfMonth = new Date(
          parseInt(query.year),
          parseInt(query.month) - 1,
          1,
        );
        const endOfMonth = new Date(
          parseInt(query.year),
          parseInt(query.month),
          0,
          23,
          59,
          59,
          999,
        );
        where.contractDate = {
          [Op.between]: [startOfMonth, endOfMonth],
        };
      } else {
        // Just year
        const startOfYear = new Date(parseInt(query.year), 0, 1);
        const endOfYear = new Date(
          parseInt(query.year),
          11,
          31,
          23,
          59,
          59,
          999,
        );
        where.contractDate = {
          [Op.between]: [startOfYear, endOfYear],
        };
      }
    }

    if (query.dateRange) {
      const [start, end] = query.dateRange.split(',');
      if (start && end) {
        where.contractDate = {
          [Op.between]: [new Date(start), new Date(end)],
        };
      }
    }

    if (query.salesExecutiveId) {
      where[Op.or] = [
        { '$enquiry.created_by$': query.salesExecutiveId },
        {
          [Op.and]: [
            { enquiryId: null },
            { createdBy: query.salesExecutiveId },
          ],
        },
      ];
    }

    if (query.customerId) {
      where.buyerId = query.customerId;
    }

    if (query.countryId) {
      where.destinationCountry = query.countryId; // Assuming countryId is actually country name in destinationCountry
    }

    if (query.contractType) {
      where.contractType = query.contractType;
    }

    return where;
  }

  /**
   * Returns a Sequelize literal that resolves the creator name:
   * First tries the enquiry's created_by (original enquiry creator),
   * falls back to the sales contract's own created_by.
   * Uses CAST to handle UUID type mismatch between enquiry_id (text) and enquiries.id (uuid).
   */
  private getCreatorNameLiteral(): any {
    return literal(`(
      SELECT u.name FROM users u
      WHERE u.id = COALESCE(
        (SELECT e.created_by FROM enquiries e WHERE e.id::text = "SalesContract".enquiry_id::text LIMIT 1),
        "SalesContract".created_by
      )
      LIMIT 1
    )`);
  }

  private getIncludes(query: any): any[] {
    const includes: any[] = [];
    if (query.productId) {
      includes.push({
        model: SalesContractItem,
        required: true,
        where: { productId: query.productId },
      });
    } else {
      includes.push({
        model: SalesContractItem,
        required: false,
      });
    }
    includes.push({
      model: Partner,
      as: 'buyer',
      required: false,
    });
    return includes;
  }

  async getSummary(query: any) {
    const where = this.buildWhereClause(query);
    const includes = this.getIncludes(query);

    // If productId is provided, we need to calculate sum from items, otherwise from contract
    const contracts = await this.salesContractModel.findAll({
      where,
      include: includes,
      attributes: {
        include: [[this.getCreatorNameLiteral(), 'creatorName']],
      },
    });

    const totalOrders = contracts.length;
    let totalQuantity = 0;
    let totalValue = 0;
    let largestOrder = 0;
    const executives = new Set();

    contracts.forEach((c) => {
      const creatorName = (c as any).dataValues?.creatorName || 'Unknown';
      executives.add(creatorName);
      let qty = 0;
      let val = 0;
      if (query.productId) {
        qty = c.items.reduce(
          (acc, item) => acc + Number(item.quantity || 0),
          0,
        );
        val = c.items.reduce((acc, item) => acc + Number(item.amount || 0), 0);
      } else {
        qty = Number(c.totalQuantity || 0);
        val = Number(c.totalAmount || 0);
      }
      totalQuantity += qty;
      totalValue += val;
      if (qty > largestOrder) {
        largestOrder = qty;
      }
    });

    const averageOrderSize = totalOrders > 0 ? totalQuantity / totalOrders : 0;

    return {
      confirmedOrders: totalOrders,
      totalQuantity,
      totalValue,
      averageOrderSize,
      activeExecutives: executives.size,
      largestOrder,
    };
  }

  async getExecutives(query: any) {
    const where = this.buildWhereClause(query);
    const includes = this.getIncludes(query);

    const contracts = await this.salesContractModel.findAll({
      where,
      include: includes,
      attributes: {
        include: [[this.getCreatorNameLiteral(), 'creatorName']],
      },
    });

    // Group by creator name (resolved via raw SQL subquery)
    const execMap = new Map();
    contracts.forEach((c) => {
      const execName = (c as any).dataValues?.creatorName || null;
      if (!execName) return;
      const execId = execName; // use name as key since we group by name

      if (!execMap.has(execId)) {
        execMap.set(execId, {
          id: execId,
          name: execName,
          confirmedOrders: 0,
          totalQuantity: 0,
          totalValue: 0,
          largestOrder: 0,
          smallestOrder: Number.MAX_SAFE_INTEGER,
          largestBid: 0,
        });
      }

      const exec = execMap.get(execId);
      exec.confirmedOrders++;

      let qty = 0;
      let val = 0;
      if (query.productId) {
        qty = c.items.reduce(
          (acc, item) => acc + Number(item.quantity || 0),
          0,
        );
        val = c.items.reduce((acc, item) => acc + Number(item.amount || 0), 0);
      } else {
        qty = Number(c.totalQuantity || 0);
        val = Number(c.totalAmount || 0);
      }

      exec.totalQuantity += qty;
      exec.totalValue += val;
      if (qty > exec.largestOrder) exec.largestOrder = qty;
      if (qty < exec.smallestOrder) exec.smallestOrder = qty;
      if (val > exec.largestBid) exec.largestBid = val;
    });

    // Names are already resolved from the includes above; no second query needed.
    const result = Array.from(execMap.values()).map((e) => {
      e.averageOrderSize =
        e.confirmedOrders > 0 ? e.totalQuantity / e.confirmedOrders : 0;
      e.averageBid =
        e.confirmedOrders > 0 ? e.totalValue / e.confirmedOrders : 0;
      if (e.smallestOrder === Number.MAX_SAFE_INTEGER) e.smallestOrder = 0;
      // Mock growth% for now
      e.growth = Math.floor(Math.random() * 30);
      return e;
    });

    // Sort by totalValue DESC
    result.sort((a, b) => b.totalValue - a.totalValue);

    return result.map((e, index) => ({ ...e, rank: index + 1 }));
  }

  async getMonthly(query: any) {
    const where = this.buildWhereClause(query);
    const includes = this.getIncludes(query);

    const contracts = await this.salesContractModel.findAll({
      where,
      include: includes,
    });

    const monthMap = new Map();
    // Initialize all months
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    months.forEach((m) =>
      monthMap.set(m, {
        month: m,
        totalQuantity: 0,
        totalValue: 0,
        ordersCount: 0,
      }),
    );

    contracts.forEach((c) => {
      let monthStr = null;
      if (c.contractDate) {
        const d = new Date(c.contractDate);
        monthStr = months[d.getMonth()];
      }
      if (monthStr && monthMap.has(monthStr)) {
        const entry = monthMap.get(monthStr);
        entry.ordersCount++;

        let qty = 0;
        let val = 0;
        if (query.productId) {
          qty = c.items.reduce(
            (acc, item) => acc + Number(item.quantity || 0),
            0,
          );
          val = c.items.reduce(
            (acc, item) => acc + Number(item.amount || 0),
            0,
          );
        } else {
          qty = Number(c.totalQuantity || 0);
          val = Number(c.totalAmount || 0);
        }

        entry.totalQuantity += qty;
        entry.totalValue += val;
      }
    });

    return Array.from(monthMap.values());
  }

  async getProducts(query: any) {
    const where = this.buildWhereClause(query);
    // For products, we always need items included regardless of filter, to see breakdown
    const includes: any[] = [
      {
        model: SalesContractItem,
        required: true,
        include: [{ model: Product, attributes: ['id', 'name'] }],
      },
    ];

    // If productId is specifically filtered, we only count for that product
    if (query.productId) {
      includes[0].where = { productId: query.productId };
    }

    const contracts = await this.salesContractModel.findAll({
      where,
      include: includes,
    });

    const productMap = new Map();

    contracts.forEach((c) => {
      c.items.forEach((item) => {
        const pId = item.productId;
        const pName = (item as any).product?.name || 'Unknown';
        if (!productMap.has(pId)) {
          productMap.set(pId, {
            id: pId,
            name: pName,
            totalQuantity: 0,
            totalValue: 0,
            ordersCount: 0,
          });
        }
        const p = productMap.get(pId);
        p.totalQuantity += Number(item.quantity || 0);
        p.totalValue += Number(item.amount || 0);
        p.ordersCount++;
      });
    });

    const result = Array.from(productMap.values());
    result.sort((a, b) => b.totalQuantity - a.totalQuantity);
    return result;
  }

  async getCountries(query: any) {
    const where = this.buildWhereClause(query);
    const includes = this.getIncludes(query);

    const contracts = await this.salesContractModel.findAll({
      where,
      include: includes,
    });

    const countryMap = new Map();

    contracts.forEach((c) => {
      const country = c.destinationCountry || 'Unknown';
      if (!countryMap.has(country)) {
        countryMap.set(country, {
          country,
          name: country,
          id: country,
          totalQuantity: 0,
          totalValue: 0,
          ordersCount: 0,
        });
      }
      const p = countryMap.get(country);

      let qty = 0;
      let val = 0;
      if (query.productId) {
        qty = c.items.reduce(
          (acc, item) => acc + Number(item.quantity || 0),
          0,
        );
        val = c.items.reduce((acc, item) => acc + Number(item.amount || 0), 0);
      } else {
        qty = Number(c.totalQuantity || 0);
        val = Number(c.totalAmount || 0);
      }

      p.totalQuantity += qty;
      p.totalValue += val;
      p.ordersCount++;
    });

    const result = Array.from(countryMap.values());
    result.sort((a, b) => b.totalQuantity - a.totalQuantity);
    return result;
  }

  async getCustomers(query: any) {
    const where = this.buildWhereClause(query);
    const includes = this.getIncludes(query);

    const contracts = await this.salesContractModel.findAll({
      where,
      include: includes,
    });

    const customerMap = new Map();

    contracts.forEach((c) => {
      const cId = c.buyerId;
      const cName = (c as any).buyer?.entityName || 'Unknown';
      if (!cId) return;

      if (!customerMap.has(cId)) {
        customerMap.set(cId, {
          id: cId,
          name: cName,
          totalQuantity: 0,
          totalValue: 0,
          ordersCount: 0,
          lastOrderDate: c.contractDate,
        });
      }
      const p = customerMap.get(cId);

      let qty = 0;
      let val = 0;
      if (query.productId) {
        qty = c.items.reduce(
          (acc, item) => acc + Number(item.quantity || 0),
          0,
        );
        val = c.items.reduce((acc, item) => acc + Number(item.amount || 0), 0);
      } else {
        qty = Number(c.totalQuantity || 0);
        val = Number(c.totalAmount || 0);
      }

      p.totalQuantity += qty;
      p.totalValue += val;
      p.ordersCount++;
      if (new Date(c.contractDate) > new Date(p.lastOrderDate)) {
        p.lastOrderDate = c.contractDate;
      }
    });

    const result = Array.from(customerMap.values());
    result.sort((a, b) => b.totalValue - a.totalValue);
    return result.slice(0, 10); // Top 10
  }

  async getOrders(query: any) {
    const where = this.buildWhereClause(query);
    const includes: any[] = [
      {
        model: Partner,
        as: 'buyer',
        required: false,
        attributes: ['id', 'entityName'],
      },
      {
        model: SalesContractItem,
        required: query.productId ? true : false,
        where: query.productId ? { productId: query.productId } : undefined,
        include: [{ model: Product, attributes: ['id', 'name'] }],
      },
    ];

    const limit = query.limit ? parseInt(query.limit) : 50;
    const offset = query.offset ? parseInt(query.offset) : 0;

    const { rows, count } = await this.salesContractModel.findAndCountAll({
      where,
      include: includes,
      attributes: {
        include: [[this.getCreatorNameLiteral(), 'creatorName']],
      },
      order: [['contractDate', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    const data = rows.map((r) => {
      const j = r.toJSON();
      let qty = 0;
      let val = 0;
      let products = '';
      if (query.productId) {
        qty = j.items.reduce(
          (acc, item) => acc + Number(item.quantity || 0),
          0,
        );
        val = j.items.reduce((acc, item) => acc + Number(item.amount || 0), 0);
      } else {
        qty = Number(j.totalQuantity || 0);
        val = Number(j.totalAmount || 0);
      }

      if (j.items && j.items.length > 0) {
        products = [
          ...new Set(j.items.map((i) => i.product?.name).filter(Boolean)),
        ].join(', ');
      }

      // Creator name resolved via raw SQL subquery (handles UUID type mismatch)
      const salesExecutive =
        (r as any).dataValues?.creatorName || (j as any).creatorName || 'Unknown';

      return {
        id: j.id,
        orderNumber: j.contractNumber,
        contractNumber: j.contractNumber,
        date: j.contractDate,
        customer: j.buyer?.entityName || 'Unknown',
        salesExecutive,
        product: products,
        destination: j.destinationCountry,
        quantity: qty,
        currency: j.currencyCode,
        salesValue: val,
        status: j.status,
      };
    });

    return { data, total: count };
  }

  async getConfirmedOrders(query: ConfirmedOrdersQuery) {
    const where: any = { status: 'CONFIRMED' };

    if (query.companyId) where.companyId = query.companyId;
    if (query.salesExecutiveId) where.createdBy = query.salesExecutiveId;
    if (query.productId) where.productId = query.productId;
    if (query.customerId) where.partnerId = query.customerId;
    if (query.countryId) where.destinationCountry = query.countryId;

    if (query.dateRange) {
      const [start, end] = query.dateRange.split(',');
      if (start && end) {
        where.enquiryDate = { [Op.between]: [start, end] };
      }
    } else {
      const month = query.month ? Number(query.month) : undefined;
      const year = query.year ? Number(query.year) : undefined;

      if (
        month !== undefined &&
        (!Number.isInteger(month) || month < 1 || month > 12)
      ) {
        throw new BadRequestException('Month must be between 1 and 12.');
      }
      if (year !== undefined && !Number.isInteger(year)) {
        throw new BadRequestException('Year must be a valid number.');
      }

      if (year !== undefined && month !== undefined) {
        const start = `${year}-${String(month).padStart(2, '0')}-01`;
        const end = new Date(Date.UTC(year, month, 0))
          .toISOString()
          .slice(0, 10);
        where.enquiryDate = { [Op.between]: [start, end] };
      } else if (year !== undefined) {
        where.enquiryDate = {
          [Op.between]: [`${year}-01-01`, `${year}-12-31`],
        };
      } else if (month !== undefined) {
        where[Op.and] = [
          literal(
            `EXTRACT(MONTH FROM "Enquiry"."enquiry_date") = ${month}`,
          ),
        ];
      }
    }

    const enquiries = await this.enquiryModel.findAll({
      where,
      paranoid: false,
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name'],
          required: false,
        },
        {
          model: Partner,
          as: 'partner',
          attributes: ['id', 'entityName'],
          required: false,
        },
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name'],
          required: false,
        },
      ],
      order: [
        ['enquiryDate', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      limit: query.limit ? parseInt(query.limit, 10) : 5000,
    });

    const data = enquiries.map((enquiry) => {
      const quantity = Number(enquiry.quantity || 0);
      const unitPrice = Number(enquiry.buyingInterest || 0);

      return {
        id: enquiry.id,
        orderNumber: enquiry.enquiryNo,
        date: enquiry.enquiryDate,
        customer: enquiry.partner?.entityName || 'Unknown',
        customerId: enquiry.partnerId,
        salesExecutive: enquiry.creator?.name || 'Unknown',
        salesExecutiveId: enquiry.createdBy,
        product: enquiry.product?.name || 'Unknown',
        productId: enquiry.productId,
        destination: enquiry.destinationCountry || '',
        quantity,
        currency: enquiry.bidCurrency || '',
        salesValue: quantity * unitPrice,
        status: enquiry.status,
      };
    });

    return { data, total: data.length };
  }
}
