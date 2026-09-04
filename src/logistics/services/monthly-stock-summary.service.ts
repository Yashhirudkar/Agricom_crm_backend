import {
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { MonthlyStockSummary } from '../models/monthly-stock-summary.model';
import { MonthlyStockSummaryCountry } from '../models/monthly-stock-summary-country.model';
import { MonthlyStockSection } from '../models/monthly-stock-section.model';
import { MonthlyStockSectionColumn } from '../models/monthly-stock-section-column.model';
import { MonthlyStockSectionRow } from '../models/monthly-stock-section-row.model';
import { MonthlyStockRowCell } from '../models/monthly-stock-row-cell.model';
import { User } from '../../users/models/user.model';
import { QueryMonthlyStockSummaryDto } from '../dto/query-monthly-stock-summary.dto';
import { CreateMonthlyStockSummaryDto, UpdateMonthlyStockSummaryDto } from '../dto/create-monthly-stock-summary.dto';
import {
  CreateSectionDto,
  UpdateSectionDto,
  CreateColumnDto,
  UpdateColumnDto,
  CreateRowDto,
  BulkSaveSectionDto,
  ReorderDto,
} from '../dto/create-monthly-stock-section.dto';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

@Injectable()
export class MonthlyStockSummaryService implements OnModuleInit {
  constructor(
    @InjectModel(MonthlyStockSummary)
    private readonly summaryModel: typeof MonthlyStockSummary,
    @InjectModel(MonthlyStockSummaryCountry)
    private readonly countryModel: typeof MonthlyStockSummaryCountry,
    @InjectModel(MonthlyStockSection)
    private readonly sectionModel: typeof MonthlyStockSection,
    @InjectModel(MonthlyStockSectionColumn)
    private readonly columnModel: typeof MonthlyStockSectionColumn,
    @InjectModel(MonthlyStockSectionRow)
    private readonly rowModel: typeof MonthlyStockSectionRow,
    @InjectModel(MonthlyStockRowCell)
    private readonly cellModel: typeof MonthlyStockRowCell,
  ) {}

  async onModuleInit() {
    try {
      await this.sectionModel.sequelize.query(`
        ALTER TABLE monthly_stock_sections ADD COLUMN IF NOT EXISTS layout_x INT DEFAULT 0;
        ALTER TABLE monthly_stock_sections ADD COLUMN IF NOT EXISTS layout_y INT DEFAULT 0;
        ALTER TABLE monthly_stock_sections ADD COLUMN IF NOT EXISTS layout_width INT DEFAULT 12;
        ALTER TABLE monthly_stock_sections ADD COLUMN IF NOT EXISTS layout_height INT DEFAULT 1;
      `);
    } catch (err) {
      console.error('Auto-migration error for monthly_stock_sections layout columns:', err);
    }
  }

  private computeReportTitle(countries: MonthlyStockSummaryCountry[]): string {
    if (!countries || countries.length === 0) return 'STOCK SUMMARY';
    if (countries.length >= 5) return 'GLOBAL STOCK SUMMARY';
    const countryNames = countries.map((c) => c.countryName.toUpperCase());
    return countryNames.join(' / ') + ' STOCK';
  }

  private mapResponse(record: MonthlyStockSummary) {
    const json = record.toJSON ? record.toJSON() : { ...record };
    const monthName = MONTH_NAMES[json.month - 1] || `Month ${json.month}`;
    const reportTitle = this.computeReportTitle(json.countries || []);

    return {
      ...json,
      monthName,
      reportTitle,
    };
  }

  async findAll(query: QueryMonthlyStockSummaryDto, companyId: number) {
    const {
      search,
      month,
      year,
      status,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;

    const where: any = {};
    if (companyId) {
      where.companyId = companyId;
    }

    if (month) {
      where.month = month;
    }

    if (year) {
      where.year = year;
    }

    if (status && status !== 'All') {
      where.status = status;
    }

    const include: any[] = [
      {
        model: MonthlyStockSummaryCountry,
        as: 'countries',
        attributes: ['id', 'iso2Code', 'countryName'],
      },
      {
        model: User,
        as: 'creator',
        attributes: ['id', 'name', 'email'],
      },
      {
        model: User,
        as: 'updater',
        attributes: ['id', 'name', 'email'],
      },
      {
        model: User,
        as: 'publisher',
        attributes: ['id', 'name', 'email'],
      },
    ];

    if (search && search.trim()) {
      const q = search.trim();
      where[Op.or] = [
        { '$creator.name$': { [Op.iLike]: `%${q}%` } },
        { '$countries.country_name$': { [Op.iLike]: `%${q}%` } },
      ];
    }

    const offset = (page - 1) * limit;

    const { rows, count } = await this.summaryModel.findAndCountAll({
      where,
      include,
      distinct: true,
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit,
      offset,
    });

    const data = rows.map((r) => this.mapResponse(r));

    return {
      data,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit) || 1,
    };
  }

  async findOne(id: number, companyId: number) {
    const record = await this.summaryModel.findOne({
      where: { id, ...(companyId && { companyId }) },
      include: [
        { model: MonthlyStockSummaryCountry, as: 'countries' },
        { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'updater', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'publisher', attributes: ['id', 'name', 'email'] },
        {
          model: MonthlyStockSection,
          as: 'sections',
          include: [
            {
              model: MonthlyStockSectionColumn,
              as: 'columns',
            },
            {
              model: MonthlyStockSectionRow,
              as: 'rows',
              include: [
                {
                  model: MonthlyStockRowCell,
                  as: 'cells',
                },
              ],
            },
          ],
        },
      ],
      order: [
        [{ model: MonthlyStockSection, as: 'sections' }, 'displayOrder', 'ASC'],
        [{ model: MonthlyStockSection, as: 'sections' }, { model: MonthlyStockSectionColumn, as: 'columns' }, 'displayOrder', 'ASC'],
        [{ model: MonthlyStockSection, as: 'sections' }, { model: MonthlyStockSectionRow, as: 'rows' }, 'rowOrder', 'ASC'],
      ],
    });

    if (!record) {
      throw new NotFoundException(`Monthly Stock Summary with ID #${id} not found.`);
    }

    return this.mapResponse(record);
  }

  async create(dto: CreateMonthlyStockSummaryDto & { sourceSummaryId?: number }, user: any, companyId: number) {
    const { month, year, countries, status = 'Draft', sourceSummaryId } = dto;

    if (!countries || countries.length === 0) {
      throw new BadRequestException('At least one country must be selected for the report scope.');
    }

    // Uniqueness check for (company_id, month, year)
    const existing = await this.summaryModel.findOne({
      where: {
        month,
        year,
        ...(companyId && { companyId }),
      },
    });

    if (existing) {
      const monthName = MONTH_NAMES[month - 1] || month;
      throw new BadRequestException(
        `A Monthly Stock Summary report for ${monthName} ${year} already exists.`
      );
    }

    const newRecord = await this.summaryModel.create({
      month,
      year,
      status,
      companyId: companyId || null,
      createdBy: user?.id || user?.userId || null,
    });

    // Create bridge table country entries
    const countryData = countries.map((c) => ({
      summaryId: newRecord.id,
      iso2Code: c.iso2Code,
      countryName: c.countryName,
    }));

    await this.countryModel.bulkCreate(countryData);

    // If duplicating from sourceSummaryId, copy all section & column structures
    if (sourceSummaryId) {
      const sourceSummary = await this.summaryModel.findOne({
        where: { id: sourceSummaryId },
        include: [
          {
            model: MonthlyStockSection,
            as: 'sections',
            include: [{ model: MonthlyStockSectionColumn, as: 'columns' }],
          },
        ],
        order: [
          [{ model: MonthlyStockSection, as: 'sections' }, 'displayOrder', 'ASC'],
          [{ model: MonthlyStockSection, as: 'sections' }, { model: MonthlyStockSectionColumn, as: 'columns' }, 'displayOrder', 'ASC'],
        ],
      });

      if (sourceSummary && sourceSummary.sections) {
        for (const sec of sourceSummary.sections) {
          const newSection = await this.sectionModel.create({
            monthlyStockSummaryId: newRecord.id,
            sectionName: sec.sectionName,
            displayOrder: sec.displayOrder,
          });

          if (sec.columns && sec.columns.length > 0) {
            const colData = sec.columns.map((c, idx) => ({
              sectionId: newSection.id,
              columnName: c.columnName,
              columnKey: `col_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
              displayOrder: c.displayOrder || idx + 1,
            }));
            await this.columnModel.bulkCreate(colData);
          }
        }
      }
    }

    return this.findOne(newRecord.id, companyId);
  }

  async update(id: number, dto: UpdateMonthlyStockSummaryDto, user: any, companyId: number) {
    const record = await this.summaryModel.findOne({
      where: { id, ...(companyId && { companyId }) },
    });

    if (!record) {
      throw new NotFoundException(`Monthly Stock Summary with ID #${id} not found.`);
    }

    if (record.status === 'Published') {
      throw new BadRequestException('Published stock summaries become read-only and cannot be edited.');
    }

    const targetMonth = dto.month ?? record.month;
    const targetYear = dto.year ?? record.year;

    // If month or year changed, verify uniqueness
    if (targetMonth !== record.month || targetYear !== record.year) {
      const duplicate = await this.summaryModel.findOne({
        where: {
          id: { [Op.ne]: id },
          month: targetMonth,
          year: targetYear,
          ...(companyId && { companyId }),
        },
      });

      if (duplicate) {
        const monthName = MONTH_NAMES[targetMonth - 1] || targetMonth;
        throw new BadRequestException(
          `A Monthly Stock Summary report for ${monthName} ${targetYear} already exists.`
        );
      }
    }

    await record.update({
      month: targetMonth,
      year: targetYear,
      status: dto.status ?? record.status,
      updatedBy: user?.id || user?.userId || null,
    });

    if (dto.countries) {
      if (dto.countries.length === 0) {
        throw new BadRequestException('At least one country must be selected for the report scope.');
      }

      await this.countryModel.destroy({ where: { summaryId: id } });

      const countryData = dto.countries.map((c) => ({
        summaryId: id,
        iso2Code: c.iso2Code,
        countryName: c.countryName,
      }));

      await this.countryModel.bulkCreate(countryData);
    }

    return this.findOne(id, companyId);
  }

  async publish(id: number, user: any, companyId: number) {
    const record = await this.summaryModel.findOne({
      where: { id, ...(companyId && { companyId }) },
    });

    if (!record) {
      throw new NotFoundException(`Monthly Stock Summary with ID #${id} not found.`);
    }

    if (record.status === 'Published') {
      throw new BadRequestException('Report is already published.');
    }

    await record.update({
      status: 'Published',
      publishedBy: user?.id || user?.userId || null,
      publishedAt: new Date(),
      updatedBy: user?.id || user?.userId || null,
    });

    return this.findOne(id, companyId);
  }

  async remove(id: number, companyId: number) {
    const record = await this.summaryModel.findOne({
      where: { id, ...(companyId && { companyId }) },
    });

    if (!record) {
      throw new NotFoundException(`Monthly Stock Summary with ID #${id} not found.`);
    }

    if (record.status === 'Published') {
      throw new BadRequestException('Published stock summaries cannot be deleted.');
    }

    await record.destroy();

    return { success: true, message: `Monthly Stock Summary #${id} deleted successfully.` };
  }

  // ─── SECTION MANAGEMENT ───────────────────────────────────────────────────

  private async assertEditableSummary(summaryId: number, companyId: number) {
    const summary = await this.summaryModel.findOne({
      where: { id: summaryId, ...(companyId && { companyId }) },
    });

    if (!summary) {
      throw new NotFoundException(`Monthly Stock Summary #${summaryId} not found.`);
    }

    if (summary.status === 'Published') {
      throw new BadRequestException('Published reports are read-only. Editing sections/rows/columns is disabled.');
    }

    return summary;
  }

  async addSection(summaryId: number, dto: CreateSectionDto, companyId: number) {
    await this.assertEditableSummary(summaryId, companyId);

    const maxOrder = (await this.sectionModel.max('displayOrder', {
      where: { monthlyStockSummaryId: summaryId },
    })) as number || 0;

    const section = await this.sectionModel.create({
      monthlyStockSummaryId: summaryId,
      sectionName: dto.sectionName,
      displayOrder: dto.displayOrder ?? maxOrder + 10,
    });

    const columnsToCreate = dto.presetColumns && dto.presetColumns.length > 0
      ? dto.presetColumns
      : ['SR'];

    const colData = columnsToCreate.map((colName, idx) => ({
      sectionId: section.id,
      columnName: colName,
      columnKey: `col_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      displayOrder: idx + 1,
    }));

    await this.columnModel.bulkCreate(colData);

    return this.findOne(summaryId, companyId);
  }

  async updateSection(summaryId: number, sectionId: number, dto: UpdateSectionDto, companyId: number) {
    await this.assertEditableSummary(summaryId, companyId);

    const section = await this.sectionModel.findOne({
      where: { id: sectionId, monthlyStockSummaryId: summaryId },
    });

    if (!section) {
      throw new NotFoundException(`Section #${sectionId} not found.`);
    }

    await section.update({
      ...(dto.sectionName && { sectionName: dto.sectionName }),
      ...(dto.displayOrder !== undefined && { displayOrder: dto.displayOrder }),
      ...(dto.layoutWidth !== undefined && { layoutWidth: dto.layoutWidth }),
      ...(dto.layoutX !== undefined && { layoutX: dto.layoutX }),
      ...(dto.layoutY !== undefined && { layoutY: dto.layoutY }),
      ...(dto.layoutHeight !== undefined && { layoutHeight: dto.layoutHeight }),
    });

    return this.findOne(summaryId, companyId);
  }

  async deleteSection(summaryId: number, sectionId: number, companyId: number) {
    await this.assertEditableSummary(summaryId, companyId);

    const section = await this.sectionModel.findOne({
      where: { id: sectionId, monthlyStockSummaryId: summaryId },
    });

    if (!section) {
      throw new NotFoundException(`Section #${sectionId} not found.`);
    }

    await section.destroy(); // Soft delete

    return this.findOne(summaryId, companyId);
  }

  async duplicateSection(summaryId: number, sectionId: number, companyId: number) {
    await this.assertEditableSummary(summaryId, companyId);

    const sourceSec = await this.sectionModel.findOne({
      where: { id: sectionId, monthlyStockSummaryId: summaryId },
      include: [
        { model: MonthlyStockSectionColumn, as: 'columns' },
        {
          model: MonthlyStockSectionRow,
          as: 'rows',
          include: [{ model: MonthlyStockRowCell, as: 'cells' }],
        },
      ],
      order: [
        [{ model: MonthlyStockSectionColumn, as: 'columns' }, 'displayOrder', 'ASC'],
        [{ model: MonthlyStockSectionRow, as: 'rows' }, 'rowOrder', 'ASC'],
      ],
    });

    if (!sourceSec) {
      throw new NotFoundException(`Section #${sectionId} not found.`);
    }

    const maxOrder =
      ((await this.sectionModel.max('displayOrder', {
        where: { monthlyStockSummaryId: summaryId },
      })) as number) || 0;

    const newSection = await this.sectionModel.create({
      monthlyStockSummaryId: summaryId,
      sectionName: `${sourceSec.sectionName} (COPY)`,
      displayOrder: maxOrder + 10,
      layoutWidth: sourceSec.layoutWidth || 520,
      layoutHeight: sourceSec.layoutHeight || 340,
      layoutX: (sourceSec.layoutX || 20) + 40,
      layoutY: (sourceSec.layoutY || 20) + 40,
    });

    const columnIdMap = new Map<number, number>();

    if (sourceSec.columns && sourceSec.columns.length > 0) {
      for (const c of sourceSec.columns) {
        const newCol = await this.columnModel.create({
          sectionId: newSection.id,
          columnName: c.columnName,
          columnKey: `col_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          displayOrder: c.displayOrder,
        });
        columnIdMap.set(c.id, newCol.id);
      }
    }

    if (sourceSec.rows && sourceSec.rows.length > 0) {
      for (const r of sourceSec.rows) {
        const newRow = await this.rowModel.create({
          sectionId: newSection.id,
          rowOrder: r.rowOrder,
          isTotalRow: r.isTotalRow,
        });

        if (r.cells && r.cells.length > 0) {
          for (const cell of r.cells) {
            const newColId = columnIdMap.get(cell.columnId);
            if (newColId) {
              await this.cellModel.create({
                rowId: newRow.id,
                columnId: newColId,
                value: cell.value || '',
              });
            }
          }
        }
      }
    }

    return this.findOne(summaryId, companyId);
  }

  async reorderSections(summaryId: number, dto: ReorderDto, companyId: number) {
    await this.assertEditableSummary(summaryId, companyId);

    for (const item of dto.items) {
      await this.sectionModel.update(
        { displayOrder: item.order },
        { where: { id: item.id, monthlyStockSummaryId: summaryId } },
      );
    }

    return this.findOne(summaryId, companyId);
  }

  // ─── COLUMN MANAGEMENT ───────────────────────────────────────────────────

  async addColumn(summaryId: number, sectionId: number, dto: CreateColumnDto, companyId: number) {
    await this.assertEditableSummary(summaryId, companyId);

    const existing = await this.columnModel.findOne({
      where: {
        sectionId,
        columnName: { [Op.iLike]: dto.columnName.trim() },
      },
    });

    if (existing) {
      throw new BadRequestException(`Column "${dto.columnName}" already exists in this section.`);
    }

    const maxOrder = (await this.columnModel.max('displayOrder', {
      where: { sectionId },
    })) as number || 0;

    const columnKey = `col_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    await this.columnModel.create({
      sectionId,
      columnName: dto.columnName.trim(),
      columnKey,
      displayOrder: dto.displayOrder ?? maxOrder + 1,
    });

    return this.findOne(summaryId, companyId);
  }

  async updateColumn(summaryId: number, sectionId: number, columnId: number, dto: UpdateColumnDto, companyId: number) {
    await this.assertEditableSummary(summaryId, companyId);

    const column = await this.columnModel.findOne({
      where: { id: columnId, sectionId },
    });

    if (!column) {
      throw new NotFoundException(`Column #${columnId} not found.`);
    }

    if (dto.columnName && dto.columnName.trim().toLowerCase() !== column.columnName.toLowerCase()) {
      const existing = await this.columnModel.findOne({
        where: {
          sectionId,
          id: { [Op.ne]: columnId },
          columnName: { [Op.iLike]: dto.columnName.trim() },
        },
      });

      if (existing) {
        throw new BadRequestException(`Column "${dto.columnName}" already exists in this section.`);
      }
    }

    await column.update({
      columnName: dto.columnName.trim(),
    });

    return this.findOne(summaryId, companyId);
  }

  async deleteColumn(summaryId: number, sectionId: number, columnId: number, companyId: number) {
    await this.assertEditableSummary(summaryId, companyId);

    const column = await this.columnModel.findOne({
      where: { id: columnId, sectionId },
    });

    if (!column) {
      throw new NotFoundException(`Column #${columnId} not found.`);
    }

    await column.destroy();

    return this.findOne(summaryId, companyId);
  }

  async duplicateColumn(summaryId: number, sectionId: number, columnId: number, companyId: number) {
    await this.assertEditableSummary(summaryId, companyId);

    const sourceCol = await this.columnModel.findOne({
      where: { id: columnId, sectionId },
    });

    if (!sourceCol) {
      throw new NotFoundException(`Column #${columnId} not found.`);
    }

    const maxOrder = (await this.columnModel.max('displayOrder', {
      where: { sectionId },
    })) as number || 0;

    await this.columnModel.create({
      sectionId,
      columnName: `${sourceCol.columnName} (Copy)`,
      columnKey: `col_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      displayOrder: maxOrder + 1,
    });

    return this.findOne(summaryId, companyId);
  }

  async reorderColumns(summaryId: number, sectionId: number, dto: ReorderDto, companyId: number) {
    await this.assertEditableSummary(summaryId, companyId);

    for (const item of dto.items) {
      await this.columnModel.update(
        { displayOrder: item.order },
        { where: { id: item.id, sectionId } },
      );
    }

    return this.findOne(summaryId, companyId);
  }

  // ─── ROW MANAGEMENT ──────────────────────────────────────────────────────

  async addRow(summaryId: number, sectionId: number, dto: CreateRowDto, companyId: number) {
    await this.assertEditableSummary(summaryId, companyId);

    const section = await this.sectionModel.findOne({
      where: { id: sectionId, monthlyStockSummaryId: summaryId },
    });

    if (!section) {
      throw new NotFoundException(`Section #${sectionId} not found.`);
    }

    const maxOrder = (await this.rowModel.max('rowOrder', {
      where: { sectionId },
    })) as number || 0;

    await this.rowModel.create({
      sectionId,
      rowOrder: dto.rowOrder ?? maxOrder + 1,
      isTotalRow: dto.isTotalRow ?? false,
    });

    return this.findOne(summaryId, companyId);
  }

  async deleteRow(summaryId: number, sectionId: number, rowId: number, companyId: number) {
    await this.assertEditableSummary(summaryId, companyId);

    const row = await this.rowModel.findOne({
      where: { id: rowId, sectionId },
    });

    if (!row) {
      throw new NotFoundException(`Row #${rowId} not found.`);
    }

    await row.destroy();

    return this.findOne(summaryId, companyId);
  }

  async reorderRows(summaryId: number, sectionId: number, dto: ReorderDto, companyId: number) {
    await this.assertEditableSummary(summaryId, companyId);

    for (const item of dto.items) {
      await this.rowModel.update(
        { rowOrder: item.order },
        { where: { id: item.id, sectionId } },
      );
    }

    return this.findOne(summaryId, companyId);
  }

  // ─── BULK SAVE TRANSACTION ──────────────────────────────────────────────

  async bulkSaveSection(summaryId: number, sectionId: number, dto: BulkSaveSectionDto, companyId: number) {
    await this.assertEditableSummary(summaryId, companyId);

    const section = await this.sectionModel.findOne({
      where: { id: sectionId, monthlyStockSummaryId: summaryId },
    });

    if (!section) {
      throw new NotFoundException(`Section #${sectionId} not found.`);
    }

    const transaction = await this.sectionModel.sequelize.transaction();

    try {
      await section.update(
        {
          ...(dto.sectionName && { sectionName: dto.sectionName }),
          ...(dto.layoutWidth !== undefined && { layoutWidth: dto.layoutWidth }),
          ...(dto.layoutX !== undefined && { layoutX: dto.layoutX }),
          ...(dto.layoutY !== undefined && { layoutY: dto.layoutY }),
          ...(dto.layoutHeight !== undefined && { layoutHeight: dto.layoutHeight }),
        },
        { transaction }
      );

      // Sync Columns if provided
      const columnKeyMap = new Map<string, number>();

      if (dto.columns) {
        const columnIdsInDto = dto.columns.map((c) => c.id).filter(Boolean);
        if (columnIdsInDto.length > 0) {
          // Destroy columns removed from section
          await this.columnModel.destroy({
            where: {
              sectionId,
              id: { [Op.notIn]: columnIdsInDto },
            },
            transaction,
          });
        }

        for (const col of dto.columns) {
          if (col.id) {
            await this.columnModel.update(
              { columnName: col.columnName, displayOrder: col.displayOrder },
              { where: { id: col.id, sectionId }, transaction },
            );
            if (col.columnKey) {
              columnKeyMap.set(col.columnKey, col.id);
            }
          } else {
            const columnKey = col.columnKey || `col_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            const createdCol = await this.columnModel.create(
              {
                sectionId,
                columnName: col.columnName,
                columnKey,
                displayOrder: col.displayOrder || 1,
              },
              { transaction },
            );
            columnKeyMap.set(columnKey, createdCol.id);
          }
        }
      }

      // Sync Rows and Cells if provided
      if (dto.rows) {
        const rowIdsInDto = dto.rows.map((r) => r.id).filter(Boolean);
        if (rowIdsInDto.length > 0) {
          // Destroy rows removed from section
          await this.rowModel.destroy({
            where: {
              sectionId,
              id: { [Op.notIn]: rowIdsInDto },
            },
            transaction,
          });
        }

        for (const r of dto.rows) {
          let rowRecord: MonthlyStockSectionRow;

          if (r.id) {
            rowRecord = await this.rowModel.findOne({
              where: { id: r.id, sectionId },
              transaction,
            });
            if (rowRecord) {
              await rowRecord.update(
                {
                  rowOrder: r.rowOrder ?? rowRecord.rowOrder,
                  isTotalRow: r.isTotalRow ?? rowRecord.isTotalRow,
                },
                { transaction },
              );
            }
          }

          if (!rowRecord) {
            rowRecord = await this.rowModel.create(
              {
                sectionId,
                rowOrder: r.rowOrder || 1,
                isTotalRow: r.isTotalRow || false,
              },
              { transaction },
            );
          }

          if (r.cells && r.cells.length > 0) {
            for (const cell of r.cells) {
              const targetColumnId = cell.columnId || (cell.columnKey ? columnKeyMap.get(cell.columnKey) : null);
              if (!targetColumnId) continue;

              const [cellInstance] = await this.cellModel.findOrBuild({
                where: { rowId: rowRecord.id, columnId: targetColumnId },
                transaction,
              });

              cellInstance.value = cell.value || '';
              await cellInstance.save({ transaction });
            }
          }
        }
      }

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    return this.findOne(summaryId, companyId);
  }

  async saveReportData(summaryId: number, dto: { sections: any[] }, companyId: number) {
    await this.assertEditableSummary(summaryId, companyId);

    if (!dto.sections || dto.sections.length === 0) {
      return this.findOne(summaryId, companyId);
    }

    for (const secData of dto.sections) {
      if (secData.sectionId) {
        await this.bulkSaveSection(summaryId, secData.sectionId, secData, companyId);
      }
    }

    return this.findOne(summaryId, companyId);
  }
}
