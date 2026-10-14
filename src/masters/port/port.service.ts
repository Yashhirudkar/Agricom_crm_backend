import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import * as ExcelJS from 'exceljs';
import { Port, PortType, PortShippingLine } from './port.model';
import { Country } from '../country/country.model';
import { ShippingLine } from '../shipping-line/shipping-line.model';
import { CreatePortDto } from './dto/create-port.dto';
import { UpdatePortDto } from './dto/update-port.dto';
import { QueryPortDto } from './dto/query-port.dto';
import { AddShippingLineToPortDto } from './dto/port-shipping-line.dto';

@Injectable()
export class PortService {
  private readonly logger = new Logger(PortService.name);

  constructor(
    @InjectModel(Port)
    private readonly portModel: typeof Port,
    @InjectModel(Country)
    private readonly countryModel: typeof Country,
    @InjectModel(ShippingLine)
    private readonly shippingLineModel: typeof ShippingLine,
    @InjectModel(PortShippingLine)
    private readonly portShippingLineModel: typeof PortShippingLine,
  ) {}

  async findAll(query: QueryPortDto) {
    const where: any = {};

    // 1. Status Filter
    const activeParam = query.isActive !== undefined ? query.isActive : query.is_active;
    if (activeParam !== undefined && activeParam !== 'all' && activeParam !== '') {
      where.isActive = String(activeParam) === 'true';
    }

    // 2. Country Filter
    const countryParam = query.countryId || query.country_id;
    if (countryParam && countryParam !== 'all') {
      where.countryId = parseInt(countryParam);
    }

    // 3. Port Type Filter
    const portTypeParam = query.portType || query.port_type;
    if (portTypeParam && portTypeParam !== 'all') {
      where.portType = portTypeParam.toUpperCase();
    }

    // 4. Shipping Line Filter
    const lineParam = query.shippingLineId || query.shipping_line_id;
    if (lineParam && lineParam !== 'all') {
      const lineId = parseInt(lineParam);
      const portMappings = await this.portShippingLineModel.findAll({
        where: { shippingLineId: lineId },
        attributes: ['portId'],
      });
      const portIds = portMappings.map((m) => m.portId);
      where.id = { [Op.in]: portIds };
    }

    // 5. Search Filter (searches port name, unlocode, port code, country name, shipping line name)
    const search = query.search?.trim();
    if (search) {
      const q = `%${search.toLowerCase()}%`;

      // Pre-resolve countries matching search
      const matchingCountries = await this.countryModel.findAll({
        where: { name: { [Op.iLike]: q } },
        attributes: ['id'],
      });
      const matchingCountryIds = matchingCountries.map((c) => c.id);

      // Pre-resolve shipping lines matching search
      const matchingLines = await this.shippingLineModel.findAll({
        where: { lineName: { [Op.iLike]: q } },
        attributes: ['id'],
      });
      const matchingLineIds = matchingLines.map((l) => l.id);

      let portIdsFromLines: number[] = [];
      if (matchingLineIds.length > 0) {
        const mappings = await this.portShippingLineModel.findAll({
          where: { shippingLineId: { [Op.in]: matchingLineIds } },
          attributes: ['portId'],
        });
        portIdsFromLines = mappings.map((m) => m.portId);
      }

      const orConditions: any[] = [
        { portName: { [Op.iLike]: q } },
        { unlocode: { [Op.iLike]: q } },
        { portCode: { [Op.iLike]: q } },
      ];

      if (matchingCountryIds.length > 0) {
        orConditions.push({ countryId: { [Op.in]: matchingCountryIds } });
      }

      if (portIdsFromLines.length > 0) {
        orConditions.push({ id: { [Op.in]: portIdsFromLines } });
      }

      where[Op.or] = orConditions;
    }

    const page = query.page ? Math.max(1, parseInt(query.page)) : 1;
    const limit = query.limit ? Math.max(1, parseInt(query.limit)) : 50;
    const offset = (page - 1) * limit;

    const { count, rows } = await this.portModel.findAndCountAll({
      where,
      order: [['portName', 'ASC']],
      limit,
      offset,
      distinct: true,
      include: [
        {
          model: Country,
          as: 'country',
          attributes: ['id', 'name', 'iso2Code', 'iso3Code'],
        },
        {
          model: ShippingLine,
          as: 'shippingLines',
          through: { attributes: ['id', 'isActive', 'remarks'] },
        },
      ],
    });

    const items = rows.map((p: any) => {
      const json = p.toJSON();
      const lines = json.shippingLines || [];
      return {
        ...json,
        country_id: json.countryId,
        port_name: json.portName,
        port_code: json.portCode,
        port_type: json.portType,
        is_active: json.isActive,
        shipping_lines_count: lines.length,
        shippingLines: lines,
        shipping_lines: lines,
      };
    });

    // Global Stats for Port Master header
    const totalPorts = await this.portModel.count();
    const activePorts = await this.portModel.count({ where: { isActive: true } });
    const totalCountries = await this.portModel.count({
      distinct: true,
      col: 'country_id',
    });
    const totalShippingLines = await this.shippingLineModel.count();

    return {
      data: items,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit) || 1,
      stats: {
        totalPorts,
        activePorts,
        inactivePorts: totalPorts - activePorts,
        totalCountriesWithPorts: totalCountries,
        totalShippingLines,
      },
    };
  }

  async findOne(id: number) {
    const port = await this.portModel.findByPk(id, {
      include: [
        {
          model: Country,
          as: 'country',
        },
        {
          model: ShippingLine,
          as: 'shippingLines',
          through: { attributes: ['id', 'isActive', 'remarks', 'createdAt'] },
        },
      ],
    });

    if (!port) {
      throw new NotFoundException(`Port with ID ${id} not found`);
    }

    const json = port.toJSON();
    const lines = json.shippingLines || [];
    return {
      ...json,
      country_id: json.countryId,
      port_name: json.portName,
      port_code: json.portCode,
      port_type: json.portType,
      is_active: json.isActive,
      shipping_lines_count: lines.length,
      shippingLines: lines,
      shipping_lines: lines,
    };
  }

  async create(dto: CreatePortDto, user?: any) {
    // 1. Resolve country
    let countryId = dto.country_id || dto.countryId;
    const countryName = (dto.country_name || dto.countryName || '').trim();

    if (!countryId && countryName) {
      let country = await this.countryModel.findOne({
        where: { name: { [Op.iLike]: countryName } },
      });
      if (!country) {
        country = await this.countryModel.create({
          name: countryName,
          iso2Code: countryName.slice(0, 2).toUpperCase(),
          iso3Code: countryName.slice(0, 3).toUpperCase(),
          isActive: true,
        } as any);
      }
      countryId = country.id;
    }

    if (!countryId) {
      throw new BadRequestException('Country is required to create a Port');
    }

    const portName = (dto.port_name || dto.portName || '').trim();
    if (!portName) {
      throw new BadRequestException('Port Name is required');
    }

    // Validation: Cannot create duplicate Port within same Country
    const existing = await this.portModel.findOne({
      where: {
        countryId,
        portName: { [Op.iLike]: portName },
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Port "${portName}" already exists in the selected country`,
      );
    }

    const portType = (dto.port_type || dto.portType || 'SEA').toUpperCase();
    const portCode = (dto.port_code || dto.portCode || '').trim() || null;
    const unlocode = (dto.unlocode || '').trim().toUpperCase() || null;
    const isActive = dto.is_active !== undefined ? dto.is_active : dto.isActive !== undefined ? dto.isActive : true;

    const newPort = await this.portModel.create({
      countryId,
      portName,
      portCode,
      unlocode,
      portType,
      isActive,
    } as any);

    // Link shipping lines in junction table
    const lineIds = dto.shipping_line_ids || dto.shippingLineIds || [];
    if (Array.isArray(lineIds) && lineIds.length > 0) {
      const uniqueLineIds = [...new Set(lineIds.map((id) => Number(id)).filter(Boolean))];
      for (const lineId of uniqueLineIds) {
        await this.portShippingLineModel.create({
          portId: newPort.id,
          shippingLineId: lineId,
          isActive: true,
        } as any);
      }
    }

    return await this.findOne(newPort.id);
  }

  async update(id: number, dto: UpdatePortDto, user?: any) {
    const port = await this.portModel.findByPk(id);
    if (!port) {
      throw new NotFoundException(`Port with ID ${id} not found`);
    }

    // 1. Resolve country if changed
    const targetCountryId = dto.country_id || dto.countryId || port.countryId;
    const rawPortName = (dto.port_name || dto.portName || port.portName).trim();

    // Check duplicate if name or country changed
    if (
      targetCountryId !== port.countryId ||
      rawPortName.toLowerCase() !== port.portName.toLowerCase()
    ) {
      const existing = await this.portModel.findOne({
        where: {
          id: { [Op.ne]: id },
          countryId: targetCountryId,
          portName: { [Op.iLike]: rawPortName },
        },
      });
      if (existing) {
        throw new BadRequestException(
          `Port "${rawPortName}" already exists in the chosen country`,
        );
      }
      port.countryId = targetCountryId;
      port.portName = rawPortName;
    }

    if (dto.port_code !== undefined || dto.portCode !== undefined) {
      port.portCode = (dto.port_code || dto.portCode || '').trim() || null;
    }
    if (dto.unlocode !== undefined) {
      port.unlocode = (dto.unlocode || '').trim().toUpperCase() || null;
    }
    if (dto.port_type !== undefined || dto.portType !== undefined) {
      port.portType = (dto.port_type || dto.portType || 'SEA').toUpperCase();
    }
    if (dto.is_active !== undefined || dto.isActive !== undefined) {
      port.isActive = dto.is_active !== undefined ? dto.is_active : !!dto.isActive;
    }

    await port.save();

    // Synchronize shipping lines in junction table only
    const rawLineIds = dto.shipping_line_ids || dto.shippingLineIds;
    if (Array.isArray(rawLineIds)) {
      const targetIds = new Set(rawLineIds.map((lid) => Number(lid)).filter(Boolean));
      const currentMappings = await this.portShippingLineModel.findAll({
        where: { portId: id },
      });

      const currentIds = new Set(currentMappings.map((m) => m.shippingLineId));

      // Lines to remove
      const toRemove = currentMappings.filter((m) => !targetIds.has(m.shippingLineId));
      for (const m of toRemove) {
        await m.destroy();
      }

      // Lines to add
      for (const lineId of targetIds) {
        if (!currentIds.has(lineId)) {
          await this.portShippingLineModel.create({
            portId: id,
            shippingLineId: lineId,
            isActive: true,
          } as any);
        }
      }
    }

    return await this.findOne(id);
  }

  async toggleStatus(id: number) {
    const port = await this.portModel.findByPk(id);
    if (!port) {
      throw new NotFoundException(`Port with ID ${id} not found`);
    }
    port.isActive = !port.isActive;
    await port.save();
    return port;
  }

  async remove(id: number) {
    const port = await this.portModel.findByPk(id);
    if (!port) {
      throw new NotFoundException(`Port with ID ${id} not found`);
    }

    // Validation: Cannot delete Port having Shipments (future check)
    // Here we can check if sales contracts or shipments refer to this port
    // Once confirmed clear:
    await this.portShippingLineModel.destroy({ where: { portId: id } });
    await port.destroy();

    return {
      success: true,
      message: `Port "${port.portName}" deleted successfully`,
    };
  }

  async addShippingLine(portId: number, dto: AddShippingLineToPortDto) {
    const port = await this.portModel.findByPk(portId);
    if (!port) {
      throw new NotFoundException(`Port with ID ${portId} not found`);
    }

    const shippingLineId = dto.shipping_line_id || dto.shippingLineId;
    if (!shippingLineId) {
      throw new BadRequestException('shipping_line_id is required');
    }

    const line = await this.shippingLineModel.findByPk(shippingLineId);
    if (!line) {
      throw new NotFoundException(`Shipping Line with ID ${shippingLineId} not found`);
    }

    // Validation: Cannot assign same Shipping Line twice to same Port
    const existing = await this.portShippingLineModel.findOne({
      where: { portId, shippingLineId },
    });

    if (existing) {
      throw new BadRequestException(
        `Shipping Line "${line.lineName}" is already assigned to Port "${port.portName}"`,
      );
    }

    await this.portShippingLineModel.create({
      portId,
      shippingLineId,
      remarks: dto.remarks || null,
      isActive: true,
    } as any);

    return await this.findOne(portId);
  }

  async removeShippingLine(portId: number, lineId: number) {
    const mapping = await this.portShippingLineModel.findOne({
      where: {
        portId,
        shippingLineId: lineId,
      },
    });

    if (!mapping) {
      throw new NotFoundException(`Shipping Line relation not found on this Port`);
    }

    await mapping.destroy();
    return {
      success: true,
      message: `Shipping Line unlinked from Port successfully`,
    };
  }

  /**
   * Bulk Excel Import
   * Rules:
   * 1. If Country exists: reuse. Else create.
   * 2. If Shipping Line exists: reuse. Else create.
   * 3. If Port exists: update. Else create.
   * 4. Link Shipping Line to Port.
   * 5. Skip duplicate mappings safely.
   */
  async importExcelRows(
    rows: Array<{
      country: string;
      port_name: string;
      unlocode?: string;
      port_type?: string;
      shipping_line?: string;
    }>,
  ) {
    let createdCountries = 0;
    let createdPorts = 0;
    let updatedPorts = 0;
    let createdShippingLines = 0;
    let linkedRelations = 0;
    let skippedRows = 0;
    const errors: string[] = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const countryRaw = (row.country || '').trim();
      const portRaw = (row.port_name || '').trim();
      const lineRaw = (row.shipping_line || '').trim();

      if (!countryRaw || !portRaw) {
        skippedRows++;
        continue;
      }

      try {
        // 1. Resolve Country (Reuse or Create)
        let country = await this.countryModel.findOne({
          where: {
            [Op.or]: [
              { name: { [Op.iLike]: countryRaw } },
              { iso2Code: { [Op.iLike]: countryRaw } },
            ],
          },
        });

        if (!country) {
          country = await this.countryModel.create({
            name: countryRaw,
            iso2Code: countryRaw.slice(0, 2).toUpperCase(),
            iso3Code: countryRaw.slice(0, 3).toUpperCase(),
            isActive: true,
          } as any);
          createdCountries++;
        }

        // 2. Resolve Shipping Line if provided (Reuse or Create)
        let shippingLine: ShippingLine | null = null;
        if (lineRaw) {
          shippingLine = await this.shippingLineModel.findOne({
            where: { lineName: { [Op.iLike]: lineRaw } },
          });

          if (!shippingLine) {
            shippingLine = await this.shippingLineModel.create({
              lineName: lineRaw,
              isActive: true,
            } as any);
            createdShippingLines++;
          }
        }

        // 3. Resolve Port (Update or Create)
        let port = await this.portModel.findOne({
          where: {
            countryId: country.id,
            portName: { [Op.iLike]: portRaw },
          },
        });

        const unlocode = row.unlocode ? row.unlocode.trim().toUpperCase() : null;
        const portType = row.port_type ? row.port_type.trim().toUpperCase() : 'SEA';

        if (!port) {
          port = await this.portModel.create({
            countryId: country.id,
            portName: portRaw,
            unlocode: unlocode || null,
            portType: ['SEA', 'AIR', 'ICD', 'DRY_PORT'].includes(portType) ? portType : 'SEA',
            isActive: true,
          } as any);
          createdPorts++;
        } else {
          // Update unlocode or type if provided
          let changed = false;
          if (unlocode && port.unlocode !== unlocode) {
            port.unlocode = unlocode;
            changed = true;
          }
          if (portType && port.portType !== portType) {
            port.portType = portType;
            changed = true;
          }
          if (changed) {
            await port.save();
            updatedPorts++;
          }
        }

        // 4. Link Shipping Line to Port (No duplicate mappings)
        if (shippingLine) {
          const mapping = await this.portShippingLineModel.findOne({
            where: {
              portId: port.id,
              shippingLineId: shippingLine.id,
            },
          });

          if (!mapping) {
            await this.portShippingLineModel.create({
              portId: port.id,
              shippingLineId: shippingLine.id,
              isActive: true,
            } as any);
            linkedRelations++;
          } else {
            skippedRows++;
          }
        }
      } catch (err: any) {
        this.logger.error(`Error importing row ${index + 1}: ${err.message}`);
        errors.push(`Row ${index + 1} (${countryRaw} - ${portRaw}): ${err.message}`);
      }
    }

    return {
      success: true,
      stats: {
        totalProcessed: rows.length,
        createdCountries,
        createdPorts,
        updatedPorts,
        createdShippingLines,
        linkedRelations,
        skippedRows,
      },
      errors,
    };
  }

  /**
   * Export all Ports and relations into an Excel workbook
   */
  async exportExcel(): Promise<ExcelJS.Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AgriCom CRM';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Ports Master', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = [
      { header: 'Country', key: 'country', width: 22 },
      { header: 'Port Name', key: 'port_name', width: 25 },
      { header: 'UNLOCODE', key: 'unlocode', width: 16 },
      { header: 'Port Type', key: 'port_type', width: 14 },
      { header: 'Shipping Line', key: 'shipping_line', width: 25 },
      { header: 'Status', key: 'status', width: 14 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' },
    };

    const ports = await this.portModel.findAll({
      order: [['portName', 'ASC']],
      include: [
        { model: Country, as: 'country' },
        { model: ShippingLine, as: 'shippingLines' },
      ],
    });

    for (const p of ports) {
      const countryName = p.country?.name || 'Unknown';
      const lines = p.shippingLines || [];

      if (lines.length === 0) {
        sheet.addRow({
          country: countryName,
          port_name: p.portName,
          unlocode: p.unlocode || '',
          port_type: p.portType,
          shipping_line: '',
          status: p.isActive ? 'Active' : 'Inactive',
        });
      } else {
        for (const line of lines) {
          sheet.addRow({
            country: countryName,
            port_name: p.portName,
            unlocode: p.unlocode || '',
            port_type: p.portType,
            shipping_line: line.lineName,
            status: p.isActive ? 'Active' : 'Inactive',
          });
        }
      }
    }

    return await workbook.xlsx.writeBuffer();
  }

  /**
   * Generates downloadable sample template for bulk import
   */
  async getImportTemplate(): Promise<ExcelJS.Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AgriCom CRM';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Port_Import_Template');

    sheet.columns = [
      { header: 'Country', key: 'country', width: 20 },
      { header: 'Port Name', key: 'port_name', width: 25 },
      { header: 'UNLOCODE', key: 'unlocode', width: 16 },
      { header: 'Port Type', key: 'port_type', width: 15 },
      { header: 'Shipping Line', key: 'shipping_line', width: 22 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' }, // Teal
    };

    // Sample rows from user prompt
    const sampleRows = [
      { country: 'India', port_name: 'Mundra', unlocode: 'INMUN', port_type: 'SEA', shipping_line: 'MSC' },
      { country: 'India', port_name: 'Mundra', unlocode: 'INMUN', port_type: 'SEA', shipping_line: 'Maersk' },
      { country: 'India', port_name: 'Mundra', unlocode: 'INMUN', port_type: 'SEA', shipping_line: 'ONE' },
      { country: 'India', port_name: 'Mumbai', unlocode: 'INBOM', port_type: 'SEA', shipping_line: 'MSC' },
      { country: 'India', port_name: 'Mumbai', unlocode: 'INBOM', port_type: 'SEA', shipping_line: 'CMA CGM' },
      { country: 'UAE', port_name: 'Jebel Ali', unlocode: 'AEJEA', port_type: 'SEA', shipping_line: 'MSC' },
      { country: 'UAE', port_name: 'Jebel Ali', unlocode: 'AEJEA', port_type: 'SEA', shipping_line: 'COSCO' },
      { country: 'UAE', port_name: 'Jebel Ali', unlocode: 'AEJEA', port_type: 'SEA', shipping_line: 'EMC' },
    ];

    sampleRows.forEach((r) => sheet.addRow(r));

    return await workbook.xlsx.writeBuffer();
  }
}
